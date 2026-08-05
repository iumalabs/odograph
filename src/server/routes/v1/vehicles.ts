import { Hono } from "hono";
import {
  createVehicle,
  deleteVehicle,
  findVehicleById,
  listVehicles,
  updateVehicle,
} from "../../db/repository";
import type { VehicleInput } from "../../db/repository";
import { rateLimitBySession } from "../../auth/rate-limit";
import { tenantContext } from "../../middleware/tenant-context";
import type { AppEnv } from "../../types";

export const vehicles = new Hono<AppEnv>();

vehicles.use("*", tenantContext);

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
  const deleted = await deleteVehicle(c.env.DB, c.get("tenant"), c.req.param("id"));
  if (!deleted) return c.notFound();
  return c.body(null, 204);
});
