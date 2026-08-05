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

export function createReminderRule(
  vehicleId: string,
  input: {
    label: string;
    intervalDays?: number;
    intervalDistance?: number;
    lastDoneDate?: string;
    lastDoneOdometer?: number;
  },
): Promise<ReminderRule> {
  return jsonFetch(`/api/v1/vehicles/${vehicleId}/reminder-rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
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

export async function deleteReminderRule(id: string): Promise<void> {
  const res = await fetch(`/api/v1/reminder-rules/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`delete reminder rule failed: ${res.status}`);
  }
}

export function markDone(id: string): Promise<ReminderRule> {
  return jsonFetch(`/api/v1/reminder-rules/${id}/mark-done`, { method: "POST" });
}
