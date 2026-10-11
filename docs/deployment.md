# Deploying Mira to production

A checklist for going from this repository to a live site. Do the steps in order; each ends with a way to check it worked. Budget about two hours the first time, mostly waiting on Meta and your email domain.

For the list of every environment variable, `.env.example` is the source of truth (a test fails if the code uses a variable that file does not list).

## 1. Supabase (the database)

1. Create a project at supabase.com. Pick the region nearest your customers. Supabase has no Africa region; for West Africa the nearest are the European ones (Ireland, London, Paris, Frankfurt). A project's region cannot be changed later.
2. Run every file in `supabase/migrations/` **in numeric order** in the SQL Editor (`0001...` first, newest last). Re-running a file that already ran is not safe for all of them, so keep a note of the last number you applied. When you add a new release, run only the files newer than that.
3. Copy the project URL, the publishable ("anon") key and the service-role key from Project Settings > API.
4. Make yourself a platform admin: sign up through the app once, then in the SQL Editor run
   `insert into platform_admins (id, email) select id, email from auth.users where email = 'you@example.com';`
5. Check: `supabase/tests/run.sh` (see `docs/alerts.md`) builds a scratch database from the same files; if it passes there it applies cleanly.

## 2. Vercel (the app)

1. Import the repository. Add the environment variables from `.env.example` for **Production**.
2. Set `CRON_SECRET` to a long random string. **Without it every scheduled job is rejected** (the nudges job and the daily data-retention cleanup never run, and Admin shows Background jobs as Down).
3. Set the function region to match your database (Project Settings > Functions). The default is Washington D.C.; if your database is in Ireland choose Dublin. A mismatch adds a transatlantic round trip to every query.
4. Cron jobs (`vercel.json`) only run on **Production** deployments, and the free plan allows daily schedules only.
5. Vercel's free Hobby plan is for non-commercial use. A paying-customer product needs a paid plan; check Vercel's current terms.
6. Check: open `/admin`, then Mira Analytics > System health. Database should be Operational.

## 3. Email (Resend)

1. Create a Resend account and verify your sending domain (DNS records).
2. Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (for example `Mira <noreply@yourdomain.com>`), and `EMAIL_VERIFICATION_PEPPER` (a long random string).
3. For customers who email a business: add a Resend webhook for `email.received` pointing at `https://YOUR_DOMAIN/api/webhooks/email` and set `RESEND_WEBHOOK_SECRET`.
4. Set `ALERT_EMAIL_TO` to your own address to get operator alerts (see `docs/alerts.md`).

## 4. Payments (Paystack)

See `docs/paystack-setup.md`. Short version: set `PAYSTACK_SECRET_KEY` and the amounts, and set the webhook URL to `https://YOUR_DOMAIN/api/paystack/webhook`. Use `sk_test_` keys until a full test payment works, then switch to `sk_live_`.

## 5. WhatsApp (Meta)

Needs a Meta developer account and a verified Meta Business. Plan for days, not minutes, if the business is not verified yet.

1. Create a Meta app with the WhatsApp product and add a phone number. Note the **Phone number ID**.
2. Set `WHATSAPP_TOKEN` (a permanent system-user token), `WHATSAPP_APP_SECRET` and `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (any random string you choose).
3. In the Meta app, set the webhook callback to `https://YOUR_DOMAIN/api/webhooks/whatsapp` with that verify token and subscribe to `messages`.
4. In Mira, Admin > the business > Settings, enter the business's Phone number ID. Each business has its own; it is stored in the database, not in an environment variable.
5. **No separate worker is needed.** The webhook saves each message, answers it, and replies in the same request. If something fails, Meta re-delivers; anything that still goes unanswered shows in Admin > Message queue with a Retry button and triggers an alert email.
6. Meta charges for messages. See `docs/costs.md`.

## 6. Google sign-in (optional)

Steps are in `.env.example`. No environment variables are involved.

## 7. Before you announce it

- Send a test message through each channel (web widget, WhatsApp, email) and confirm the reply.
- Make a test payment with the live key for the smallest amount, then refund it.
- Confirm Admin > System health is green and a test alert email arrives.
- Read the Terms and Privacy pages and have them reviewed by a lawyer (they are still drafts).
- Confirm backups: Supabase > Database > Backups. What your plan keeps, and for how long, is what you can honestly promise customers (see `docs/data-retention.md`).
