import type { Locator, Page } from "@playwright/test";
// Imported straight from the client's own i18n table — not duplicated as literal strings — so
// these tests break loudly (import error or stale text) instead of silently drifting the moment
// UI copy changes, per the project's single-source i18n setup (src/client/i18n/strings.ts).
import { t } from "../../src/client/i18n/strings.ts";
import type { StringKey } from "../../src/client/i18n/strings.ts";

/**
 * Locates a record-creation form by its submit button, then scopes to that
 * button's immediate parent — the flex container that also holds the
 * form's own labeled inputs. Several forms share label text verbatim
 * (Service and Fuel both have a "Date" field), so `page.getByLabel(...)`
 * alone is ambiguous once a vehicle is selected and every panel renders at
 * once; scoping through the submit button's container disambiguates without
 * relying on DOM order or any test-only attribute.
 */
function formFor(page: Page, submitLabel: string): Locator {
  return page.getByRole("button", { name: submitLabel, exact: true }).locator("..");
}

/**
 * Clicking a submit button only waits for the click event to dispatch, not
 * for the async create request it kicks off — the form's own onClick
 * handler fires-and-forgets a fetch. Two `addXRecord()` calls back to back
 * with no wait between them can therefore have their POSTs land out of
 * order (or overlapping) at the server, which matters here specifically
 * because duplicate detection is a SELECT-then-INSERT with no locking
 * (src/server/db/repository.ts's find*DuplicateCandidate): a genuine race,
 * reproduced directly, silently drops the duplicate flag when two creates
 * for the same vehicle overlap (filed as a bug). Waiting for the POST's
 * response here reflects realistic sequential form submission and avoids
 * the suite spuriously tripping over that race while still exercising it.
 */
async function submitAndWait(
  page: Page,
  urlFragment: string,
  submit: () => Promise<void>,
): Promise<void> {
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes(urlFragment) && res.request().method() === "POST",
  );
  await submit();
  await responsePromise;
}

export async function addVehicle(
  page: Page,
  opts: { name: string; odometerUnit?: "km" | "mi"; year?: string },
): Promise<void> {
  const form = formFor(page, t("addVehicle"));
  await form.getByLabel(t("vehicleNameLabel")).fill(opts.name);
  if (opts.odometerUnit) {
    await form.getByLabel(t("vehicleOdometerUnitLabel")).selectOption(opts.odometerUnit);
  }
  // Known bug (github.com/maksimyugai/odograph/issues/178): a blank Year field sends
  // `year: null`, which the server's create-vehicle validator rejects as `invalid_request` — the
  // offline write queue then silently marks the create "rejected" while the UI has already
  // optimistically rendered the vehicle as if it existed, so every later request against it
  // 404s. None of these tests are *about* the Year field, so default to a valid one to route
  // around the bug; pass `year: ""` explicitly (as the dedicated regression test in
  // vehicles.spec.ts does) to exercise the bug itself.
  await form.getByLabel(t("vehicleYearLabel")).fill(opts.year ?? "2020");
  await submitAndWait(
    page,
    "/api/v1/vehicles",
    () => form.getByRole("button", { name: t("addVehicle"), exact: true }).click(),
  );
}

/**
 * Every screen's header also renders a vehicle-switcher pill per vehicle
 * (specs/039, `AppShell.tsx`) whose text is the bare vehicle name — outside
 * the `<main>` landmark that holds the actual view content. Scoping to
 * `main` is what keeps this from also matching that header pill once a
 * second vehicle exists or the header itself is visible (it always is).
 */
export function vehicleCard(page: Page, name: string): Locator {
  return page.locator("main").getByRole("button").filter({ hasText: name });
}

/**
 * Only ever a Garage-screen action: clicking a vehicle card there selects
 * it AND jumps straight to the Dashboard view (specs/038 `App.tsx`'s
 * `Garage`'s `onSelectVehicle`) — it no longer just reveals inline panels.
 * Callers that need a different screen must follow up with `goToView`.
 */
export async function selectVehicle(page: Page, name: string): Promise<void> {
  await vehicleCard(page, name).click();
  await page.getByText(t("dashboardHeading"), { exact: true }).waitFor();
}

