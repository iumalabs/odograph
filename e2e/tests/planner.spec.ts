import { expect, test } from "../support/dev-session.ts";
import {
  addPlanCard,
  addVehicle,
  goToView,
  planCard,
  selectVehicle,
  serviceRecordRow,
  t,
} from "../support/app.ts";

// Maintenance planner kanban board (spec 025) — no prior e2e coverage. Cards route through the
// offline write queue like service/fuel records (PlanBoard.tsx's own doc comment), unlike
// documents. Advancing a card to "done" auto-logs a service record (spec 049's "mirrors the
// already-shipped Planner-card-to-done behavior" — `updatePlanCard` in
// src/server/db/repository.ts, description = the card's own title).
test.describe("maintenance planner (spec 025)", () => {
  test.beforeEach(async ({ authedPage }) => {
    await addVehicle(authedPage, { name: "Planner Test Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "Planner Test Car");
    await goToView(authedPage, "planner");
  });

  test("empty planner shows the empty state", async ({ authedPage }) => {
    await expect(authedPage.getByText(t("noPlanCardsYet"))).toBeVisible();
  });

  test("adding a card puts it in the Idea column with its target date and cost", async ({ authedPage }) => {
    await addPlanCard(authedPage, {
      title: "New brake pads",
      targetDate: "2026-09-01",
      estimatedCost: "150",
      urgent: true,
    });
    await expect(authedPage.getByText(t("noPlanCardsYet"))).toHaveCount(0);
    const card = planCard(authedPage, "New brake pads");
    await expect(card).toContainText("2026-09-01");
    await expect(card).toContainText("$150");
    await expect(card.getByText(t("planCardUrgentLabel"))).toBeVisible();
  });

  test("advancing a card moves it through idea -> buy -> doing -> done", async ({ authedPage }) => {
    await addPlanCard(authedPage, { title: "Timing belt kit" });
    const card = planCard(authedPage, "Timing belt kit");

    await expect(
      card.getByRole("button", { name: t("advancePlanCard", { stage: t("planStageBuy") }) }),
    )
      .toBeVisible();
    await card.getByRole("button", { name: t("advancePlanCard", { stage: t("planStageBuy") }) })
      .click();

    await expect(
      card.getByRole("button", { name: t("advancePlanCard", { stage: t("planStageDoing") }) }),
    )
      .toBeVisible();
    await card.getByRole("button", { name: t("advancePlanCard", { stage: t("planStageDoing") }) })
      .click();

    await expect(
      card.getByRole("button", { name: t("advancePlanCard", { stage: t("planStageDone") }) }),
    )
      .toBeVisible();
    await card.getByRole("button", { name: t("advancePlanCard", { stage: t("planStageDone") }) })
      .click();

    // "done" is the terminal stage — no further advance action.
    await expect(card.getByRole("button", { name: /^Move to/ })).toHaveCount(0);
  });

  test("advancing a card to done auto-logs a service record (spec 049)", async ({ authedPage }) => {
    await addPlanCard(authedPage, { title: "Alternator replacement" });
    const card = planCard(authedPage, "Alternator replacement");
    await card.getByRole("button", { name: t("advancePlanCard", { stage: t("planStageBuy") }) })
      .click();
    await card.getByRole("button", { name: t("advancePlanCard", { stage: t("planStageDoing") }) })
      .click();
    const doneResponse = authedPage.waitForResponse(
      (res) => res.url().includes("/api/v1/plan-cards/") && res.request().method() === "PATCH",
    );
    await card.getByRole("button", { name: t("advancePlanCard", { stage: t("planStageDone") }) })
      .click();
    await doneResponse;

    // Known bug (github.com/maksimyugai/odograph/issues/180): the server-side auto-logged
    // record never reaches `serviceRecords` client state via the offline queue's sync event
    // (that event only carries the plan card itself, not its side effect) — only a refetch
    // triggered by re-selecting the vehicle (or, here, a reload) picks it up.
    await authedPage.reload();
    await authedPage.getByText(t("vehiclesHeading")).waitFor();
    await selectVehicle(authedPage, "Planner Test Car");
    await goToView(authedPage, "service");

    const record = serviceRecordRow(authedPage, "Alternator replacement");
    await expect(record).toBeVisible();
    await expect(record).toContainText("Created from the maintenance planner");
  });

  test("deleting a card removes it from its column", async ({ authedPage }) => {
    await addPlanCard(authedPage, { title: "Cabin air filter" });
    const card = planCard(authedPage, "Cabin air filter");
    await card.getByRole("button", { name: t("deletePlanCard"), exact: true }).click();
    await expect(authedPage.getByText("Cabin air filter", { exact: true })).toHaveCount(0);
    await expect(authedPage.getByText(t("noPlanCardsYet"))).toBeVisible();
  });

  test("plan cards are per-vehicle", async ({ authedPage }) => {
    await addPlanCard(authedPage, { title: "Car A's plan item" });
    await goToView(authedPage, "garage");
    await addVehicle(authedPage, { name: "Second Planner Car", odometerUnit: "km" });
    await selectVehicle(authedPage, "Second Planner Car");
    await goToView(authedPage, "planner");
    await expect(authedPage.getByText(t("noPlanCardsYet"))).toBeVisible();
    await expect(authedPage.getByText("Car A's plan item", { exact: true })).toHaveCount(0);
  });
});
