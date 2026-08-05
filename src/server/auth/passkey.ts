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

/** Reads the `challenge` field out of a response's clientDataJSON without
 * running full verification — needed so the challenge can be consumed
 * (single-use, FR-007) before the expensive/crypto verification step. */
function extractChallenge(clientDataJSON: string): string {
  const decoded = new TextDecoder().decode(base64UrlDecode(clientDataJSON));
  const clientData = JSON.parse(decoded) as { challenge: string };
  return clientData.challenge;
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
    challenge,
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
  const challenge = extractChallenge(response.response.clientDataJSON);
  const challengeValid = await consumeChallenge(db, challenge, "registration");
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
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      // Matches authenticatorSelection.userVerification: "preferred" below —
      // not requiring it here that wasn't asked for at registration.
      requireUserVerification: false,
    });
    if (!result.verified) {
      console.error(
        `passkey registration verification failed: expectedRPID=${rpID} expectedOrigin=${origin}`,
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
      `passkey registration verification threw: expectedRPID=${rpID} expectedOrigin=${origin} error=${
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
  return generateAuthenticationOptions({ rpID, challenge });
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
  const challenge = extractChallenge(response.response.clientDataJSON);
  const challengeValid = await consumeChallenge(db, challenge, "authentication");
  if (!challengeValid) {
    console.error("passkey authentication failed: challenge not found or already consumed");
    return { verified: false, reason: "challenge" };
  }

  const { rpID, origin } = deriveRp(requestUrl);
  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: storedCredential,
      requireUserVerification: false,
    });
    if (!result.verified) {
      console.error(
        `passkey authentication verification failed: expectedRPID=${rpID} expectedOrigin=${origin}`,
      );
      return { verified: false, reason: "verification" };
    }
    return { verified: true, newCounter: result.authenticationInfo.newCounter };
  } catch (error) {
    // Includes the library's own thrown counter-regression error (clone
    // detection) — treated identically to any other verification failure.
    console.error(
      `passkey authentication verification threw: expectedRPID=${rpID} expectedOrigin=${origin} error=${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return { verified: false, reason: "verification" };
  }
}
