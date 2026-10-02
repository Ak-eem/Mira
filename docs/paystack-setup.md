# Mira Paystack integration setup

## Environment variables

Create `.env.local` (never commit it):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
PAYSTACK_SECRET_KEY=sk_test_your-test-secret-key
PAYSTACK_BASE_AMOUNT_NGN=50000
PAYSTACK_BASE_PROMO_AMOUNT_NGN=25000
PAYSTACK_BASE_DURATION_DAYS=30
```

The single `base` plan costs NGN 50,000 per month. The server automatically applies the NGN 25,000 promo price to the first 10 businesses that have ever subscribed. `PAYSTACK_*_AMOUNT_NGN` values are in naira; the server converts them to kobo before calling Paystack. Keep the service-role key server-only.

## Database and routes

1. Run `20260919144928_paystack_subscriptions.sql` in the Supabase SQL editor.
2. Put the route files in the matching Next.js App Router locations, and adjust the `@/lib/...` aliases if your project uses different paths.
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
- `refund.processed` cancels the subscription bought by a fully refunded payment. Dispute events are only logged for manual review.
