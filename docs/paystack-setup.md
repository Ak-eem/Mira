# Mira Paystack integration setup

## Environment variables

`.env.example` is the authoritative list of every variable. Create `.env.local` (never commit it); the Paystack-related part:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
PAYSTACK_SECRET_KEY=sk_test_your-test-secret-key
PAYSTACK_BASE_AMOUNT_NGN=50000
PAYSTACK_BASE_PROMO_AMOUNT_NGN=25000
PAYSTACK_BASE_DURATION_DAYS=30
```

The single `base` plan costs NGN 50,000 per month. The server automatically applies the NGN 25,000 promo price to the first 10 businesses that have ever subscribed. `PAYSTACK_*_AMOUNT_NGN` values are in naira; the server converts them to kobo before calling Paystack. Keep the service-role key server-only.

## Database and routes

1. Apply the project's migrations in numeric order (see `docs/DEPLOYMENT.md`). The Paystack tables and functions come from `0044_paystack_subscriptions.sql`, with `0049_paystack_activation_owner_check.sql` and `0056_cancel_subscription.sql` building on them.
2. The routes already exist in the repo: `app/api/paystack/checkout`, `app/api/paystack/verify` and `app/api/paystack/webhook`. Nothing to copy.
3. In the Paystack Dashboard, open **Settings → API Keys & Webhooks → Webhook URL** and set it to `https://YOUR_DOMAIN.example.com/api/paystack/webhook`. Deploy the webhook route over HTTPS and do not put authentication middleware in front of it; its HMAC signature is the authentication.
4. Paystack redirects customers to `/subscribe` with a `reference`; the `/subscribe` page polls the authenticated verify route until the payment reaches a final status, while the webhook remains the source of asynchronous activation. `SubscribeButton` (on the portal upgrade page) only starts checkout for the business being paid for.

## Test and live keys

Use `sk_test_...` and `pk_test_...` while testing, and test transactions/test webhook events. Before launch, switch to the live `sk_live_...` key and configure the live dashboard webhook URL; never mix test and live keys or transactions.

## Paystack fees

Paystack fees are **1.5% + ₦100**, with the ₦100 fee waived for transactions under **₦2,500** and fees capped at **₦2,000**. Confirm current commercial terms with Paystack before launch.

## Account verification

A Paystack account must be verified by an adult (18+).

## Webhook IP allowlist (optional)

The HMAC signature check is what authenticates a webhook. To add an IP check on top, set `PAYSTACK_WEBHOOK_IPS` to a comma-separated list of Paystack's published source IPs. It is **off by default**: a stale list would silently 403 real payments if Paystack ever changes ranges.

## Expiry, renewals and refunds

- Paid access lasts `PAYSTACK_BASE_DURATION_DAYS` from payment. Once `expires_at` passes, the business is locked (app checks and the `enforce_active_business_subscription` trigger both honor it). Rows with a null `expires_at` are manual admin grants and never expire.
- Paying again before expiry extends from the current expiry, not from today.
- The price the customer was quoted is stored in the transaction metadata (`amount_kobo`), so changing the price env vars doesn't reject payments already in flight.
- Every Paystack reference is recorded in `paystack_payments` and can only be applied once, so replayed webhooks, revisited `/subscribe` links and late redeliveries never extend access twice.
- **Refunds.** A fully refunded payment removes exactly the days it bought (`refund_paystack_payment`, migration `0075`), including when the business paid early and the payments stacked: refunding the earlier payment keeps the later one's full period, refunding the latest keeps what the earlier one still has left, and the subscription is cancelled only when nothing paid is left. A manual extension you gave in Admin is kept. A partial refund is recorded but does not change access; cancel or shorten by hand if it should. Replayed `refund.processed` events change nothing.
- **Everything is recorded and emailed.** Each refund is stored on the payment (`refunded_amount`, `refunded_at`, `access_revoked_at`) and you get an alert email at `ALERT_EMAIL_TO` saying what Mira did. If Mira could not work out which days to remove (a payment made before day-tracking that is not the latest one), the alert says **needs your review** and you adjust the subscription in Admin.
- **Chargebacks** (`charge.dispute.*`) are recorded (`disputed_at`) and emailed to you, including Paystack's reminder events (at most about once a day). Access is **not** changed automatically because a dispute can be won. Paystack gives a short deadline to respond, so answer it in the Paystack dashboard.
- **If the app is deployed before migration `0075` is applied,** payments still activate (they are recorded without their length) and refunds fall back to the old behaviour (cancel only if it was the latest payment). The alert email then tells you to apply the migration. Payments made before `0075` have no recorded length and keep the old behaviour.
- Before going live, test it end to end in Paystack **test mode**: make a payment, refund it from the Paystack dashboard, and confirm the alert email arrives and the business loses access. The amount in the refund event (kobo) has only been tested against a simulated event.
