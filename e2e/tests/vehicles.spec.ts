import { expect, test } from "../support/dev-session.ts";
import { addVehicle, t, vehicleCard } from "../support/app.ts";

test.describe("vehicle CRUD (spec 006)", () => {
  test("empty garage shows the empty state", async ({ authedPage }) => {
    await expect(authedPage.getByText(t("noVehiclesYet"))).toBeVisible();
  });

  test("creating a vehicle adds it to the garage with its odometer unit", async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "Subaru Forester", odometerUnit: "mi" });
    const card = vehicleCard(authedPage, "Subaru Forester");
    await expect(card).toBeVisible();
    await expect(card).toContainText("mi");
    await expect(authedPage.getByText(t("noVehiclesYet"))).toHaveCount(0);
  });

  test("multiple vehicles all appear, independently", async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "Daily Driver", odometerUnit: "km" });
    await addVehicle(authedPage, { name: "Weekend Car", odometerUnit: "mi" });
    await expect(vehicleCard(authedPage, "Daily Driver")).toBeVisible();
    await expect(vehicleCard(authedPage, "Weekend Car")).toBeVisible();
  });

  test("selecting a vehicle reveals its service/fuel/reminder sections; selecting it again hides them", async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "Test Vehicle", odometerUnit: "km" });
    const serviceHeading = authedPage.getByRole("heading", {
      name: t("serviceRecordsHeading"),
      exact: true,
    });
    await expect(serviceHeading).toHaveCount(0);

    await vehicleCard(authedPage, "Test Vehicle").click();
    await expect(serviceHeading).toBeVisible();
    await expect(authedPage.getByRole("heading", { name: t("fuelRecordsHeading"), exact: true }))
      .toBeVisible();
    await expect(
      authedPage.getByRole("heading", { name: t("reminderRulesHeading"), exact: true }),
    ).toBeVisible();

    await vehicleCard(authedPage, "Test Vehicle").click();
    await expect(serviceHeading).toHaveCount(0);
  });
});
