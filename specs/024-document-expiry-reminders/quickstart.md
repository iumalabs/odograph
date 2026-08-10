# Quickstart: Document Expiry Reminders

No new infrastructure to provision — this feature reuses the existing `EMAIL` binding, the
`web-push-browser` dependency, and the VAPID keys already set up in specs/022.

## 1. Apply the new migration locally

```sh
wrangler d1 migrations apply odograph-preview --local
```

## 2. Run the automated test suite

```sh
deno task test
```

Expect `tests/server/document-reminders.test.ts` to pass — status transitions (on track / coming
up / overdue) driven by `expiry_date` relative to "now," escalation firing exactly once per
transition, no repeat notification while unchanged, both channels skipped gracefully when
unavailable, and renewing (or clearing) a document's `expiryDate` clearing its notification state.

Also confirm the existing `reminder-rules.test.ts` suite still passes after the
`sendReminderDueEmail`/`sendReminderPushNotification` parameter rename (research.md) — both call
sites are updated, not just the new document ones added.

## 3. Manual smoke test end-to-end

```sh
deno task dev
```

1. Create a document with an expiry date 45 days out — confirm it shows on track.
2. Create a document with an expiry date 10 days out — confirm it shows coming up, and (if you've
   set up an `EMAIL`/push-capable local environment) that a notification actually arrives on the
   next scheduled evaluation.
3. Edit that document's expiry date further out — confirm its status returns to on track and any
   pending notification state resets.
4. Create a document with an expiry date in the past — confirm it shows overdue and triggers its
   own (separate) notification.
