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
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  body: unknown;
  status: PendingActionStatus;
  rejectReason: string | null;
  createdAt: string;
};
