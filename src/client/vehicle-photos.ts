import { compressImageIfNeeded } from "./compress-image";

export type VehiclePhotoCategory = "general" | "repair" | "damage" | "parts";

export type VehiclePhoto = {
  id: string;
  tenantId: string;
  vehicleId: string;
  category: VehiclePhotoCategory;
  caption: string | null;
  photoDate: string | null;
  odometerReading: number | null;
  serviceRecordId: string | null;
  hasImage: boolean;
  contentType: string | null;
  size: number | null;
  createdAt: string;
  updatedAt: string;
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

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function listVehiclePhotos(vehicleId: string): Promise<VehiclePhoto[]> {
  const { photos } = await jsonFetch<{ photos: VehiclePhoto[] }>(
    `/api/v1/vehicles/${vehicleId}/photos`,
  );
  return photos;
}

/**
 * Plain fetch, not routed through the offline write queue (spec 020) — mirrors documents.ts's own
 * scoping-out of offline sync: creating the metadata row is only ever step one of a flow that
 * immediately needs a real network round trip anyway (uploadVehiclePhotoImage), so there's no
 * useful offline-first path here.
 */
export function createVehiclePhoto(
  vehicleId: string,
  input: {
    category: VehiclePhotoCategory;
    caption?: string;
    photoDate?: string;
    odometerReading?: number;
    serviceRecordId?: string;
  },
): Promise<VehiclePhoto> {
  return jsonFetch(`/api/v1/vehicles/${vehicleId}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateVehiclePhoto(
  id: string,
  patch: Partial<
    Pick<VehiclePhoto, "category" | "caption" | "photoDate" | "odometerReading" | "serviceRecordId">
  >,
): Promise<VehiclePhoto> {
  return jsonFetch(`/api/v1/vehicle-photos/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteVehiclePhoto(id: string): Promise<void> {
  const res = await fetch(`/api/v1/vehicle-photos/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`delete vehicle photo failed: ${res.status}`);
  }
}

export async function uploadVehiclePhotoImage(id: string, file: File): Promise<VehiclePhoto> {
  const upload = await compressImageIfNeeded(file);
  const res = await fetch(`/api/v1/vehicle-photos/${id}/image`, {
    method: "POST",
    headers: { "Content-Type": upload.type || "application/octet-stream" },
    body: upload,
  });
  if (!res.ok) {
    throw new AttachmentUploadError(await attachmentErrorCode(res));
  }
  return res.json() as Promise<VehiclePhoto>;
}

export function vehiclePhotoImageUrl(id: string): string {
  return `/api/v1/vehicle-photos/${id}/image`;
}