export type AppView =
  | "garage"
  | "dashboard"
  | "fuel"
  | "service"
  | "photos"
  | "reminders"
  | "planner"
  | "documents"
  | "review"
  | "settings";

const VIEW_NAV_LABEL: Record<AppView, StringKey> = {
  garage: "garageNavLabel",
  dashboard: "dashboardNavLabel",
  fuel: "fuelNavLabel",
  service: "serviceNavLabel",
  photos: "photosNavLabel",
  reminders: "remindersNavLabel",
  planner: "plannerNavLabel",
  documents: "documentsNavLabel",
  review: "syncReviewNavLabel",
  settings: "settingsNavLabel",
};

const VIEW_HEADING: Partial<Record<AppView, StringKey>> = {
  garage: "vehiclesHeading",
  dashboard: "dashboardHeading",
  fuel: "fuelRecordsHeading",
  service: "serviceRecordsHeading",
  photos: "photoGalleryHeading",
  reminders: "reminderRulesHeading",
  planner: "planBoardHeading",
  documents: "documentsHeading",
  review: "syncReviewHeading",
  settings: "settingsScreenHeading",
};

/**
 * Clicks a nav-rail destination (specs/038 `AppShell.tsx`'s `NAV_ITEMS`) and
 * waits for that screen's own title to render — the rail persists across
 * every view, so scoping the click to `nav` avoids ever matching content
 * inside `main` that happens to repeat a label.
 *
 * The "review" entry's accessible name gets a live count prefixed onto it
 * once anything is rejected (AppShell.tsx's reviewBadgeCount span renders
 * before the label span, e.g. "1 REVIEW" instead of bare "REVIEW") — an
 * exact match against the bare label silently stops finding it the moment
 * that happens. Matching on the label as a suffix handles both cases; none
 * of the ten nav labels is a suffix of another, so this stays precise.
 */
export async function goToView(page: Page, view: AppView): Promise<void> {
  const label = t(VIEW_NAV_LABEL[view]);
  await page.locator("nav").getByRole("button", { name: new RegExp(`${label}$`) }).click();
  const heading = VIEW_HEADING[view];
  if (heading) {
    await page.getByText(t(heading), { exact: true }).first().waitFor();
  }
}

export function serviceForm(page: Page): Locator {
  return formFor(page, t("addServiceRecord"));
}

export async function addServiceRecord(
  page: Page,
  opts: { date: string; description: string },
): Promise<void> {
  const form = serviceForm(page);
  await form.getByLabel(t("serviceDateLabel")).fill(opts.date);
  await form.getByLabel(t("serviceDescriptionLabel")).fill(opts.description);
  await submitAndWait(
    page,
    "/service-records",
    () => form.getByRole("button", { name: t("addServiceRecord"), exact: true }).click(),
  );
}

/**
 * Every record panel (service/fuel/reminder) renders its list rows with the
 * identical structure — "Mirrors ServiceRecordPanel.tsx's structure
 * exactly" per the components' own comments — but *which* field the caller
 * anchors on sits at a different DOM depth from the row container: a
 * service record's description and a reminder's label are nested one level
 * deeper (inside their own content wrapper div) than a fuel record's
 * odometer reading, which is a direct child of the row's header flex row.
 * Getting this wrong doesn't error — it silently resolves to the *shared
 * list container* one level up, which happens to still contain the right
 * text and so passes for a single row, then falsely matches sibling rows'
 * content too once a second row exists (caught by the fuel duplicate-flag
 * test once two fuel rows existed simultaneously).
 */
function rowContaining(page: Page, exactText: string, parentHops: number): Locator {
  let locator = page.getByText(exactText, { exact: true });
  for (let i = 0; i < parentHops; i++) locator = locator.locator("..");
  return locator;
}

export function serviceRecordRow(page: Page, description: string): Locator {
  return rowContaining(page, description, 3);
}

export function fuelForm(page: Page): Locator {
  return formFor(page, t("addFuelRecord"));
}

