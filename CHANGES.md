# Changes in this update

Run the 3 new migrations first (0009, 0010, 0011) — everything else depends
on them. No new env vars needed for any of this.

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
