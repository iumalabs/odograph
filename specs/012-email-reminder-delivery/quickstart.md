# Quickstart: Email Reminder Delivery

## 1. Apply the new migration locally

```sh
wrangler d1 migrations apply odograph-preview --local
```

## 2. Run the automated test suite

```sh
deno task test
```

Expect `tests/server/reminder-rules.test.ts`'s scheduled-sweep section to pass, covering:

- A reminder crossing from "on track" to "coming up" triggers exactly one notification
  (`notified` count increments, `last_notified_severity` becomes `"coming_up"`).
- The same reminder staying "coming up" on the next sweep run does not notify again.
- The same reminder escalating further to "overdue" notifies again (a second, distinct
  notification).
- A reminder with "not enough data" never notifies.
- Marking a notified reminder done resets `last_notified_severity` to `NULL`, and it notifies
  again the next time it becomes due.
- A reminder belonging to an account with only a placeholder email doesn't notify, doesn't error,
  doesn't block the rest of the sweep, and its `last_notified_severity` is left unchanged so a
  later-added real email would still notify for that same due state.
- One reminder's simulated email failure (in addition to spec 011's simulated evaluation failure)
  doesn't stop the rest of the sweep from being evaluated and notified.

## 3. Manual smoke test

Since this feature has no HTTP route or client UI (it's a scheduled-sweep side effect), there's no
`deno task dev` browser walkthrough. Verify instead:

1. `wrangler d1 migrations apply odograph-preview --local` succeeds and `reminder_rules` now has a
   `last_notified_severity` column (`wrangler d1 execute odograph-preview --local --command "PRAGMA
table_info(reminder_rules)"`).
2. Create a reminder rule via the existing API (spec 011) that computes to "overdue," then invoke
   the sweep the same way the automated test does (`createScheduledController()`), or wait for the
   real daily Cron Trigger after deploying — confirm via a direct D1 query that
   `last_notified_severity` is now `"overdue"`.
3. Confirm no email is attempted for a reminder whose owning account's `users.email` is a
   `@example.invalid` placeholder and has no linked `magic_link_identities` row — by inspecting
   that `last_notified_severity` stayed `NULL` (or unchanged) after a sweep run, not by trying to
   observe an actual email (this project has no test/dev tooling for reading sent email content —
   research.md Decision 7).
