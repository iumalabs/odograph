import { bootstrapDevSession, expect, test } from "../support/dev-session.ts";
import { addVehicle, t } from "../support/app.ts";

// The passkey/magic-link/Google WebAuthn ceremonies themselves aren't automated here — that
// needs a virtual WebAuthn authenticator (CDP) or a real email inbox and is tracked as follow-up
// QA infra, not skipped silently. These specs cover what every other spec's `authedPage` fixture
// depends on: the sign-out screen renders its real entry points, and dev-session-issued sessions
// are genuinely tenant-isolated (constitution Principle I).

test.describe("sign-out screen", () => {
  test("shows every real sign-in entry point", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel(t("emailLabel"))).toBeVisible();
    await expect(page.getByRole("button", { name: t("signUpWithPasskey") })).toBeVisible();
    await expect(page.getByRole("button", { name: t("signInWithPasskey") })).toBeVisible();
    await expect(page.getByRole("button", { name: t("sendMagicLink") })).toBeVisible();
    await expect(page.getByRole("link", { name: t("continueWithGoogle") })).toBeVisible();
  });

  test("magic-link request shows the sent banner without requiring a real email", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(t("emailLabel")).fill(`e2e-${Date.now()}@example.invalid`);
    await page.getByRole("button", { name: t("sendMagicLink") }).click();
    await expect(page.getByRole("status").filter({ hasText: t("magicLinkSentBanner") }))
      .toBeVisible();
  });
});

test.describe("dev-session bootstrap", () => {
  test("lands signed in on the garage screen", async ({ authedPage, session }) => {
    await expect(authedPage.getByText(t("vehiclesHeading"))).toBeVisible();
    await expect(authedPage.getByText(t("signedInAs", { tenantId: session.tenantId })))
      .toBeVisible();
  });

  test("two sessions get two different tenants with isolated vehicle lists (Principle I)", async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    try {
      const sessionA = await bootstrapDevSession(contextA);
      const sessionB = await bootstrapDevSession(contextB);
      expect(sessionA.tenantId).not.toBe(sessionB.tenantId);

      const pageA = await contextA.newPage();
      await pageA.goto("/");
      await addVehicle(pageA, { name: "Tenant A's Car", odometerUnit: "km" });
      await expect(pageA.getByRole("button").filter({ hasText: "Tenant A's Car" })).toBeVisible();

      const pageB = await contextB.newPage();
      await pageB.goto("/");
      await expect(pageB.getByText(t("noVehiclesYet"))).toBeVisible();
      await expect(pageB.getByRole("button").filter({ hasText: "Tenant A's Car" })).toHaveCount(0);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
