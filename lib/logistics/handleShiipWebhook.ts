import { decryptCredential } from "@/lib/logistics/credentials";
import { verifyShiipSignature, mapShiipStatus, parseShiipWebhookPayload } from "@/lib/logistics/shiipWebhook";
import { transitionOrderStatus } from "@/lib/orders/transition";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";

type SupabaseClient = ReturnType<typeof createServiceRoleClient>;

export type WebhookResult = { status: number; body: Record<string, unknown> };

/**
 * The actual Shiip-webhook logic, pulled out of the route handler so it
 * can be called with an injected (real or fake) Supabase client and
 * tested without a live environment. See
 * app/api/webhooks/shiip/[businessId]/route.ts for the HTTP adapter.
 */
export async function handleShiipWebhook(
  supabase: SupabaseClient,
  args: { businessId: string; rawBody: string; signature: string | null },
): Promise<WebhookResult> {
  const { businessId, rawBody, signature } = args;

  const { data: account, error: accountError } = await supabase
    .from("business_logistics_accounts")
    .select("id, encrypted_webhook_secret")
    .eq("business_id", businessId)
    .eq("provider", "shiip")
    .eq("status", "active")
    .maybeSingle();

  if (accountError) {
    console.error("Shiip webhook: account lookup failed", accountError);
    return { status: 500, body: { error: "Internal error" } };
  }
  // No active Shiip connection for this businessId: either it was never
  // connected, or it's been disconnected since. Nothing to verify
  // against -- 404 rather than 401 so this reads as "this business isn't
  // using this integration" rather than "signature check failed", which
  // is a different, more alarming signal.
  if (!account || !account.encrypted_webhook_secret) {
    return { status: 404, body: { error: "No active Shiip connection for this business" } };
  }

  let secret: string;
  try {
    secret = decryptCredential(account.encrypted_webhook_secret);
  } catch (error) {
    // A decrypt failure means a corrupted row or a
    // LOGISTICS_CREDENTIALS_KEY mismatch (e.g. rotated without
    // re-encrypting stored secrets) -- a real operational problem, not
    // something to expose to the caller.
    console.error("Shiip webhook: could not decrypt stored secret", error);
    return { status: 500, body: { error: "Internal error" } };
  }

  if (!verifyShiipSignature(rawBody, signature, secret)) {
    return { status: 401, body: { error: "Invalid signature" } };
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }

  const payload = parseShiipWebhookPayload(parsedBody);
  if (!payload) {
    // Signature-valid but unparseable: ack with 200 so Shiip doesn't
    // retry something that will never parse differently, but log it --
    // this is the shape to watch if Shiip changes their payload format.
    console.error("Shiip webhook: signature valid but payload shape unrecognized", parsedBody);
    return { status: 200, body: { received: true } };
  }

  const mappedStatus = mapShiipStatus(payload.shipment.data.status);
  if (!mappedStatus) {
    console.error(`Shiip webhook: unrecognized status "${payload.shipment.data.status}"`, { businessId, reference: payload.shipment.data.reference });
    return { status: 200, body: { received: true } };
  }

  // The actual join: courier_reference scoped to business_id (and
  // provider) is how this can never cross-match another business's
  // order, even if two different businesses' couriers coincidentally
  // return the same reference string -- see migration 0065's unique
  // index and its own comment for why that's structurally guaranteed,
  // not just convention.
  const { data: shipment, error: shipmentError } = await supabase
    .from("order_shipments")
    .select("id, order_id, status")
    .eq("business_id", businessId)
    .eq("provider", "shiip")
    .eq("courier_reference", payload.shipment.data.reference)
    .maybeSingle();

  if (shipmentError) {
    console.error("Shiip webhook: shipment lookup failed", shipmentError);
    return { status: 500, body: { error: "Internal error" } };
  }
  if (!shipment) {
    // A reference Shiip knows about but Mira never booked (or booked
    // under a different business_id) -- nothing to update. Logged, not
    // retried: the reference will never resolve differently later.
    console.error("Shiip webhook: no matching shipment", { businessId, reference: payload.shipment.data.reference });
    return { status: 200, body: { received: true } };
  }

  await supabase
    .from("order_shipments")
    .update({ status: mappedStatus, last_event: parsedBody as object, updated_at: new Date().toISOString() })
    .eq("id", shipment.id);

  // Only drive the ORDER's own status forward to "delivered" -- the
  // intermediate shipment statuses (booked/picked_up/in_transit) are
  // tracked on order_shipments for visibility, but orders.status's
  // existing vocabulary (placed/confirmed/shipped/delivered) doesn't
  // have a clean mapping for Shiip's in-between states, and
  // transitionOrderStatus already has its own real business logic
  // (notifications, handoff resolution, stock release awareness) that
  // shouldn't fire for every intermediate courier status update.
  if (mappedStatus === "delivered") {
    const result = await transitionOrderStatus(supabase, {
      businessId,
      orderId: shipment.order_id,
      to: "delivered",
      actor: "courier",
    });
    if (!result.ok) {
      console.error("Shiip webhook: transitionOrderStatus failed", { businessId, orderId: shipment.order_id, error: result.error });
    }
  }

  return { status: 200, body: { received: true } };
}
