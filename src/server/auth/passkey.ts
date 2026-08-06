import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  WebAuthnCredential,
} from "@simplewebauthn/server";
import { consumeChallenge, createChallenge } from "../db/repository";

const RP_NAME = "Odograph";

/**
 * rpID/origin are derived from the request itself rather than static
 * per-environment config — @simplewebauthn's functions take them as call
 * parameters, and this handles preview's per-PR hostnames and local dev's
 * `localhost` correctly with no config to keep in sync with wrangler.toml
 * (research.md).
 */
export function deriveRp(requestUrl: string): { rpID: string; origin: string } {
  const url = new URL(requestUrl);
  return { rpID: url.hostname, origin: url.origin };
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Reads clientDataJSON without running full verification — the `challenge` field lets the
 * challenge be consumed (single-use, FR-007) before the expensive/crypto verification step.
 * `origin`/`type` are read too, purely for the console.error calls below (issue #46's
 * investigation showed Cloudflare Workers Logs doesn't reliably surface this Worker's output in
 * practice, but the fields cost nothing to keep around for whenever it does).
 */
function parseClientData(
  clientDataJSON: string,
): { challenge: string; origin: string; type: string } {
  const decoded = new TextDecoder().decode(base64UrlDecode(clientDataJSON));
  return JSON.parse(decoded) as { challenge: string; origin: string; type: string };
}

export async function createRegistrationOptions(
  db: D1Database,
  requestUrl: string,
  email: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const { rpID } = deriveRp(requestUrl);
  const challenge = await createChallenge(db, "registration");
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: email,
    // Root cause of issue #46 (confirmed live, then reproduced in isolation): passing `challenge`
    // as a plain string makes @simplewebauthn/server treat its CHARACTERS as UTF-8 text and
    // base64url-encode THAT for the wire, rather than using the string as already-encoded
    // base64url bytes — so the value the browser actually signs and returns never matched what
    // consumeChallenge() looked up, on every single registration, in every environment, always.
    // Decoding to the raw bytes first makes the library's own base64url-encoding produce the
    // exact string already stored by createChallenge().
    challenge: base64UrlDecode(challenge) as Uint8Array<ArrayBuffer>,
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
}

export type RegistrationVerification =
  | {
    verified: true;
    credentialId: string;
    publicKey: Uint8Array;
    counter: number;
    transports: string[] | null;
  }
  | { verified: false; reason: "challenge" | "verification" };

export async function verifyRegistration(
  db: D1Database,
  requestUrl: string,
  response: RegistrationResponseJSON,
): Promise<RegistrationVerification> {
  const clientData = parseClientData(response.response.clientDataJSON);
  const challengeValid = await consumeChallenge(db, clientData.challenge, "registration");
  if (!challengeValid) {
    // Logged distinctly from a verification failure below (issue #46) — a stale/already-consumed
    // challenge points at a client retry or a slow ceremony, not an rpID/origin mismatch.
    console.error("passkey registration failed: challenge not found or already consumed");
    return { verified: false, reason: "challenge" };
  }

  const { rpID, origin } = deriveRp(requestUrl);
  try {
    const result = await verifyRegistrationResponse({
      response,
      expectedChallenge: clientData.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      // Matches authenticatorSelection.userVerification: "preferred" below —
      // not requiring it here that wasn't asked for at registration.
      requireUserVerification: false,
    });
    if (!result.verified) {
      console.error(
        `passkey registration verification failed: expectedRPID=${rpID} expectedOrigin=${origin} clientOrigin=${clientData.origin}`,
      );
      return { verified: false, reason: "verification" };
    }
    const { credential } = result.registrationInfo;
    return {
      verified: true,
      credentialId: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports ?? null,
    };
  } catch (error) {
    console.error(
      `passkey registration verification threw: expectedRPID=${rpID} expectedOrigin=${origin} clientOrigin=${clientData.origin} error=${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { verified: false, reason: "verification" };
  }
}

export async function createAuthenticationOptions(
  db: D1Database,
  requestUrl: string,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { rpID } = deriveRp(requestUrl);
  const challenge = await createChallenge(db, "authentication");
  // No allowCredentials — the browser shows every discoverable passkey it
  // has for this site (research.md's discoverable-credential decision).
  // challenge: see createRegistrationOptions' comment — same double-encoding bug, same fix.
  return generateAuthenticationOptions({
    rpID,
    challenge: base64UrlDecode(challenge) as Uint8Array<ArrayBuffer>,
  });
}

export type AuthenticationVerification =
  | { verified: true; newCounter: number }
  | { verified: false; reason: "challenge" | "verification" };

export async function verifyAuthentication(
  db: D1Database,
  requestUrl: string,
  response: AuthenticationResponseJSON,
  storedCredential: WebAuthnCredential,
): Promise<AuthenticationVerification> {
  const clientData = parseClientData(response.response.clientDataJSON);
  const challengeValid = await consumeChallenge(db, clientData.challenge, "authentication");
  if (!challengeValid) {
    console.error("passkey authentication failed: challenge not found or already consumed");
    return { verified: false, reason: "challenge" };
  }

  const { rpID, origin } = deriveRp(requestUrl);
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: clientData.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: storedCredential,
      requireUserVerification: false,
    });
    if (!result.verified) {
      console.error(
        `passkey authentication verification failed: expectedRPID=${rpID} expectedOrigin=${origin} clientOrigin=${clientData.origin}`,
      );
      return { verified: false, reason: "verification" };
    }
    return { verified: true, newCounter: result.authenticationInfo.newCounter };
  } catch (error) {
    // Includes the library's own thrown counter-regression error (clone
    // detection) — treated identically to any other verification failure.
    console.error(
      `passkey authentication verification threw: expectedRPID=${rpID} expectedOrigin=${origin} clientOrigin=${clientData.origin} error=${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { verified: false, reason: "verification" };
  }
}
