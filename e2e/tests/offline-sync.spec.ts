import { expect, test } from "../support/dev-session.ts";
import { addVehicle, goToView, t, vehicleCard } from "../support/app.ts";

// Offline write queue (spec 020) and sync rejection review (spec 021) — no prior e2e coverage.
// The offline/pending indicator (SyncStatusIndicator) is only rendered on the Garage screen (same
// architectural shape as issue #179's error banner, just less severe: the rejected *count* is
// still visible everywhere via the REVIEW nav item's badge, only the live pending/offline text
// isn't). Rejections are reproduced deterministically two ways: the real, already-filed
// null-Year bug (issue #178, a genuine 400) for the "it just happens" case, and a mocked route
// for the retry-then-succeeds case.
test.describe("offline write queue & sync review (specs 020, 021)", () => {
  test("a write made while offline queues and shows a pending count, then flushes once back online", async ({ authedPage }) => {
    await authedPage.context().setOffline(true);
    const form = authedPage.getByRole("button", { name: t("addVehicle"), exact: true })
      .locator("..");
    await form.getByLabel(t("vehicleNameLabel")).fill("Sync Test Car");
    await form.getByLabel(t("vehicleYearLabel")).fill("2021");
    await form.getByRole("button", { name: t("addVehicle"), exact: true }).click();

    // One combined span ("Offline — 1 pending"), not two separate texts — and "Offline" alone
    // would also match substrings elsewhere (e.g. a garage card's own placeholder text), so
    // match the exact combined string.
    const offlineBadge = authedPage.getByText(
      `${t("offlineIndicatorLabel")} — ${t("pendingSyncCountLabel", { count: "1" })}`,
      { exact: true },
    );
    await expect(offlineBadge).toBeVisible();
    // The optimistic card still renders immediately, offline or not.
    await expect(vehicleCard(authedPage, "Sync Test Car")).toBeVisible();

    const syncedResponse = authedPage.waitForResponse(
      (res) => res.url().includes("/api/v1/vehicles") && res.request().method() === "POST",
    );
    await authedPage.context().setOffline(false);
    await syncedResponse;

    await expect(authedPage.getByText(t("offlineIndicatorLabel"))).toHaveCount(0);
    await expect(vehicleCard(authedPage, "Sync Test Car")).toBeVisible();
  });

  test("a rejected create surfaces a review badge on the REVIEW nav item from any screen", async ({ authedPage }) => {
    // issue #178: a blank Year reliably 400s and is never retried — a real, deterministic
    // rejection, not a contrived one.
    await addVehicle(authedPage, { name: "Bad Year Car", odometerUnit: "km", year: "" });
    await expect(vehicleCard(authedPage, "Bad Year Car").getByText(t("rejectedSyncLabel")))
      .toBeVisible();

    const reviewNavBadge = authedPage.locator("nav").getByText("1", { exact: true });
    await expect(reviewNavBadge).toBeVisible();

    // Still visible from a completely different screen — the nav badge, unlike the Garage-only
    // pending/offline indicator, isn't view-scoped.
    await goToView(authedPage, "settings");
    await expect(reviewNavBadge).toBeVisible();
  });

  test("the review screen describes a rejected action and lets you discard it", async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "To Discard", odometerUnit: "km", year: "" });
    await goToView(authedPage, "review");

    await expect(authedPage.getByText(t("syncReviewEmpty"))).toHaveCount(0);
    await expect(authedPage.getByText(/Create vehicle.*To Discard/)).toBeVisible();
    await expect(authedPage.getByText(t("rejectReasonInvalidRequest"))).toBeVisible();

    await authedPage.getByRole("button", { name: t("discardAction"), exact: true }).click();
    await expect(authedPage.getByText(t("syncReviewEmpty"))).toBeVisible();
    await expect(authedPage.locator("nav").getByText("1", { exact: true })).toHaveCount(0);
  });

  test("retrying a rejected action re-submits it, and it disappears from review once the server accepts it", async ({ authedPage }) => {
    let attempt = 0;
    await authedPage.route("**/api/v1/vehicles", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      attempt += 1;
      if (attempt === 1) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ error: "invalid_request" }),
        });
      } else {
        await route.continue();
      }
    });

    await addVehicle(authedPage, { name: "Retry Car", odometerUnit: "km", year: "2021" });
    await goToView(authedPage, "review");
    await expect(authedPage.getByText(/Create vehicle.*Retry Car/)).toBeVisible();

    const retrySuccess = authedPage.waitForResponse(
      (res) => res.url().includes("/api/v1/vehicles") && res.request().method() === "POST",
    );
    await authedPage.getByRole("button", { name: t("retryAction"), exact: true }).click();
    await retrySuccess;

    await expect(authedPage.getByText(t("syncReviewEmpty"))).toBeVisible();
    await goToView(authedPage, "garage");
    await expect(vehicleCard(authedPage, "Retry Car").getByText(t("rejectedSyncLabel")))
      .toHaveCount(0);
  });
});
