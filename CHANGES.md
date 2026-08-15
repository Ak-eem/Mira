# Changes in this update

Run the 3 new migrations first (0009, 0010, 0011) — everything else depends
on them. No new env vars needed for any of this.

## This session — Nudges + business portal
Run migrations 0014-0018 in order. One new env var: `CRON_SECRET` (see
.env.example). If deploying to Vercel, `vercel.json` wires up the hourly
schedule automatically and Vercel sets the Authorization header itself —
just add `CRON_SECRET` in the project's env vars. Any other host: point
your own scheduler at `/api/cron/nudges` with the same header.

**What's real and working:** the schema for all of it (business_owners,
orders/order_items, product_interest, product_restock_events,
nudge_rules/nudge_sends/nudge_opt_outs, business_subscriptions); the full
business portal at `/portal` (its own login, business-scoped via new
`is_business_owner()` RLS policies added alongside the existing admin
ones — purely additive, nothing existing was touched); opt-out detection
on WhatsApp ("stop" etc, checked before anything else, confirmation reply,
respected globally across every rule); the rule-checking engine
(`lib/nudges/checkRules.ts`) with per-trigger-type targeting, the
max-per-week cap (configurable per business, admin sets it in Settings),
and quiet hours (9am-9pm business-local); "replied" tracking (an inbound
WhatsApp message after a nudge marks it replied); delivery/read receipts
(new `value.statuses` handling in the WhatsApp webhook, alongside the
existing `value.messages` handling); restock-event detection (wired into
the existing product stock-quantity update); admin controls to invite
portal owners (`auth.admin.inviteUserByEmail`) and set a business's
plan/Nudges tier.

**What's built but can't be tested end-to-end yet:** actual template
sends (`lib/nudges/sendTemplate.ts` calls Meta's template message API
correctly per their docs, but there's no approved template name to send
with yet — a rule with no `template_name` set just gets skipped by the
cron, silently and by design).

**Deliberate scope decisions, flagged rather than silently made:**
- Orders are logged manually in the portal for now (`orders/actions.ts`)
  — nothing infers an order from a chat. That's a separate, bigger
  decision (does Mira eventually take orders herself?) left alone here.
- Billing is a manual flag in Settings (`business_subscriptions.status`),
  no payment gateway wired up — matches "you invoice/track it yourself
  right now."
- Nudges only ever targets WhatsApp senders (`wa_<phone>`) — there's no
  way to proactively reach a web widget visitor who isn't looking at the
  page, so the web channel was left out entirely rather than half-built.
- "Estimated revenue impact" (portal Nudges page) is a rough heuristic —
  orders that got a nudge and later converted — not a real attribution
  model. Labeled as an estimate in the UI.
- Portal owners get read-only access to their catalogue/hours/etc, plus
  write access to orders, nudge rules, and resolving their own handoffs.
  Editing products/services/hours from the portal wasn't asked for and
  isn't there yet.

## This session — 4 bug fixes
Run migration 0012 too (`needs_human` column + index) — no new env vars.

- **Conversation isolation**: the embed widget runs inside a cross-site
  `<iframe>` on a business's own website, so the `mira_session` cookie it
  relied on for visitor identity is a third-party cookie — Safari ITP and
  Chrome increasingly won't send it back reliably. `ChatWindow.tsx` now
  generates a visitor id client-side (localStorage) and sends it
  explicitly with every message; `app/api/chat/route.ts` uses that (not
  the cookie) to decide identity (`web_{visitorId}`). WhatsApp's
  `wa_{from}` was already correct and needed no change.
- **Product images**: already fully wired for the customer-facing embed
  widget and chat page (they're the same `ChatWindow.tsx` component under
  the hood) — confirmed by reading the code and this file's own history
  below. What was actually missing: the *admin* conversation transcript
  viewer never fetched or rendered them, so a business owner reviewing a
  chat couldn't see what the customer saw. Fixed in
  `conversations/[conversationId]/page.tsx`.
