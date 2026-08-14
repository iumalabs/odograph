import { expect, test } from "../support/dev-session.ts";
import { t } from "../support/app.ts";

// Magic-link sign-in (spec 003) — no prior e2e coverage; the real ceremony needs a real inbox, so
// this uses the dev-only token-retrieval fixture (spec 031, src/server/auth/dev-magic-link.ts) to
// fetch the token the real /request route already issued, then drives the real
// /api/v1/auth/magic-link/verify route with it — everything past that point is the genuine
// production code path, not a shortcut.
test.describe("magic-link sign-in (spec 003, via dev fixture 031)", () => {
  test("requesting, then verifying, a magic link signs the user in", async ({ page }) => {
    const email = `e2e-magic-${Date.now()}@example.invalid`;
    await page.goto("/");
    await page.getByLabel(t("emailLabel")).fill(email);
    await page.getByRole("button", { name: t("sendMagicLink") }).click();
    await expect(page.getByRole("status").filter({ hasText: t("magicLinkSentBanner") }))
      .toBeVisible();

    const tokenRes = await page.request.get(
      `/api/v1/_dev/magic-link-token?email=${encodeURIComponent(email)}`,
    );
    expect(tokenRes.ok()).toBe(true);
    const { token } = await tokenRes.json() as { token: string | null };
    expect(token).toBeTruthy();

    await page.goto(`/api/v1/auth/magic-link/verify?token=${token}`);
    await expect(page.getByText(t("vehiclesHeading"))).toBeVisible();
  });

  test("verifying an invalid token shows the error banner, not a sign-in", async ({ page }) => {
    await page.goto("/api/v1/auth/magic-link/verify?token=not-a-real-token");
    await expect(page.getByLabel(t("emailLabel"))).toBeVisible(); // still the sign-out screen
    await expect(page.getByText(t("magicLinkErrorBanner"))).toBeVisible();
  });

  test("two different emails get two different, isolated tenants", async ({ page, browser }) => {
    const emailA = `e2e-magic-a-${Date.now()}@example.invalid`;
    const emailB = `e2e-magic-b-${Date.now()}@example.invalid`;

    async function signInVia(p: typeof page, email: string) {
      await p.goto("/");
      await p.getByLabel(t("emailLabel")).fill(email);
      // Must wait for the request to actually land before querying the dev-fixture token
      // endpoint, or the query can race the token's own creation.
      await p.getByRole("button", { name: t("sendMagicLink") }).click();
      await p.getByRole("status").filter({ hasText: t("magicLinkSentBanner") }).waitFor();
      const tokenRes = await p.request.get(
        `/api/v1/_dev/magic-link-token?email=${encodeURIComponent(email)}`,
      );
      const { token } = await tokenRes.json() as { token: string | null };
      await p.goto(`/api/v1/auth/magic-link/verify?token=${token}`);
    }

    await signInVia(page, emailA);
    await expect(page.getByText(t("vehiclesHeading"))).toBeVisible();
    const bannerA = await page.getByText(/Signed in — tenant/).textContent();

    // A genuinely separate browser context, not just a second tab sharing the first one's
    // context — same isolation pattern auth.spec.ts's own tenant-isolation test uses.
    const contextB = await browser.newContext();
    try {
      const pageB = await contextB.newPage();
      await signInVia(pageB, emailB);
      await expect(pageB.getByText(t("vehiclesHeading"))).toBeVisible();
      const bannerB = await pageB.getByText(/Signed in — tenant/).textContent();
      expect(bannerA).not.toBe(bannerB);
    } finally {
      await contextB.close();
    }
  });
});
