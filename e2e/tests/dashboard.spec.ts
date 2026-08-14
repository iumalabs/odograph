import { expect, test } from "../support/dev-session.ts";
import {
  addFuelRecord,
  addReminderRule,
  addServiceRecord,
  addVehicle,
  goToView,
  selectVehicle,
  t,
} from "../support/app.ts";

// Per-vehicle dashboard (specs 014, 037, 042) and expense analytics (spec 026) — no prior e2e
// coverage; both only reachable via the "dashboard" nav destination (spec 038 moved them off the
// single Garage screen). PDF export (spec 027) lives on this same screen (the download link sits
// right below the expense breakdown), so its one e2e-appropriate assertion — clicking triggers a
// download, not PDF content inspection — is folded in here too.
test.describe("per-vehicle dashboard & expense analytics (specs 014, 026, 037, 042)", () => {
  test("with no vehicles at all, the dashboard prompts to select one", async ({ authedPage }) => {
    await goToView(authedPage, "dashboard");
    await expect(authedPage.getByText(t("selectVehicleForDashboard"))).toBeVisible();
  });

  test("shows expense totals and recent activity after adding records", async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "Dashboard Test Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "Dashboard Test Car");
    await goToView(authedPage, "service");
    await addServiceRecord(authedPage, { date: "2026-06-01", description: "Oil change" });
    await goToView(authedPage, "fuel");
    await addFuelRecord(authedPage, {
      date: "2026-06-02",
      odometer: "1000",
      volume: "10",
      cost: "15",
    });

    await goToView(authedPage, "dashboard");
    // "Fuel" alone collides with the header's currency quick-toggle and the just-added toast —
    // scope to `main` and match exactly, same pattern used throughout this suite.
    await expect(authedPage.locator("main").getByText(t("expenseFuelLabel"), { exact: true }))
      .toBeVisible();
    await expect(authedPage.getByText(t("recentActivityHeading"))).toBeVisible();
    await expect(authedPage.getByText("Oil change", { exact: true })).toBeVisible();
  });

  test("an overdue reminder shows in Upcoming, an on-track one doesn't", async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "Reminder Dashboard Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "Reminder Dashboard Car");
    await goToView(authedPage, "reminders");

    const today = new Date().toISOString().slice(0, 10);
    const longAgo = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10);

    await addReminderRule(authedPage, {
      label: "Overdue Timing Belt",
      intervalDays: "30",
      lastDoneDate: longAgo,
    });
    await addReminderRule(authedPage, {
      label: "Fresh Oil Change",
      intervalDays: "30",
      lastDoneDate: today,
    });

    await goToView(authedPage, "dashboard");
    await expect(authedPage.getByText(t("upcomingRemindersHeading"))).toBeVisible();
    await expect(authedPage.getByText("Overdue Timing Belt", { exact: true })).toBeVisible();
    await expect(authedPage.getByText("Fresh Oil Change", { exact: true })).toHaveCount(0);
  });

  test.describe("expense breakdown panel (spec 026)", () => {
    test("a fresh vehicle with no records shows the empty state", async ({ authedPage }) => {
      await addVehicle(authedPage, { name: "No Expense Car", odometerUnit: "km" });
      await selectVehicle(authedPage, "No Expense Car");
      await expect(authedPage.getByText(t("noExpenseDataYet"))).toBeVisible();
    });

    test("toggling between month and year grouping switches the active button", async ({ authedPage }) => {
      await addVehicle(authedPage, { name: "Expense Toggle Car", odometerUnit: "km" });
      await selectVehicle(authedPage, "Expense Toggle Car");
      await goToView(authedPage, "service");
      await addServiceRecord(authedPage, { date: "2026-06-01", description: "Brake job" });
      await goToView(authedPage, "dashboard");

      const monthButton = authedPage.getByRole("button", {
        name: t("expenseGroupByMonth"),
        exact: true,
      });
      const yearButton = authedPage.getByRole("button", {
        name: t("expenseGroupByYear"),
        exact: true,
      });
      await expect(monthButton).toBeVisible();
      await yearButton.click();
      // Both stay present regardless of which is active — the real signal is the period row
      // switching from a "YYYY-MM" to a "YYYY" key, since there's no exposed active-state ARIA.
      await expect(authedPage.getByText(/^2026$/)).toBeVisible();
      await monthButton.click();
      await expect(authedPage.getByText(/^2026-06$/)).toBeVisible();
    });
  });

  test("downloading the PDF report triggers a real download (spec 027)", async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "PDF Export Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "PDF Export Car");
    await goToView(authedPage, "service");
    await addServiceRecord(authedPage, { date: "2026-06-01", description: "Timing belt" });
    await goToView(authedPage, "dashboard");

    const downloadPromise = authedPage.waitForEvent("download");
    await authedPage.getByRole("link", { name: t("downloadReportLabel") }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});
