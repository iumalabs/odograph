# Quickstart: Web Push Reminder Delivery

`deno task check` covers the new server-side endpoints and repository functions
(`tests/server/push-subscriptions.test.ts`) plus the full existing suite. The actual outbound push
send and the client-side subscribe/service-worker flow have no equivalent under
`vitest`/`workerd` — verify live per the walkthrough below, using a real build
(`deno task build:preview`).

## One-time setup: VAPID keys

Before this feature works in any environment, a VAPID keypair must exist as Workers secrets. Once,
per environment (preview and production separately):

```sh
deno run -A npm:web-push-browser/generate-keys   # or equivalent one-off script — see
                                                   # research.md's chosen library's own docs
wrangler secret put VAPID_PUBLIC_KEY --env preview
wrangler secret put VAPID_PRIVATE_KEY --env preview
```

(Repeat for `--env production` with its own keypair, or reuse the same pair across environments —
either is fine, VAPID keys aren't environment-sensitive the way session secrets are.)

## Manual walkthrough

1. `deno task build:preview`, sign in, open the app on a browser that supports the Push API.
2. **Opt in (User Story 1)**: find the "push notifications" toggle (alongside API tokens/account
   deletion), turn it on. Confirm the browser's native permission prompt appears, and once granted,
   the toggle reflects "enabled."
3. **Permission denied**: on a fresh browser profile (or after resetting the site's notification
   permission), turn the toggle on and deny the prompt. Confirm the app clearly says push isn't
   available, not a silent no-op or a false "enabled" state.
4. **Receive a notification**: with a reminder that's currently due (or about to be, per
   specs/011's own test setup), trigger the same scheduled sweep specs/012's quickstart already
   uses to test email (`wrangler dev`'s scheduled-event trigger, or the equivalent CI/local method
   already documented for testing the Cron Trigger). Confirm a push notification arrives even with
   the app's tab closed, and that clicking it opens the app.
5. **No duplicate on next sweep**: trigger the sweep again with nothing changed. Confirm no second
   notification arrives for the same reminder/severity (SC-004).
6. **Multiple devices (User Story 3)**: opt in from a second browser/profile for the same account.
   Trigger the sweep with a due reminder and confirm both devices receive it.
7. **Opt out (User Story 2)**: turn the toggle off on one device. Trigger the sweep again (with a
   still-due reminder) and confirm that device receives nothing, while the other opted-in device
   (from step 6) and email still fire normally.
8. **Dead subscription cleanup**: simulate an invalid subscription (e.g. uninstall/clear site data
   on one device without explicitly opting out first, or directly delete its browser-side
   subscription) and trigger the sweep. Confirm the sweep doesn't error, and that the row for that
   device is no longer present after this run (query `push_subscriptions` directly, or confirm via
   re-opting-in producing a fresh row rather than a duplicate).
