import { Hono } from "hono";
import {
  computeVehicleAggregates,
  createFuelRecord,
  createReminderRule,
  createServiceRecord,
  createVehicle,
  deleteVehicle,
  findFuelRecordById,
  findReminderRuleById,
  findVehicleById,
  listAttachmentKeysForVehicle,
  listAttachmentKeysForVehicleFuelRecords,
  listFuelRecordsWithEconomy,
  listReminderRulesWithStatus,
  listServiceRecords,
  listVehicles,
  updateVehicle,
} from "../../db/repository";
import type {
  FuelRecordInput,
  ReminderRuleInput,
  ServiceRecordInput,
  VehicleInput,
} from "../../db/repository";
import { deleteAttachments } from "../../attachments/storage";
import { rateLimitBySession } from "../../auth/rate-limit";
import { tenantContextOrToken } from "../../middleware/tenant-context";
import type { AppEnv } from "../../types";

export const vehicles = new Hono<AppEnv>();

vehicles.use("*", tenantContextOrToken);

const ODOMETER_UNITS = new Set(["km", "mi"]);
const MIN_YEAR = 1900;

function maxYear(): number {
  return new Date().getUTCFullYear() + 10;
}

function isValidYear(year: unknown): year is number {
  return typeof year === "number" && Number.isInteger(year) && year >= MIN_YEAR &&
    year <= maxYear();
}

type CreateBody = {
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

vehicles.post("/", rateLimitBySession, async (c) => {
  const body = await c.req.json().catch(() => ({}) as CreateBody);
  const input = validateCreate(body);
  if (!input) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const vehicle = await createVehicle(c.env.DB, c.get("tenant"), input);
  return c.json(vehicle, 201);
});

vehicles.get("/", async (c) => {
  const results = await listVehicles(c.env.DB, c.get("tenant"));
  return c.json({ vehicles: results });
});

vehicles.get("/:id", async (c) => {
  const vehicle = await findVehicleById(c.env.DB, c.get("tenant"), c.req.param("id"));
  if (!vehicle) return c.notFound();
  return c.json(vehicle);
});

vehicles.patch("/:id", rateLimitBySession, async (c) => {
  const body = await c.req.json().catch(() => ({}) as CreateBody);
  const patch = validatePatch(body);
  if (!patch) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const vehicle = await updateVehicle(c.env.DB, c.get("tenant"), c.req.param("id"), patch);
  if (!vehicle) return c.notFound();
  return c.json(vehicle);
});

vehicles.delete("/:id", rateLimitBySession, async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("id");

  // R2 objects never cascade from a D1 delete (constitution Principle VIII) — clean them up
  // before removing the D1 rows that reference them. Both attachment kinds (service records and
  // fuel records) belonging to this vehicle must be cleaned up (spec 009's retrofit).
  const serviceAttachmentKeys = await listAttachmentKeysForVehicle(c.env.DB, tenant, vehicleId);
  const fuelAttachmentKeys = await listAttachmentKeysForVehicleFuelRecords(
    c.env.DB,
    tenant,
    vehicleId,
  );
  await deleteAttachments(c.env.ATTACHMENTS, [...serviceAttachmentKeys, ...fuelAttachmentKeys]);

  const deleted = await deleteVehicle(c.env.DB, tenant, vehicleId);
  if (!deleted) return c.notFound();
  return c.body(null, 204);
});

type ServiceRecordBody = {
  serviceDate?: unknown;
  description?: unknown;
  odometerReading?: unknown;
  cost?: unknown;
  notes?: unknown;
};

function validateServiceRecordCreate(body: ServiceRecordBody): ServiceRecordInput | null {
  if (typeof body.serviceDate !== "string" || body.serviceDate.length === 0) return null;
  if (typeof body.description !== "string" || body.description.length === 0) return null;
  if (body.odometerReading !== undefined && typeof body.odometerReading !== "number") return null;
  if (body.cost !== undefined && typeof body.cost !== "number") return null;
  if (body.notes !== undefined && typeof body.notes !== "string") return null;

  return {
    serviceDate: body.serviceDate,
    description: body.description,
    odometerReading: typeof body.odometerReading === "number" ? body.odometerReading : null,
    cost: typeof body.cost === "number" ? body.cost : null,
    notes: typeof body.notes === "string" ? body.notes : null,
  };
}

vehicles.post("/:vehicleId/service-records", rateLimitBySession, async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
  if (!vehicle) return c.notFound();

  const body = await c.req.json().catch(() => ({}) as ServiceRecordBody);
  const input = validateServiceRecordCreate(body);
  if (!input) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const record = await createServiceRecord(c.env.DB, tenant, vehicleId, input);
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

vehicles.post("/:vehicleId/fuel-records", rateLimitBySession, async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
  if (!vehicle) return c.notFound();

  const body = await c.req.json().catch(() => ({}) as FuelRecordBody);
  const input = validateFuelRecordCreate(body);
  if (!input) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const record = await createFuelRecord(c.env.DB, tenant, vehicleId, input);
  // Computed fresh rather than assumed null — a backfilled fill-up can have a computable economy
  // even on creation, if it slots in after an earlier record by odometer reading (FR-007/FR-008).
  const withEconomy = await findFuelRecordById(c.env.DB, tenant, record.id);
  return c.json(withEconomy, 201);
});

vehicles.get("/:vehicleId/fuel-records", async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
  if (!vehicle) return c.notFound();

  const results = await listFuelRecordsWithEconomy(c.env.DB, tenant, vehicleId);
  return c.json({ fuelRecords: results });
});

// Read-only, not rate-limited — matches every other GET in this file.
vehicles.get("/:vehicleId/aggregates", async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
  if (!vehicle) return c.notFound();

  const aggregates = await computeVehicleAggregates(c.env.DB, tenant, vehicleId);
  return c.json(aggregates);
});

type ReminderRuleBody = {
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

vehicles.post("/:vehicleId/reminder-rules", rateLimitBySession, async (c) => {
  const tenant = c.get("tenant");
  const vehicleId = c.req.param("vehicleId");

  const vehicle = await findVehicleById(c.env.DB, tenant, vehicleId);
  if (!vehicle) return c.notFound();

  const body = await c.req.json().catch(() => ({}) as ReminderRuleBody);
  const input = validateReminderRuleCreate(body);
  if (!input) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const rule = await createReminderRule(c.env.DB, tenant, vehicleId, input);
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
