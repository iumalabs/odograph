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
 *
 * `origin`/`type` are read too for TEMPORARY (issue #46) live debugging — surfaced directly in
 * the HTTP error response so a verification failure shows exactly what the browser signed versus
 * what the server expected, since Cloudflare Workers Logs isn't surfacing console.error output
 * for this Worker in practice. Remove the debug plumbing once #46 is root-caused.
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
    challenge,
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
}

// TEMPORARY (issue #46) — surfaced directly in the HTTP error response so it's visible in
// DevTools Network without depending on Cloudflare Workers Logs. Remove once #46 is root-caused.
export type VerificationDebug = {
  expectedRPID: string;
  expectedOrigin: string;
  clientOrigin: string;
  clientType: string;
  thrown: string | null;
};

export type RegistrationVerification =
  | {
    verified: true;
    credentialId: string;
    publicKey: Uint8Array;
    counter: number;
    transports: string[] | null;
  }
  | { verified: false; reason: "challenge" | "verification"; debug?: VerificationDebug };

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
      return {
        verified: false,
        reason: "verification",
        debug: {
          expectedRPID: rpID,
          expectedOrigin: origin,
          clientOrigin: clientData.origin,
          clientType: clientData.type,
          thrown: null,
        },
      };
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
    const thrown = error instanceof Error ? error.message : String(error);
    console.error(
      `passkey registration verification threw: expectedRPID=${rpID} expectedOrigin=${origin} clientOrigin=${clientData.origin} error=${thrown}`,
    );
    return {
      verified: false,
      reason: "verification",
      debug: {
        expectedRPID: rpID,
        expectedOrigin: origin,
        clientOrigin: clientData.origin,
        clientType: clientData.type,
        thrown,
      },
    };
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
  | { verified: false; reason: "challenge" | "verification"; debug?: VerificationDebug };

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
      return {
        verified: false,
        reason: "verification",
        debug: {
          expectedRPID: rpID,
          expectedOrigin: origin,
          clientOrigin: clientData.origin,
          clientType: clientData.type,
          thrown: null,
        },
      };
    }
    return { verified: true, newCounter: result.authenticationInfo.newCounter };
  } catch (error) {
    // Includes the library's own thrown counter-regression error (clone
    // detection) — treated identically to any other verification failure.
    const thrown = error instanceof Error ? error.message : String(error);
    console.error(
      `passkey authentication verification threw: expectedRPID=${rpID} expectedOrigin=${origin} clientOrigin=${clientData.origin} error=${thrown}`,
    );
    return {
      verified: false,
      reason: "verification",
      debug: {
        expectedRPID: rpID,
        expectedOrigin: origin,
        clientOrigin: clientData.origin,
        clientType: clientData.type,
        thrown,
      },
    };
  }
}