- **Language consistency**: the "reply in the same language" rule was one
  bullet buried in an 8-item list. Pulled out into its own strict,
  prominent block in `buildPrompt.ts`: match the customer's most recent
  message specifically (not the conversation's opening language), and
  never blend languages within one reply.
- **Human handoff** (new feature): `classifyIntent.ts` gained a
  `human_handoff` intent, checked before everything else so it wins
  regardless of what else is in the message. `lib/chat/handoff.ts` is new
  — frustration detection plus deterministic, never-model-generated canned
  replies that never mention WhatsApp. Wired into both
  `processMessage.ts` and `app/api/chat/route.ts` (still two separate
  implementations — see below, unchanged from last time). Trigger =
  explicit request OR the fallback reply repeating twice in a row. Flags
  `conversations.needs_human`; the admin dashboard (businesses list,
  business hub, conversations list, conversation thread) all surface it,
  with a "Mark resolved" action on the thread page.

What I didn't touch: WhatsApp still can't send actual image messages
(unchanged scope from last time, see below); there's still no
per-business-owner login, so "notify the business owner" means "show it
in this admin dashboard" rather than email/push — there's no notification
infra in the codebase yet to hook into for that.

## Bug fixes (from the earlier review)
- `app/api/webhooks/whatsapp/route.ts`: added `after()` so the webhook acks
  Meta immediately instead of blocking on the LLM call; reply is now clipped
  to WhatsApp's 4096-char limit before sending; `markMessageProcessed`
  renamed to `isNewMessage` with corrected polarity (behavior was already
  correct, name was backwards); removed the redundant/latent-buggy
  `phone_number_id` fallback chain.
- `supabase/migrations/0009_one_open_conversation.sql` +
  `lib/chat/processMessage.ts` + `app/api/chat/route.ts`: partial unique
  index closes the race where two concurrent messages for a brand-new
  session could open two separate "open" conversations. Both call sites now
  catch `23505` on the conversation insert and re-select the winner's row.
- `.env.example`: removed `WHATSAPP_WABA_ID`, unused since migration 0007
  moved routing to per-business `whatsapp_phone_number_id`.

## Feature 3 — offline auto-reply
- `lib/chat/offlineReply.ts` (new): shared gate, used by both `processMessage`
  and the web route. Only fires on the **first** message of a brand-new
  conversation started outside business hours or during an active closure —
  every later message in that conversation still goes through the normal,
  already-hours-aware AI pipeline. Accounts for `closures`, not just weekly
  `business_hours`.

## Feature 2 — product images
- `supabase/migrations/0010_product_images.sql`: `products.image_url` +
  public-read/admin-write `product-images` storage bucket.
- `lib/ai/buildContext.ts`: products now carry `image_url`; product lines
  in the AI's context get a `[has photo]` marker (not the raw URL).
- `lib/chat/matchProductImages.ts` (new): after a reply is generated,
  matches product names mentioned in the text against the catalog and
  attaches their images — deterministic, doesn't rely on the model
  outputting URLs itself.
- Admin: `products/actions.ts` gets `uploadProductImage` /
  `removeProductImage`; `NewProductForm.tsx` and `ProductList.tsx` get
  upload/replace/remove UI and thumbnails.
- `ChatWindow.tsx` renders matched product images under assistant replies.
- Out of scope for now: sending actual WhatsApp image messages (Meta's media
  upload flow) — this only renders images in the web/embed chat UI.

## Feature 4 — feedback
- `supabase/migrations/0011_message_feedback.sql`: one feedback row per
  message, upsertable (customers can change their vote).
- `app/api/feedback/route.ts` (new): public, rate-limited endpoint.
- `ChatWindow.tsx`: thumbs up/down under assistant replies.
- Admin conversation thread page: shows the rating next to each message.

## Feature 1 — embed widget
- `app/chat/[businessSlug]/page.tsx` + `ChatWindow.tsx`: `?embed=1` drops
  the redundant business-name header (keeps the open/closed badge) and
  switches `min-h-screen` to `h-full` so it behaves inside a fixed-size
  iframe instead of assuming it owns the viewport.
- `public/embed.js` (new): vanilla JS, shadow-DOM isolated, floating bubble
  + lazy-loaded iframe pointed at `/chat/{slug}?embed=1`. Config via
  `data-business` (required), `data-title`, `data-primary-color`. Exposes
  `window.MiraChat.open()/close()/toggle()` so an existing nav link can
  open the same widget instead of navigating away.
- Note: your original spec had the iframe URL as `?embed=1&business=ID` —
  chat is actually routed by slug in the path (`/chat/[businessSlug]`), so
  `embed.js` targets `/chat/{slug}?embed=1` instead.

## What I didn't touch
`app/api/chat/route.ts` and `processMessage.ts` are still two separate
implementations (flagged last time) — I added the offline gate and the
race fix to both rather than unifying them, since that's a bigger,
deliberate call you didn't ask for this round.
