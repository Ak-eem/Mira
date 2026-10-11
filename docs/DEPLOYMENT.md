# Putting Mira live

This is the full path from an empty account to a working production deployment. Everything
here is taken from the code in this repo; when a step depends on a third party's current
screens or prices, it says so and links the thing to check rather than guessing.

You will touch five services. Only the first three are required.

| Service | Needed for | Required |
|---|---|---|
| Supabase | database, login, file storage | yes |
| Vercel (or any Node host) | running the app | yes |
| Groq and/or Gemini | the AI that answers customers | yes (one at least) |
| Resend | emails: verification codes, handoff alerts, order updates, inbound email | for email features |
| Meta WhatsApp Cloud API | WhatsApp conversations | optional |
| Paystack | taking subscription payments | for billing |

## 1. Supabase

1. Create a project. From **Project Settings → API** copy the project URL, the publishable
   key (formerly "anon key") and the service role key.
2. **Apply every file in `supabase/migrations/` in numeric order**, in the SQL editor or with
   the Supabase CLI (`supabase db push`). Don't skip any. Several features quietly fail
   without their migration (for example `0054` for owner settings, `0056` for cancelling a
   subscription, `0057` for owners editing their own products and hours).
3. **Authentication → URL Configuration:** add `https://YOUR_DOMAIN/auth/callback` and
   `http://localhost:3000/auth/callback` to Redirect URLs. For Google sign-in, follow the
   steps in `.env.example`. If email confirmation is on in Supabase, read
   `docs/email-verification.md` so users do not get two confirmation emails.
4. **Faster page loads (recommended):** in the Supabase dashboard's JWT signing keys settings,
   move the project to asymmetric signing keys. The app verifies sessions locally when it can,
   and falls back to asking Supabase Auth on every request when it cannot.
5. **Make yourself the first platform admin.** Create your user (Authentication → Users in
   Supabase, or sign up in the app), then run this in the SQL editor with your email:

   ```sql
   insert into platform_admins (id, email)
   select id, email from auth.users where email = 'you@example.com';
   ```

## 2. Vercel

1. Import the GitHub repo as a new project.
2. Add environment variables from `.env.example` (that file is the authoritative list).
   The ones you cannot skip: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `AI_PROVIDER` with `GROQ_API_KEY` and/or `LLM_API_KEY`
   (Gemini), `NEXT_PUBLIC_SITE_URL` (your real domain), and `CRON_SECRET`.
   Never put the service role key behind a `NEXT_PUBLIC_` name.
3. **Pick the function region next to your Supabase region** (Project Settings → Functions
   in Vercel). A mismatch adds a network round trip to every database call and is the most
   common reason the app feels slow.
4. Deploy, then attach your domain.
5. **Scheduled jobs.** `vercel.json` defines two daily crons: `/api/cron/nudges` (09:00) and
   `/api/cron/cleanup` (03:30). Check Vercel's current limits for your plan: cron frequency is
   restricted on the free Hobby plan, which is why these are daily. Any other
   scheduler must call the same URLs with the header `Authorization: Bearer <CRON_SECRET>`.

## 3. Email (Resend)

1. Verify your sending domain in Resend; set `RESEND_API_KEY` and `RESEND_FROM_EMAIL`.
2. Set `EMAIL_VERIFICATION_PEPPER` to a long random string.
3. For businesses that receive customer email: point Resend inbound at
   `https://YOUR_DOMAIN/api/webhooks/email` and set `RESEND_WEBHOOK_SECRET`.
4. `CONTACT_TO_EMAIL` receives the landing-page contact form; `CUSTOM_REQUEST_TO_EMAIL`
   receives portal custom requests.
5. **Handoff alerts:** when a customer needs a person, the business's **team members** (not the
   owner) are emailed a link to the conversation. A business with no team members gets no
   email; the owner still sees it on the dashboard. This uses the same Resend setup. Set
   `HANDOFF_EMAILS_DISABLED=true` to turn it off.

## 4. WhatsApp (optional)

Meta's console changes often, so follow Meta's own current guide for the Cloud API and use
this list as what Mira needs from it.

1. Create a Meta developer app and add the WhatsApp product; add a business phone number.
2. Create a long-lived system-user access token and set it as `WHATSAPP_TOKEN`.
3. Set `WHATSAPP_APP_SECRET` (from the app settings) and invent a value for
   `WHATSAPP_WEBHOOK_VERIFY_TOKEN`.
4. In the WhatsApp webhook settings, set the callback URL to
   `https://YOUR_DOMAIN/api/webhooks/whatsapp`, enter the verify token, and subscribe to the
   `messages` field.
5. For each business: **Admin → business → Settings**, paste the phone number ID into the
   WhatsApp field. Messages are routed to businesses by that ID.

**Reliability you should know about**

- Every inbound message is stored in `whatsapp_inbound_queue` before it is processed, and the
  message ID is unique, so redelivered webhooks are not processed twice.
- If processing fails the webhook answers 500 and Meta retries. **Nothing in this repo drains
  stuck queue rows on a schedule** (see `docs/p1-concurrency-and-limits.md`). If you run
  WhatsApp for paying businesses, add a small job that re-claims `pending` and `failed` rows,
  and test it in staging first.
- WhatsApp has no idempotency key for sending. After an uncertain send the app re-sends once
  rather than leave the customer without an answer, so a very occasional duplicate reply is
  possible. This is a deliberate trade-off (see `CHANGES.md`).

## 5. Paystack

Follow `docs/paystack-setup.md`. Use `sk_test_` keys until you have run a full payment and a
webhook end to end, then switch to live keys and the live webhook URL.

## 6. Check it works

- Open `/admin/login` with your platform admin account.
- Open `/portal/signup`, create a test business, and confirm you land in the dashboard.
- Open the business's chat page (the **Try your Mira** button) and send a message.
- Add a team member to the test business, ask for "a human" in the chat, and confirm the alert email reaches them.

## 7. What it costs to run

Prices change, so these are the things to price, not numbers to trust.

- **What a business pays you:** set by `PAYSTACK_BASE_AMOUNT_NGN` (and the promo price in
  `PAYSTACK_BASE_PROMO_AMOUNT_NGN`, applied to the first 10 subscribers) per
  `PAYSTACK_BASE_DURATION_DAYS` days. `docs/paystack-setup.md` lists Paystack's fee
  structure; confirm it with Paystack.
- **What you pay to run it:** Supabase, Vercel, the AI provider (billed per token), Resend,
  and Meta's per-conversation WhatsApp fees. Work out your cost per business per month from
  those before you set your price.

## 8. What Mira does and does not do

- It answers questions, takes orders into a queue for the owner to confirm, and hands over
  to a person. Orders are confirmed and moved along by the business; Mira does not take
  payment from a business's customers or arrange delivery.
- Subscription billing for Mira itself runs through Paystack. Paying again before a plan ends
  currently starts a fresh period from the payment date instead of adding to what is left,
  and no reminder is sent before a plan expires.
- Deleting a business 30 days after it cancels is a manual admin action, and backups follow
  your Supabase plan. Both are written up in `docs/data-retention.md`.
