# Email verification wiring

The custom verification flow is intentionally server-only. It uses the existing `lib/supabase/service-role.ts` convention and never exposes an OTP, its hash, the service-role key, or the Resend API key to the browser.

## Setup

1. Apply `supabase/migrations/0021_email_verification_codes.sql`, then `0022_email_verification_delivery_and_rate_limits.sql`, then `0023_email_verification_failed_delivery_retry.sql`.
2. Set these server-side environment variables (the repository does not contain values):
   - `EMAIL_VERIFICATION_PEPPER`: a long random secret used as the HMAC key for OTP hashes.
   - `RESEND_API_KEY`: the Resend API key.
   - `RESEND_FROM_EMAIL`: a verified Resend sender, for example `Mira <noreply@example.com>`.
3. Configure the Resend sending domain before sending production mail.

## Endpoints

- `POST /api/auth/email-verification/send` with `{ "email": "user@example.com" }` creates and sends a six-digit OTP using the inline-CSS template in `lib/email/templates.ts`.
- `POST /api/auth/email-verification/verify` with `{ "email": "user@example.com", "otp": "123456" }` verifies the code. A successful verification consumes and invalidates it and sets a short-lived, HttpOnly signup-confirmation marker.
- The same verify endpoint accepts `{ "email": "user@example.com", "userId": "..." }` only after that marker exists, then confirms the matching Supabase user server-side.

The database functions serialize requests per email. Codes are HMAC-SHA256 hashed with `EMAIL_VERIFICATION_PEPPER`, expire after 10 minutes, are single-use, invalidate after 5 failed attempts, enforce a 60-second resend cooldown, and allow at most 5 sends per email per hour. Public sends also enforce IP, provider, and global hourly limits. A blocked send returns HTTP 429 with `Retry-After`.

If Resend rejects delivery, the undelivered reservation and its aggregate rate-limit increments are removed by `0023_email_verification_failed_delivery_retry.sql`, so the user can retry immediately without consuming the OTP or quota.

## Signup integration

The existing client signup handler (`app/portal/signup/page.tsx`) sends the OTP before calling `supabase.auth.signUp`. It only enables account creation after the six-digit code has been verified; after signup, it calls the server-side confirmation path with the newly-created user ID. Do not import `lib/auth/email-verification.ts`, `lib/email/resend.ts`, or the service-role client into a client component.

If Supabase Auth email confirmation is enabled, this flow uses the custom OTP as the confirmation source by calling `auth.admin.updateUserById(..., { email_confirm: true })` after the OTP has been verified. Configure Supabase so it does not send a duplicate confirmation email for this flow.

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
