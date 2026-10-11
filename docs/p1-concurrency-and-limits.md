# P1 concurrency and abuse controls

- Chat limits use the `consume_rate_limit` Postgres function and durable fixed-window rows. Chat keeps the 20 requests/minute identity limit and adds 120/minute per-IP plus 2,000/minute global caps. The identity is the supplied widget visitor ID, falling back to the request IP.
- `conversation_processing_leases` serializes the complete conversation pipeline across instances. Leases expire after five minutes so a crashed invocation can be recovered; unusually slow work beyond that lease remains a follow-up risk.
- Both chat and WhatsApp reject text over 4,000 characters before conversation/message persistence or LLM work.
- WhatsApp verifies `X-Hub-Signature-256` before parsing and inserts inbound messages into `whatsapp_inbound_queue` before processing. Unique message IDs provide deduplication; failed work is retained with a retry time and the webhook returns 500 so Meta can retry.
- No separate queue worker is needed: the webhook answers each message in the same request, and a failure makes it return 500 so Meta re-delivers. A message that is still unanswered after that (Meta gives up, or 5 attempts are used) appears in Admin > Message queue, triggers an alert email, and can be retried with one click (see `docs/alerts.md`). WhatsApp has no idempotency key, so a retry can rarely send the same reply twice.
