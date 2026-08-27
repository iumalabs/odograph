import { jwtVerify } from "jose";
import type { JWTVerifyGetKey } from "jose";

// Google's discovery doc reports `iss` as "https://accounts.google.com", but Google's own docs
// say to also accept the bare form (research.md).
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type OidcIdTokenClaims = {
  sub: string;
  email: string;
  email_verified: boolean;
};

/**
 * Verifies signature, issuer, audience, and expiry (jose's jwtVerify checks exp/nbf by default) —
 * never trusts an unverified claim (FR-005). `jwks` is injectable so tests can supply a local
 * fixture keyset instead of a provider's real remote one (research.md's testing strategy) —
 * production callers pass `createRemoteJWKSet(new URL(<provider's JWKS URI>))`. Provider-agnostic
 * since specs/061 (Cloudflare OIDC) — `issuers` is now a caller-supplied parameter rather than a
 * hardcoded Google constant, so this same function verifies both providers' tokens identically.
 */
export async function verifyOidcIdToken(
  idToken: string,
  input: { jwks: JWTVerifyGetKey; audience: string; issuers: string[] },
): Promise<OidcIdTokenClaims> {
  const { payload } = await jwtVerify(idToken, input.jwks, {
    issuer: input.issuers,
    audience: input.audience,
  });

  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Error("id token missing required sub/email claims");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    email_verified: payload.email_verified === true,
  };
}
