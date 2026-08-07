import { enqueue } from "./offline/queue";
import type { PendingAction } from "./offline/types";

export type Vehicle = {
  id: string;
  tenantId: string;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  odometerUnit: "km" | "mi";
  createdAt: string;
  updatedAt: string;
};

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function listVehicles(): Promise<Vehicle[]> {
  const { vehicles } = await jsonFetch<{ vehicles: Vehicle[] }>("/api/v1/vehicles");
  return vehicles;
}

/**
 * Builds a displayable vehicle from a still-pending/rejected "create" action — not the server's
 * response, which doesn't exist yet (or never will, if rejected). Server-computed/derived fields
 * have no equivalent here, so they're left at their legitimate "nothing computed yet" value
 * (null), never a guessed one (constitution Principle IV). Shared between this module's own
 * optimistic return value and offline/merge.ts's overlay of the same action onto a fetched list.
 */
export function hydrateOptimisticVehicle(action: PendingAction): Vehicle {
  const body = action.body as {
    id: string;
    name: string;
    odometerUnit: "km" | "mi";
  };
  return {
    id: body.id,
    tenantId: "",
    name: body.name,
    make: null,
    model: null,
    year: null,
    vin: null,
    odometerUnit: body.odometerUnit,
    createdAt: action.createdAt,
    updatedAt: action.createdAt,
  };
}

/**
 * Routes through the offline write queue (spec 020) instead of fetching directly: saved locally
 * right away (survives no connectivity) and synced automatically once online.
 */
export async function createVehicle(
  input: { name: string; odometerUnit: "km" | "mi" },
): Promise<Vehicle> {
  const action = await enqueue({
    entity: "vehicle",
    actionType: "create",
    vehicleId: null,
    method: "POST",
    path: "/api/v1/vehicles",
    body: input,
  });
  return hydrateOptimisticVehicle(action);
}

export function getVehicle(id: string): Promise<Vehicle> {
  return jsonFetch(`/api/v1/vehicles/${id}`);
}

export function updateVehicle(id: string, patch: Partial<Vehicle>): Promise<Vehicle> {
  return jsonFetch(`/api/v1/vehicles/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteVehicle(id: string): Promise<void> {
  const res = await fetch(`/api/v1/vehicles/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`delete vehicle failed: ${res.status}`);
  }
}
