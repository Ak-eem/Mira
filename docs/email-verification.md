# Email verification wiring

The custom verification flow is intentionally server-only. It uses the existing `lib/supabase/service-role.ts` convention and never exposes an OTP, its hash, the service-role key, or the Resend API key to the browser.

## Setup

1. Apply `supabase/migrations/0021_email_verification_codes.sql`.
2. Set these server-side environment variables (the repository does not contain values):
   - `EMAIL_VERIFICATION_PEPPER`: a long random secret used as the HMAC key for OTP hashes.
   - `RESEND_API_KEY`: the Resend API key.
   - `RESEND_FROM_EMAIL`: a verified Resend sender, for example `Mira <noreply@example.com>`.
3. Configure the Resend sending domain before sending production mail.

## Endpoints

- `POST /api/auth/email-verification/send` with `{ "email": "user@example.com" }` creates and sends a six-digit OTP using the inline-CSS template in `lib/email/templates.ts`.
- `POST /api/auth/email-verification/verify` with `{ "email": "user@example.com", "otp": "123456" }` verifies the code. A successful verification consumes and invalidates it.

The database functions serialize requests per email. Codes are HMAC-SHA256 hashed with `EMAIL_VERIFICATION_PEPPER`, expire after 10 minutes, are single-use, invalidate after 5 failed attempts, enforce a 60-second resend cooldown, and allow at most 5 sends per email per hour. A blocked send returns HTTP 429 with `Retry-After`.

## Signup integration

In the existing client signup handler (`app/portal/signup/page.tsx`), call the send endpoint after `supabase.auth.signUp` succeeds, then route the user to a client verification screen that submits the OTP to the verify endpoint. Do not import `lib/auth/email-verification.ts`, `lib/email/resend.ts`, or the service-role client into a client component.

If Supabase Auth email confirmation is enabled, decide on one confirmation source before production: disable the duplicate Supabase confirmation email for this custom flow, or keep Supabase confirmation and use this flow only as a separate application-level verification. After a successful custom verification, the server-side integration should mark the matching Supabase user as confirmed with the Admin API (`auth.admin.updateUserById(..., { email_confirm: true })`) when that is the chosen confirmation source.

## Welcome email

After verification and any required Supabase Admin update, send the welcome message from a server action or route:

```ts
import { sendEmailWithResend } from "@/lib/email/resend";
import { renderWelcomeEmail } from "@/lib/email/templates";

const welcome = renderWelcomeEmail({ recipientName, loginUrl });
await sendEmailWithResend({
  to: verifiedEmail,
  subject: welcome.subject,
  html: welcome.html,
});
```

The welcome template accepts an optional login URL so the server, rather than the template, remains responsible for the deployed application URL.
