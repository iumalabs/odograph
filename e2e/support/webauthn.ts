import type { Page } from "@playwright/test";

/**
 * Real WebAuthn ceremonies via CDP's WebAuthn domain virtual authenticator
 * — not a mock of the app's passkey code, an actual software authenticator
 * the browser's real `navigator.credentials.create()`/`.get()` talk to, so
 * @simplewebauthn/browser and the server's @simplewebauthn/server
 * verification both run for real. `hasResidentKey`/`hasUserVerification`/
 * `isUserVerified: true` match this app's own
 * `authenticatorSelection: { residentKey: "required", userVerification:
 * "preferred" }` (src/server/auth/passkey.ts) — a virtual authenticator
 * without resident-key support would fail every registration ceremony here.
 */
export async function addVirtualAuthenticator(
  page: Page,
): Promise<
  { authenticatorId: string; reattach: () => Promise<void>; detach: () => Promise<void> }
> {
  const client = await page.context().newCDPSession(page);
  await client.send("WebAuthn.enable");
  const { authenticatorId } = await client.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return {
    authenticatorId,
    // A same-page navigation (page.reload(), or any goto) can drop the
    // WebAuthn domain's event wiring for the new execution context even
    // though the underlying authenticator (with its resident credentials)
    // is unaffected — observed as navigator.credentials.get() hanging
    // indefinitely post-reload. Call this after any navigation that
    // happens between adding the authenticator and the next ceremony.
    reattach: async () => {
      await client.send("WebAuthn.enable");
    },
    detach: async () => {
      await client.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
      await client.detach().catch(() => {});
    },
  };
}
