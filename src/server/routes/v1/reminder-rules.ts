import { Hono } from "hono";
import { findReminderRuleById } from "../../db/repository";
import { tenantContext } from "../../middleware/tenant-context";
import type { AppEnv } from "../../types";

export const reminderRules = new Hono<AppEnv>();

reminderRules.use("*", tenantContext);

reminderRules.get("/:id", async (c) => {
  const rule = await findReminderRuleById(c.env.DB, c.get("tenant"), c.req.param("id"));
  if (!rule) return c.notFound();
  return c.json(rule);
});

// Routes added incrementally: PATCH/DELETE /:id, POST /:id/mark-done.
