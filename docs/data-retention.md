# Data retention: what is automatic and what is manual

The Terms of Service and Privacy Policy make retention promises. This is how each one is kept.

## Automatic

| Data | Retention | How |
|---|---|---|
| WhatsApp / email inbound queue rows (raw message + sender id) | 30 days | `/api/cron/cleanup`, daily 03:30 (`vercel.json`). The number is `INBOUND_QUEUE_RETENTION_DAYS` in `lib/retention.ts`, which the legal pages also read. |

## Manual: deleting a business 30 days after it cancels

Owners cancel themselves in Portal > Settings > Cancel subscription. That switches Mira
off immediately on every channel and records `business_subscriptions.cancelled_at`.

The Terms say that 30 days after a business cancels, its knowledge data, catalogs and
chat histories are permanently deleted. **Nothing does this automatically.** It is done by
a platform admin using **Delete business** (Admin > business > Settings), which cascades
through all of that tenant's data.

> **Needs migration 0056.** Before it, the database blocked deleting any business whose
> subscription was not active (the paywall trigger also fired on DELETE), so this step
> failed with `SUBSCRIPTION_REQUIRED`. 0056 exempts deletes from the paywall.

To find businesses that are due, run this in the Supabase SQL editor (monthly is plenty):

```sql
select b.id, b.name, s.cancelled_at
from business_subscriptions s
join businesses b on b.id = s.business_id
where s.status = 'cancelled'
  and s.cancelled_at < now() - interval '30 days'
order by s.cancelled_at;
```

Notes:
- A business that resubscribes goes back to `active`; the query only lists `cancelled`
  rows, so it never lists a business that came back.
- Businesses cancelled by hand (before 0056) have no `cancelled_at`; find those with
  `where s.status = 'cancelled' and s.cancelled_at is null` and judge by `updated_at`.
- Deletion is permanent. If a business asked for an export (the Terms allow requests
  within the 30 days), make sure it was sent first.
- Expired trials are not "cancelled", so the query does not list them. Decide separately
  how long to keep an unpaid trial's data, and say so in the Privacy Policy if it matters.

## If you want this automated later

Do it as a dry run first: a job that only *lists* due businesses (for example to an admin
page or an email), and only after weeks of it listing the right ones, add the delete. An
unattended job that permanently deletes tenant data is the one place a bug costs a customer.
