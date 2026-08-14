import { expect, test } from "../support/dev-session.ts";
import { addVehicle, goToView, selectVehicle, t } from "../support/app.ts";
import type { AppView } from "../support/app.ts";
import type { StringKey } from "../../src/client/i18n/strings.ts";

// The nav restructuring itself (spec 038): fuel/service/reminders/planner/documents moved from
// inline panels on one Garage screen to ten dedicated top-level nav destinations. This is the
// actual root-cause surface behind most of the pre-038 suite's breakage (see e2e/support/app.ts's
// `goToView`/`vehicleCard` doc comments) — nothing previously asserted that every destination
// renders its own distinct screen at all, only that individual features worked once already on
// the right one.
const DESTINATIONS: { view: AppView; heading: StringKey }[] = [
  { view: "garage", heading: "vehiclesHeading" },
  { view: "dashboard", heading: "dashboardHeading" },
  { view: "fuel", heading: "fuelRecordsHeading" },
  { view: "service", heading: "serviceRecordsHeading" },
  { view: "photos", heading: "photoGalleryHeading" },
  { view: "reminders", heading: "reminderRulesHeading" },
  { view: "planner", heading: "planBoardHeading" },
  { view: "documents", heading: "documentsHeading" },
  { view: "review", heading: "syncReviewHeading" },
  { view: "settings", heading: "settingsScreenHeading" },
];

test.describe("top-level nav screens (spec 038)", () => {
  test("every nav destination renders its own distinct screen", async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "Nav Test Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "Nav Test Car");

    for (const { view, heading } of DESTINATIONS) {
      await goToView(authedPage, view);
      // goToView already waits for the heading, so this is really asserting exclusivity: no
      // *other* destination's heading is simultaneously present (would catch a screen that fails
      // to unmount the previous one, or two views sharing a stale AppShell `title`).
      const others = DESTINATIONS.filter((d) => d.view !== view);
      for (const other of others) {
        await expect(authedPage.getByText(t(other.heading), { exact: true })).toHaveCount(0);
      }
      await expect(authedPage.getByText(t(heading), { exact: true })).toBeVisible();
    }
  });

  test("fuel/service/photos/reminders/planner/documents prompt to select a vehicle when the garage is empty", async ({ authedPage }) => {
    // With zero vehicles, `selectedVehicleId` can never become non-null (App.tsx's auto-select
    // effect only fires once `vehicles.length` is at least 1) — the one reliable way to observe
    // this prompt, since a *single* existing vehicle is auto-selected immediately (App.tsx's
    // `vehicles.length === 1` branch, from the fix-vehicle-auto-select work).
    for (
      const view of ["fuel", "service", "photos", "reminders", "planner", "documents"] as const
    ) {
      await goToView(authedPage, view);
      await expect(authedPage.getByText(t("selectVehiclePrompt"))).toBeVisible();
    }
  });

  test("adding a second vehicle doesn't steal selection away from the first (auto-select only fills a gap)", async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "First Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "First Car"); // auto-selected already; this just confirms it
    await goToView(authedPage, "garage");
    await addVehicle(authedPage, { name: "Second Nav Car", odometerUnit: "km" });
    await goToView(authedPage, "dashboard");
    await expect(authedPage.locator("main").getByText("First Car", { exact: true }))
      .toBeVisible();
  });

  test("the nav rail persists across every destination and stays clickable", async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "Persist Nav Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "Persist Nav Car");
    await goToView(authedPage, "settings");
    // From the far end of the rail, garage is still reachable in one click.
    await goToView(authedPage, "garage");
    await expect(authedPage.getByText(t("vehiclesHeading"), { exact: true })).toBeVisible();
  });
});
