export type VehicleAggregates = {
  costPerDistance: number | null;
  costPerTime: number | null;
  averageFuelEconomy: number | null;
  currentOdometer: number | null;
};

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** `unit` requests the fuel-economy figures in a specific unit system (specs/050) — omitted
 * defaults server-side to the vehicle's own native unit, matching today's behavior. */
export function getVehicleAggregates(
  vehicleId: string,
  unit?: "km" | "mi",
): Promise<VehicleAggregates> {
  const suffix = unit !== undefined ? `?unit=${unit}` : "";
  return jsonFetch(`/api/v1/vehicles/${vehicleId}/aggregates${suffix}`);
}

export type ExpenseGroupBy = "month" | "year";

export type ExpensePeriod = {
  period: string;
  maintenanceCost: number;
  fuelCost: number;
  totalCost: number;
};

export async function getVehicleExpenseBreakdown(
  vehicleId: string,
  groupBy: ExpenseGroupBy,
): Promise<ExpensePeriod[]> {
  const { periods } = await jsonFetch<{ periods: ExpensePeriod[] }>(
    `/api/v1/vehicles/${vehicleId}/expense-breakdown?groupBy=${groupBy}`,
  );
  return periods;
}

/** Plain URL, not a fetch+blob dance (specs/027 research.md) — the response's
 * Content-Disposition: attachment header handles the download natively on direct navigation,
 * mirroring attachmentDownloadUrl's existing pattern. */
export function reportDownloadUrl(vehicleId: string): string {
  return `/api/v1/vehicles/${vehicleId}/report.pdf`;
}
