import { createRemoteJWKSet } from "jose";
import * as client from "./client";
import type { OidcProviderConfig } from "./client";

// Cloudflare Access's "Generic OIDC" SaaS application mechanism (research.md Decisions 1-2,
// verified directly against Cloudflare's own docs 2026-08-26) — unlike Google, the endpoint
// hostnames are per-operator (keyed by their own Zero Trust team domain), not global constants,
// so these are built from CLOUDFLARE_ACCESS_TEAM_DOMAIN at config-construction time rather than
// hardcoded.

const PROVIDER = "cloudflare";

export function cloudflareIssuer(teamDomain: string): string {
  return `https://${teamDomain}.cloudflareaccess.com`;
}

function oidcBase(teamDomain: string, clientId: string): string {
  return `${cloudflareIssuer(teamDomain)}/cdn-cgi/access/sso/oidc/${clientId}`;
}

export function buildCloudflareConfig(teamDomain: string, clientId: string): OidcProviderConfig {
  const base = oidcBase(teamDomain, clientId);
  return {
    provider: PROVIDER,
    authorizationEndpoint: `${base}/authorization`,
    tokenEndpoint: `${base}/token`,
    issuers: [cloudflareIssuer(teamDomain)],
    scope: "openid email profile",
  };
}

export function cloudflareJwksUri(teamDomain: string, clientId: string): string {
  return `${oidcBase(teamDomain, clientId)}/jwks`;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Cached per (team, client) pair, per isolate — same reasoning as google.ts's googleJwks(). */
export function getCloudflareJwks(
  teamDomain: string,
  clientId: string,
): ReturnType<typeof createRemoteJWKSet> {
  const key = `${teamDomain}:${clientId}`;
  let jwks = jwksCache.get(key);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(cloudflareJwksUri(teamDomain, clientId)));
    jwksCache.set(key, jwks);
  }
  return jwks;
}

export function buildCloudflareAuthorizationUrl(
  config: OidcProviderConfig,
  input: { clientId: string; redirectUri: string; state: string; codeVerifier: string },
): Promise<string> {
  return client.buildAuthorizationUrl(config, input);
}

export function exchangeCodeForTokens(
  config: OidcProviderConfig,
  input: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
    clientId: string;
    clientSecret: string;
  },
): Promise<client.ExchangeResult> {
  return client.exchangeCodeForTokens(config, input);
}

export function completeCloudflareSignIn(
  db: D1Database,
  config: OidcProviderConfig,
  idToken: string,
  input: { jwks: Parameters<typeof client.completeSignIn>[3]["jwks"]; audience: string },
): Promise<client.CompleteSignInResult> {
  return client.completeSignIn(db, config, idToken, input);
}

export function completeCloudflareLink(
  db: D1Database,
  config: OidcProviderConfig,
  idToken: string,
  input: {
    jwks: Parameters<typeof client.completeLink>[3]["jwks"];
    audience: string;
    linkingUserId: string;
  },
): Promise<client.CompleteSignInResult> {
  return client.completeLink(db, config, idToken, input);
}

export { PROVIDER as CLOUDFLARE_PROVIDER };
