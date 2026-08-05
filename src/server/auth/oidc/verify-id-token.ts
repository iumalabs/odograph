import { jwtVerify } from "jose";
import type { JWTVerifyGetKey } from "jose";

// Google's discovery doc reports `iss` as "https://accounts.google.com", but Google's own docs
// say to also accept the bare form (research.md).
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type GoogleIdTokenClaims = {
  sub: string;
  email: string;
  email_verified: boolean;
};

/**
 * Verifies signature, issuer, audience, and expiry (jose's jwtVerify checks exp/nbf by default) —
 * never trusts an unverified claim (FR-005). `jwks` is injectable so tests can supply a local
 * fixture keyset instead of Google's real remote one (research.md's testing strategy) — production
 * callers pass `createRemoteJWKSet(new URL(GOOGLE_JWKS_URI))`.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  input: { jwks: JWTVerifyGetKey; audience: string },
): Promise<GoogleIdTokenClaims> {
  const { payload } = await jwtVerify(idToken, input.jwks, {
    issuer: GOOGLE_ISSUERS,
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
