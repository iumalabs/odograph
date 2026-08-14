import { expect, test } from "../support/dev-session.ts";
import {
  addDocument,
  addVehicle,
  documentForm,
  documentRow,
  goToView,
  selectVehicle,
  t,
} from "../support/app.ts";

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Vehicle document records (spec 023), the renew shortcut (spec 036), and the expiry progress
// bar/badges (spec 045) — none had e2e coverage before (only reachable via the "documents" nav
// destination since spec 038). The create form only takes title+category (App.tsx's
// `onAddDocument` never passes an expiryDate) — expiry has to be set through the edit form.
test.describe("vehicle documents (specs 023, 036, 045)", () => {
  test.beforeEach(async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "Document Test Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "Document Test Car");
    await goToView(authedPage, "documents");
  });

  test("adding a document with a category shows it in the list", async ({ authedPage }) => {
    await expect(authedPage.getByText(t("noDocumentsYet"))).toBeVisible();
    await addDocument(authedPage, { title: "Registration card", category: "registration" });
    await expect(authedPage.getByText(t("noDocumentsYet"))).toHaveCount(0);
    const row = documentRow(authedPage, "Registration card");
    await expect(row).toContainText(t("documentCategoryRegistration"));
  });

  test("a document with no expiry date shows no expiry badge or renew shortcut", async ({ authedPage }) => {
    await addDocument(authedPage, { title: "No expiry doc" });
    const row = documentRow(authedPage, "No expiry doc");
    await expect(row.getByText(t("documentExpiredLabel"))).toHaveCount(0);
    await expect(row.getByText(t("documentComingUpLabel"))).toHaveCount(0);
    await expect(row.getByRole("button", { name: t("renewRecord") })).toHaveCount(0);
  });

  test("editing in an expiry date within 30 days shows the coming-up badge and a renew shortcut", async ({ authedPage }) => {
    await addDocument(authedPage, { title: "Insurance card", category: "insurance" });
    const row = documentRow(authedPage, "Insurance card");
    await row.getByRole("button", { name: t("editRecord"), exact: true }).click();

    const editForm = authedPage.getByRole("button", { name: t("saveEdit"), exact: true })
      .locator("..").locator("..");
    await editForm.getByLabel(t("documentExpiryDateLabel")).fill(isoDaysFromNow(10));
    await editForm.getByRole("button", { name: t("saveEdit"), exact: true }).click();

    await expect(row.getByText(t("documentComingUpLabel"))).toBeVisible();
    await expect(row.getByText(t("documentExpiredLabel"))).toHaveCount(0);
    await expect(row.getByRole("button", { name: t("renewRecord") })).toBeVisible();
  });

  test("an expiry date in the past shows the expired badge, not coming-up", async ({ authedPage }) => {
    await addDocument(authedPage, { title: "Old inspection", category: "inspection" });
    const row = documentRow(authedPage, "Old inspection");
    await row.getByRole("button", { name: t("editRecord"), exact: true }).click();

    const editForm = authedPage.getByRole("button", { name: t("saveEdit"), exact: true })
      .locator("..").locator("..");
    await editForm.getByLabel(t("documentExpiryDateLabel")).fill(isoDaysFromNow(-5));
    await editForm.getByRole("button", { name: t("saveEdit"), exact: true }).click();

    await expect(row.getByText(t("documentExpiredLabel"))).toBeVisible();
    await expect(row.getByText(t("documentComingUpLabel"))).toHaveCount(0);
    await expect(row.getByRole("button", { name: t("renewRecord") })).toBeVisible();
  });

  test("an expiry date far in the future shows no badge at all", async ({ authedPage }) => {
    await addDocument(authedPage, { title: "Fresh warranty", category: "warranty" });
    const row = documentRow(authedPage, "Fresh warranty");
    await row.getByRole("button", { name: t("editRecord"), exact: true }).click();

    const editForm = authedPage.getByRole("button", { name: t("saveEdit"), exact: true })
      .locator("..").locator("..");
    await editForm.getByLabel(t("documentExpiryDateLabel")).fill(isoDaysFromNow(120));
    await editForm.getByRole("button", { name: t("saveEdit"), exact: true }).click();

    await expect(row.getByText(t("documentExpiredLabel"))).toHaveCount(0);
    await expect(row.getByText(t("documentComingUpLabel"))).toHaveCount(0);
    await expect(row.getByRole("button", { name: t("renewRecord") })).toHaveCount(0);
  });

  test("the renew shortcut clears the stale expiry date rather than pre-filling it (spec 036)", async ({ authedPage }) => {
    await addDocument(authedPage, { title: "Renewable permit", category: "other" });
    const row = documentRow(authedPage, "Renewable permit");
    await row.getByRole("button", { name: t("editRecord"), exact: true }).click();
    let editForm = authedPage.getByRole("button", { name: t("saveEdit"), exact: true })
      .locator("..").locator("..");
    await editForm.getByLabel(t("documentExpiryDateLabel")).fill(isoDaysFromNow(-1));
    await editForm.getByRole("button", { name: t("saveEdit"), exact: true }).click();
    await expect(row.getByText(t("documentExpiredLabel"))).toBeVisible();

    await row.getByRole("button", { name: t("renewRecord"), exact: true }).click();
    editForm = authedPage.getByRole("button", { name: t("saveEdit"), exact: true })
      .locator("..").locator("..");
    // The renew shortcut must never pre-fill the now-stale expiry date (constitution Principle
    // IV: no interpolated data) — the owner has to type the real new one.
    await expect(editForm.getByLabel(t("documentExpiryDateLabel"))).toHaveValue("");
    // Title/category are still carried over unchanged, unlike the date.
    await expect(editForm.getByLabel(t("documentTitleLabel"))).toHaveValue("Renewable permit");
  });

  test("deleting a document removes it from the list", async ({ authedPage }) => {
    await addDocument(authedPage, { title: "To be deleted" });
    const row = documentRow(authedPage, "To be deleted");
    await row.getByRole("button", { name: t("deleteRecord"), exact: true }).click();
    await expect(authedPage.getByText("To be deleted", { exact: true })).toHaveCount(0);
    await expect(authedPage.getByText(t("noDocumentsYet"))).toBeVisible();
  });

  test("uploading a valid attachment shows it on the document", async ({ authedPage }) => {
    await addDocument(authedPage, { title: "Doc with receipt" });
    const row = documentRow(authedPage, "Doc with receipt");
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

  test("documents are per-vehicle: a different vehicle's list starts empty", async ({ authedPage }) => {
    await addDocument(authedPage, { title: "Car A's document" });
    await goToView(authedPage, "garage");
    await addVehicle(authedPage, { name: "Second Document Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "Second Document Car");
    await goToView(authedPage, "documents");
    await expect(authedPage.getByText(t("noDocumentsYet"))).toBeVisible();
    await expect(authedPage.getByText("Car A's document", { exact: true })).toHaveCount(0);
  });

  test("the create form resets after a successful add", async ({ authedPage }) => {
    await addDocument(authedPage, { title: "Reset check doc" });
    await expect(documentForm(authedPage).getByLabel(t("documentTitleLabel"))).toHaveValue("");
  });
});
