import { expect, test } from "../support/dev-session.ts";
import {
  addServiceRecord,
  addVehicle,
  selectVehicle,
  serviceRecordRow,
  t,
} from "../support/app.ts";

test.describe("service record CRUD & duplicate detection (specs 007, 010)", () => {
  test.beforeEach(async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "Service Test Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "Service Test Car");
  });

  test("adding a record with required fields shows it in the history", async ({ authedPage }) => {
    await expect(authedPage.getByText(t("noServiceRecordsYet"))).toBeVisible();
    await addServiceRecord(authedPage, { date: "2026-01-15", description: "Oil change" });
    await expect(authedPage.getByText(t("noServiceRecordsYet"))).toHaveCount(0);
    await expect(serviceRecordRow(authedPage, "Oil change")).toContainText("2026-01-15");
  });

  test("a second record with the same date and description is flagged a possible duplicate", async ({ authedPage }) => {
    await addServiceRecord(authedPage, { date: "2026-02-01", description: "Brake pads" });
    await addServiceRecord(authedPage, { date: "2026-02-01", description: "Brake pads" });

    const rows = authedPage.getByText("Brake pads", { exact: true });
    await expect(rows).toHaveCount(2);
    // Exactly one of the two rows carries the duplicate flag — the original never does.
    await expect(authedPage.getByText(t("possibleDuplicateLabel"))).toHaveCount(1);
    await expect(authedPage.getByRole("button", { name: t("dismissDuplicate") })).toHaveCount(1);
  });

  test("a different description on the same date is not flagged (description must match too)", async ({ authedPage }) => {
    await addServiceRecord(authedPage, { date: "2026-03-01", description: "Tire rotation" });
    await addServiceRecord(authedPage, { date: "2026-03-01", description: "Cabin air filter" });
    await expect(authedPage.getByText(t("possibleDuplicateLabel"))).toHaveCount(0);
  });

  test("dismissing a duplicate flag clears the badge", async ({ authedPage }) => {
    await addServiceRecord(authedPage, { date: "2026-04-01", description: "Coolant flush" });
    await addServiceRecord(authedPage, { date: "2026-04-01", description: "Coolant flush" });
    await expect(authedPage.getByText(t("possibleDuplicateLabel"))).toHaveCount(1);

    await authedPage.getByRole("button", { name: t("dismissDuplicate") }).click();
    await expect(authedPage.getByText(t("possibleDuplicateLabel"))).toHaveCount(0);
    await expect(authedPage.getByRole("button", { name: t("dismissDuplicate") })).toHaveCount(0);
  });

  test("the same date and description on a DIFFERENT vehicle is not flagged (duplicate detection is per-vehicle)", async ({ authedPage }) => {
    await addServiceRecord(authedPage, { date: "2026-07-01", description: "Spark plugs" });

    await addVehicle(authedPage, { name: "Second Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "Second Car");
    await addServiceRecord(authedPage, { date: "2026-07-01", description: "Spark plugs" });

    await expect(authedPage.getByText(t("possibleDuplicateLabel"))).toHaveCount(0);
  });

  test("uploading a valid attachment shows it on the record", async ({ authedPage }) => {
    await addServiceRecord(authedPage, { date: "2026-05-01", description: "Wiper blades" });
    const row = serviceRecordRow(authedPage, "Wiper blades");
    await row.getByRole("button", { name: t("attachmentUploadLabel") }).click();

    // Minimal valid 1x1 PNG (magic bytes 89 50 4E 47 0D 0A 1A 0A + IHDR/IDAT/IEND) — the server
    // detects type by signature, not Content-Type (constitution Principle V, FR-010).
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

  test("editing a service record updates its fields and returns to the display view (issue #49)", async ({ authedPage }) => {
    await addServiceRecord(authedPage, { date: "2026-08-01", description: "Battery check" });
    const row = serviceRecordRow(authedPage, "Battery check");
    await row.getByRole("button", { name: t("editRecord"), exact: true }).click();

    // The edit form is inline in the row — scope through the Save button's own container (two
    // hops up, past the action-buttons wrapper), same pattern create forms use, since "Date"/
    // "Description" here are the same label text the create form below also uses.
    // Editing swaps the row's whole non-editing branch (its description text included) for the
    // edit form, so `row` — anchored on that now-gone text — can't be used to reach into the
    // form. Scope through the page-level Save button instead (two hops up, past the
    // action-buttons wrapper, same pattern create forms use) — unambiguous since only one row
    // is ever mid-edit at a time in these tests.
    const editForm = authedPage.getByRole("button", { name: t("saveEdit"), exact: true })
      .locator("..").locator("..");
    await editForm.getByLabel(t("serviceDescriptionLabel"), { exact: true }).fill(
      "Battery replaced",
    );
    await editForm.getByRole("button", { name: t("saveEdit"), exact: true }).click();

    await expect(authedPage.getByRole("button", { name: t("saveEdit") })).toHaveCount(0);
    await expect(authedPage.getByText("Battery replaced", { exact: true })).toBeVisible();
    await expect(authedPage.getByText("Battery check", { exact: true })).toHaveCount(0);
  });

  test("cancelling a service record edit discards the draft", async ({ authedPage }) => {
    await addServiceRecord(authedPage, { date: "2026-08-02", description: "Headlight bulb" });
    const row = serviceRecordRow(authedPage, "Headlight bulb");
    await row.getByRole("button", { name: t("editRecord"), exact: true }).click();

    // Editing swaps the row's whole non-editing branch (its description text included) for the
    // edit form, so `row` — anchored on that now-gone text — can't be used to reach into the
    // form. Scope through the page-level Save button instead (two hops up, past the
    // action-buttons wrapper, same pattern create forms use) — unambiguous since only one row
    // is ever mid-edit at a time in these tests.
    const editForm = authedPage.getByRole("button", { name: t("saveEdit"), exact: true })
      .locator("..").locator("..");
    await editForm.getByLabel(t("serviceDescriptionLabel"), { exact: true }).fill(
      "Discarded draft",
    );
    await editForm.getByRole("button", { name: t("cancelEdit"), exact: true }).click();

    await expect(authedPage.getByRole("button", { name: t("saveEdit") })).toHaveCount(0);
    await expect(authedPage.getByText("Discarded draft", { exact: true })).toHaveCount(0);
    await expect(authedPage.getByText("Headlight bulb", { exact: true })).toBeVisible();
  });

  test("deleting a service record removes it from the history (issue #49)", async ({ authedPage }) => {
    await addServiceRecord(authedPage, { date: "2026-08-03", description: "Cabin filter swap" });
    const row = serviceRecordRow(authedPage, "Cabin filter swap");
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: t("deleteRecord"), exact: true }).click();

    await expect(authedPage.getByText("Cabin filter swap", { exact: true })).toHaveCount(0);
    await expect(authedPage.getByText(t("noServiceRecordsYet"))).toBeVisible();
  });
});
