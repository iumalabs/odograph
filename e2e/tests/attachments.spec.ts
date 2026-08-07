import { expect, test } from "../support/dev-session.ts";
import {
  addFuelRecord,
  addServiceRecord,
  addVehicle,
  fuelRecordRow,
  selectVehicle,
  serviceRecordRow,
  t,
} from "../support/app.ts";

// Attachment validation is shared logic duplicated across service-records.ts and fuel-records.ts
// (constitution Principle V, FR-010: type detected by magic bytes, never trusted Content-Type;
// size capped at MAX_ATTACHMENT_BYTES = 10MB). Both happy-path uploads are already covered in
// service-records.spec.ts / fuel-records.spec.ts; these cover the two rejection paths, once per
// record type since the check is implemented per-route rather than in one shared handler.

const NOT_A_REAL_FILE = Buffer.from("this is plain text, not jpeg/png/pdf/webp", "utf-8");
// Starts with real PNG magic bytes so this is unambiguously a size rejection, not a type one —
// the server checks Content-Length before ever reading/sniffing the body (fuel-records.ts /
// service-records.ts: "Fast-fail on a declared oversized body before reading it into memory").
const OVERSIZED_PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(10 * 1024 * 1024 + 1),
]);

test.describe("attachment validation (specs 007, 009, constitution Principle V)", () => {
  test("a service record rejects a file whose bytes don't match any allowed signature", async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "Attachment Reject Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "Attachment Reject Car");
    await addServiceRecord(authedPage, { date: "2026-06-01", description: "Brake inspection" });
    const row = serviceRecordRow(authedPage, "Brake inspection");
    await row.getByRole("button", { name: t("attachmentUploadLabel") }).click();
    await row.locator('input[type="file"]').setInputFiles({
      name: "not-a-file.png",
      mimeType: "image/png",
      buffer: NOT_A_REAL_FILE,
    });

    await expect(
      authedPage.getByRole("alert").filter({ hasText: t("attachmentUnsupportedTypeError") }),
    )
      .toBeVisible();
    await expect(row.getByText(/KB$/)).toHaveCount(0);
  });

  test("a service record rejects a file over the 10MB cap", async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "Oversize Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "Oversize Car");
    await addServiceRecord(authedPage, { date: "2026-06-01", description: "Timing belt" });
    const row = serviceRecordRow(authedPage, "Timing belt");
    await row.getByRole("button", { name: t("attachmentUploadLabel") }).click();
    await row.locator('input[type="file"]').setInputFiles({
      name: "huge.png",
      mimeType: "image/png",
      buffer: OVERSIZED_PNG,
    });

    await expect(authedPage.getByRole("alert").filter({ hasText: t("attachmentTooLargeError") }))
      .toBeVisible();
    await expect(row.getByText(/KB$/)).toHaveCount(0);
  });

  test("a fuel record rejects a file whose bytes don't match any allowed signature", async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "Fuel Reject Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "Fuel Reject Car");
    await addFuelRecord(authedPage, {
      date: "2026-06-01",
      odometer: "1000",
      volume: "10",
      cost: "15",
    });
    const row = fuelRecordRow(authedPage, "1000");
    await row.getByRole("button", { name: t("attachmentUploadLabel") }).click();
    await row.locator('input[type="file"]').setInputFiles({
      name: "not-a-file.png",
      mimeType: "image/png",
      buffer: NOT_A_REAL_FILE,
    });

    await expect(
      authedPage.getByRole("alert").filter({ hasText: t("attachmentUnsupportedTypeError") }),
    )
      .toBeVisible();
    await expect(row.getByText(/KB$/)).toHaveCount(0);
  });

  test("a fuel record rejects a file over the 10MB cap", async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "Fuel Oversize Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "Fuel Oversize Car");
    await addFuelRecord(authedPage, {
      date: "2026-06-01",
      odometer: "1000",
      volume: "10",
      cost: "15",
    });
    const row = fuelRecordRow(authedPage, "1000");
    await row.getByRole("button", { name: t("attachmentUploadLabel") }).click();
    await row.locator('input[type="file"]').setInputFiles({
      name: "huge.png",
      mimeType: "image/png",
      buffer: OVERSIZED_PNG,
    });

    await expect(authedPage.getByRole("alert").filter({ hasText: t("attachmentTooLargeError") }))
      .toBeVisible();
    await expect(row.getByText(/KB$/)).toHaveCount(0);
  });
});
