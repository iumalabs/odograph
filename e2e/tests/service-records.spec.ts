import { expect, test } from "../support/dev-session.ts";
import { addServiceRecord, addVehicle, selectVehicle, serviceRecordRow, t } from "../support/app.ts";

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

  test("a second record with the same date and description is flagged a possible duplicate", async ({
    authedPage,
  }) => {
    await addServiceRecord(authedPage, { date: "2026-02-01", description: "Brake pads" });
    await addServiceRecord(authedPage, { date: "2026-02-01", description: "Brake pads" });

    const rows = authedPage.getByText("Brake pads", { exact: true });
    await expect(rows).toHaveCount(2);
    // Exactly one of the two rows carries the duplicate flag — the original never does.
    await expect(authedPage.getByText(t("possibleDuplicateLabel"))).toHaveCount(1);
    await expect(authedPage.getByRole("button", { name: t("dismissDuplicate") })).toHaveCount(1);
  });

  test("a different description on the same date is not flagged (description must match too)", async ({
    authedPage,
  }) => {
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

  test("the same date and description on a DIFFERENT vehicle is not flagged (duplicate detection is per-vehicle)", async ({
    authedPage,
  }) => {
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
});
