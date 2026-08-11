import { Hono } from "hono";
import { findMagicLinkTokenByEmail } from "../db/repository";
import { notFoundOutsideDev } from "./dev-session";
import type { AppEnv } from "../types";

/**
 * Read-only test hook (specs/031) sitting alongside the real magic-link flow
 * (src/server/routes/v1/auth/magic-link.ts) — never creates, invalidates, or
 * consumes a token, only retrieves one already issued by the real /request
 * route. Reuses dev-session.ts's notFoundOutsideDev so production is exactly
 * as inert as this repo's existing dev-only routes (research.md).
 */
export const devMagicLink = new Hono<AppEnv>();

devMagicLink.get("/", notFoundOutsideDev, async (c) => {
  const email = c.req.query("email") ?? "";
  const row = await findMagicLinkTokenByEmail(c.env.DB, email);
  return c.json({ token: row?.token ?? null, expiresAt: row?.expiresAt ?? null });
});
