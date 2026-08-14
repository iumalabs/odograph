import { bootstrapDevSession, expect, test } from "../support/dev-session.ts";
import {
  addDocument,
  addServiceRecord,
  addVehicle,
  goToView,
  selectVehicle,
  t,
} from "../support/app.ts";

// Search across vehicles/records (spec 028) — no prior e2e coverage. Only mounted on the Garage
// screen (SearchBar.tsx's own doc comment: "the point of search is finding which vehicle to
// select next", unlike every per-vehicle panel). Uses `.fill()`, not `.type()`, so exactly one
// query fires instead of one per keystroke (SearchBar has no debounce — every keystroke would
// otherwise race its own request).
test.describe("search (spec 028)", () => {
  test("a query under 2 characters shows the too-short hint, not results", async ({ authedPage }) => {
    const search = authedPage.getByPlaceholder(t("searchPlaceholder"));
    await search.fill("a");
    await expect(authedPage.getByText(t("searchTooShort"))).toBeVisible();
  });

  test("a query with no matches shows the no-results message", async ({ authedPage }) => {
    const search = authedPage.getByPlaceholder(t("searchPlaceholder"));
    const responsePromise = authedPage.waitForResponse((res) =>
      res.url().includes("/api/v1/search")
    );
    await search.fill("nonexistent-zzz-query");
    await responsePromise;
    await expect(authedPage.getByText(t("searchNoResults"))).toBeVisible();
  });

  test("finds a vehicle by name and selecting it jumps to its Dashboard", async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "Subaru Outback Wilderness", odometerUnit: "km" });
    await goToView(authedPage, "garage");

    const search = authedPage.getByPlaceholder(t("searchPlaceholder"));
    const responsePromise = authedPage.waitForResponse((res) =>
      res.url().includes("/api/v1/search")
    );
    await search.fill("outback");
    await responsePromise;

    // Scoped to the results group itself — the header's vehicle-switcher pill and the Garage
    // card both also render "Subaru Outback Wilderness" text elsewhere on this same screen.
    const vehicleGroup = authedPage.getByText(t("searchVehiclesGroup"), { exact: true })
      .locator("..");
    await expect(vehicleGroup).toBeVisible();
    const result = vehicleGroup.getByRole("button", { name: /Subaru Outback Wilderness/ });
    await expect(result).toBeVisible();
    await result.click();
    await expect(authedPage.getByText(t("dashboardHeading"), { exact: true })).toBeVisible();
  });

  test("finds a service record by description", async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "Search Service Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "Search Service Car");
    await goToView(authedPage, "service");
    await addServiceRecord(authedPage, {
      date: "2026-05-01",
      description: "Timing chain replacement",
    });
    await goToView(authedPage, "garage");

    const search = authedPage.getByPlaceholder(t("searchPlaceholder"));
    const responsePromise = authedPage.waitForResponse((res) =>
      res.url().includes("/api/v1/search")
    );
    await search.fill("timing chain");
    await responsePromise;

    await expect(authedPage.getByText(t("searchServiceRecordsGroup"), { exact: true }))
      .toBeVisible();
    await expect(authedPage.getByRole("button", { name: /Timing chain replacement/ }))
      .toBeVisible();
  });

  test("finds a document by title", async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "Search Document Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "Search Document Car");
    await goToView(authedPage, "documents");
    await addDocument(authedPage, { title: "Emissions certificate", category: "inspection" });
    await goToView(authedPage, "garage");

    const search = authedPage.getByPlaceholder(t("searchPlaceholder"));
    const responsePromise = authedPage.waitForResponse((res) =>
      res.url().includes("/api/v1/search")
    );
    await search.fill("emissions");
    await responsePromise;

    await expect(authedPage.getByText(t("searchDocumentsGroup"), { exact: true })).toBeVisible();
    await expect(authedPage.getByRole("button", { name: /Emissions certificate/ })).toBeVisible();
  });

  test("search results are tenant-scoped: another tenant's vehicle never matches", async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    try {
      await bootstrapDevSession(contextA);
      await bootstrapDevSession(contextB);

      const pageA = await contextA.newPage();
      await pageA.goto("/");
      await addVehicle(pageA, { name: "Tenant A Search Target", odometerUnit: "km" });

      const pageB = await contextB.newPage();
      await pageB.goto("/");
      const search = pageB.getByPlaceholder(t("searchPlaceholder"));
      const responsePromise = pageB.waitForResponse((res) => res.url().includes("/api/v1/search"));
      await search.fill("search target");
      await responsePromise;
      await expect(pageB.getByText(t("searchNoResults"))).toBeVisible();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
