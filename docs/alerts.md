# Operator alerts and the message queue

Set `ALERT_EMAIL_TO` (and the existing `RESEND_API_KEY` / `RESEND_FROM_EMAIL`) to get emails when something is wrong.

| Alert | When | Repeats |
|---|---|---|
| Message abandoned | a WhatsApp/email message used up its 5 attempts and was refused again | at most every 2 hours |
| Daily sweep | any customer message unanswered for 15+ minutes, or 5+ AI failures making up 20%+ of the last 24 hours of replies | at most every 20 hours |
| Cleanup job failed | the daily `/api/cron/cleanup` threw | at most every 6 hours |

The sweep runs inside the existing daily cleanup cron (`vercel.json`). If you are on a Vercel plan that allows more frequent crons, add the same path with a shorter schedule; the cooldowns keep it from spamming.

Mail sent to an address no business owns is ignored by the sweep (nothing can fix it).

## Retrying a stuck message

**Admin > Message queue** lists unanswered messages with their last error. **Retry** resets the attempt counter and runs the normal processing on the stored message.

- A reply that was already written is re-sent as-is, never regenerated.
- A message that is already answered is left alone.
- Email replies use an idempotency key, so a retry cannot double-send. WhatsApp has no such key: if an earlier send's outcome was never recorded, a retry can rarely deliver the reply twice.
