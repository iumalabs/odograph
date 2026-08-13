import { enqueue } from "./offline/queue";
import type { PendingAction } from "./offline/types";
import { compressImageIfNeeded } from "./compress-image";

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

export type AttachmentUploadErrorCode = "file_too_large" | "unsupported_file_type" | "unknown";

export class AttachmentUploadError extends Error {
  code: AttachmentUploadErrorCode;

  constructor(code: AttachmentUploadErrorCode) {
    super(`attachment upload failed: ${code}`);
    this.code = code;
  }
}

async function attachmentErrorCode(res: Response): Promise<AttachmentUploadErrorCode> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error === "file_too_large" || body.error === "unsupported_file_type") {
      return body.error;
    }
  } catch {
    // response body wasn't JSON — fall through to "unknown"
  }
  return "unknown";
}

export type FuelRecordDetail = FuelRecord & { attachments: Attachment[] };

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** `unit` requests each record's fuelEconomy in a specific unit system (specs/050) — omitted
 * defaults server-side to the vehicle's own native unit, matching today's behavior. */
export async function listFuelRecords(
  vehicleId: string,
  unit?: "km" | "mi",
): Promise<FuelRecord[]> {
  const suffix = unit !== undefined ? `?unit=${unit}` : "";
  const { fuelRecords } = await jsonFetch<{ fuelRecords: FuelRecord[] }>(
    `/api/v1/vehicles/${vehicleId}/fuel-records${suffix}`,
  );
  return fuelRecords;
}

export type FuelPreview = { economy: number | null; costPerDistance: number | null };

/**
 * Server-computed live preview for the create-fuel-record form (specs/040 — constitution Principle
 * II forbids running this division client-side). `cost` is only appended to the query when present,
 * matching contracts/api.md's optional-param contract.
 */
export function fetchFuelPreview(
  vehicleId: string,
  odometerReading: number,
  volume: number,
  cost: number | null,
  unit?: "km" | "mi",
): Promise<FuelPreview> {
  const params = new URLSearchParams({
    odometerReading: String(odometerReading),
    volume: String(volume),
  });
  if (cost !== null) params.set("cost", String(cost));
  if (unit !== undefined) params.set("unit", unit);
  return jsonFetch<FuelPreview>(
    `/api/v1/vehicles/${vehicleId}/fuel-preview?${params.toString()}`,
  );
}

/**
 * Builds a displayable record from a still-pending/rejected "create" action —
 * `fuelEconomy`/`duplicateOfId` are left `null`, the same value they'd legitimately have before
 * the server ever computes/checks them, not a guess (constitution Principles II and IV: aggregates
 * are server-computed only, never client-side). Shared between this module's own optimistic
 * return value and offline/merge.ts's overlay of the same action onto a fetched list.
 */
export function hydrateOptimisticFuelRecord(action: PendingAction): FuelRecord {
  const body = action.body as {
    id: string;
    fuelDate: string;
    odometerReading: number;
    volume: number;
    cost: number;
    station?: string;
    notes?: string;
  };
  return {
    id: body.id,
    tenantId: "",
    vehicleId: action.vehicleId ?? "",
    fuelDate: body.fuelDate,
    odometerReading: body.odometerReading,
    volume: body.volume,
    cost: body.cost,
    station: body.station ?? null,
    notes: body.notes ?? null,
    fuelEconomy: null,
    duplicateOfId: null,
    createdAt: action.createdAt,
    updatedAt: action.createdAt,
  };
}

/** Routes through the offline write queue (spec 020). */
export async function createFuelRecord(
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
  const action = await enqueue({
    entity: "fuelRecord",
    actionType: "create",
    vehicleId,
    method: "POST",
    path: `/api/v1/vehicles/${vehicleId}/fuel-records`,
    body: input,
  });
  return hydrateOptimisticFuelRecord(action);
}

export function getFuelRecord(id: string): Promise<FuelRecordDetail> {
  return jsonFetch(`/api/v1/fuel-records/${id}`);
}

/** Routes through the offline write queue; the patch is overlaid onto the cached record for
 * display (offline/merge.ts) until the real sync response replaces it. */
export async function updateFuelRecord(
  id: string,
  vehicleId: string,
  patch: Partial<FuelRecord>,
): Promise<void> {
  await enqueue({
    entity: "fuelRecord",
    actionType: "update",
    vehicleId,
    targetId: id,
    method: "PATCH",
    path: `/api/v1/fuel-records/${id}`,
    body: patch,
  });
}

export async function deleteFuelRecord(id: string, vehicleId: string): Promise<void> {
  await enqueue({
    entity: "fuelRecord",
    actionType: "delete",
    vehicleId,
    targetId: id,
    method: "DELETE",
    path: `/api/v1/fuel-records/${id}`,
    body: undefined,
  });
}

export async function uploadAttachment(fuelRecordId: string, file: File): Promise<Attachment> {
  const upload = await compressImageIfNeeded(file);
  const res = await fetch(`/api/v1/fuel-records/${fuelRecordId}/attachments`, {
    method: "POST",
    headers: { "Content-Type": upload.type || "application/octet-stream" },
    body: upload,
  });
  if (!res.ok) {
    throw new AttachmentUploadError(await attachmentErrorCode(res));
  }
  return res.json() as Promise<Attachment>;
}

export function attachmentDownloadUrl(fuelRecordId: string, attachmentId: string): string {
  return `/api/v1/fuel-records/${fuelRecordId}/attachments/${attachmentId}`;
}

export async function dismissDuplicate(id: string, vehicleId: string): Promise<void> {
  await enqueue({
    entity: "fuelRecord",
    actionType: "dismissDuplicate",
    vehicleId,
    targetId: id,
    method: "POST",
    path: `/api/v1/fuel-records/${id}/dismiss-duplicate`,
    body: undefined,
  });
}
