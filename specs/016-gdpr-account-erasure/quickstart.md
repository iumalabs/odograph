# Quickstart: GDPR Account Erasure

No migration — this feature deletes existing rows and objects only.

## 1. Run the automated test suite

```sh
deno task test
```

Expect `tests/server/account-erasure.test.ts` to pass — full erasure across every affected table and
every R2 object for an account with vehicles/records/attachments/reminders, a second tenant's data
left completely untouched, an outstanding sign-in magic-link token gone after deletion, a missing or
wrong `confirm` value changing nothing, and the session cookie cleared and unusable immediately
after a successful deletion.

## 2. Manual smoke test end-to-end

```sh
deno task dev
```

Using the dev session bootstrap route and the existing vehicle/service-record/fuel-record/
reminder-rule creation routes to seed a realistic account first:

1. Seed an account with at least one vehicle, a service record with an attachment, a fuel record
   with an attachment, and a reminder rule. Confirm they're all visible in the app.
2. Request a sign-in magic link for the same account's email (without clicking it) — this leaves an
   outstanding, unconsumed token in place.
3. Open the account deletion flow. Confirm attempting to proceed without typing the exact
   confirmation phrase does nothing — no request is sent, nothing changes, and closing the flow
   leaves the account fully intact and usable.
4. Type the exact confirmation phrase and confirm deletion.
5. Confirm the app immediately reflects a signed-out state, and that navigating anywhere the app
   would normally require a session behaves exactly as it would for a visitor who was never signed
   in.
6. Attempt the sign-in magic link from step 2 — confirm it no longer works.
7. Sign up as a brand new account, seed one vehicle, and confirm it's unaffected by the earlier
   account's deletion — proving tenant isolation held throughout.
