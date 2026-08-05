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

export function createVehicle(
  input: { name: string; odometerUnit: "km" | "mi" },
): Promise<Vehicle> {
  return jsonFetch("/api/v1/vehicles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
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
