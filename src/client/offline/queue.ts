import { deletePendingAction, getAllPendingActionsInOrder, putPendingAction } from "./db";
import { isOnline, subscribeNetworkStatus } from "./network-status";
import type { PendingAction, PendingActionEntity, PendingActionType } from "./types";

export type EnqueueInput = {
  entity: PendingActionEntity;
  actionType: PendingActionType;
  vehicleId: string | null;
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  body: unknown;
};

export type SyncEvent =
  | { type: "synced"; action: PendingAction; responseBody: unknown }
  | { type: "needsReauth" }
  | { type: "reauthResolved" };

export type QueueSnapshot = {
  actions: PendingAction[];
  online: boolean;
  needsReauth: boolean;
};

// Single-flight, strictly sequence-ordered drain (research.md: ordering is a byproduct of never
// having more than one request in flight, not a server-side reordering mechanism — a per-vehicle
// order is always a subsequence of a correctly-maintained total order).
const TRANSIENT_RETRY_DELAY_MS = 3000;

let actions: PendingAction[] = [];
let online = isOnline();
let needsReauth = false;
let nextSequence = 1;
let draining = false;
let hydrated = false;

const listeners = new Set<() => void>();
const syncListeners = new Set<(event: SyncEvent) => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function emitSync(event: SyncEvent): void {
  for (const listener of syncListeners) listener(event);
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function onSyncEvent(listener: (event: SyncEvent) => void): () => void {
  syncListeners.add(listener);
  return () => syncListeners.delete(listener);
}

export function getSnapshot(): QueueSnapshot {
  return { actions, online, needsReauth };
}

/** Loads the persisted queue and resumes draining if online — call once at app startup. */
export async function init(): Promise<void> {
  if (hydrated) return;
  hydrated = true;

  const persisted = await getAllPendingActionsInOrder();
  // Anything still "syncing" from a previous session was interrupted mid-flight (tab closed,
  // device lost power) — safe to retry, never lost or double-applied (FR-008).
  actions = persisted.map((a) => (a.status === "syncing" ? { ...a, status: "pending" } : a));
  nextSequence = actions.reduce((max, a) => Math.max(max, a.sequence), 0) + 1;
  online = isOnline();
  notify();

  subscribeNetworkStatus((isNowOnline) => {
    online = isNowOnline;
    notify();
    if (isNowOnline) void drain();
  });

  if (online) void drain();
}

export async function enqueue(input: EnqueueInput): Promise<PendingAction> {
  const id = crypto.randomUUID();
  // For a create, the same id doubles as the new resource's own id (FR-007) — assigned before it
  // ever reaches the server, so a further offline edit/delete of this same record can still be
  // queued correctly.
  const body = input.actionType === "create" && input.body && typeof input.body === "object"
    ? { ...(input.body as Record<string, unknown>), id }
    : input.body;

  const action: PendingAction = {
    id,
    sequence: nextSequence++,
    entity: input.entity,
    actionType: input.actionType,
    vehicleId: input.vehicleId,
    method: input.method,
    path: input.path,
    body,
    status: "pending",
    rejectReason: null,
    createdAt: new Date().toISOString(),
  };

  actions = [...actions, action];
  notify();
  await putPendingAction(action);
  void drain();
  return action;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setStatus(action: PendingAction, status: PendingAction["status"]): Promise<void> {
  const updated: PendingAction = { ...action, status };
  actions = actions.map((a) => (a.id === action.id ? updated : a));
  notify();
  await putPendingAction(updated);
}

/**
 * Four response-outcome branches (research.md's drain-loop decision): 2xx succeeds and advances;
 * 401 pauses the *entire* queue for reauth, without marking anything rejected; 429/network
 * failure/5xx are transient — retry the same action after a delay, never surfaced as a rejection
 * (FR-010); any other 4xx is a genuine rejection (FR-009) — marked and the loop moves on to the
 * next action, not blocked by one rejection (SC-003).
 */
async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    for (;;) {
      if (needsReauth || !isOnline()) return;
      const next = actions.find((a) => a.status === "pending");
      if (!next) return;

      await setStatus(next, "syncing");

      let response: Response;
      try {
        response = await fetch(next.path, {
          method: next.method,
          headers: { "Content-Type": "application/json", "Idempotency-Key": next.id },
          body: next.method === "DELETE" ? undefined : JSON.stringify(next.body),
        });
      } catch {
        await setStatus(next, "pending");
        await sleep(TRANSIENT_RETRY_DELAY_MS);
        continue;
      }

      if (response.ok) {
        const responseBody = response.status === 204
          ? null
          : await response.json().catch(() => null);
        actions = actions.filter((a) => a.id !== next.id);
        notify();
        await deletePendingAction(next.id);
        emitSync({ type: "synced", action: next, responseBody });
        continue;
      }

      if (response.status === 401) {
        await setStatus(next, "pending");
        needsReauth = true;
        notify();
        emitSync({ type: "needsReauth" });
        return;
      }

      if (response.status === 429 || response.status >= 500) {
        await setStatus(next, "pending");
        const retryAfterHeader = response.headers.get("Retry-After");
        const retryAfterMs = retryAfterHeader
          ? Number(retryAfterHeader) * 1000
          : TRANSIENT_RETRY_DELAY_MS;
        await sleep(Number.isFinite(retryAfterMs) ? retryAfterMs : TRANSIENT_RETRY_DELAY_MS);
        continue;
      }

      // Any other 4xx: a real rejection, not a transient one.
      const rejectReason = await response.text().catch(() => "");
      const rejected: PendingAction = { ...next, status: "rejected", rejectReason };
      actions = actions.map((a) => (a.id === next.id ? rejected : a));
      notify();
      await putPendingAction(rejected);
      continue;
    }
  } finally {
    draining = false;
  }
}

/** Call once re-authentication completes — resumes draining (research.md). */
export function resolveReauth(): void {
  if (!needsReauth) return;
  needsReauth = false;
  notify();
  emitSync({ type: "reauthResolved" });
  if (isOnline()) void drain();
}

/** Removes a rejected action the user has acknowledged (used by a future review UI, issue #21). */
export function discardRejected(id: string): void {
  actions = actions.filter((a) => a.id !== id);
  notify();
  void deletePendingAction(id);
}
