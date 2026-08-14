import { Hono } from "hono";
import {
  acceptServiceDueEstimate,
  computeFuelPreview,
  computeServiceDueEstimate,
  computeVehicleAggregates,
  computeVehicleExpenseBreakdown,
  createDocument,
  createFuelRecord,
  createPlanCard,
  createReminderRule,
  createServiceRecord,
  createVehicle,
  deleteVehicle,
  findFuelRecordById,
  findReminderRuleById,
  findVehicleById,
  getVehicleHistoryForReport,
  listAttachmentKeysForVehicle,
  listAttachmentKeysForVehicleDocuments,
  listAttachmentKeysForVehicleFuelRecords,
  listDocuments,
  listFuelRecordsWithEconomy,
  listPlanCards,
  listReminderRulesWithStatus,
  listServiceRecords,
  listVehicles,
  updateVehicle,
} from "../../db/repository";
import type {
  DocumentInput,
  ExpenseGroupBy,
  FuelRecordInput,
  PlanCardInput,
  ReminderRuleInput,
  ServiceRecordInput,
  Vehicle,
  VehicleInput,
} from "../../db/repository";
import { deleteAttachments, getAttachment } from "../../attachments/storage";
import { buildReportData } from "../../reports/maintenance-history-report";
import { renderReportPdf } from "../../reports/render-pdf";
import { rateLimitBySession } from "../../auth/rate-limit";
import { tenantContextOrToken } from "../../middleware/tenant-context";
import { idempotent } from "../../middleware/idempotency";
import type { AppEnv } from "../../types";

export const vehicles = new Hono<AppEnv>();

vehicles.use("*", tenantContextOrToken);

const ODOMETER_UNITS = new Set(["km", "mi"]);
const MIN_YEAR = 1900;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Honors a client-supplied id on create (spec 020: a record created offline needs a stable
 * identity before it ever syncs). `undefined` return means "present but invalid" so the caller
 * can 400 rather than silently falling back to a server-generated id.
 */
function parseOptionalId(body: { id?: unknown }): string | null | undefined {
  if (body.id === undefined) return null;
  if (typeof body.id === "string" && UUID_RE.test(body.id)) return body.id;
  return undefined;
}

function maxYear(): number {
  return new Date().getUTCFullYear() + 10;
}

function isValidYear(year: unknown): year is number {
  return typeof year === "number" && Number.isInteger(year) && year >= MIN_YEAR &&
    year <= maxYear();
}

type CreateBody = {
  id?: unknown;
  name?: unknown;
  odometerUnit?: unknown;
  make?: unknown;
  model?: unknown;
  year?: unknown;
  vin?: unknown;
};

function validateCreate(body: CreateBody): VehicleInput | null {
  if (typeof body.name !== "string" || body.name.length === 0) return null;
  if (typeof body.odometerUnit !== "string" || !ODOMETER_UNITS.has(body.odometerUnit)) return null;
  if (body.year !== undefined && !isValidYear(body.year)) return null;

  return {
    name: body.name,
    make: typeof body.make === "string" ? body.make : null,
    model: typeof body.model === "string" ? body.model : null,
    year: typeof body.year === "number" ? body.year : null,
    vin: typeof body.vin === "string" ? body.vin : null,
    odometerUnit: body.odometerUnit as "km" | "mi",
  };
}

function validatePatch(body: CreateBody): Partial<VehicleInput> | null {
  const patch: Partial<VehicleInput> = {};

  if ("name" in body) {
    if (typeof body.name !== "string" || body.name.length === 0) return null;
    patch.name = body.name;
  }
  if ("odometerUnit" in body) {
    if (typeof body.odometerUnit !== "string" || !ODOMETER_UNITS.has(body.odometerUnit)) {
      return null;
    }
    patch.odometerUnit = body.odometerUnit as "km" | "mi";
  }
  if ("year" in body) {
    if (body.year !== null && !isValidYear(body.year)) return null;
    patch.year = typeof body.year === "number" ? body.year : null;
  }
  if ("make" in body) patch.make = typeof body.make === "string" ? body.make : null;
  if ("model" in body) patch.model = typeof body.model === "string" ? body.model : null;
  if ("vin" in body) patch.vin = typeof body.vin === "string" ? body.vin : null;

  return patch;
}

/** Strips the R2 key/content-type (internal storage detail, never handed to a client — same
 * posture as every other attachment response in this file) down to a plain `hasPhoto` flag; the
 * actual bytes are only ever reachable through GET /:id/photo below. */
