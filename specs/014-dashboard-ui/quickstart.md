# Quickstart: Dashboard UI

No migration, no new server route — nothing to apply before starting the client.

## Manual smoke test end-to-end

```sh
deno task dev
```

Using the dev session bootstrap route (`POST /api/v1/_dev/session`) and the existing vehicle/
service-record/fuel-record/reminder-rule creation routes to seed data (or the app's own forms):

1. Sign in with zero vehicles. Select the Dashboard nav entry — confirm the empty state renders, not
   a blank screen.
2. Create one vehicle with no service or fuel records yet. Open the Dashboard — confirm its card
   shows "not enough data" for every aggregate figure, and an "all good" indicator (no reminders
   yet).
3. Log a service and a fuel record for that vehicle establishing a nonzero cost/distance/time span
   (mirroring spec 013's own quickstart scenario). Refresh the Dashboard — confirm the card now
   shows real `costPerDistance`/`costPerTime` figures.
4. Add a reminder rule for that vehicle and mark it overdue (a date-based rule with a `lastDoneDate`
   far enough in the past). Open the Dashboard — confirm the card now shows the needs-attention
   indicator instead of "all good."
5. Create a second vehicle with no reminders needing attention. Confirm the Dashboard shows both
   vehicles side by side, each with its own independent state — the first flagged, the second "all
   good."
6. Select the flagged vehicle's card — confirm the app switches to the Garage/detail view for
   exactly that vehicle, with its full service/fuel/reminder history visible.
7. Return to the Dashboard via the nav rail — confirm both vehicles and their states are still
   correct (re-fetched, not stale from before step 4's change).
8. Sign in as a second tenant with its own vehicle — confirm its Dashboard shows only its own
   vehicle, never the first tenant's.
