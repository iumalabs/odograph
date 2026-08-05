import { Hono } from "hono";
import { consumeOidcState, createOidcState } from "../../../../db/repository";
import {
  buildGoogleAuthorizationUrl,
  completeGoogleSignIn,
  exchangeCodeForTokens,
  googleJwks,
} from "../../../../auth/oidc/google";
import { rateLimitByIp } from "../../../../auth/rate-limit";
import type { AppEnv } from "../../../../types";

export const googleOidcAuth = new Hono<AppEnv>();

function redirectUriFor(requestUrl: string): string {
  return new URL("/api/v1/auth/oidc/google/callback", requestUrl).toString();
}

function errorRedirect(requestUrl: string): Response {
  return Response.redirect(new URL("/?oidc=error", requestUrl).toString(), 302);
}

// The write-path step (creates an oidc_states row) — rate-limited like magic-link's /request.
googleOidcAuth.get("/start", rateLimitByIp, async (c) => {
  const { state, codeVerifier } = await createOidcState(c.env.DB);
  const authorizationUrl = await buildGoogleAuthorizationUrl({
    clientId: c.env.GOOGLE_CLIENT_ID,
    redirectUri: redirectUriFor(c.req.url),
    state,
    codeVerifier,
  });
  return c.redirect(authorizationUrl);
});

// Carries its own single-use secret (state) — not separately rate-limited, same reasoning
// magic-link's /verify gave (contracts/api.md).
googleOidcAuth.get("/callback", async (c) => {
  const errorParam = c.req.query("error");
  const state = c.req.query("state");
  const code = c.req.query("code");
  if (errorParam || !state || !code) {
    return errorRedirect(c.req.url);
  }

  const consumed = await consumeOidcState(c.env.DB, state);
  if (!consumed) {
    return errorRedirect(c.req.url);
  }

  const exchange = await exchangeCodeForTokens({
    code,
    redirectUri: redirectUriFor(c.req.url),
    codeVerifier: consumed.codeVerifier,
    clientId: c.env.GOOGLE_CLIENT_ID,
    clientSecret: c.env.GOOGLE_CLIENT_SECRET,
  });
  if (!exchange.ok) {
    return errorRedirect(c.req.url);
  }

  const result = await completeGoogleSignIn(c.env.DB, exchange.idToken, {
    jwks: googleJwks(),
    audience: c.env.GOOGLE_CLIENT_ID,
  });
  if (!result.ok) {
    return errorRedirect(c.req.url);
  }

  c.header("Set-Cookie", result.cookie);
  return c.redirect(new URL("/?oidc=ok", c.req.url).toString());
});