function publicVehicle(vehicle: Vehicle) {
  const { photoR2Key, photoContentType: _photoContentType, ...rest } = vehicle;
  return { ...rest, hasPhoto: photoR2Key !== null };
}

vehicles.post("/", rateLimitBySession, idempotent, async (c) => {
  const body = await c.req.json().catch(() => ({}) as CreateBody);
  const input = validateCreate(body);
  if (!input) {
    return c.json({ error: "invalid_request" }, 400);
  }
  const clientId = parseOptionalId(body);
  if (clientId === undefined) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const vehicle = await createVehicle(c.env.DB, c.get("tenant"), input, clientId ?? undefined);
  return c.json(publicVehicle(vehicle), 201);
});

vehicles.get("/", async (c) => {
  const results = await listVehicles(c.env.DB, c.get("tenant"));
  return c.json({ vehicles: results.map(publicVehicle) });
});

vehicles.get("/:id", async (c) => {
  const vehicle = await findVehicleById(c.env.DB, c.get("tenant"), c.req.param("id"));
  if (!vehicle) return c.notFound();
  return c.json(publicVehicle(vehicle));
});

vehicles.patch("/:id", rateLimitBySession, async (c) => {
  const body = await c.req.json().catch(() => ({}) as CreateBody);
  const patch = validatePatch(body);
  if (!patch) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const vehicle = await updateVehicle(c.env.DB, c.get("tenant"), c.req.param("id"), patch);
  if (!vehicle) return c.notFound();
  return c.json(publicVehicle(vehicle));
});

// Read-only, not rate-limited — same posture as every other GET in this file. Served directly by
// this Worker route, never a redirect to a public storage URL (same posture as
// service-records'/fuel-records'/documents' attachment routes).
vehicles.get("/:id/photo", async (c) => {
  const vehicle = await findVehicleById(c.env.DB, c.get("tenant"), c.req.param("id"));
  if (!vehicle || !vehicle.photoR2Key || !vehicle.photoContentType) return c.notFound();

  const object = await getAttachment(c.env.ATTACHMENTS, vehicle.photoR2Key);
  if (!object) return c.notFound();

  return c.body(object.body, 200, { "Content-Type": vehicle.photoContentType });
});

vehicles.delete("/:id", rateLimitBySession, async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("id");

  // R2 objects never cascade from a D1 delete (constitution Principle VIII) — clean them up
  // before removing the D1 rows that reference them. All three attachment kinds (service records,
  // fuel records, documents) belonging to this vehicle must be cleaned up (spec 009's retrofit,
  // extended by specs/023).
  const serviceAttachmentKeys = await listAttachmentKeysForVehicle(c.env.DB, tenant, vehicleId);
  const fuelAttachmentKeys = await listAttachmentKeysForVehicleFuelRecords(
    c.env.DB,
    tenant,
    vehicleId,
  );
  const documentAttachmentKeys = await listAttachmentKeysForVehicleDocuments(
    c.env.DB,
    tenant,
    vehicleId,
  );
  await deleteAttachments(c.env.ATTACHMENTS, [
    ...serviceAttachmentKeys,
    ...fuelAttachmentKeys,
    ...documentAttachmentKeys,
  ]);

  const deleted = await deleteVehicle(c.env.DB, tenant, vehicleId);
  if (!deleted) return c.notFound();
  return c.body(null, 204);
});

type ServiceRecordBody = {
  id?: unknown;
  serviceDate?: unknown;
  description?: unknown;
  odometerReading?: unknown;
  cost?: unknown;
  notes?: unknown;
  performedBy?: unknown;
};

function validateServiceRecordCreate(body: ServiceRecordBody): ServiceRecordInput | null {
  if (typeof body.serviceDate !== "string" || body.serviceDate.length === 0) return null;
  if (typeof body.description !== "string" || body.description.length === 0) return null;
  if (body.odometerReading !== undefined && typeof body.odometerReading !== "number") return null;
  if (body.cost !== undefined && typeof body.cost !== "number") return null;
  if (body.notes !== undefined && typeof body.notes !== "string") return null;
  if (
    body.performedBy !== undefined && body.performedBy !== "self" && body.performedBy !== "shop"
  ) return null;

  return {
    serviceDate: body.serviceDate,
    description: body.description,
    odometerReading: typeof body.odometerReading === "number" ? body.odometerReading : null,
    cost: typeof body.cost === "number" ? body.cost : null,
    notes: typeof body.notes === "string" ? body.notes : null,
    performedBy: body.performedBy === "self" || body.performedBy === "shop"
      ? body.performedBy
      : null,
  };
}

