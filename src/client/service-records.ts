import { enqueue } from "./offline/queue";
import type { PendingAction } from "./offline/types";

export type ServiceRecord = {
  id: string;
  tenantId: string;
  vehicleId: string;
  serviceDate: string;
  description: string;
  odometerReading: number | null;
  cost: number | null;
  notes: string | null;
  performedBy: "self" | "shop" | null;
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

export type ServiceRecordDetail = ServiceRecord & { attachments: Attachment[] };

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function listServiceRecords(vehicleId: string): Promise<ServiceRecord[]> {
  const { serviceRecords } = await jsonFetch<{ serviceRecords: ServiceRecord[] }>(
    `/api/v1/vehicles/${vehicleId}/service-records`,
  );
  return serviceRecords;
}

/**
 * Builds a displayable record from a still-pending/rejected "create" action — `duplicateOfId` is
 * left `null`, the same value it would legitimately have before spec 010's duplicate detection
 * ever runs, not a guess (constitution Principle IV). Shared between this module's own optimistic
 * return value and offline/merge.ts's overlay of the same action onto a fetched list.
 */
export function hydrateOptimisticServiceRecord(action: PendingAction): ServiceRecord {
  const body = action.body as {
    id: string;
    vehicleId?: string;
    serviceDate: string;
    description: string;
    odometerReading?: number;
    cost?: number;
    notes?: string;
    performedBy?: "self" | "shop";
  };
  return {
    id: body.id,
    tenantId: "",
    vehicleId: action.vehicleId ?? "",
    serviceDate: body.serviceDate,
    description: body.description,
    odometerReading: body.odometerReading ?? null,
    cost: body.cost ?? null,
    notes: body.notes ?? null,
    performedBy: body.performedBy ?? null,
    duplicateOfId: null,
    createdAt: action.createdAt,
    updatedAt: action.createdAt,
  };
}

/** Routes through the offline write queue (spec 020). */
export async function createServiceRecord(
  vehicleId: string,
  input: {
    serviceDate: string;
    description: string;
    odometerReading?: number;
    cost?: number;
    notes?: string;
    performedBy?: "self" | "shop";
  },
): Promise<ServiceRecord> {
  const action = await enqueue({
    entity: "serviceRecord",
    actionType: "create",
    vehicleId,
    method: "POST",
    path: `/api/v1/vehicles/${vehicleId}/service-records`,
    body: input,
  });
  return hydrateOptimisticServiceRecord(action);
}

export function getServiceRecord(id: string): Promise<ServiceRecordDetail> {
  return jsonFetch(`/api/v1/service-records/${id}`);
}

/** Routes through the offline write queue; the patch is overlaid onto the cached record for
 * display (offline/merge.ts) until the real sync response replaces it. */
export async function updateServiceRecord(
  id: string,
  vehicleId: string,
  patch: Partial<ServiceRecord>,
): Promise<void> {
  await enqueue({
    entity: "serviceRecord",
    actionType: "update",
    vehicleId,
    targetId: id,
    method: "PATCH",
    path: `/api/v1/service-records/${id}`,
    body: patch,
  });
}

export async function deleteServiceRecord(id: string, vehicleId: string): Promise<void> {
  await enqueue({
    entity: "serviceRecord",
    actionType: "delete",
    vehicleId,
    targetId: id,
    method: "DELETE",
    path: `/api/v1/service-records/${id}`,
    body: undefined,
  });
}

export async function uploadAttachment(serviceRecordId: string, file: File): Promise<Attachment> {
  const res = await fetch(`/api/v1/service-records/${serviceRecordId}/attachments`, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    throw new AttachmentUploadError(await attachmentErrorCode(res));
  }
  return res.json() as Promise<Attachment>;
}

export function attachmentDownloadUrl(serviceRecordId: string, attachmentId: string): string {
  return `/api/v1/service-records/${serviceRecordId}/attachments/${attachmentId}`;
}

export async function dismissDuplicate(id: string, vehicleId: string): Promise<void> {
  await enqueue({
    entity: "serviceRecord",
    actionType: "dismissDuplicate",
    vehicleId,
    targetId: id,
    method: "POST",
    path: `/api/v1/service-records/${id}/dismiss-duplicate`,
    body: undefined,
  });
}
