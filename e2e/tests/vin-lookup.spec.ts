import { expect, test } from "../support/dev-session.ts";
import { addVehicle, t, vehicleCard } from "../support/app.ts";

// VIN lookup (spec 030) — part of the vehicle-add form on the Garage screen, proxying to NHTSA's
// real vPIC API (src/server/routes/v1/vin-lookup.ts's own doc comment: "pure proxy... not tenant-
// data-scoped"). Never hit the real external API from e2e — mocked via page.route() instead, same
// determinism principle as the dev-session auth bootstrap.
test.describe("VIN lookup (spec 030)", () => {
  test("a found VIN pre-fills make/model/year", async ({ authedPage }) => {
    await authedPage.route("**/api/v1/vin-lookup/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ found: true, make: "Subaru", model: "Outback", year: 2021 }),
      }));

    await authedPage.getByLabel(t("vehicleVinLabel")).fill("4S4BTANC5M3123456");
    await authedPage.getByRole("button", { name: t("lookupVinButton"), exact: true }).click();

    await expect(authedPage.getByLabel(t("vehicleMakeLabel"))).toHaveValue("Subaru");
    await expect(authedPage.getByLabel(t("vehicleModelLabel"))).toHaveValue("Outback");
    await expect(authedPage.getByLabel(t("vehicleYearLabel"))).toHaveValue("2021");
    await expect(authedPage.getByText(t("vinLookupNotFound"))).toHaveCount(0);
  });

  test("a not-found VIN shows the not-found hint and leaves the fields blank", async ({ authedPage }) => {
    await authedPage.route("**/api/v1/vin-lookup/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ found: false, make: null, model: null, year: null }),
      }));

    await authedPage.getByLabel(t("vehicleVinLabel")).fill("00000000000000000");
    await authedPage.getByRole("button", { name: t("lookupVinButton"), exact: true }).click();

    await expect(authedPage.getByText(t("vinLookupNotFound"))).toBeVisible();
    await expect(authedPage.getByLabel(t("vehicleMakeLabel"))).toHaveValue("");
    await expect(authedPage.getByLabel(t("vehicleModelLabel"))).toHaveValue("");
  });

  test("the lookup button is disabled until a VIN is typed, and shows a pending state while in flight", async ({ authedPage }) => {
    const lookupButton = authedPage.getByRole("button", {
      name: t("lookupVinButton"),
      exact: true,
    });
    await expect(lookupButton).toBeDisabled();

    let resolveRoute: (() => void) | undefined;
    const routeGate = new Promise<void>((resolve) => {
      resolveRoute = resolve;
    });
    await authedPage.route("**/api/v1/vin-lookup/**", async (route) => {
      await routeGate;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ found: true, make: "Toyota", model: "Corolla", year: 2019 }),
      });
    });

    await authedPage.getByLabel(t("vehicleVinLabel")).fill("1HGCM82633A123456");
    await expect(lookupButton).toBeEnabled();
    await lookupButton.click();

    await expect(authedPage.getByText(t("vinLookupInProgress"))).toBeVisible();
    await expect(authedPage.getByLabel(t("vehicleVinLabel"))).toBeDisabled();

    resolveRoute!();
    await expect(authedPage.getByLabel(t("vehicleMakeLabel"))).toHaveValue("Toyota");
    await expect(authedPage.getByLabel(t("vehicleVinLabel"))).toBeEnabled();
  });

  test("a fetched VIN survives into the created vehicle", async ({ authedPage }) => {
    await authedPage.route("**/api/v1/vin-lookup/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ found: true, make: "Honda", model: "Civic", year: 2018 }),
      }));

    await authedPage.getByLabel(t("vehicleVinLabel")).fill("2HGFC2F59JH123456");
    await authedPage.getByRole("button", { name: t("lookupVinButton"), exact: true }).click();
    await expect(authedPage.getByLabel(t("vehicleMakeLabel"))).toHaveValue("Honda");

    // addVehicle() always fills Year itself (works around issue #178) — pin it to what the
    // mocked VIN lookup already set, so it doesn't clobber that value.
    await addVehicle(authedPage, { name: "VIN Test Car", odometerUnit: "km", year: "2018" });
    const card = vehicleCard(authedPage, "VIN Test Car");
    await expect(card).toContainText("Honda Civic 2018");
    await expect(card).toContainText("2HGFC2F59JH123456");
  });
});
