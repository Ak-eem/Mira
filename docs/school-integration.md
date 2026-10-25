# School vertical: backend and AI context (Phase 1)

Status: database schema, AI context and the owner-facing portal page are
implemented. A platform admin turns a business into a school with the
**School mode** switch in Admin > business > Settings; the owner then gets a
**School** page in their portal (sessions, terms, classes, fees per term,
and a paste-from-spreadsheet student import). Pure parsing/validation lives
in `lib/school/input.ts` (tested); saves are owner-only server actions in
`app/portal/(protected)/[businessId]/school/actions.ts`, backed by the same
RLS policies as the rest of the school tables. The AI reads changes within
about a minute (the business-context cache TTL).

Known limit: there is **no payment tracking**. The guardian lookup returns the
fee *schedule* for the student's class, not whether it has been paid, so Mira
cannot answer "has my child's fee been paid?".

## What exists

- `0057_school_layer.sql` — the original tables: `school_academic_sessions`,
  `school_terms`, `school_classes`, `school_fee_schedules`,
  `school_students`. Multi-tenant via `business_id`, RLS for owners and
  platform admins.
- `0062_business_type_and_school_lookup.sql` — adds
  `businesses.business_type` (`'general' | 'school'`), and the index
  `school_students` needs for a guardian-phone lookup to be fast rather
  than a sequential scan per inbound WhatsApp message.
- `0063_school_guardian_lookup.sql` — two `SECURITY DEFINER` functions:
  `find_school_student_by_guardian_phone(business_id, phone)` and
  `get_school_student_fee_status(business_id, student_id)`.
- `lib/ai/buildContext.ts` — a "School calendar" section (current session,
  its terms, class names) added to `buildBusinessContext()` for
  `business_type = 'school'`, plus a separate `getSchoolGuardianContext()`
  function and the `isSchoolGuardianLookupEligible()` gate it's called
  behind.
- `lib/chat/processMessage.ts` — calls the gate and, when eligible, passes
  the guardian context into `composeReply()` as `extraSystemContext`.

## The privacy boundary (read this before changing any of the above)

`buildBusinessContext()`'s result is cached and shared across **every**
customer conversation for a business, for up to `CONTEXT_TTL_MS`. A
specific guardian's child's fee status must never be written into that
object — doing so would let it leak into a different family's
conversation within the same cache window.

So the design is split in two, deliberately:

1. **Business-wide, cacheable**: the "School calendar" section in
   `buildBusinessContext()` — session dates, term dates, class names. Safe
   to share with any customer of that business, no guardian-specific data.
2. **Per-conversation, never cached**: `getSchoolGuardianContext()`,
   called fresh on every message, gated by `isSchoolGuardianLookupEligible()`
   to WhatsApp + `business_type = 'school'` + a real `wa_` session token.
   Its result is passed into `composeReply()` as a separate
   `extraSystemContext` argument, appended to the prompt *after*
   `buildSystemPrompt()` runs on the cacheable context — it is never
   merged into anything cached.

The actual guardian-to-student match happens **inside Postgres**, in
`find_school_student_by_guardian_phone()`, scoped to `business_id` and a
normalized phone match, before any row leaves the database. Application
code must never attempt this match itself (e.g. by selecting all students
for a business and filtering in TypeScript) — that would mean a full
roster, including every other family's data, passing through application
memory on every message.

Phone matching compares the **last 10 digits** of both sides
(`guardian_phone` on file vs. the inbound number), so `"+234 803 123
4567"`, `"08031234567"`, and `"2348031234567"` all match the same
underlying number regardless of which format a school owner typed in or
how WhatsApp delivers the sender's number.

## Manual verification (no database in CI)

CI has no Postgres instance, so the SQL functions above are not covered by
`npm test` — only the TypeScript gating logic
(`lib/ai/schoolGuardian.test.ts`) is. To verify the SQL directly against a
local Postgres:

```sql
-- after applying 0001 through 0063 in order against a throwaway database:

insert into businesses (id, name, slug, business_type) values
  ('...', 'Test School', 'test-school', 'school');
-- ...insert a session, term, class, fee schedule, and a student with a
-- guardian_phone...

-- should return exactly one row, matching by last-10-digits regardless
-- of the format either side is stored/queried in:
select * from find_school_student_by_guardian_phone('<business_id>', '08031234567');

-- should return nothing for a student_id belonging to a DIFFERENT
-- business_id, even with a correct, real student_id:
select * from get_school_student_fee_status('<other_business_id>', '<student_id>');
```

The isolation case worth testing deliberately: two different businesses,
each with a student whose `guardian_phone` normalizes to the *same* last
10 digits. `find_school_student_by_guardian_phone(business_id_a, phone)`
must return business A's student, never business B's, proving the
isolation is enforced by `business_id` in the query and not an accident of
the phone numbers happening to be unique.

## What's left (not built)

- **Payment tracking** (who has paid what), which is what parents most often
  ask about.
- **Class-level fee schedule in the business-wide context**, so web chat and
  email (not just WhatsApp guardians) can answer "how much is JSS 1?". It is
  not guardian-specific, so it is safe to cache, but it needs a larger
  `SECTION_LIMITS.school` budget.
- **Editing** a session/term/class/student in place (today: delete and
  re-add, or re-import a student to update them).
- **Web chat / email guardian context.** `isSchoolGuardianLookupEligible()`
  is WhatsApp-only by design (that's the channel with a real phone number to
  match against). Extending it would need a different identity signal, such
  as an authenticated parent portal.
