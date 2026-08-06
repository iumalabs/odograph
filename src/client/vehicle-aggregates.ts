export type VehicleAggregates = {
  costPerDistance: number | null;
  costPerTime: number | null;
  averageFuelEconomy: number | null;
};

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function getVehicleAggregates(vehicleId: string): Promise<VehicleAggregates> {
  return jsonFetch(`/api/v1/vehicles/${vehicleId}/aggregates`);
}
