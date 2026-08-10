import { Hono } from "hono";
import { deletePlanCard, findPlanCardById, updatePlanCard } from "../../db/repository";
import type { PlanCardInput, PlanCardStage } from "../../db/repository";
import { rateLimitBySession } from "../../auth/rate-limit";
import { tenantContextOrToken } from "../../middleware/tenant-context";
import { idempotent } from "../../middleware/idempotency";
import type { AppEnv } from "../../types";

export const planCards = new Hono<AppEnv>();

planCards.use("*", tenantContextOrToken);

const PLAN_CARD_STAGES = new Set(["idea", "buy", "doing", "done"]);

planCards.get("/:id", async (c) => {
  const card = await findPlanCardById(c.env.DB, c.get("tenant"), c.req.param("id"));
  if (!card) return c.notFound();
  return c.json(card);
});

type PatchBody = {
  title?: unknown;
  stage?: unknown;
  targetDate?: unknown;
  estimatedCost?: unknown;
  urgent?: unknown;
};

function validatePatch(
  body: PatchBody,
): (Partial<PlanCardInput> & { stage?: PlanCardStage }) | null {
  const patch: Partial<PlanCardInput> & { stage?: PlanCardStage } = {};

  if ("title" in body) {
    if (typeof body.title !== "string" || body.title.length === 0) return null;
    patch.title = body.title;
  }
  if ("stage" in body) {
    if (typeof body.stage !== "string" || !PLAN_CARD_STAGES.has(body.stage)) return null;
    patch.stage = body.stage as PlanCardStage;
  }
  if ("targetDate" in body) {
    if (body.targetDate !== null && typeof body.targetDate !== "string") return null;
    patch.targetDate = typeof body.targetDate === "string" ? body.targetDate : null;
  }
  if ("estimatedCost" in body) {
    if (body.estimatedCost !== null && typeof body.estimatedCost !== "number") return null;
    patch.estimatedCost = typeof body.estimatedCost === "number" ? body.estimatedCost : null;
  }
  if ("urgent" in body) {
    if (typeof body.urgent !== "boolean") return null;
    patch.urgent = body.urgent;
  }

  return patch;
}

planCards.patch("/:id", rateLimitBySession, idempotent, async (c) => {
  const body = await c.req.json().catch(() => ({}) as PatchBody);
  const patch = validatePatch(body);
  if (!patch) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const card = await updatePlanCard(c.env.DB, c.get("tenant"), c.req.param("id"), patch);
  if (!card) return c.notFound();
  return c.json(card);
});

planCards.delete("/:id", rateLimitBySession, idempotent, async (c) => {
  const deleted = await deletePlanCard(c.env.DB, c.get("tenant"), c.req.param("id"));
  if (!deleted) return c.notFound();
  return c.body(null, 204);
});