vehicles.post("/:vehicleId/service-records", rateLimitBySession, idempotent, async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
  if (!vehicle) return c.notFound();

  const body = await c.req.json().catch(() => ({}) as ServiceRecordBody);
  const input = validateServiceRecordCreate(body);
  if (!input) {
    return c.json({ error: "invalid_request" }, 400);
  }
  const clientId = parseOptionalId(body);
  if (clientId === undefined) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const record = await createServiceRecord(
    c.env.DB,
    tenant,
    vehicleId,
    input,
    clientId ?? undefined,
  );
  return c.json(record, 201);
});

vehicles.get("/:vehicleId/service-records", async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
  if (!vehicle) return c.notFound();

  const results = await listServiceRecords(c.env.DB, tenant, vehicleId);
  return c.json({ serviceRecords: results });
});

type FuelRecordBody = {
  id?: unknown;
  fuelDate?: unknown;
  odometerReading?: unknown;
  volume?: unknown;
  cost?: unknown;
  station?: unknown;
  notes?: unknown;
};

function validateFuelRecordCreate(body: FuelRecordBody): FuelRecordInput | null {
  if (typeof body.fuelDate !== "string" || body.fuelDate.length === 0) return null;
  if (typeof body.odometerReading !== "number") return null;
  if (typeof body.volume !== "number") return null;
  if (typeof body.cost !== "number") return null;
  if (body.station !== undefined && typeof body.station !== "string") return null;
  if (body.notes !== undefined && typeof body.notes !== "string") return null;

  return {
    fuelDate: body.fuelDate,
    odometerReading: body.odometerReading,
    volume: body.volume,
    cost: body.cost,
    station: typeof body.station === "string" ? body.station : null,
    notes: typeof body.notes === "string" ? body.notes : null,
  };
}

vehicles.post("/:vehicleId/fuel-records", rateLimitBySession, idempotent, async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
  if (!vehicle) return c.notFound();

  const body = await c.req.json().catch(() => ({}) as FuelRecordBody);
  const input = validateFuelRecordCreate(body);
  if (!input) {
    return c.json({ error: "invalid_request" }, 400);
  }
  const clientId = parseOptionalId(body);
  if (clientId === undefined) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const record = await createFuelRecord(c.env.DB, tenant, vehicleId, input, clientId ?? undefined);
  // Computed fresh rather than assumed null — a backfilled fill-up can have a computable economy
  // even on creation, if it slots in after an earlier record by odometer reading (FR-007/FR-008).
  const withEconomy = await findFuelRecordById(c.env.DB, tenant, record.id);
  return c.json(withEconomy, 201);
});

const UNIT_QUERY_VALUES = new Set(["km", "mi"]);

/** Parses the optional ?unit= query param shared by the fuel-economy endpoints (specs/050). Absent
 * → { ok: true, unit: undefined } (falls back to the vehicle's own native unit downstream); an
 * unrecognized non-empty value → { ok: false }, matching /expense-breakdown's groupBy pattern. */
function parseUnitQuery(
  value: string | undefined,
): { ok: true; unit?: "km" | "mi" } | { ok: false } {
  if (value === undefined) return { ok: true, unit: undefined };
  if (!UNIT_QUERY_VALUES.has(value)) return { ok: false };
  return { ok: true, unit: value as "km" | "mi" };
}

vehicles.get("/:vehicleId/fuel-records", async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
  if (!vehicle) return c.notFound();

  const unitQuery = parseUnitQuery(c.req.query("unit"));
  if (!unitQuery.ok) return c.json({ error: "invalid_request" }, 400);

  const results = await listFuelRecordsWithEconomy(c.env.DB, tenant, vehicleId, unitQuery.unit);
  return c.json({ fuelRecords: results });
});

const DOCUMENT_CATEGORIES = new Set([
  "registration",
  "insurance",
  "warranty",
  "inspection",
  "other",
]);

type DocumentBody = {
  id?: unknown;
  title?: unknown;
  category?: unknown;
  expiryDate?: unknown;
  notes?: unknown;
};

function validateDocumentCreate(body: DocumentBody): DocumentInput | null {
  if (typeof body.title !== "string" || body.title.length === 0) return null;
  if (typeof body.category !== "string" || !DOCUMENT_CATEGORIES.has(body.category)) return null;
  if (body.expiryDate !== undefined && typeof body.expiryDate !== "string") return null;
  if (body.notes !== undefined && typeof body.notes !== "string") return null;

  return {
    title: body.title,
    category: body.category as DocumentInput["category"],
    expiryDate: typeof body.expiryDate === "string" ? body.expiryDate : null,
    notes: typeof body.notes === "string" ? body.notes : null,
  };
}

