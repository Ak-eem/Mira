# Courier (logistics) integration

Status: connect / disconnect, link-a-shipment-to-an-order, the Shiip
delivery webhook, and the owner-facing screens are implemented. Logic is
tested against fakes and the schema/RLS against real Postgres. **Nothing
here has been run against the real Shiip API** -- no Shiip credentials
were available when this was built. The signature scheme and payload
shape come from Shiip's published docs (developer.goshiip.com).

Where it lives for an owner:
- Settings -> **Delivery tracking** (`CourierPanel`): shows their own
  webhook address, takes the Shiip webhook secret, connect/disconnect.
  Connect/disconnect are owner-only.
- Orders -> each open order gets a **Track delivery** box (any team member)
  once a courier is connected; afterwards the row shows Shiip's status.

## How an order gets matched to a delivery update

1. The owner books the delivery **in Shiip's own dashboard** (their
   addresses, their wallet) and copies Shiip's reference.
2. In Mira they paste it on the order (`linkShipmentToOrder`), which
   writes an `order_shipments` row.
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

Only the **webhook secret** is collected. Nothing in Mira calls Shiip's
API in this flow, so an API key would be a credential stored for no
benefit; `encrypted_credentials` is nullable and unused until booking
exists.

The secret is encrypted in application code (AES-256-GCM,
`lib/logistics/credentials.ts`) before it reaches Postgres. The key is the
`LOGISTICS_CREDENTIALS_KEY` env var (64 hex chars) and is never stored in
the database:

    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

**Losing or rotating this key without re-encrypting makes every stored
courier credential unreadable.** Back it up like any other secret.

## Access model

`business_logistics_accounts` is **read-only from a browser session**
(owners and staff can see that a connection exists; nothing can write).
Writes go through `courier-actions.ts`, which checks the caller is the
business owner and then uses the service role. `order_shipments` likewise
has no browser write path, so a shipment can't be forged from a session.
This is deliberate: `is_business_owner()` matches staff too, so an
owner-write RLS policy would have let staff replace the secret directly.

## What is not built yet

- Booking a shipment from Mira (see above).
- Any courier other than Shiip. Adding one means a new webhook handler
  that verifies that courier's own signature scheme.
