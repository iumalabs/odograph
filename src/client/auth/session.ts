import type { PasskeyIdentity } from "./passkey";

/**
 * Resolves an existing session cookie to the current identity, or null if
 * there isn't one — used on page load so magic-link/Google sign-ins (both
 * complete via a server-side redirect, never touching client state) show the
 * authenticated view too, not just passkey's client-driven ceremony.
 */
export async function getCurrentIdentity(): Promise<PasskeyIdentity | null> {
  const res = await fetch("/api/v1/auth/whoami");
  if (res.status === 401) return null;
  if (!res.ok) {
    throw new Error(`whoami failed: ${res.status}`);
  }
  return res.json() as Promise<PasskeyIdentity>;
}
