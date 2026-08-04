import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

export type PasskeyIdentity = { userId: string; tenantId?: string };

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function registerWithPasskey(email: string): Promise<PasskeyIdentity> {
  const options = await postJson<PublicKeyCredentialCreationOptionsJSON>(
    "/api/v1/auth/passkey/register/options",
    { email },
  );
  const response: RegistrationResponseJSON = await startRegistration({ optionsJSON: options });
  return postJson<PasskeyIdentity>("/api/v1/auth/passkey/register/verify", { response, email });
}

export async function loginWithPasskey(): Promise<PasskeyIdentity> {
  const options = await postJson<PublicKeyCredentialRequestOptionsJSON>(
    "/api/v1/auth/passkey/login/options",
  );
  const response: AuthenticationResponseJSON = await startAuthentication({ optionsJSON: options });
  return postJson<PasskeyIdentity>("/api/v1/auth/passkey/login/verify", response);
}

export async function addPasskey(): Promise<{ credentialId: string }> {
  const options = await postJson<PublicKeyCredentialCreationOptionsJSON>(
    "/api/v1/auth/passkey/add/options",
  );
  const response: RegistrationResponseJSON = await startRegistration({ optionsJSON: options });
  return postJson<{ credentialId: string }>("/api/v1/auth/passkey/add/verify", { response });
}