vehicles.post("/:vehicleId/documents", rateLimitBySession, idempotent, async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
  if (!vehicle) return c.notFound();

  const body = await c.req.json().catch(() => ({}) as DocumentBody);
  const input = validateDocumentCreate(body);
  if (!input) {
    return c.json({ error: "invalid_request" }, 400);
  }
  const clientId = parseOptionalId(body);
  if (clientId === undefined) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const document = await createDocument(c.env.DB, tenant, vehicleId, input, clientId ?? undefined);
  return c.json(document, 201);
});

vehicles.get("/:vehicleId/documents", async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
  if (!vehicle) return c.notFound();

  const results = await listDocuments(c.env.DB, tenant, vehicleId);
  return c.json({ documents: results });
});

type PlanCardBody = {
  id?: unknown;
  title?: unknown;
  targetDate?: unknown;
  estimatedCost?: unknown;
  urgent?: unknown;
};

function validatePlanCardCreate(body: PlanCardBody): PlanCardInput | null {
  if (typeof body.title !== "string" || body.title.length === 0) return null;
  if (body.targetDate !== undefined && typeof body.targetDate !== "string") return null;
  if (body.estimatedCost !== undefined && typeof body.estimatedCost !== "number") return null;
  if (body.urgent !== undefined && typeof body.urgent !== "boolean") return null;

  return {
    title: body.title,
    targetDate: typeof body.targetDate === "string" ? body.targetDate : null,
    estimatedCost: typeof body.estimatedCost === "number" ? body.estimatedCost : null,
    urgent: body.urgent === true,
  };
}

vehicles.post("/:vehicleId/plan-cards", rateLimitBySession, idempotent, async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
  if (!vehicle) return c.notFound();

  const body = await c.req.json().catch(() => ({}) as PlanCardBody);
  const input = validatePlanCardCreate(body);
  if (!input) {
    return c.json({ error: "invalid_request" }, 400);
  }
  const clientId = parseOptionalId(body);
  if (clientId === undefined) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const card = await createPlanCard(c.env.DB, tenant, vehicleId, input, clientId ?? undefined);
  return c.json(card, 201);
});

vehicles.get("/:vehicleId/plan-cards", async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
  if (!vehicle) return c.notFound();

  const results = await listPlanCards(c.env.DB, tenant, vehicleId);
  return c.json({ planCards: results });
});

// Read-only, not rate-limited — matches every other GET in this file.
vehicles.get("/:vehicleId/aggregates", async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
  if (!vehicle) return c.notFound();

  const unitQuery = parseUnitQuery(c.req.query("unit"));
  if (!unitQuery.ok) return c.json({ error: "invalid_request" }, 400);

  const aggregates = await computeVehicleAggregates(c.env.DB, tenant, vehicleId, unitQuery.unit);
  return c.json(aggregates);
});

const EXPENSE_GROUP_BY_VALUES = new Set(["month", "year"]);

// Read-only, not rate-limited — matches /:vehicleId/aggregates's existing posture.
vehicles.get("/:vehicleId/expense-breakdown", async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
  if (!vehicle) return c.notFound();

  const groupBy = c.req.query("groupBy");
  if (typeof groupBy !== "string" || !EXPENSE_GROUP_BY_VALUES.has(groupBy)) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const periods = await computeVehicleExpenseBreakdown(
    c.env.DB,
    tenant,
    vehicleId,
    groupBy as ExpenseGroupBy,
  );
  return c.json({ periods });
});

/** Parses a required query param as a finite number, or returns null on missing/invalid input. */
function requiredFiniteNumberQuery(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Read-only, not rate-limited — matches /:vehicleId/aggregates's/expense-breakdown's existing
// posture. Never persists anything (specs/040 contracts/api.md) — a pure computed preview.
vehicles.get("/:vehicleId/fuel-preview", async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
  if (!vehicle) return c.notFound();

  const odometerReading = requiredFiniteNumberQuery(c.req.query("odometerReading"));
  const volume = requiredFiniteNumberQuery(c.req.query("volume"));
  const costRaw = c.req.query("cost");
  const cost = costRaw === undefined ? null : requiredFiniteNumberQuery(costRaw);
  const unitQuery = parseUnitQuery(c.req.query("unit"));
  if (
    odometerReading === null || volume === null || (costRaw !== undefined && cost === null) ||
    !unitQuery.ok
  ) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const preview = await computeFuelPreview(
    c.env.DB,
    tenant,
    vehicleId,
    odometerReading,
    volume,
    cost,
    unitQuery.unit,
  );
  return c.json(preview);
});

