import { createHmac, timingSafeEqual } from "node:crypto";

// Verifies Shiip's webhook signature per their documented scheme
// (https://developer.goshiip.com/getting-started/webhook): HMAC-SHA256 of
// the raw request body, hex-encoded, sent in the X-Signature header.
// Unlike Paystack (one platform-wide secret), each BUSINESS has their own
// secret -- set when they configure their own webhook URL in their own
// Shiip dashboard -- so the secret to check against is looked up per
// connection, not read from a single env var.
//
// Same timingSafeEqual pattern as app/api/paystack/webhook/route.ts, for
// the same reason: a naive === comparison leaks timing information about
// how many leading bytes matched, which is a real (if narrow) attack
// surface for guessing a signature byte-by-byte.
export function verifyShiipSignature(rawBody: string, receivedSignature: string | null, secret: string): boolean {
  if (!receivedSignature) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"), "utf8");
  const actual = Buffer.from(receivedSignature, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Shiip's documented webhook payload shape
// (https://developer.goshiip.com/getting-started/webhook#webhook-event-sample).
export type ShiipWebhookPayload = {
  shipment: {
    data: {
      destination: string;
      origin: string;
      reference: string;
      id: string;
      status: string;
      extra?: string;
    };
    carrier: string;
  };
};

// Shiip's own statuses, from their documented table, mapped to this
// repo's order_shipments.status values. "pending" and "in progress" both
// land on "booked" here -- from Mira's side, both just mean "accepted,
// not yet physically moving" and the distinction isn't something a
// customer asking "where's my order" needs surfaced separately.
const SHIIP_STATUS_MAP: Record<string, string> = {
  pending: "booked",
  "in progress": "booked",
  "picked up": "picked_up",
  delivered: "delivered",
};

/** Returns null for a status Shiip sends that isn't in the known map, rather than guessing. */
export function mapShiipStatus(shiipStatus: string): string | null {
  return SHIIP_STATUS_MAP[shiipStatus.trim().toLowerCase()] ?? null;
}

export function parseShiipWebhookPayload(body: unknown): ShiipWebhookPayload | null {
  if (typeof body !== "object" || body === null) return null;
  const shipment = (body as { shipment?: unknown }).shipment;
  if (typeof shipment !== "object" || shipment === null) return null;
  const data = (shipment as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (typeof d.reference !== "string" || typeof d.status !== "string") return null;
  return body as ShiipWebhookPayload;
}
