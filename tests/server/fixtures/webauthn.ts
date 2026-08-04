import fido2Helpers from "fido2-helpers";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";

// Fixtures from `fido2-helpers` (npm, MIT) — see research.md's testing-strategy
// decision. Two independent registration fixtures ("none" and "packed"
// attestation) are used across tests, each with its own credential id, since
// D1 storage in @cloudflare/vitest-pool-workers is isolated per test *file*,
// not per `it()` — reusing the same credential id across two tests that both
// expect a fresh successful registration would collide on the second one.

const REG_FIXTURE = fido2Helpers.server.challengeResponseAttestationNoneMsgB64Url;
const REG_FIXTURE_2 = fido2Helpers.server.challengeResponseAttestationPackedB64UrlMsg;
const AUTH_FIXTURE = fido2Helpers.server.assertionResponseMsgB64Url;
const AUTH_PUBLIC_KEY_PEM = fido2Helpers.lib.assnPublicKey;

export const FIXTURE_ORIGIN = "https://localhost:8443";
export const FIXTURE_RP_ID = "localhost";

// REG_FIXTURE_2 ("packed" attestation) was captured against a different
// origin than the others — used as-is rather than normalized, since the
// origin only needs to match what the test's request URL passes in.
export const FIXTURE_2_ORIGIN = "https://webauthn.org";

/** A valid registration response (fido2-helpers), adapted to the fields
 * @simplewebauthn/server's RegistrationResponseJSON requires that the raw
 * fixture doesn't include (`type`, `clientExtensionResults`). */
export function validRegistrationResponse(): RegistrationResponseJSON {
  return {
    ...REG_FIXTURE,
    type: "public-key",
    clientExtensionResults: {},
  } as RegistrationResponseJSON;
}

/** A second, independent valid registration response — distinct credential
 * id and origin (FIXTURE_2_ORIGIN) from validRegistrationResponse(). */
export function validRegistrationResponse2(): RegistrationResponseJSON {
  return {
    ...REG_FIXTURE_2,
    type: "public-key",
    clientExtensionResults: {},
  } as RegistrationResponseJSON;
}

/** Same as validRegistrationResponse(), with one byte of the attestation
 * object flipped after decoding — a stand-in for a forged/tampered response,
 * used to prove verification actually checks the crypto (FR-008). */
export function tamperedRegistrationResponse(): RegistrationResponseJSON {
  const valid = validRegistrationResponse();
  return {
    ...valid,
    response: {
      ...valid.response,
      attestationObject: flipOneByte(valid.response.attestationObject),
    },
  };
}

export function validAuthenticationResponse(): AuthenticationResponseJSON {
  return {
    ...AUTH_FIXTURE,
    type: "public-key",
    clientExtensionResults: {},
  } as AuthenticationResponseJSON;
}

export function tamperedAuthenticationResponse(): AuthenticationResponseJSON {
  const valid = validAuthenticationResponse();
  return {
    ...valid,
    response: {
      ...valid.response,
      signature: flipOneByte(valid.response.signature),
    },
  };
}

export const AUTH_FIXTURE_CREDENTIAL_ID: string = AUTH_FIXTURE.id;
export const REG_FIXTURE_CREDENTIAL_ID: string = REG_FIXTURE.id;
export const REG_FIXTURE_2_CREDENTIAL_ID: string = REG_FIXTURE_2.id;

/** Extracts the `challenge` field from a response's clientDataJSON — used to
 * seed webauthn_challenges directly with the exact value a fixture expects,
 * since these fixtures' challenges were never issued by this project's own
 * `/options` endpoints. */
export function challengeOf(response: { response: { clientDataJSON: string } }): string {
  const decoded = new TextDecoder().decode(base64UrlToBytes(response.response.clientDataJSON));
  return (JSON.parse(decoded) as { challenge: string }).challenge;
}

/** Seeds webauthn_challenges with an exact challenge value (bypassing
 * repository.ts's createChallenge, which always generates a random one) so a
 * fixture response's embedded challenge is accepted as if this project's own
 * `/options` endpoint had issued it. Test-only — production code always
 * generates its own challenges. */
export async function seedChallenge(
  db: D1Database,
  challenge: string,
  purpose: "registration" | "authentication",
): Promise<void> {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await db
    .prepare(
      "INSERT OR REPLACE INTO webauthn_challenges (challenge, purpose, expires_at) VALUES (?, ?, ?)",
    )
    .bind(challenge, purpose, expiresAt)
    .run();
}

/**
 * Converts the PEM (SPKI) public key that matches validAuthenticationResponse()
 * into the COSE-encoded bytes this project's schema/verification expects —
 * fido2-helpers ships the key in PEM form since it targets a different
 * consumer library; @simplewebauthn needs COSE_Key CBOR.
 */
export async function authFixturePublicKeyAsCose(): Promise<Uint8Array> {
  const der = AUTH_PUBLIC_KEY_PEM
    .replace("-----BEGIN PUBLIC KEY-----", "")
    .replace("-----END PUBLIC KEY-----", "")
    .replace(/\s/g, "");
  const derBytes = base64ToBytes(der);
  const key = await crypto.subtle.importKey(
    "spki",
    derBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", key) as JsonWebKey;
  if (!jwk.x || !jwk.y) throw new Error("expected an EC JWK with x/y coordinates");

  const coseKey = new Map<number, number | Uint8Array>();
  coseKey.set(1, 2); // kty: EC2
  coseKey.set(3, -7); // alg: ES256
  coseKey.set(-1, 1); // crv: P-256
  coseKey.set(-2, base64UrlToBytes(jwk.x));
  coseKey.set(-3, base64UrlToBytes(jwk.y));
  return isoCBOR.encode(coseKey);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlToBytes(value: string): Uint8Array {
  return base64ToBytes(value.replace(/-/g, "+").replace(/_/g, "/"));
}

function flipOneByte(base64UrlValue: string): string {
  const bytes = base64UrlToBytes(base64UrlValue);
  bytes[0] = bytes[0]! ^ 0xff;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
