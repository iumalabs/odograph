import { Hono } from "hono";
import { consumeOidcState, createOidcState } from "../../../../db/repository";
import {
  buildCloudflareAuthorizationUrl,
  buildCloudflareConfig,
  completeCloudflareLink,
  completeCloudflareSignIn,
  exchangeCodeForTokens,
  getCloudflareJwks,
} from "../../../../auth/oidc/cloudflare";
import { rateLimitByIp, rateLimitBySession } from "../../../../auth/rate-limit";
import { tenantContext } from "../../../../middleware/tenant-context";
import type { AppEnv } from "../../../../types";

export const cloudflareOidcAuth = new Hono<AppEnv>();

function redirectUriFor(requestUrl: string): string {
  return new URL("/api/v1/auth/oidc/cloudflare/callback", requestUrl).toString();
}

function errorRedirect(requestUrl: string): Response {
  return Response.redirect(
    new URL("/?oidc=error&provider=cloudflare", requestUrl).toString(),
    302,
  );
}

// The write-path step (creates an oidc_states row) — rate-limited like Google's /start.
cloudflareOidcAuth.get("/start", rateLimitByIp, async (c) => {
  const config = buildCloudflareConfig(
    c.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
    c.env.CLOUDFLARE_ACCESS_CLIENT_ID,
  );
  const { state, codeVerifier } = await createOidcState(c.env.DB);
  const authorizationUrl = await buildCloudflareAuthorizationUrl(config, {
    clientId: c.env.CLOUDFLARE_ACCESS_CLIENT_ID,
    redirectUri: redirectUriFor(c.req.url),
    state,
    codeVerifier,
  });
  return c.redirect(authorizationUrl);
});

// Account linking (specs/005) — requires an already-authenticated session (FR-002/D-004); there is
// no unauthenticated variant of this route, unlike /start.
cloudflareOidcAuth.get("/link", tenantContext, rateLimitBySession, async (c) => {
  const config = buildCloudflareConfig(
    c.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
    c.env.CLOUDFLARE_ACCESS_CLIENT_ID,
  );
  const { state, codeVerifier } = await createOidcState(c.env.DB, c.get("tenant").userId);
  const authorizationUrl = await buildCloudflareAuthorizationUrl(config, {
    clientId: c.env.CLOUDFLARE_ACCESS_CLIENT_ID,
    redirectUri: redirectUriFor(c.req.url),
    state,
    codeVerifier,
  });
  return c.redirect(authorizationUrl);
});

// Carries its own single-use secret (state) — not separately rate-limited, same reasoning
// Google's callback gives.
cloudflareOidcAuth.get("/callback", async (c) => {
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

  const config = buildCloudflareConfig(
    c.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
    c.env.CLOUDFLARE_ACCESS_CLIENT_ID,
  );

  const exchange = await exchangeCodeForTokens(config, {
    code,
    redirectUri: redirectUriFor(c.req.url),
    codeVerifier: consumed.codeVerifier,
    clientId: c.env.CLOUDFLARE_ACCESS_CLIENT_ID,
    clientSecret: c.env.CLOUDFLARE_ACCESS_CLIENT_SECRET,
  });
  if (!exchange.ok) {
    return errorRedirect(c.req.url);
  }

  const jwks = getCloudflareJwks(
    c.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN,
    c.env.CLOUDFLARE_ACCESS_CLIENT_ID,
  );

  if (consumed.linkingUserId) {
    const linkResult = await completeCloudflareLink(c.env.DB, config, exchange.idToken, {
      jwks,
      audience: c.env.CLOUDFLARE_ACCESS_CLIENT_ID,
      linkingUserId: consumed.linkingUserId,
    });
    if (!linkResult.ok) {
      return errorRedirect(c.req.url);
    }
    c.header("Set-Cookie", linkResult.cookie);
    return c.redirect(new URL("/app?oidc=linked&provider=cloudflare", c.req.url).toString());
  }

  const result = await completeCloudflareSignIn(c.env.DB, config, exchange.idToken, {
    jwks,
    audience: c.env.CLOUDFLARE_ACCESS_CLIENT_ID,
  });
  if (!result.ok) {
    return errorRedirect(c.req.url);
  }

  c.header("Set-Cookie", result.cookie);
  return c.redirect(new URL("/app?oidc=ok&provider=cloudflare", c.req.url).toString());
});
