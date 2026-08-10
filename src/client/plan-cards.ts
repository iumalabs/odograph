import { enqueue } from "./offline/queue";
import type { PendingAction } from "./offline/types";

export type PlanCardStage = "idea" | "buy" | "doing" | "done";

export type PlanCard = {
  id: string;
  tenantId: string;
  vehicleId: string;
  title: string;
  stage: PlanCardStage;
  targetDate: string | null;
  estimatedCost: number | null;
  urgent: boolean;
  createdAt: string;
  updatedAt: string;
};

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function listPlanCards(vehicleId: string): Promise<PlanCard[]> {
  const { planCards } = await jsonFetch<{ planCards: PlanCard[] }>(
    `/api/v1/vehicles/${vehicleId}/plan-cards`,
  );
  return planCards;
}

/**
 * Builds a displayable card from a still-pending/rejected "create" action — stage is always
 * "idea" (creation never sets it, FR-001), the same value it would legitimately have before the
 * server ever assigns one. Shared between this module's own optimistic return value and
 * offline/merge.ts's overlay of the same action onto a fetched list.
 */
export function hydrateOptimisticPlanCard(action: PendingAction): PlanCard {
  const body = action.body as {
    id: string;
    title: string;
    targetDate?: string;
    estimatedCost?: number;
    urgent?: boolean;
  };
  return {
    id: body.id,
    tenantId: "",
    vehicleId: action.vehicleId ?? "",
    title: body.title,
    stage: "idea",
    targetDate: body.targetDate ?? null,
    estimatedCost: body.estimatedCost ?? null,
    urgent: body.urgent ?? false,
    createdAt: action.createdAt,
    updatedAt: action.createdAt,
  };
}

/** Routes through the offline write queue (spec 020) — this feature explicitly requires it
 * (unlike documents.ts, which deliberately bypasses the queue). */
export async function createPlanCard(
  vehicleId: string,
  input: { title: string; targetDate?: string; estimatedCost?: number; urgent?: boolean },
): Promise<PlanCard> {
  const action = await enqueue({
    entity: "planCard",
    actionType: "create",
    vehicleId,
    method: "POST",
    path: `/api/v1/vehicles/${vehicleId}/plan-cards`,
    body: input,
  });
  return hydrateOptimisticPlanCard(action);
}

export function getPlanCard(id: string): Promise<PlanCard> {
  return jsonFetch(`/api/v1/plan-cards/${id}`);
}

/** Routes through the offline write queue; the patch is overlaid onto the cached card for
 * display (offline/merge.ts) until the real sync response replaces it. Also used for stage
 * moves — a "move to done" is just a patch with `stage: "done"`. */
export async function updatePlanCard(
  id: string,
  vehicleId: string,
  patch: Partial<Pick<PlanCard, "title" | "stage" | "targetDate" | "estimatedCost" | "urgent">>,
): Promise<void> {
  await enqueue({
    entity: "planCard",
    actionType: "update",
    vehicleId,
    targetId: id,
    method: "PATCH",
    path: `/api/v1/plan-cards/${id}`,
    body: patch,
  });
}

export async function deletePlanCard(id: string, vehicleId: string): Promise<void> {
  await enqueue({
    entity: "planCard",
    actionType: "delete",
    vehicleId,
    targetId: id,
    method: "DELETE",
    path: `/api/v1/plan-cards/${id}`,
    body: undefined,
  });
}
