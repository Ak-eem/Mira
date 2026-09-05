# P1 concurrency and abuse controls

- Chat limits use the `consume_rate_limit` Postgres function and durable fixed-window rows. Chat keeps the 20 requests/minute identity limit and adds 120/minute per-IP plus 2,000/minute global caps. The identity is the supplied widget visitor ID, falling back to the request IP.
- `conversation_processing_leases` serializes the complete conversation pipeline across instances. Leases expire after five minutes so a crashed invocation can be recovered; unusually slow work beyond that lease remains a follow-up risk.
- Both chat and WhatsApp reject text over 4,000 characters before conversation/message persistence or LLM work.
- WhatsApp verifies `X-Hub-Signature-256` before parsing and inserts inbound messages into `whatsapp_inbound_queue` before processing. Unique message IDs provide deduplication; failed work is retained with a retry time and the webhook returns 500 so Meta can retry.
- This branch does not add a worker trigger. A production deployment should run a small queue worker/cron that claims `pending`/`failed` rows, which also covers failures after webhook acknowledgement.
