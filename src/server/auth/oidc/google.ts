import { createRemoteJWKSet } from "jose";
import * as client from "./client";
import type { OidcProviderConfig } from "./client";
import { GOOGLE_ISSUERS } from "./verify-id-token";

export const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";

const PROVIDER = "google";

export const GOOGLE_CONFIG: OidcProviderConfig = {
  provider: PROVIDER,
  authorizationEndpoint: GOOGLE_AUTHORIZATION_ENDPOINT,
  tokenEndpoint: GOOGLE_TOKEN_ENDPOINT,
  issuers: GOOGLE_ISSUERS,
  scope: "openid email profile",
};

let googleJwks: ReturnType<typeof createRemoteJWKSet> | undefined;

/** Constructed once per isolate and reused — jose's own cache does the rest (research.md). */
function getGoogleJwks(): ReturnType<typeof createRemoteJWKSet> {
  googleJwks ??= createRemoteJWKSet(new URL(GOOGLE_JWKS_URI));
  return googleJwks;
}

export function buildGoogleAuthorizationUrl(
  input: { clientId: string; redirectUri: string; state: string; codeVerifier: string },
): Promise<string> {
  return client.buildAuthorizationUrl(GOOGLE_CONFIG, input);
}

export function exchangeCodeForTokens(
  input: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
    clientId: string;
    clientSecret: string;
  },
): Promise<client.ExchangeResult> {
  return client.exchangeCodeForTokens(GOOGLE_CONFIG, input);
}

export function completeGoogleSignIn(
  db: D1Database,
  idToken: string,
  input: { jwks: Parameters<typeof client.completeSignIn>[3]["jwks"]; audience: string },
): Promise<client.CompleteSignInResult> {
  return client.completeSignIn(db, GOOGLE_CONFIG, idToken, input);
}

export function completeGoogleLink(
  db: D1Database,
  idToken: string,
  input: {
    jwks: Parameters<typeof client.completeLink>[3]["jwks"];
    audience: string;
    linkingUserId: string;
  },
): Promise<client.CompleteSignInResult> {
  return client.completeLink(db, GOOGLE_CONFIG, idToken, input);
}

export { getGoogleJwks as googleJwks, PROVIDER as GOOGLE_PROVIDER };
