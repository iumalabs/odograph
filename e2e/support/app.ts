import type { Locator, Page } from "@playwright/test";
// Imported straight from the client's own i18n table — not duplicated as literal strings — so
// these tests break loudly (import error or stale text) instead of silently drifting the moment
// UI copy changes, per the project's single-source i18n setup (src/client/i18n/strings.ts).
import { t } from "../../src/client/i18n/strings.ts";

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
  opts: { name: string; odometerUnit?: "km" | "mi" },
): Promise<void> {
  const form = formFor(page, t("addVehicle"));
  await form.getByLabel(t("vehicleNameLabel")).fill(opts.name);
  if (opts.odometerUnit) {
    await form.getByLabel(t("vehicleOdometerUnitLabel")).selectOption(opts.odometerUnit);
  }
  await submitAndWait(
    page,
    "/api/v1/vehicles",
    () => form.getByRole("button", { name: t("addVehicle"), exact: true }).click(),
  );
}

export function vehicleCard(page: Page, name: string): Locator {
  return page.getByRole("button").filter({ hasText: name });
}

export async function selectVehicle(page: Page, name: string): Promise<void> {
  await vehicleCard(page, name).click();
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

export { t };
