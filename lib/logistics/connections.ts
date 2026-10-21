import { encryptCredential } from "@/lib/logistics/credentials";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";

type SupabaseClient = ReturnType<typeof createServiceRoleClient>;

// Couriers Mira can receive delivery webhooks from. Validated here, in
// application code, rather than as a DB CHECK: adding a courier later
// should be a code change, not a migration (see 0065's comment on
// businesses.logistics_provider).
export const SUPPORTED_PROVIDERS = ["shiip"] as const;
export type LogisticsProvider = (typeof SUPPORTED_PROVIDERS)[number];

export function isSupportedProvider(value: unknown): value is LogisticsProvider {
  return typeof value === "string" && (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
}

export type ActionResult = { ok: true } | { ok: false; error: string };

const MAX_SECRET_LENGTH = 512;

/**
 * Connects (or re-connects) a business to a courier. Credentials are
 * encrypted HERE, before anything is written -- the plaintext never
 * reaches the database or a log line. If an active connection already
 * exists it is updated in place rather than disconnected-then-recreated:
 * a single-row UPDATE can't leave a business with no connection if the
 * second step of a two-step swap failed.
 */
export async function saveConnection(
  supabase: SupabaseClient,
  args: { businessId: string; provider: unknown; apiKey: unknown; webhookSecret: unknown },
): Promise<ActionResult> {
  if (!isSupportedProvider(args.provider)) return { ok: false, error: "Unsupported courier." };
  const apiKey = typeof args.apiKey === "string" ? args.apiKey.trim() : "";
  const webhookSecret = typeof args.webhookSecret === "string" ? args.webhookSecret.trim() : "";
  if (!apiKey) return { ok: false, error: "Enter your API key." };
  if (!webhookSecret) return { ok: false, error: "Enter your webhook secret." };
  if (apiKey.length > MAX_SECRET_LENGTH || webhookSecret.length > MAX_SECRET_LENGTH) {
    return { ok: false, error: "That value is too long." };
  }

  let encryptedCredentials: string;
  let encryptedWebhookSecret: string;
  try {
    encryptedCredentials = encryptCredential(JSON.stringify({ apiKey }));
    encryptedWebhookSecret = encryptCredential(webhookSecret);
  } catch (error) {
    // Almost always a missing/malformed LOGISTICS_CREDENTIALS_KEY. The
    // owner can't fix that, so don't leak the reason to them.
    console.error("saveConnection: encryption failed", error);
    return { ok: false, error: "Couldn't save your connection. Please contact support." };
  }

  const existing = await supabase
    .from("business_logistics_accounts")
    .select("id")
    .eq("business_id", args.businessId)
    .eq("provider", args.provider)
    .eq("status", "active")
    .maybeSingle();
  if (existing.error) {
    console.error("saveConnection: lookup failed", existing.error);
    return { ok: false, error: "Couldn't save your connection. Please try again." };
  }

  const now = new Date().toISOString();
  if (existing.data) {
    const updated = await supabase
      .from("business_logistics_accounts")
      .update({
        encrypted_credentials: encryptedCredentials,
        encrypted_webhook_secret: encryptedWebhookSecret,
        updated_at: now,
      })
      .eq("id", existing.data.id)
      .eq("business_id", args.businessId);
    if (updated.error) {
      console.error("saveConnection: update failed", updated.error);
      return { ok: false, error: "Couldn't save your connection. Please try again." };
    }
    return { ok: true };
  }

  const inserted = await supabase.from("business_logistics_accounts").insert({
    business_id: args.businessId,
    provider: args.provider,
    encrypted_credentials: encryptedCredentials,
    encrypted_webhook_secret: encryptedWebhookSecret,
  });
  if (inserted.error) {
    console.error("saveConnection: insert failed", inserted.error);
    return { ok: false, error: "Couldn't save your connection. Please try again." };
  }
  return { ok: true };
}

/** Marks the active connection disconnected. Shipments already linked keep their history. */
export async function disconnect(
  supabase: SupabaseClient,
  args: { businessId: string; provider: unknown },
): Promise<ActionResult> {
  if (!isSupportedProvider(args.provider)) return { ok: false, error: "Unsupported courier." };
  const result = await supabase
    .from("business_logistics_accounts")
    .update({ status: "disconnected", disconnected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("business_id", args.businessId)
    .eq("provider", args.provider)
    .eq("status", "active");
  if (result.error) {
    console.error("disconnect: update failed", result.error);
    return { ok: false, error: "Couldn't disconnect. Please try again." };
  }
  return { ok: true };
}

// Shiip references look like "72d4iejm4lg0". Deliberately a permissive
// charset/length rather than an exact shape: Shiip never documents the
// format as a contract, and rejecting a real reference over a guessed
// pattern would be worse than accepting an odd one (a wrong reference
// just never matches a webhook; it can't match the wrong business).
const REFERENCE_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

/**
 * Links an order to a shipment the owner already booked in the courier's
 * own dashboard, so that courier's delivery webhooks can update this
 * order. Mira doesn't book anything here and spends no one's money: the
 * owner books with their own addresses and wallet, then pastes the
 * courier's reference.
 *
 * Both the connection and the order are looked up WITH business_id, so a
 * crafted call can't link another business's order, and the resulting row
 * is only ever reachable by the webhook route for the same business.
 */
export async function linkShipmentToOrder(
  supabase: SupabaseClient,
  args: { businessId: string; orderId: unknown; provider: unknown; reference: unknown },
): Promise<ActionResult> {
  if (!isSupportedProvider(args.provider)) return { ok: false, error: "Unsupported courier." };
  if (typeof args.orderId !== "string" || !args.orderId) return { ok: false, error: "Missing order." };
  const reference = typeof args.reference === "string" ? args.reference.trim() : "";
  if (!REFERENCE_PATTERN.test(reference)) {
    return { ok: false, error: "That doesn't look like a valid tracking reference." };
  }

  const account = await supabase
    .from("business_logistics_accounts")
    .select("id")
    .eq("business_id", args.businessId)
    .eq("provider", args.provider)
    .eq("status", "active")
    .maybeSingle();
  if (account.error) {
    console.error("linkShipmentToOrder: account lookup failed", account.error);
    return { ok: false, error: "Couldn't link that shipment. Please try again." };
  }
  if (!account.data) return { ok: false, error: "Connect your courier account first." };

  const order = await supabase
    .from("orders")
    .select("id")
    .eq("id", args.orderId)
    .eq("business_id", args.businessId)
    .maybeSingle();
  if (order.error) {
    console.error("linkShipmentToOrder: order lookup failed", order.error);
    return { ok: false, error: "Couldn't link that shipment. Please try again." };
  }
  if (!order.data) return { ok: false, error: "Order not found." };

  const inserted = await supabase.from("order_shipments").insert({
    business_id: args.businessId,
    order_id: args.orderId,
    logistics_account_id: account.data.id,
    provider: args.provider,
    courier_reference: reference,
    status: "booked",
  });
  if (inserted.error) {
    // 23505 = the (business_id, provider, courier_reference) unique index
    // from 0065: this reference is already linked to an order here.
    if (inserted.error.code === "23505") return { ok: false, error: "That reference is already linked to an order." };
    console.error("linkShipmentToOrder: insert failed", inserted.error);
    return { ok: false, error: "Couldn't link that shipment. Please try again." };
  }
  return { ok: true };
}
