# Quickstart: Offline Write Queue

`deno task check` covers the server-side idempotency middleware and client-supplied-id creates
(new `tests/server/idempotency.test.ts`, plus the existing full server suite proving no regression).
The client queue engine itself (IndexedDB, drain loop, `navigator.onLine`) has no equivalent under
`vitest`/`workerd` — verify live per the manual walkthrough below, using a real build
(`deno task build:preview`), not `deno task dev`.

Manual walkthrough:

1. `deno task build:preview` and open the preview URL, signed in, with at least one vehicle.
2. **Core offline flow (User Story 1)**: DevTools → Network → "Offline." Create a service record and
   a fuel record. Confirm both appear immediately in their lists, visibly marked pending, with no
   error. Switch Network back to "Online" (or "No throttling"). Confirm both sync within a few
   seconds, automatically, with no action from you, and the pending marker clears.
3. **Ordering across a restart (User Story 2)**: Offline, create a fuel record, edit it (e.g. change
   the cost), then delete an older, already-synced service record for the same vehicle. Reload the
   page while still offline. Confirm all three actions are still shown as pending after reload, in
   the same order. Go back online. Confirm the fuel record ends up correctly edited (not duplicated,
   not reverted) and the service record ends up deleted.
4. **Interrupted sync**: Offline, queue 2-3 actions. Go online, and immediately (mid-sync) toggle
   back offline in DevTools, then online again a few seconds later. Confirm no action was applied
   twice and none were skipped — check the final record list matches exactly what you queued.
5. **Rejection surfaces, doesn't block the rest (User Story 3)**: Offline, queue an edit to a service
   record. In a second, separate signed-in session (or via `curl`/API token), delete that same
   record before the first session goes back online. Bring the first session back online. Confirm
   the edit is shown as rejected (not silently dropped, not shown as succeeded), and confirm any
   *other* pending actions queued alongside it still synced normally (rejection didn't block them).
6. **Rate-limit backoff (SC-005)**: Offline, queue more than 30 actions (the app's own rate limit is
   30 requests/60s per session — e.g. create many small service records). Go online. Confirm the
   full backlog eventually completes rather than erroring out partway through once the limit is hit.
7. **Session-expiry state (FR-011)**: Simulate an expired session (e.g. clear the session cookie via
   DevTools → Application → Cookies while a queued action exists) and go online. Confirm the app
   shows a distinct "sign in again to sync" state rather than marking the pending action(s) as
   individually rejected.
8. **At-a-glance indicator (FR-003/FR-012)**: While offline with pending actions queued, confirm the
   app shows both "you're offline" and a pending/rejected count somewhere visible without opening
   any per-record detail.
9. **Regression**: Confirm every mutation NOT covered by this feature (attachment upload, from #19)
   still requires being online and behaves exactly as before.
