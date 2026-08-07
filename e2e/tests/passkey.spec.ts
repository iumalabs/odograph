import { expect, test } from "../support/dev-session.ts";
import { t } from "../support/app.ts";
import { addVirtualAuthenticator } from "../support/webauthn.ts";

// A real WebAuthn ceremony (CDP virtual authenticator round-trip + the server's own
// @simplewebauthn/server verification) takes noticeably longer than a plain UI click; the default
// 5s expect timeout was intermittently too tight for it specifically (observed: buttons still
// mid-ceremony, disabled, when the assertion's window ran out).
const CEREMONY_TIMEOUT = { timeout: 15_000 };

// Real WebAuthn ceremonies via a CDP virtual authenticator (support/webauthn.ts) — not a mock of
// the app's own passkey code. The client's real @simplewebauthn/browser call and the server's real
// @simplewebauthn/server verification both run.
test.describe("passkey authentication (spec 002) — real WebAuthn ceremonies", () => {
  test("sign up with a passkey lands authenticated on the garage screen", async ({ page }) => {
    const authenticator = await addVirtualAuthenticator(page);
    await page.goto("/");

    await page.getByLabel(t("emailLabel")).fill(`e2e-passkey-${Date.now()}@example.invalid`);
    await page.getByRole("button", { name: t("signUpWithPasskey") }).click();

    await expect(page.getByText(t("vehiclesHeading"))).toBeVisible(CEREMONY_TIMEOUT);
    await authenticator.detach();
  });

  test("signing in again with the same resident credential re-authenticates", async ({ page, context }) => {
    const authenticator = await addVirtualAuthenticator(page);
    await page.goto("/");
    await page.getByLabel(t("emailLabel")).fill(
      `e2e-passkey-relogin-${Date.now()}@example.invalid`,
    );
    await page.getByRole("button", { name: t("signUpWithPasskey") }).click();
    await expect(page.getByText(t("vehiclesHeading"))).toBeVisible(CEREMONY_TIMEOUT);

    // The app has no sign-out control (nothing to click) — clearing the
    // session cookie and reloading is the only way to get back to the
    // sign-out screen without a fresh context (which would also drop the
    // virtual authenticator's resident credential).
    await context.clearCookies();
    await page.reload();
    await authenticator.reattach();
    await expect(page.getByRole("button", { name: t("signInWithPasskey") })).toBeVisible();

    // No email needed — the credential is discoverable/resident, matching
    // this app's authenticatorSelection (spec 002 FR: no allowCredentials).
    await page.getByRole("button", { name: t("signInWithPasskey") }).click();
    await expect(page.getByText(t("vehiclesHeading"))).toBeVisible(CEREMONY_TIMEOUT);

    await authenticator.detach();
  });

  test("adding a second passkey while signed in succeeds", async ({ page }) => {
    const authenticator = await addVirtualAuthenticator(page);
    await page.goto("/");
    await page.getByLabel(t("emailLabel")).fill(`e2e-passkey-add-${Date.now()}@example.invalid`);
    await page.getByRole("button", { name: t("signUpWithPasskey") }).click();
    await expect(page.getByText(t("vehiclesHeading"))).toBeVisible(CEREMONY_TIMEOUT);

    await page.getByRole("button", { name: t("addAnotherPasskey") }).click();
    // No dedicated success banner for this action (App.tsx's handler is a no-op success
    // callback) — the observable, business-relevant outcome is that it doesn't surface the
    // generic error banner, i.e. the ceremony + server verification actually succeeded.
    await expect(page.getByRole("alert").filter({ hasText: t("genericError") })).toHaveCount(
      0,
      CEREMONY_TIMEOUT,
    );

    await authenticator.detach();
  });
});
