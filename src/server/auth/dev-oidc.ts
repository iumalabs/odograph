import { Hono } from "hono";
import { completeGoogleSignIn } from "./oidc/google";
import { FIXTURE_AUDIENCE, fixtureJwks, signFixtureIdToken } from "./oidc/fixture";
import { notFoundOutsideDev } from "./dev-session";
import type { AppEnv } from "../types";

/**
 * Stands in for the ENTIRE real callback route's effect in one shot (specs/032 research.md) —
 * unlike dev-magic-link.ts, there's no separate real route this can hand a pre-obtained token to,
 * since the real /callback is irreducibly coupled to a live Google network call before JWKS
 * verification even runs. Signs a fixture ID token (oidc/fixture.ts, already proven safe with zero
 * real Google calls) and drives completeGoogleSignIn with the local fixture JWKS instead of the
 * real remote one — same account-resolution logic, same success response shape as /callback, so a
 * browser navigating here lands in the exact "signed in via Google" UI state a real user would.
 * Gated production-inert via the same notFoundOutsideDev pattern as every other dev-only route.
 */
export const devOidc = new Hono<AppEnv>();

devOidc.get("/", notFoundOutsideDev, async (c) => {
  const email = c.req.query("email");
  if (!email) {
    return c.json({ error: "invalid_request" }, 400);
  }

  // Deterministic, not random: a repeat call with the same email must resolve the same account
  // (FR-002), not create a duplicate — account resolution is keyed by (provider, subject), never
  // email (D-004), so the subject itself has to be stable across calls.
  const sub = `dev-fixture:${email}`;
  const idToken = await signFixtureIdToken({ sub, email });
  const result = await completeGoogleSignIn(c.env.DB, idToken, {
    jwks: await fixtureJwks(),
    audience: FIXTURE_AUDIENCE,
  });
  if (!result.ok) {
    return c.json({ error: "sign_in_failed" }, 500);
  }

  c.header("Set-Cookie", result.cookie);
  return c.redirect(new URL("/?oidc=ok", c.req.url).toString());
});