// Read-only, not rate-limited — matches /fuel-preview's existing posture (specs/053
// contracts/api.md). Never persists anything — a pure computed estimate.
vehicles.get("/:vehicleId/service-due-estimate", async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
  if (!vehicle) return c.notFound();

  const estimate = await computeServiceDueEstimate(c.env.DB, tenant, vehicleId);
  return c.json({ estimate });
});

vehicles.post(
  "/:vehicleId/service-due-estimate/accept",
  rateLimitBySession,
  idempotent,
  async (c) => {
    const tenant = c.get("tenant");
    const vehicleId = c.req.param("vehicleId");

    const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
    if (!vehicle) return c.notFound();

    const body = await c.req.json().catch(() => ({}) as { description?: unknown; id?: unknown });
    if (typeof body.description !== "string" || body.description.length === 0) {
      return c.json({ error: "invalid_request" }, 400);
    }
    const clientId = parseOptionalId(body);
    if (clientId === undefined) {
      return c.json({ error: "invalid_request" }, 400);
    }

    const rule = await acceptServiceDueEstimate(
      c.env.DB,
      tenant,
      vehicleId,
      body.description,
      clientId ?? undefined,
    );
    if (!rule) {
      return c.json({ error: "no_longer_available" }, 409);
    }
    const withStatus = await findReminderRuleById(c.env.DB, tenant, rule.id);
    return c.json(withStatus, 201);
  },
);

/** Only safe filename characters — a vehicle name is free text and could otherwise break the
 * Content-Disposition header or produce an unusable filename on the client's filesystem. */
function safeFilenameFragment(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
  return sanitized.length > 0 ? sanitized : "vehicle";
}

// Read-only, not rate-limited — matches /:vehicleId/aggregates's/expense-breakdown's existing
// posture; PDF generation is in-memory, bounded by the vehicle's own record count.
vehicles.get("/:vehicleId/report.pdf", async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
  if (!vehicle) return c.notFound();

  const { services, fuels } = await getVehicleHistoryForReport(c.env.DB, tenant, vehicleId);
  const reportData = buildReportData(vehicle, services, fuels);
  const pdfBytes = await renderReportPdf(reportData);

  const filename = `${safeFilenameFragment(vehicle.name)}-maintenance-history.pdf`;
  return c.body(pdfBytes, 200, {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${filename}"`,
  });
});

type ReminderRuleBody = {
  id?: unknown;
  label?: unknown;
  intervalDays?: unknown;
  intervalDistance?: unknown;
  lastDoneDate?: unknown;
  lastDoneOdometer?: unknown;
};

function validateReminderRuleCreate(body: ReminderRuleBody): ReminderRuleInput | null {
  if (typeof body.label !== "string" || body.label.length === 0) return null;

  const hasIntervalDays = body.intervalDays !== undefined;
  const hasIntervalDistance = body.intervalDistance !== undefined;
  if (!hasIntervalDays && !hasIntervalDistance) return null;
  if (hasIntervalDays && typeof body.intervalDays !== "number") return null;
  if (hasIntervalDistance && typeof body.intervalDistance !== "number") return null;

  if (hasIntervalDays && typeof body.lastDoneDate !== "string") return null;
  if (hasIntervalDistance && typeof body.lastDoneOdometer !== "number") return null;

  return {
    label: body.label,
    intervalDays: typeof body.intervalDays === "number" ? body.intervalDays : null,
    intervalDistance: typeof body.intervalDistance === "number" ? body.intervalDistance : null,
    lastDoneDate: typeof body.lastDoneDate === "string" ? body.lastDoneDate : null,
    lastDoneOdometer: typeof body.lastDoneOdometer === "number" ? body.lastDoneOdometer : null,
  };
}

vehicles.post("/:vehicleId/reminder-rules", rateLimitBySession, idempotent, async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
  if (!vehicle) return c.notFound();

  const body = await c.req.json().catch(() => ({}) as ReminderRuleBody);
  const input = validateReminderRuleCreate(body);
  if (!input) {
    return c.json({ error: "invalid_request" }, 400);
  }
  const clientId = parseOptionalId(body);
  if (clientId === undefined) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const rule = await createReminderRule(
    c.env.DB,
    tenant,
    vehicleId,
    input,
    clientId ?? undefined,
  );
  const withStatus = await findReminderRuleById(c.env.DB, tenant, rule.id);
  return c.json(withStatus, 201);
});

vehicles.get("/:vehicleId/reminder-rules", async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
  if (!vehicle) return c.notFound();

  const results = await listReminderRulesWithStatus(c.env.DB, tenant, vehicleId);
  return c.json({ reminderRules: results });
});
