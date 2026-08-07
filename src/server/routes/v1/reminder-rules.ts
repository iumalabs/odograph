import { Hono } from "hono";
import {
  deleteReminderRule,
  findReminderRuleById,
  markReminderRuleDone,
  updateReminderRule,
} from "../../db/repository";
import type { ReminderRuleInput } from "../../db/repository";
import { rateLimitBySession } from "../../auth/rate-limit";
import { tenantContextOrToken } from "../../middleware/tenant-context";
import { idempotent } from "../../middleware/idempotency";
import type { AppEnv } from "../../types";

export const reminderRules = new Hono<AppEnv>();

reminderRules.use("*", tenantContextOrToken);

reminderRules.get("/:id", async (c) => {
  const rule = await findReminderRuleById(c.env.DB, c.get("tenant"), c.req.param("id"));
  if (!rule) return c.notFound();
  return c.json(rule);
});

reminderRules.post("/:id/mark-done", rateLimitBySession, idempotent, async (c) => {
  const rule = await markReminderRuleDone(c.env.DB, c.get("tenant"), c.req.param("id"));
  if (!rule) return c.notFound();
  return c.json(rule);
});

type PatchBody = {
  label?: unknown;
  intervalDays?: unknown;
  intervalDistance?: unknown;
  lastDoneDate?: unknown;
  lastDoneOdometer?: unknown;
};

function validatePatch(body: PatchBody): Partial<ReminderRuleInput> | null {
  const patch: Partial<ReminderRuleInput> = {};

  if ("label" in body) {
    if (typeof body.label !== "string" || body.label.length === 0) return null;
    patch.label = body.label;
  }
  if ("intervalDays" in body) {
    if (body.intervalDays !== null && typeof body.intervalDays !== "number") return null;
    patch.intervalDays = typeof body.intervalDays === "number" ? body.intervalDays : null;
  }
  if ("intervalDistance" in body) {
    if (body.intervalDistance !== null && typeof body.intervalDistance !== "number") return null;
    patch.intervalDistance = typeof body.intervalDistance === "number"
      ? body.intervalDistance
      : null;
  }
  if ("lastDoneDate" in body) {
    if (body.lastDoneDate !== null && typeof body.lastDoneDate !== "string") return null;
    patch.lastDoneDate = typeof body.lastDoneDate === "string" ? body.lastDoneDate : null;
  }
  if ("lastDoneOdometer" in body) {
    if (body.lastDoneOdometer !== null && typeof body.lastDoneOdometer !== "number") return null;
    patch.lastDoneOdometer = typeof body.lastDoneOdometer === "number"
      ? body.lastDoneOdometer
      : null;
  }

  return patch;
}

reminderRules.patch("/:id", rateLimitBySession, async (c) => {
  const id = c.req.param("id");
  const tenant = c.get("tenant");

  const body = await c.req.json().catch(() => ({}) as PatchBody);
  const patch = validatePatch(body);
  if (!patch) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const existing = await findReminderRuleById(c.env.DB, tenant, id);
  if (!existing) return c.notFound();

  const nextIntervalDays = "intervalDays" in patch ? patch.intervalDays : existing.intervalDays;
  const nextIntervalDistance = "intervalDistance" in patch
    ? patch.intervalDistance
    : existing.intervalDistance;
  if (nextIntervalDays === null && nextIntervalDistance === null) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const rule = await updateReminderRule(c.env.DB, tenant, id, patch);
  return c.json(rule);
});

reminderRules.delete("/:id", rateLimitBySession, idempotent, async (c) => {
  const deleted = await deleteReminderRule(c.env.DB, c.get("tenant"), c.req.param("id"));
  if (!deleted) return c.notFound();
  return c.body(null, 204);
});
