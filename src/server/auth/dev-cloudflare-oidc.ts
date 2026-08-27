import { Hono } from "hono";
import { buildCloudflareConfig, completeCloudflareSignIn } from "./oidc/cloudflare";
import { FIXTURE_AUDIENCE, fixtureJwks, signFixtureIdToken } from "./oidc/fixture";
import { notFoundOutsideDev } from "./dev-session";
import type { AppEnv } from "../types";

/**
 * Cloudflare counterpart to dev-oidc.ts (specs/061) — same reasoning: the real /callback is
 * irreducibly coupled to a live Cloudflare Access network call before JWKS verification even
 * runs, so this signs a fixture ID token and drives completeCloudflareSignIn with the local
 * fixture JWKS instead, using a fixture-only provider config (real team-domain/client-id secrets
 * aren't needed at all for this path). Gated production-inert via the same notFoundOutsideDev
 * pattern as every other dev-only route.
 */
export const devCloudflareOidc = new Hono<AppEnv>();

const FIXTURE_CONFIG = buildCloudflareConfig("test-team", "fixture-client-id");

devCloudflareOidc.get("/", notFoundOutsideDev, async (c) => {
  const email = c.req.query("email");
  if (!email) {
    return c.json({ error: "invalid_request" }, 400);
  }

  // Deterministic, not random: a repeat call with the same email must resolve the same account,
  // not create a duplicate — account resolution is keyed by (provider, subject), never email
  // (D-004), so the subject itself has to be stable across calls.
  const sub = `dev-fixture:${email}`;
  const idToken = await signFixtureIdToken({
    sub,
    email,
    audience: FIXTURE_AUDIENCE,
    issuer: FIXTURE_CONFIG.issuers[0],
  });
  const result = await completeCloudflareSignIn(c.env.DB, FIXTURE_CONFIG, idToken, {
    jwks: await fixtureJwks(),
    audience: FIXTURE_AUDIENCE,
  });
  if (!result.ok) {
    return c.json({ error: "sign_in_failed" }, 500);
  }

  c.header("Set-Cookie", result.cookie);
  return c.redirect(new URL("/?oidc=ok&provider=cloudflare", c.req.url).toString());
});
