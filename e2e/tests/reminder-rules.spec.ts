import { expect, test } from "../support/dev-session.ts";
import { addFuelRecord, addReminderRule, addVehicle, reminderRuleRow, selectVehicle, t } from "../support/app.ts";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Status thresholds mirror src/server/db/repository.ts's classifyRemainingFraction: overdue once
// the due date/mileage has passed, coming_up in the last 10% of the interval, on_track otherwise.
test.describe("reminder rules — status computation (spec 011)", () => {
  test.beforeEach(async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "Reminder Test Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "Reminder Test Car");
  });

  test("a freshly-done date-based reminder is on track", async ({ authedPage }) => {
    await addReminderRule(authedPage, {
      label: "Oil change",
      intervalDays: "30",
      lastDoneDate: isoDaysAgo(0),
    });
    await expect(
      reminderRuleRow(authedPage, "Oil change").getByText(t("reminderStatusOnTrack"), {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("a reminder within the last 10% of its interval is coming up", async ({ authedPage }) => {
    // interval 30 days, done 29 days ago -> 1/30 = 3.3% remaining <= 10% threshold.
    await addReminderRule(authedPage, {
      label: "Tire rotation",
      intervalDays: "30",
      lastDoneDate: isoDaysAgo(29),
    });
    await expect(
      reminderRuleRow(authedPage, "Tire rotation").getByText(t("reminderStatusComingUp"), {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("a reminder past its due date is overdue", async ({ authedPage }) => {
    await addReminderRule(authedPage, {
      label: "Brake fluid",
      intervalDays: "30",
      lastDoneDate: isoDaysAgo(40),
    });
    await expect(
      reminderRuleRow(authedPage, "Brake fluid").getByText(t("reminderStatusOverdue"), {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("a distance-based reminder on a vehicle with no odometer history shows not enough data, never a guess", async ({
    authedPage,
  }) => {
    await addReminderRule(authedPage, {
      label: "Timing belt",
      intervalDistance: "5000",
      lastDoneOdometer: "10000",
    });
    await expect(
      reminderRuleRow(authedPage, "Timing belt").getByText(t("reminderStatusNotEnoughData"), {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("whichever comes first wins (FR-006): overdue by date beats on-track by mileage", async ({
    authedPage,
  }) => {
    // Establishes a current odometer reading of 1000 so the mileage side is computable at all.
    await addFuelRecord(authedPage, { date: isoDaysAgo(1), odometer: "1000", volume: "10", cost: "15" });
    await addReminderRule(authedPage, {
      label: "Combined - date overdue",
      intervalDays: "30",
      lastDoneDate: isoDaysAgo(40), // due 10 days ago -> overdue by date
      intervalDistance: "1000",
      lastDoneOdometer: "900", // due at 1900 vs current 1000 -> 90% remaining, on track by mileage
    });
    await expect(
      reminderRuleRow(authedPage, "Combined - date overdue").getByText(t("reminderStatusOverdue"), {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("whichever comes first wins (FR-006): overdue by mileage beats on-track by date", async ({
    authedPage,
  }) => {
    await addFuelRecord(authedPage, { date: isoDaysAgo(1), odometer: "1000", volume: "10", cost: "15" });
    await addReminderRule(authedPage, {
      label: "Combined - mileage overdue",
      intervalDays: "30",
      lastDoneDate: isoDaysAgo(0), // on track by date
      intervalDistance: "200",
      lastDoneOdometer: "700", // due at 900 vs current 1000 -> already past -> overdue by mileage
    });
    await expect(
      reminderRuleRow(authedPage, "Combined - mileage overdue").getByText(
        t("reminderStatusOverdue"),
        { exact: true },
      ),
    ).toBeVisible();
  });

  test("marking an overdue reminder done resets it to on track", async ({ authedPage }) => {
    await addReminderRule(authedPage, {
      label: "Air filter",
      intervalDays: "30",
      lastDoneDate: isoDaysAgo(40),
    });
    const row = reminderRuleRow(authedPage, "Air filter");
    await expect(row.getByText(t("reminderStatusOverdue"), { exact: true })).toBeVisible();

    await row.getByRole("button", { name: t("markReminderDone") }).click();
    await expect(row.getByText(t("reminderStatusOnTrack"), { exact: true })).toBeVisible();
  });

  test("deleting a reminder removes it from the list", async ({ authedPage }) => {
    await addReminderRule(authedPage, {
      label: "Cabin filter",
      intervalDays: "30",
      lastDoneDate: isoDaysAgo(0),
    });
    const row = reminderRuleRow(authedPage, "Cabin filter");
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: t("deleteReminderRule") }).click();
    await expect(authedPage.getByText("Cabin filter", { exact: true })).toHaveCount(0);
    await expect(authedPage.getByText(t("noReminderRulesYet"))).toBeVisible();
  });
});
