import { createLocalJWKSet, exportJWK, SignJWT } from "jose";
import type { JWTVerifyGetKey } from "jose";

// Locally-signed fixture ID tokens + a matching local JWKS (research.md's testing strategy) — no
// real Google network call needed. Mirrors tests/server/fixtures/webauthn.ts's role for passkey.

export const FIXTURE_AUDIENCE = "fixture-client-id.apps.googleusercontent.com";

let cachedKeyPair: CryptoKeyPair | undefined;

async function getFixtureKeyPair(): Promise<CryptoKeyPair> {
  if (!cachedKeyPair) {
    cachedKeyPair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    ) as CryptoKeyPair;
  }
  return cachedKeyPair;
}

let cachedJwks: JWTVerifyGetKey | undefined;

/** The injectable `jwks` fixture-side counterpart to `verifyGoogleIdToken`'s production `createRemoteJWKSet`. */
export async function fixtureJwks(): Promise<JWTVerifyGetKey> {
  if (!cachedJwks) {
    const { publicKey } = await getFixtureKeyPair();
    const jwk = await exportJWK(publicKey);
    cachedJwks = createLocalJWKSet({ keys: [{ ...jwk, alg: "ES256", use: "sig" }] });
  }
  return cachedJwks;
}

export async function signFixtureIdToken(input: {
  sub: string;
  email: string;
  email_verified?: boolean;
  audience?: string;
  issuer?: string;
  expiresIn?: string;
}): Promise<string> {
  const { privateKey } = await getFixtureKeyPair();
  return await new SignJWT({
    email: input.email,
    email_verified: input.email_verified ?? true,
  })
    .setProtectedHeader({ alg: "ES256" })
    .setSubject(input.sub)
    .setIssuer(input.issuer ?? "https://accounts.google.com")
    .setAudience(input.audience ?? FIXTURE_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(input.expiresIn ?? "1h")
    .sign(privateKey);
}
