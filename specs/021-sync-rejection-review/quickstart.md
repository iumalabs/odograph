# Quickstart: Sync Rejection Review Screen

`deno task check` covers formatting/linting/typechecking and the full existing server suite
(unaffected by this feature — see plan.md's Testing section). Verify live per the walkthrough below,
using a real build (`deno task build:preview`).

Manual walkthrough:

1. Produce at least one rejected action, mirroring specs/020's quickstart.md step 5: queue an
   offline edit to a service (or fuel) record, then have that record deleted through a second
   session before the edit syncs. Reconnect and confirm it's rejected (per #20's own behavior).
2. **Discoverability (FR-007/FR-008)**: without opening the review screen yet, confirm the nav rail
   and/or `SyncStatusIndicator` shows something needs attention, and confirm the review screen is
   reachable in one click from wherever you are in the app.
3. **Listing (User Story 1)**: open the review screen. Confirm the rejected edit is listed with a
   recognizable description (which record, what kind of change) and the server's rejection reason.
   Repeat step 1 for a *different* vehicle and confirm both rejections show up together in the same
   screen, not scoped to whichever vehicle is currently selected in Garage.
4. **Empty state (FR-009)**: with no rejections pending, open the review screen and confirm it says
   so clearly rather than rendering blank.
5. **Discard (User Story 2)**: from the review screen, discard one of the rejected items. Confirm it
   disappears from the screen and the record it targeted is unchanged from before the rejected
   attempt.
6. **Retry, succeeds (User Story 3)**: create a new rejection the same way as step 1, but this time
   resolve the underlying conflict (e.g. don't delete the record from elsewhere, or otherwise make
   the original request valid again) before retrying. Retry it from the review screen and confirm it
   syncs, disappears from the review screen, and its effect shows up in the normal record view.
7. **Retry, rejected again (User Story 3)**: create another rejection and retry it *without*
   resolving the underlying conflict. Confirm it's rejected again, remains listed, and shows a
   current reason (not a stale one from before the retry).
8. **Offline retry/discard**: with a rejected action listed, go offline (DevTools → Network →
   Offline) and confirm both discard and retry are still usable — discard still removes it
   immediately; retry marks it pending again and it waits for reconnection like any other queued
   action, without erroring or blocking the UI.
