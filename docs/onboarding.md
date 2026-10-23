# Signup setup wizard

New owners land on `/portal/<id>/setup` the first time they open their
dashboard. It asks four questions and can be skipped at any step.

## Who sees it

- Only **new** businesses. Migration 0065 marks every business that already
  exists as complete, once, when the column is first added (guarded so
  re-applying the file doesn't mark later signups complete).
- Only the **owner**. Staff go straight to the dashboard, and
  `complete_onboarding()` refuses anyone but the owner or a platform admin.
- Skipping also marks it complete, so it can't trap anyone. The page can be
  opened again at the same URL; answers can be changed by running it again.
- If the `onboarding_completed_at` column can't be read (migration not yet
  applied) nobody is redirected.

## What each answer actually does today

| Question | Stored in | What acts on it |
|---|---|---|
| Do you have a website? | nothing | **Yes** runs the existing scraper and the review screen below. **No** just continues. |
| Reply to emails too? | `wants_email_channel` | **Nothing yet.** Email replies need an inbound address that only Mira staff can set (nothing in the app writes `email_inbound_address`). The answer is recorded so we know who wants it. |
| Track stock? | `tracks_inventory` | **Nothing yet.** Stock behaviour is driven by a product having a `stock_quantity`, not by this flag. Recorded only. |
| How do you deliver? | `logistics_provider` | **Shiip** points the owner at Settings -> Delivery tracking on the last screen. Other couriers are recorded (to show which to build next) and the wizard says plainly they aren't connectable. `self` = delivers themselves; NULL = didn't answer. |

If those two "nothing yet" answers should do something, that's a follow-up:
self-serve email address setup, and a decision on what "tracks stock"
should switch on.

## Reviewing scraped items

Every suggestion starts ticked; one Select all / Unselect all toggle; one
confirm button that states both counts (e.g. "Add 7 and discard 3").
Ticked items go live, unticked are **discarded** (left pending they'd
clutter the list forever). It is not all-or-nothing: each item is its own
transaction because importing a product photo is a network call, so one
failing never undoes the others and every item gets its own outcome.
A product whose photo can't be imported is still added without it.

## Not verified

- The screens were **not exercised in a browser** (none is available where
  this was built): they were type-checked, linted, and server-rendered, and
  the logic behind them (selection, labels, batch rules, validation) is
  unit tested. Click through both screens once before relying on them.
- The scraper itself and the Shiip integration were not run against live
  sites/APIs.
