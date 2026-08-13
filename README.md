# Mira v0.1

Multi-tenant, AI-powered customer service: a platform admin manages
isolated business profiles, and customers chat with an assistant
grounded only in their business's own data.

## What' here

- Next.js 16 (App Router) + TypeScript + Tailwind
- Supabase (Postgres + Auth): browser client, session-aware server
  client, and a service-role client for the anonymous customer path
- Two migrations:
  - `0001_core_schema.sql` -- `platform_admins`, `businesses`, `services`
  - `0002_knowledge_model.sql` -- `business_hours`, `promotions`,
    `closures`, `faqs`, `policies`, `conversations`, `messages`
- Row Level Security on every table from the start
- Admin: login, business list, create business, a settings page to
  edit an existing business's profile/tone/active status, and a
  management hub for each business covering all six knowledge-model
  resources with full create/edit/delete
- The hub now also shows a computed **Mira status** (Online / Needs
  attention / Offline), aggregate counts (services, active promotions,
  FAQs, policies), a preview of the 3 most recent conversations, a
  **Preview Mira** button that opens the real customer chat in a new
  tab -- not a separate fake preview, the exact same route and code
  path a customer hits -- and a **Copy link** button for sharing that
  same chat URL externally
- Each business's chat page has its own page title/description (via
  `generateMetadata`), so a link shared to WhatsApp/Instagram shows
  that business's actual name in the preview card, not generic "Mira"
  for every business
- Every Supabase call in `/api/chat` now checks its own error, not just
  its data -- business/conversation lookups and saving the customer's
  own message fail loudly with a clean message if something goes
  wrong; bookkeeping writes (the assistant's own message, the
  conversation timestamp) log the error but don't block the reply the
  customer's about to get, since failing their whole exchange over a
  persistence detail would be worse than the detail itself
- A fourth migration (`0004_message_isolation_constraint.sql`) makes
  the `messages.business_id` denormalization structurally enforced,
  not just conventionally true: a composite foreign key on
  `(conversation_id, business_id)` means Postgres itself rejects a
  message whose business_id doesn't match its conversation's, rather
  than relying entirely on application code always getting it right
- Promotion and closure dates/times, typed into plain `date` and
  `datetime-local` inputs with no timezone of their own, are now
  converted using each business's actual `timezone` (`lib/timezone.ts`)
  before they're stored, and converted back the same way when an
  existing one is reopened for editing. Previously they went straight
  into `timestamptz` columns as if they were UTC, so a promotion an
  Africa/Lagos business set to "end Friday" actually expired around
  1am Friday Lagos time -- gone from the AI's grounding for most of
  the day it was supposed to still be running
- Every mutation across all six knowledge-model resources plus
  business settings writes a plain-language line to an activity log --
  "Haircut price changed from 4000 to 5000," "Business paused," and
  so on. Shown as the 5 most recent on the hub, full history at
  `/admin/businesses/[id]/activity`. Deliberately simple: one
  pre-formatted summary per row, not generic structured before/after
  diffing across seven different entity shapes -- see
  `lib/activityLog.ts`
- **Command Center** (`/admin/businesses/[id]/command`) -- the AI's
  first write path. Type a plain instruction ("mark haircuts
  unavailable," "add 20% off all services until Friday"), Gemini
  parses it via function calling into one of 5 actions (availability,
  price, promotions, hours, FAQs), and nothing writes to the database
  without an explicit confirm. If a name matches nothing, it says so
  rather than guessing; if it matches more than one thing, you pick --
  it never silently picks for you. Every execution calls the exact
  same functions the admin forms use (`updateService`, `createPromotion`,
  `createFaq`), not a second write path, and logs to Activity with
  `source: 'command_center'` so it's distinguishable from a form edit
- A conversations viewer per business -- read-only chat logs, reusing
  the same message-bubble look the customer actually saw
- A live "Open now / Closed" indicator, shown in both the admin hub
  and the customer chat header, computed by `lib/hours.ts` -- the same
  function `buildContext.ts` uses to ground the AI's own answers, so
  none of the three can ever disagree with each other
- Customer: `/chat/[slug]` -- a real chat UI backed by `/api/chat`,
  grounded in that business's own data, falling back to "I don't have
  that information" rather than guessing. Rate-limited (20
  messages/minute per source, in-memory -- resets on server restart,
  a real limitation, but genuine protection at this stage) so one
  person or a stray script can't burn through the shared free-tier
  quota for everyone using it
- Running on Gemini 3.6 Flash, the current model as of this writing --
  swapped from 3.5, cheaper on output tokens and now Google's default
- Both Gemini calls now go through one shared helper
  (`lib/ai/geminiFetch.ts`) instead of two separate implementations:
  a 10-second timeout, one automatic retry for a genuinely transient
  failure (a timeout or Gemini's own 5xx -- not for something like a
  malformed request, which would just fail the same way again), and
  error messages that are always safe to show a customer, never
  Gemini's raw response body. Output is capped (2048 tokens for chat
  replies, 400 for Command Center) -- both were far tighter (300/200)
  for a few hours tonight while chasing latency, which turned out to
  cut off genuinely long answers mid-sentence; raised back with real
  headroom once that surfaced
