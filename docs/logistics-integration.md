# Courier (logistics) integration

Status: connect / disconnect, link-a-shipment-to-an-order, and the Shiip
delivery webhook are implemented and tested against fakes. **Nothing here
has been run against the real Shiip API** -- no Shiip credentials were
available when this was built. The signature scheme and payload shape
come from Shiip's published docs (developer.goshiip.com).

## How an order gets matched to a delivery update

1. The owner books the delivery **in Shiip's own dashboard** (their
   addresses, their wallet) and copies Shiip's reference.
2. In Mira they link that reference to the order
   (`linkShipmentToOrder`), which writes an `order_shipments` row.
3. Shiip calls `POST /api/webhooks/shiip/<businessId>` when the status
   changes. Mira verifies the HMAC signature with **that business's own
   secret**, looks the shipment up by `(business_id, provider,
   courier_reference)`, updates `order_shipments`, and on a terminal
   "delivered" calls `transitionOrderStatus(..., actor: "courier")`,
   which sends the usual customer notification.

Isolation comes from the lookup always being scoped by `business_id`
(and the unique index in migration 0065), not from references being
globally unique. Two businesses can hold identical reference strings
without ever matching each other's orders.

## Why Mira does not book shipments itself (yet)

Checked against Shiip's docs and Mira's schema:

- Booking is `rates` -> `book`, and `book` needs a `redis_key`/`rate_id`
  from the rates response plus a `user_id` from a profile call.
- The rates call needs pickup/delivery addresses and parcel details.
  `orders`/`order_items` hold **no address, weight or dimensions**.
- Booking **debits the business's Shiip wallet**, so it must never fire
  automatically; it needs an explicit per-shipment owner confirmation.

Booking from inside Mira therefore needs address capture on orders first.
That is a later phase.

## Credentials

Encrypted in application code (AES-256-GCM, `lib/logistics/credentials.ts`)
before they reach Postgres. The key is the `LOGISTICS_CREDENTIALS_KEY` env
var (64 hex chars) and is never stored in the database:

    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

**Losing or rotating this key without re-encrypting makes every stored
courier credential unreadable.** Back it up like any other secret.

## What is not built yet

- Owner-facing UI to connect a courier and to link a reference to an order
  (the logic exists in `lib/logistics/connections.ts`).
- Booking a shipment from Mira (see above).
- Any courier other than Shiip. Adding one means a new webhook handler
  that verifies that courier's own signature scheme.
