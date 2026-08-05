export type FuelRecord = {
  id: string;
  tenantId: string;
  vehicleId: string;
  fuelDate: string;
  odometerReading: number;
  volume: number;
  cost: number;
  station: string | null;
  notes: string | null;
  fuelEconomy: number | null;
  duplicateOfId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Attachment = {
  id: string;
  contentType: string;
  size: number;
  createdAt: string;
};

export type FuelRecordDetail = FuelRecord & { attachments: Attachment[] };

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function listFuelRecords(vehicleId: string): Promise<FuelRecord[]> {
  const { fuelRecords } = await jsonFetch<{ fuelRecords: FuelRecord[] }>(
    `/api/v1/vehicles/${vehicleId}/fuel-records`,
  );
  return fuelRecords;
}

export function createFuelRecord(
  vehicleId: string,
  input: {
    fuelDate: string;
    odometerReading: number;
    volume: number;
    cost: number;
    station?: string;
    notes?: string;
  },
): Promise<FuelRecord> {
  return jsonFetch(`/api/v1/vehicles/${vehicleId}/fuel-records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function getFuelRecord(id: string): Promise<FuelRecordDetail> {
  return jsonFetch(`/api/v1/fuel-records/${id}`);
}

export function updateFuelRecord(
  id: string,
  patch: Partial<FuelRecord>,
): Promise<FuelRecord> {
  return jsonFetch(`/api/v1/fuel-records/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteFuelRecord(id: string): Promise<void> {
  const res = await fetch(`/api/v1/fuel-records/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`delete fuel record failed: ${res.status}`);
  }
}

export async function uploadAttachment(fuelRecordId: string, file: File): Promise<Attachment> {
  const res = await fetch(`/api/v1/fuel-records/${fuelRecordId}/attachments`, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    throw new Error(`upload attachment failed: ${res.status}`);
  }
  return res.json() as Promise<Attachment>;
}

export function attachmentDownloadUrl(fuelRecordId: string, attachmentId: string): string {
  return `/api/v1/fuel-records/${fuelRecordId}/attachments/${attachmentId}`;
}

export function dismissDuplicate(id: string): Promise<FuelRecord> {
  return jsonFetch(`/api/v1/fuel-records/${id}/dismiss-duplicate`, { method: "POST" });
}
