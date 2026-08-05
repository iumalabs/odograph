import { Hono } from "hono";
import {
  consumeMagicLinkToken,
  createMagicLinkUser,
  findMagicLinkIdentityByEmail,
  invalidateAndCreateMagicLinkToken,
} from "../../../db/repository";
import { isValidEmail, normalizeEmail, sendMagicLinkEmail } from "../../../auth/magic-link";
import { issueSession } from "../../../auth/session";
import { rateLimitByIp } from "../../../auth/rate-limit";
import type { AppEnv } from "../../../types";

export const magicLinkAuth = new Hono<AppEnv>();

magicLinkAuth.post("/request", rateLimitByIp, async (c) => {
  const body = await c.req.json().catch(() => null) as { email?: unknown } | null;
  if (typeof body?.email !== "string" || !isValidEmail(body.email)) {
    return c.json({ error: "invalid_email" }, 400);
  }
  const email = normalizeEmail(body.email);

  // Looked up only to choose email copy — never to change the response
  // shape or skip a step (FR-006). Every request does the same DB write and
  // send attempt regardless of the outcome here.
  const existing = await findMagicLinkIdentityByEmail(c.env.DB, email);
  const token = await invalidateAndCreateMagicLinkToken(c.env.DB, email);
  const result = await sendMagicLinkEmail(c.env, {
    email,
    token,
    requestUrl: c.req.url,
    isNewAccount: existing === null,
  });

  if (!result.sent) {
    return c.json({ error: "send_failed" }, 502);
  }
  return c.json({ sent: true });
});

magicLinkAuth.get("/verify", async (c) => {
  const token = c.req.query("token");
  const consumed = token ? await consumeMagicLinkToken(c.env.DB, token) : null;
  if (!consumed) {
    return c.redirect(new URL("/?magicLink=error", c.req.url).toString());
  }

  const existing = await findMagicLinkIdentityByEmail(c.env.DB, consumed.email);
  const userId = existing
    ? existing.userId
    : (await createMagicLinkUser(c.env.DB, consumed.email)).userId;

  const { cookie } = await issueSession(c.env.DB, userId);
  c.header("Set-Cookie", cookie);
  return c.redirect(new URL("/?magicLink=ok", c.req.url).toString());
});
