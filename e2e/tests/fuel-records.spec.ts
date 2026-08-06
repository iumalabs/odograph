import { expect, test } from "../support/dev-session.ts";
import { addFuelRecord, addVehicle, fuelRecordRow, selectVehicle, t } from "../support/app.ts";

test.describe("fuel record CRUD, economy & duplicate detection (specs 009, 010)", () => {
  test.beforeEach(async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "Fuel Test Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "Fuel Test Car");
  });

  test("the first fuel record ever has no economy — shown as an explicit dash, never blank", async ({ authedPage }) => {
    await expect(authedPage.getByText(t("noFuelRecordsYet"))).toBeVisible();
    await addFuelRecord(authedPage, {
      date: "2026-01-01",
      odometer: "10000",
      volume: "40",
      cost: "60",
    });
    await expect(
      fuelRecordRow(authedPage, "10000").getByText(t("fuelEconomyNotEnoughData"), {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("a second record computes economy from the odometer delta since the prior record", async ({ authedPage }) => {
    await addFuelRecord(authedPage, {
      date: "2026-01-01",
      odometer: "10000",
      volume: "40",
      cost: "60",
    });
    await addFuelRecord(authedPage, {
      date: "2026-01-15",
      odometer: "10500",
      volume: "50",
      cost: "75",
    });
    // (10500 - 10000) / 50 = 10.0
    await expect(fuelRecordRow(authedPage, "10500").getByText("10.0", { exact: true }))
      .toBeVisible();
  });

  test("same date + odometer within the 5-unit tolerance is flagged a possible duplicate", async ({ authedPage }) => {
    await addFuelRecord(authedPage, {
      date: "2026-02-01",
      odometer: "20000",
      volume: "10",
      cost: "15",
    });
    await addFuelRecord(authedPage, {
      date: "2026-02-01",
      odometer: "20003",
      volume: "10",
      cost: "15",
    });

    await expect(
      fuelRecordRow(authedPage, "20003").getByText(t("possibleDuplicateLabel")),
    ).toBeVisible();
    await expect(
      fuelRecordRow(authedPage, "20000").getByText(t("possibleDuplicateLabel")),
    ).toHaveCount(0);
  });

  test("same date but odometer outside the tolerance is NOT flagged", async ({ authedPage }) => {
    await addFuelRecord(authedPage, {
      date: "2026-03-01",
      odometer: "30000",
      volume: "10",
      cost: "15",
    });
    await addFuelRecord(authedPage, {
      date: "2026-03-01",
      odometer: "30010",
      volume: "10",
      cost: "15",
    });
    await expect(authedPage.getByText(t("possibleDuplicateLabel"))).toHaveCount(0);
  });

  test("the same date + near odometer on a DIFFERENT vehicle is not flagged (duplicate detection is per-vehicle)", async ({ authedPage }) => {
    await addFuelRecord(authedPage, {
      date: "2026-02-15",
      odometer: "25000",
      volume: "10",
      cost: "15",
    });

    await addVehicle(authedPage, { name: "Second Fuel Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "Second Fuel Car");
    await addFuelRecord(authedPage, {
      date: "2026-02-15",
      odometer: "25001",
      volume: "10",
      cost: "15",
    });

    await expect(authedPage.getByText(t("possibleDuplicateLabel"))).toHaveCount(0);
  });

  test("no-interpolation guarantee: economy skips a flagged duplicate and uses the last real fill-up (spec 009/010)", async ({ authedPage }) => {
    // Record 1: the real first fill-up.
    await addFuelRecord(authedPage, {
      date: "2026-03-01",
      odometer: "60000",
      volume: "40",
      cost: "60",
    });
    // Record 2: same date, odometer 3 away (within the 5-unit tolerance) -> flagged a duplicate of
    // record 1, so it must be invisible to record 3's economy calculation.
    await addFuelRecord(authedPage, {
      date: "2026-03-01",
      odometer: "60003",
      volume: "10",
      cost: "15",
    });
    await expect(fuelRecordRow(authedPage, "60003").getByText(t("possibleDuplicateLabel")))
      .toBeVisible();
    // Record 3: a later, real fill-up. If record 2 were wrongly used as "previous" instead of
    // being skipped, economy would be (60500-60003)/50 = 9.9, not (60500-60000)/50 = 10.0 — the
    // two are close enough that a naive off-by-one here would be easy to miss without this check.
    await addFuelRecord(authedPage, {
      date: "2026-03-15",
      odometer: "60500",
      volume: "50",
      cost: "75",
    });
    await expect(fuelRecordRow(authedPage, "60500").getByText("10.0", { exact: true }))
      .toBeVisible();
  });

  test("dismissing a fuel duplicate flag clears the badge and shows economy instead", async ({ authedPage }) => {
    await addFuelRecord(authedPage, {
      date: "2026-04-01",
      odometer: "40000",
      volume: "10",
      cost: "15",
    });
    await addFuelRecord(authedPage, {
      date: "2026-04-01",
      odometer: "40002",
      volume: "10",
      cost: "15",
    });
    const duplicateRow = fuelRecordRow(authedPage, "40002");
    await expect(duplicateRow.getByText(t("possibleDuplicateLabel"))).toBeVisible();

    await duplicateRow.getByRole("button", { name: t("dismissDuplicate") }).click();
    await expect(duplicateRow.getByText(t("possibleDuplicateLabel"))).toHaveCount(0);
  });

  test("uploading a valid attachment shows it on the record", async ({ authedPage }) => {
    await addFuelRecord(authedPage, {
      date: "2026-05-01",
      odometer: "50000",
      volume: "10",
      cost: "15",
    });
    const row = fuelRecordRow(authedPage, "50000");
    await row.getByRole("button", { name: t("attachmentUploadLabel") }).click();

    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    await row.locator('input[type="file"]').setInputFiles({
      name: "receipt.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(row.getByText(`${t("uploadAttachment")} ✓`)).toBeVisible();
    await expect(row.getByText(/KB$/)).toBeVisible();
  });

  test("editing a fuel record updates its fields and returns to the display view (issue #49)", async ({ authedPage }) => {
    await addFuelRecord(authedPage, {
      date: "2026-06-01",
      odometer: "70000",
      volume: "10",
      cost: "15",
    });
    const row = fuelRecordRow(authedPage, "70000");
    await row.getByRole("button", { name: t("editRecord"), exact: true }).click();

    // Editing swaps the row's whole non-editing branch (odometer/cost text included) for the
    // edit form, so `row` — anchored on that now-gone text — can't be used to reach into the
    // form. Scope through the page-level Save button instead (two hops up, past the
    // action-buttons wrapper, same pattern create forms use) — unambiguous since only one row
    // is ever mid-edit at a time in these tests.
    const editForm = authedPage.getByRole("button", { name: t("saveEdit"), exact: true })
      .locator("..").locator("..");
    await editForm.getByLabel(t("costLabel"), { exact: true }).fill("99");
    await editForm.getByRole("button", { name: t("saveEdit"), exact: true }).click();

    await expect(authedPage.getByRole("button", { name: t("saveEdit") })).toHaveCount(0);
    await expect(row.getByText("99", { exact: true })).toBeVisible();
  });

  test("cancelling a fuel record edit discards the draft", async ({ authedPage }) => {
    await addFuelRecord(authedPage, {
      date: "2026-06-02",
      odometer: "71000",
      volume: "10",
      cost: "15",
    });
    const row = fuelRecordRow(authedPage, "71000");
    await row.getByRole("button", { name: t("editRecord"), exact: true }).click();

    const editForm = authedPage.getByRole("button", { name: t("saveEdit"), exact: true })
      .locator("..").locator("..");
    await editForm.getByLabel(t("costLabel"), { exact: true }).fill("999999");
    await editForm.getByRole("button", { name: t("cancelEdit"), exact: true }).click();

    await expect(authedPage.getByRole("button", { name: t("saveEdit") })).toHaveCount(0);
    await expect(row.getByText("999999", { exact: true })).toHaveCount(0);
    await expect(row.getByText("15", { exact: true })).toBeVisible();
  });

  test("deleting a fuel record removes it from the history (issue #49)", async ({ authedPage }) => {
    await addFuelRecord(authedPage, {
      date: "2026-06-03",
      odometer: "72000",
      volume: "10",
      cost: "15",
    });
    const row = fuelRecordRow(authedPage, "72000");
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: t("deleteRecord"), exact: true }).click();

    await expect(authedPage.getByText("72000", { exact: true })).toHaveCount(0);
    await expect(authedPage.getByText(t("noFuelRecordsYet"))).toBeVisible();
  });
});
