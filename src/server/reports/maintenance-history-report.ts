import type { FuelRecordWithEconomy, ServiceRecord, Vehicle } from "../db/repository";

export type ReportServiceRow = {
  date: string;
  description: string;
  odometerReading: number | null;
  cost: number | null;
};

export type ReportFuelRow = {
  date: string;
  station: string | null;
  volume: number;
  cost: number;
  odometerReading: number;
  fuelEconomy: number | null;
};

export type ReportData = {
  vehicleName: string;
  vehicleSpec: string | null;
  generatedAt: string;
  serviceRows: ReportServiceRow[];
  fuelRows: ReportFuelRow[];
  totalMaintenanceCost: number;
  totalFuelCost: number;
  totalCost: number;
};

/**
 * PURE — no pdf-lib, no I/O (specs/027 research.md's split between "what goes in the report" and
 * "how it's laid out"). Every field is either the record's own value or explicitly null; nothing
 * is ever fabricated (constitution Principle IV, FR-007). `services`/`fuels` are assumed already
 * filtered to this vehicle's own tenant and non-duplicate records — this function does no
 * re-filtering of its own (see getVehicleHistoryForReport, the single place that filter lives).
 */
export function buildReportData(
  vehicle: Vehicle,
  services: ServiceRecord[],
  fuels: FuelRecordWithEconomy[],
): ReportData {
  const specParts = [vehicle.make, vehicle.model, vehicle.year ? String(vehicle.year) : null]
    .filter((part): part is string => part !== null && part !== "");
  const vehicleSpec = specParts.length > 0 ? specParts.join(" ") : null;

  const serviceRows: ReportServiceRow[] = services.map((record) => ({
    date: record.serviceDate,
    description: record.description,
    odometerReading: record.odometerReading,
    cost: record.cost,
  }));

  const fuelRows: ReportFuelRow[] = fuels.map((record) => ({
    date: record.fuelDate,
    station: record.station,
    volume: record.volume,
    cost: record.cost,
    odometerReading: record.odometerReading,
    fuelEconomy: record.fuelEconomy,
  }));

  const totalMaintenanceCost = serviceRows.reduce((sum, row) => sum + (row.cost ?? 0), 0);
  const totalFuelCost = fuelRows.reduce((sum, row) => sum + row.cost, 0);

  return {
    vehicleName: vehicle.name,
    vehicleSpec,
    generatedAt: new Date().toISOString().slice(0, 10),
    serviceRows,
    fuelRows,
    totalMaintenanceCost,
    totalFuelCost,
    totalCost: totalMaintenanceCost + totalFuelCost,
  };
}