export async function addFuelRecord(
  page: Page,
  opts: { date: string; odometer: string; volume: string; cost: string },
): Promise<void> {
  const form = fuelForm(page);
  await form.getByLabel(t("fuelDateLabel")).fill(opts.date);
  await form.getByLabel(t("fuelOdometerLabel")).fill(opts.odometer);
  await form.getByLabel(t("fuelVolumeLabel")).fill(opts.volume);
  await form.getByLabel(t("fuelCostLabel")).fill(opts.cost);
  await submitAndWait(
    page,
    "/fuel-records",
    () => form.getByRole("button", { name: t("addFuelRecord"), exact: true }).click(),
  );
}

export function reminderForm(page: Page): Locator {
  return formFor(page, t("addReminderRule"));
}

export async function addReminderRule(
  page: Page,
  opts: {
    label: string;
    intervalDays?: string;
    intervalDistance?: string;
    lastDoneDate?: string;
    lastDoneOdometer?: string;
  },
): Promise<void> {
  const form = reminderForm(page);
  await form.getByLabel(t("reminderLabelLabel")).fill(opts.label);
  if (opts.intervalDays) {
    await form.getByLabel(t("reminderIntervalDaysLabel")).fill(opts.intervalDays);
  }
  if (opts.intervalDistance) {
    await form.getByLabel(t("reminderIntervalDistanceLabel")).fill(opts.intervalDistance);
  }
  if (opts.lastDoneDate) {
    await form.getByLabel(t("reminderLastDoneDateLabel")).fill(opts.lastDoneDate);
  }
  if (opts.lastDoneOdometer) {
    await form.getByLabel(t("reminderLastDoneOdometerLabel")).fill(opts.lastDoneOdometer);
  }
  await submitAndWait(
    page,
    "/reminder-rules",
    () => form.getByRole("button", { name: t("addReminderRule"), exact: true }).click(),
  );
}

/**
 * Fuel records have no station field in the create form (App.tsx never
 * wires one up), so every UI-created row displays the literal
 * `fuelStationLabel` placeholder — useless as a unique row key. The
 * odometer reading is always shown verbatim, so callers should pass a
 * distinct odometer value per record under test instead.
 */
export function fuelRecordRow(page: Page, odometerReading: string): Locator {
  // The odometer <span> is a direct child of the row's header flex row, not
  // nested inside a content wrapper — one hop shallower than description/label.
  return rowContaining(page, odometerReading, 2);
}

export function reminderRuleRow(page: Page, label: string): Locator {
  return rowContaining(page, label, 3);
}

export function documentForm(page: Page): Locator {
  return formFor(page, t("addDocument"));
}

export async function addDocument(
  page: Page,
  opts: {
    title: string;
    category?: "registration" | "insurance" | "warranty" | "inspection" | "other";
  },
): Promise<void> {
  const form = documentForm(page);
  await form.getByLabel(t("documentTitleLabel")).fill(opts.title);
  if (opts.category) {
    await form.getByLabel(t("documentCategoryLabel")).selectOption(opts.category);
  }
  await submitAndWait(
    page,
    "/documents",
    () => form.getByRole("button", { name: t("addDocument"), exact: true }).click(),
  );
}

export function documentRow(page: Page, title: string): Locator {
  return rowContaining(page, title, 3);
}

export function planCardForm(page: Page): Locator {
  return formFor(page, t("addPlanCard"));
}

export async function addPlanCard(
  page: Page,
  opts: { title: string; targetDate?: string; estimatedCost?: string; urgent?: boolean },
): Promise<void> {
  const form = planCardForm(page);
  await form.getByLabel(t("planCardTitleLabel")).fill(opts.title);
  if (opts.targetDate) {
    await form.getByLabel(t("planCardTargetDateLabel")).fill(opts.targetDate);
  }
  if (opts.estimatedCost) {
    await form.getByLabel(t("planCardEstimatedCostLabel")).fill(opts.estimatedCost);
  }
  if (opts.urgent) {
    await form.getByLabel(t("planCardUrgentLabel")).check();
  }
  await submitAndWait(
    page,
    "/plan-cards",
    () => form.getByRole("button", { name: t("addPlanCard"), exact: true }).click(),
  );
}

/** Plan cards render inside their stage column, title one hop above the card container. */
export function planCard(page: Page, title: string): Locator {
  return rowContaining(page, title, 1);
}

export { t };
