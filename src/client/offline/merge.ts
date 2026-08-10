import type { PendingAction, PendingActionEntity } from "./types";
import type { Vehicle } from "../vehicles";
import { hydrateOptimisticVehicle } from "../vehicles";
import type { ServiceRecord } from "../service-records";
import { hydrateOptimisticServiceRecord } from "../service-records";
import type { FuelRecord } from "../fuel-records";
import { hydrateOptimisticFuelRecord } from "../fuel-records";
import type { ReminderRule } from "../reminder-rules";
import { hydrateOptimisticReminderRule } from "../reminder-rules";
import type { PlanCard } from "../plan-cards";
import { hydrateOptimisticPlanCard } from "../plan-cards";

export type SyncStatus = "pending" | "rejected";
export type WithSyncStatus<T> = T & { syncStatus?: SyncStatus; rejectReason?: string | null };

function relevantActions(actions: PendingAction[], entity: PendingActionEntity): PendingAction[] {
  // Sequence order matters: multiple queued edits to the same not-yet-synced record must apply
  // (and overlay for display) in the order the user made them (FR-005).
  return actions.filter((a) => a.entity === entity).sort((a, b) => a.sequence - b.sequence);
}

/**
 * Overlays pending/rejected actions for one entity type onto a server-fetched list (FR-002,
 * FR-013). A create not yet on the server is appended; a delete removes its target (even one that
 * only exists as an unsynced create — the edge case in spec.md where a record created and deleted
 * offline, both before either ever reaches the server, must never render at all); an update or
 * dismissDuplicate is overlaid onto the existing record via `applyPatch`, which never invents a
 * server-computed value (constitution Principle II/IV) — only fields the action's own body
 * actually specifies change.
 */
function mergeGeneric<T extends { id: string }>(
  server: T[],
  actions: PendingAction[],
  entity: PendingActionEntity,
  hydrateCreate: (action: PendingAction) => T,
  applyPatch: (record: T, action: PendingAction) => T,
): WithSyncStatus<T>[] {
  const relevant = relevantActions(actions, entity);
  // A *rejected* delete did NOT happen (FR-013: a rejected action's change is never applied) —
  // only a still-pending/syncing delete hides its target ahead of time.
  const pendingDeleteIds = new Set(
    relevant.filter((a) => a.actionType === "delete" && a.status !== "rejected").map((a) =>
      a.resourceId
    ),
  );

  const byId = new Map<string, WithSyncStatus<T>>();
  for (const record of server) {
    if (!pendingDeleteIds.has(record.id)) byId.set(record.id, { ...record });
  }

  for (const action of relevant) {
    const syncStatus: SyncStatus = action.status === "rejected" ? "rejected" : "pending";

    if (action.actionType === "delete") {
      // Only the rejected case needs anything done here — a pending delete already hid the
      // record above, with nothing further to tag until it resolves one way or the other.
      if (action.status === "rejected") {
        const existing = byId.get(action.resourceId);
        if (existing) {
          byId.set(action.resourceId, {
            ...existing,
            syncStatus,
            rejectReason: action.rejectReason,
          });
        }
      }
      continue;
    }

    if (action.actionType === "create") {
      if (!byId.has(action.resourceId)) {
        byId.set(action.resourceId, {
          ...hydrateCreate(action),
          syncStatus,
          rejectReason: action.rejectReason,
        });
      }
      continue;
    }

    // update / dismissDuplicate / markDone against an existing record. If it's missing here, the
    // only way that happens is the record was also deleted by a later queued action for the same
    // id — already excluded above, so there's nothing to overlay onto.
    const existing = byId.get(action.resourceId);
    if (!existing) continue;
    byId.set(action.resourceId, {
      ...applyPatch(existing, action),
      syncStatus,
      rejectReason: action.rejectReason,
    });
  }

  return Array.from(byId.values());
}

export function mergeVehicles(
  server: Vehicle[],
  actions: PendingAction[],
): WithSyncStatus<Vehicle>[] {
  return mergeGeneric(
    server,
    actions,
    "vehicle",
    hydrateOptimisticVehicle,
    (record, action) =>
      action.actionType === "update" ? { ...record, ...(action.body as Partial<Vehicle>) } : record,
  );
}

export function mergeServiceRecords(
  server: ServiceRecord[],
  actions: PendingAction[],
): WithSyncStatus<ServiceRecord>[] {
  return mergeGeneric(server, actions, "serviceRecord", hydrateOptimisticServiceRecord, (
    record,
    action,
  ) => {
    if (action.actionType === "update") {
      return { ...record, ...(action.body as Partial<ServiceRecord>) };
    }
    if (action.actionType === "dismissDuplicate") {
      return { ...record, duplicateOfId: null };
    }
    return record;
  });
}

export function mergeFuelRecords(
  server: FuelRecord[],
  actions: PendingAction[],
): WithSyncStatus<FuelRecord>[] {
  return mergeGeneric(server, actions, "fuelRecord", hydrateOptimisticFuelRecord, (
    record,
    action,
  ) => {
    if (action.actionType === "update") {
      return { ...record, ...(action.body as Partial<FuelRecord>) };
    }
    if (action.actionType === "dismissDuplicate") {
      return { ...record, duplicateOfId: null };
    }
    return record;
  });
}

export function mergeReminderRules(
  server: ReminderRule[],
  actions: PendingAction[],
): WithSyncStatus<ReminderRule>[] {
  // markDone's real effect (recomputed status/lastDone fields) is server-owned — no optimistic
  // field change here, only the pending/rejected tag (constitution Principle II).
  return mergeGeneric(
    server,
    actions,
    "reminderRule",
    hydrateOptimisticReminderRule,
    (record) => record,
  );
}

export function mergePlanCards(
  server: PlanCard[],
  actions: PendingAction[],
): WithSyncStatus<PlanCard>[] {
  // A stage move is just an "update" action with a `stage` field in its body — the done-
  // transition's service-record creation is a server-owned side effect (constitution Principle
  // II), never simulated here; the overlay only reflects the card's own fields.
  return mergeGeneric(server, actions, "planCard", hydrateOptimisticPlanCard, (record, action) => {
    if (action.actionType === "update") {
      return { ...record, ...(action.body as Partial<PlanCard>) };
    }
    return record;
  });
}
