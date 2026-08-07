import { enqueue } from "./offline/queue";
import type { PendingAction } from "./offline/types";

export type ReminderStatus = "on_track" | "coming_up" | "overdue" | "not_enough_data";

export type ReminderRule = {
  id: string;
  tenantId: string;
  vehicleId: string;
  label: string;
  intervalDays: number | null;
  intervalDistance: number | null;
  lastDoneDate: string | null;
  lastDoneOdometer: number | null;
  createdAt: string;
  updatedAt: string;
  status: ReminderStatus;
  byDate: ReminderStatus | null;
  byMileage: ReminderStatus | null;
  dueDate: string | null;
  dueOdometer: number | null;
};

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function listReminderRules(vehicleId: string): Promise<ReminderRule[]> {
  const { reminderRules } = await jsonFetch<{ reminderRules: ReminderRule[] }>(
    `/api/v1/vehicles/${vehicleId}/reminder-rules`,
  );
  return reminderRules;
}

/**
 * Builds a displayable rule from a still-pending/rejected "create" action — the server-computed
 * status fields are left at `"not_enough_data"`/`null`, the same legitimate value they'd have
 * before the server ever evaluates them, not a guess (constitution Principles II and IV). Shared
 * between this module's own optimistic return value and offline/merge.ts's overlay of the same
 * action onto a fetched list.
 */
export function hydrateOptimisticReminderRule(action: PendingAction): ReminderRule {
  const body = action.body as {
    id: string;
    label: string;
    intervalDays?: number;
    intervalDistance?: number;
    lastDoneDate?: string;
    lastDoneOdometer?: number;
  };
  return {
    id: body.id,
    tenantId: "",
    vehicleId: action.vehicleId ?? "",
    label: body.label,
    intervalDays: body.intervalDays ?? null,
    intervalDistance: body.intervalDistance ?? null,
    lastDoneDate: body.lastDoneDate ?? null,
    lastDoneOdometer: body.lastDoneOdometer ?? null,
    createdAt: action.createdAt,
    updatedAt: action.createdAt,
    status: "not_enough_data",
    byDate: null,
    byMileage: null,
    dueDate: null,
    dueOdometer: null,
  };
}

/** Routes through the offline write queue (spec 020). */
export async function createReminderRule(
  vehicleId: string,
  input: {
    label: string;
    intervalDays?: number;
    intervalDistance?: number;
    lastDoneDate?: string;
    lastDoneOdometer?: number;
  },
): Promise<ReminderRule> {
  const action = await enqueue({
    entity: "reminderRule",
    actionType: "create",
    vehicleId,
    method: "POST",
    path: `/api/v1/vehicles/${vehicleId}/reminder-rules`,
    body: input,
  });
  return hydrateOptimisticReminderRule(action);
}

export function getReminderRule(id: string): Promise<ReminderRule> {
  return jsonFetch(`/api/v1/reminder-rules/${id}`);
}

export function updateReminderRule(
  id: string,
  patch: Partial<ReminderRule>,
): Promise<ReminderRule> {
  return jsonFetch(`/api/v1/reminder-rules/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteReminderRule(id: string, vehicleId: string): Promise<void> {
  await enqueue({
    entity: "reminderRule",
    actionType: "delete",
    vehicleId,
    targetId: id,
    method: "DELETE",
    path: `/api/v1/reminder-rules/${id}`,
    body: undefined,
  });
}

export async function markDone(id: string, vehicleId: string): Promise<void> {
  await enqueue({
    entity: "reminderRule",
    actionType: "markDone",
    vehicleId,
    targetId: id,
    method: "POST",
    path: `/api/v1/reminder-rules/${id}/mark-done`,
    body: undefined,
  });
}
