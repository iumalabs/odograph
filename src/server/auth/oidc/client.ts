import {
  createOidcUser,
  findOidcIdentityByProviderAndSubject,
  isUniqueConstraintError,
  linkOidcIdentity,
} from "../../db/repository";
import { issueSession } from "../session";
import { verifyOidcIdToken } from "./verify-id-token";
import type { JWTVerifyGetKey } from "jose";

// Generic OIDC relying-party core, extracted from what was originally Google-only logic once a
// second provider (Cloudflare, specs/061) needed the exact same shape — every function here was
// already parameterized by everything except a handful of provider constants, so `google.ts` and
// `cloudflare.ts` are now thin config declarations that call straight into this file.

export type OidcProviderConfig = {
  provider: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  issuers: string[];
  scope: string;
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function computeCodeChallenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export async function buildAuthorizationUrl(
  config: OidcProviderConfig,
  input: { clientId: string; redirectUri: string; state: string; codeVerifier: string },
): Promise<string> {
  const codeChallenge = await computeCodeChallenge(input.codeVerifier);
  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export type ExchangeResult = { ok: true; idToken: string } | { ok: false; error: string };

/**
 * Real network call to the provider's token endpoint — deliberately not unit tested (research.md,
 * same posture specs/003 took for send_email's failure path). Catches and surfaces failures rather
 * than letting a thrown error escape uncaught.
 */
export async function exchangeCodeForTokens(
  config: OidcProviderConfig,
  input: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
    clientId: string;
    clientSecret: string;
  },
): Promise<ExchangeResult> {
  try {
    const res = await fetch(config.tokenEndpoint, {
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
 * The directly-testable core (analyze finding C1, originally): verifies the ID token, resolves
 * the account via (provider, subject) — never email (D-004/FR-003a) — and issues a session. Split
 * out from the callback route so tests never need a real network call to reach this logic; only
 * `exchangeCodeForTokens` above touches the network.
 */
export async function completeSignIn(
  db: D1Database,
  config: OidcProviderConfig,
  idToken: string,
  input: { jwks: JWTVerifyGetKey; audience: string },
): Promise<CompleteSignInResult> {
  let claims;
  try {
    claims = await verifyOidcIdToken(idToken, {
      jwks: input.jwks,
      audience: input.audience,
      issuers: config.issuers,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "verification_failed" };
  }

  const existing = await findOidcIdentityByProviderAndSubject(db, config.provider, claims.sub);
  const userId = existing ? existing.userId : (await createOidcUser(db, {
    provider: config.provider,
    subject: claims.sub,
    email: claims.email,
  }))
    .userId;

  const { cookie } = await issueSession(db, userId);
  return { ok: true, cookie };
}

/**
 * Account-linking counterpart to completeSignIn (specs/005, research.md — a separate function
 * rather than a mode flag, since the resolution logic genuinely differs): verifies the ID token
 * exactly the same way, but never resolves-or-creates — it only ever attaches the identity to the
 * caller-supplied `linkingUserId`, and rejects (rather than falling back to anything) if that
 * identity is already linked to any account, including this one (FR-005).
 */
export async function completeLink(
  db: D1Database,
  config: OidcProviderConfig,
  idToken: string,
  input: { jwks: JWTVerifyGetKey; audience: string; linkingUserId: string },
): Promise<CompleteSignInResult> {
  let claims;
  try {
    claims = await verifyOidcIdToken(idToken, {
      jwks: input.jwks,
      audience: input.audience,
      issuers: config.issuers,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "verification_failed" };
  }

  try {
    await linkOidcIdentity(db, config.provider, claims.sub, input.linkingUserId);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, error: "already_linked" };
    }
    throw error;
  }

  const { cookie } = await issueSession(db, input.linkingUserId);
  return { ok: true, cookie };
}
