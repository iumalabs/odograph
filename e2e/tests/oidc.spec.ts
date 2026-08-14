import { expect, test } from "../support/dev-session.ts";
import { t } from "../support/app.ts";

// Google OIDC sign-in (spec 004) — no prior e2e coverage; the real ceremony needs a live Google
// network round trip, so this uses the dev-only fixture (spec 032, src/server/auth/dev-oidc.ts)
// that signs a fixture ID token and drives the exact same account-resolution code the real
// /callback route uses, just against a local fixture JWKS instead of Google's real one. A GET to
// this route sets the session cookie and redirects to `/?oidc=ok`, same as the real callback would.
test.describe("Google OIDC sign-in (spec 004, via dev fixture 032)", () => {
  test("visiting the dev OIDC fixture signs the user in", async ({ page }) => {
    const email = `e2e-oidc-${Date.now()}@example.invalid`;
    await page.goto(`/api/v1/_dev/oidc-google?email=${encodeURIComponent(email)}`);
    await expect(page.getByText(t("vehiclesHeading"))).toBeVisible();
    await expect(page).toHaveURL(/oidc=ok/);
  });

  test("the same email resolves to the same account on a second sign-in (FR-002)", async ({ page, context }) => {
    const email = `e2e-oidc-stable-${Date.now()}@example.invalid`;
    await page.goto(`/api/v1/_dev/oidc-google?email=${encodeURIComponent(email)}`);
    await expect(page.getByText(t("vehiclesHeading"))).toBeVisible();
    const firstTenant = await page.getByText(/Signed in — tenant/).textContent();

    const pageB = await context.newPage();
    await pageB.goto(`/api/v1/_dev/oidc-google?email=${encodeURIComponent(email)}`);
    await expect(pageB.getByText(t("vehiclesHeading"))).toBeVisible();
    const secondTenant = await pageB.getByText(/Signed in — tenant/).textContent();

    expect(secondTenant).toBe(firstTenant);
  });

  test("visiting without an email param fails rather than silently signing in", async ({ page }) => {
    const res = await page.request.get("/api/v1/_dev/oidc-google");
    expect(res.status()).toBe(400);
  });

  test("two different emails get two different, isolated tenants", async ({ page, context }) => {
    const emailA = `e2e-oidc-a-${Date.now()}@example.invalid`;
    const emailB = `e2e-oidc-b-${Date.now()}@example.invalid`;

    await page.goto(`/api/v1/_dev/oidc-google?email=${encodeURIComponent(emailA)}`);
    await expect(page.getByText(t("vehiclesHeading"))).toBeVisible();
    const tenantA = await page.getByText(/Signed in — tenant/).textContent();

    const pageB = await context.newPage();
    await pageB.goto(`/api/v1/_dev/oidc-google?email=${encodeURIComponent(emailB)}`);
    await expect(pageB.getByText(t("vehiclesHeading"))).toBeVisible();
    const tenantB = await pageB.getByText(/Signed in — tenant/).textContent();

    expect(tenantA).not.toBe(tenantB);
  });
});
