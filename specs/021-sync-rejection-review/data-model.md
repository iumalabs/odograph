# Phase 1 Data Model: Sync Rejection Review Screen

No new data of any kind — no D1 table, no IndexedDB store, no new field on `PendingAction`
(specs/020-offline-write-queue/data-model.md). This feature reads the existing `status: "rejected"`
and `rejectReason` fields and writes back only `status` and `rejectReason` (on retry, resetting both
to `"pending"`/`null`) via the same `putPendingAction`/`deletePendingAction` functions #20 already
exports from `offline/db.ts`.

## Derived (not stored) values

Both computed at display time from an existing `PendingAction`, never persisted:

- **Action description** (`offline/describe-action.ts`): `entity` + `actionType` + (where present)
  a recognizable field from `body` — e.g. a service record create/update shows its `description`;
  a fuel record shows its `fuelDate`; a reminder shows its `label`; a vehicle shows its `name`.
  Delete/dismiss-duplicate/mark-done actions have no body field to show beyond the entity/action-type
  phrase itself, since they act on an id, not a fresh payload.
- **Formatted reject reason** (`offline/reject-reason.ts`): the stored `rejectReason` string,
  translated to a friendlier phrase for recognized shapes (currently: `{"error":"invalid_request"}`)
  and shown verbatim otherwise (e.g. a plain-text `"404 Not Found"`).
