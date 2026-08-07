export type PendingActionEntity = "vehicle" | "serviceRecord" | "fuelRecord" | "reminderRule";

export type PendingActionType = "create" | "update" | "delete" | "dismissDuplicate" | "markDone";

export type PendingActionStatus = "pending" | "syncing" | "rejected";

/** One queued write (data-model.md). Persisted verbatim in IndexedDB via db.ts. */
export type PendingAction = {
  id: string;
  sequence: number;
  entity: PendingActionEntity;
  actionType: PendingActionType;
  vehicleId: string | null;
  /**
   * The affected record's own id — for a "create" this is the same value as `id` (FR-007: the
   * client-assigned id doubles as the resource id); for update/delete/dismissDuplicate/markDone
   * it's the existing record's id, supplied at enqueue time (not parsed back out of `path`).
   */
  resourceId: string;
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  body: unknown;
  status: PendingActionStatus;
  rejectReason: string | null;
  createdAt: string;
};