- If Groq itself times out or errors after the retry, `geminiFetch.ts`
  now falls back automatically to Gemini rather than failing the
  request outright -- same request/response shape translated between
  the two APIs, including tool-calling for Command Center. `AI_PROVIDER`
  defaults to `groq`; `GROQ_API_KEY` is the one that's actually
  required now, `LLM_API_KEY` (Gemini) is the optional fallback --
  this flipped when Groq became primary, and without a Groq key every
  chat message fails outright rather than falling back
- The customer chat has its own font (Nunito, via `next/font/google`,
  scoped to that page only) and opens with a warm greeting bubble
  using the business's actual name -- the admin side intentionally
  stays plain system sans-serif, this was specifically about the
  surface a customer sees feeling more personable
- Customers can also message a business on WhatsApp instead of using
  `/chat/[slug]` (`app/api/webhooks/whatsapp/route.ts`). Both entry
  points now go through the same `lib/chat/processMessage.ts` pipeline
  -- one place that builds context, calls the model, and saves
  messages, not two implementations that quietly drift apart. Inbound
  webhooks are signature-verified (HMAC-SHA256, constant-time compare)
  and deduped against a `whatsapp_processed_messages` table, since
  WhatsApp can and does redeliver the same webhook. Each business sets
  its own WhatsApp phone number ID in Settings (`0007` migration) --
  there's no single global number, so this isn't limited to one
  hardcoded business the way the first working version was. The
  WhatsApp path also runs through the same `checkRateLimit` the web
  chat already used, keyed on the sender's WhatsApp number instead of
  IP -- the original version had no rate limiting on this path at all

## What's still deliberately not here

- Pagination on the conversations list (caps at 50, oldest drop off
  past that)
- Bulk actions anywhere -- deleting 10 FAQs is 10 separate confirms
- Loading past conversation history back into the customer chat UI on
  page reload (still stored correctly server-side, just not re-fetched
  into view)
- `proxy.ts` (Next.js 16's renamed `middleware.ts`) for session
  refresh -- deferred on purpose, its only job would be convenience
  session refresh, not security

## Setup

1. `npm install`
2. Create a Supabase project. Copy `.env.example` to `.env.local` and
   fill in the three Supabase values, plus `GROQ_API_KEY`
   (console.groq.com -- free tier). Optionally add `LLM_API_KEY`
   (aistudio.google.com -- Google AI Studio, also free tier) so Groq
   outages fall back to Gemini instead of failing the request.
   Optionally add the `WHATSAPP_*` values (developers.facebook.com --
   WhatsApp Business Platform) so customers can message a business on
   WhatsApp instead of only the web chat -- each business still sets
   its own phone number ID afterward, in Settings.
3. Run every file in `supabase/migrations/`, in order, in the Supabase
   SQL editor.
4. Create your admin user: Supabase dashboard -> Authentication -> Add
   user.
5. Bootstrap yourself as the first platform admin (RLS blocks a normal
   insert here -- see the comment at the bottom of `0001`):
   ```sql
   insert into platform_admins (id, email)
   values ('<your-auth-user-uuid>', '<your-email>');
   ```
6. `npm run dev`, visit `/admin/login`.
7. Create a business, open its management hub, add at least one
   service and a day of hours. Then visit `/chat/<slug>` and ask
   about it.

## A few things worth knowing

- `SUPABASE_SERVICE_ROLE_KEY` must never be prefixed with `NEXT_PUBLIC_`.
  It's only read in `lib/supabase/service-role.ts`, only ever imported
  by the customer-chat path -- never by an admin page.
- Admin pages use the regular session-aware client
  (`lib/supabase/server.ts`), not service-role. A real admin can
  read/write because the `is_platform_admin()` RLS policy allows it for
  their session -- that's the actual boundary, not the checks in
  `admin-auth.ts` or the server actions, which exist for clean error
  messages rather than security.
- The customer-chat path has no RLS policy that applies to it -- 
  customers never get a Supabase session. Isolation there is enforced
  entirely by hand in `app/api/chat/route.ts` and
  `lib/ai/buildContext.ts`: every query filters by `business_id`
  explicitly, even when also filtering by another id.
- `lib/hours.ts` is the single source of truth for "is this business
  open right now." Don't reimplement this logic anywhere else --
  import it. It's already used by `buildContext.ts`, the admin hub,
  and the chat header; a fourth copy is how those three quietly start
  disagreeing with each other.
- "Mira status" on the hub (Online/Needs attention/Offline) is
  computed on every page load from existing columns, not stored
  anywhere. Nothing to keep in sync, nothing that can drift stale --
  it's just a read of the same facts the AI itself is grounded in.
- `lib/ai/buildContext.ts` fetches everything active for a business --
  no search, no ranking -- and formats it into one labeled text block.
  Deliberate, not a shortcut: see the RAG section of the architecture
  doc for why that's the more reliable choice at this scale.
- If you want to swap the LLM provider again, `lib/ai/generateReply.ts`
  is the only file that needs to change -- this already happened once
  (Anthropic to Gemini, for free-tier access with no card required)
  and nothing else in the chat flow needed to know.
