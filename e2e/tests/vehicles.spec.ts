import { expect, test } from "../support/dev-session.ts";
import { addVehicle, goToView, t, vehicleCard } from "../support/app.ts";

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

  test("selecting a vehicle in the Garage jumps straight to its Dashboard (spec 038)", async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "Test Vehicle", odometerUnit: "km" });
    await expect(authedPage.getByText(t("dashboardHeading"), { exact: true })).toHaveCount(0);

    await vehicleCard(authedPage, "Test Vehicle").click();
    // Garage's own vehicle-add form ("Odometer unit" field) is gone now — a different screen.
    await expect(authedPage.getByText(t("dashboardHeading"), { exact: true })).toBeVisible();
    await expect(authedPage.getByLabel(t("vehicleOdometerUnitLabel"))).toHaveCount(0);

    // The Garage nav destination still shows this vehicle's card once navigated back to.
    await goToView(authedPage, "garage");
    await expect(vehicleCard(authedPage, "Test Vehicle")).toBeVisible();
  });

  test("adding a vehicle with a blank Year field fails end-to-end (known bug, issue #178)", async ({ authedPage }) => {
    // Documents current, known-bad behavior for github.com/maksimyugai/odograph/issues/178: the
    // server 400s on `year: null` (what a blank Year field sends), and the offline write queue's
    // response to any non-2xx/401/429/5xx is to mark the action "rejected" and move on — never
    // retried, never rolled back. The card stays visible throughout (optimistic-first rendering
    // never removes a rejected create), so the real assertion is the "Rejected" sync-status chip
    // appearing once the queue's drain loop actually processes the 400, not mere card visibility.
    // This test PASSES while the bug is present and will start FAILING once #178 is fixed — at
    // that point, delete it (the happy-path "no year" case belongs as a normal assertion in
    // "creating a vehicle adds it to the garage" above instead).
    const rejectResponse = authedPage.waitForResponse(
      (res) => res.url().includes("/api/v1/vehicles") && res.request().method() === "POST",
    );
    await addVehicle(authedPage, { name: "No Year Car", odometerUnit: "km", year: "" });
    const res = await rejectResponse;
    expect(res.status(), "server should 400 a null Year — see issue #178").toBe(400);

    await expect(vehicleCard(authedPage, "No Year Car").getByText(t("rejectedSyncLabel")))
      .toBeVisible();
  });
});
