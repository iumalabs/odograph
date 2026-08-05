import { createRemoteJWKSet } from "jose";
import { createOidcUser, findOidcIdentityByProviderAndSubject } from "../../db/repository";
import { issueSession } from "../session";
import { verifyGoogleIdToken } from "./verify-id-token";

export const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";

const PROVIDER = "google";

let googleJwks: ReturnType<typeof createRemoteJWKSet> | undefined;

/** Constructed once per isolate and reused — jose's own cache does the rest (research.md). */
function getGoogleJwks(): ReturnType<typeof createRemoteJWKSet> {
  googleJwks ??= createRemoteJWKSet(new URL(GOOGLE_JWKS_URI));
  return googleJwks;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function computeCodeChallenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export async function buildGoogleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeVerifier: string;
}): Promise<string> {
  const codeChallenge = await computeCodeChallenge(input.codeVerifier);
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export type ExchangeResult = { ok: true; idToken: string } | { ok: false; error: string };

/**
 * Real network call to Google's token endpoint — deliberately not unit tested (research.md, same
 * posture specs/003 took for send_email's failure path). Catches and surfaces failures (FR-008 of
 * specs/003's ethos applied here too) rather than letting a thrown error escape uncaught.
 */
export async function exchangeCodeForTokens(input: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string;
}): Promise<ExchangeResult> {
  try {
    const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: input.code,
        client_id: input.clientId,
        client_secret: input.clientSecret,
        redirect_uri: input.redirectUri,
        grant_type: "authorization_code",
        code_verifier: input.codeVerifier,
      }),
    });
    if (!res.ok) {
      return { ok: false, error: `token endpoint responded ${res.status}` };
    }
    const body = await res.json() as { id_token?: unknown };
    if (typeof body.id_token !== "string") {
      return { ok: false, error: "token response missing id_token" };
    }
    return { ok: true, idToken: body.id_token };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "unknown_error" };
  }
}

export type CompleteSignInResult =
  | { ok: true; cookie: string }
  | { ok: false; error: string };

/**
 * The directly-testable core (analyze finding C1): verifies the ID token, resolves the account via
 * (provider, subject) — never email (D-004/FR-003a) — and issues a session. Split out from the
 * callback route so tests never need a real Google network call to reach this logic; only
 * `exchangeCodeForTokens` above touches the network.
 */
export async function completeGoogleSignIn(
  db: D1Database,
  idToken: string,
  input: { jwks: Parameters<typeof verifyGoogleIdToken>[1]["jwks"]; audience: string },
): Promise<CompleteSignInResult> {
  let claims;
  try {
    claims = await verifyGoogleIdToken(idToken, { jwks: input.jwks, audience: input.audience });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "verification_failed" };
  }

  const existing = await findOidcIdentityByProviderAndSubject(db, PROVIDER, claims.sub);
  const userId = existing
    ? existing.userId
    : (await createOidcUser(db, { provider: PROVIDER, subject: claims.sub, email: claims.email }))
      .userId;

  const { cookie } = await issueSession(db, userId);
  return { ok: true, cookie };
}

export { getGoogleJwks as googleJwks, PROVIDER as GOOGLE_PROVIDER };
