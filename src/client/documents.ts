import { compressImageIfNeeded } from "./compress-image";

export type DocumentCategory = "registration" | "insurance" | "warranty" | "inspection" | "other";

export type DocumentReminderStatus = "on_track" | "coming_up" | "overdue";

export type VehicleDocument = {
  id: string;
  tenantId: string;
  vehicleId: string;
  title: string;
  category: DocumentCategory;
  expiryDate: string | null;
  notes: string | null;
  isExpired: boolean;
  reminderStatus: DocumentReminderStatus | null;
  windowFraction: number | null;
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

export type DocumentDetail = VehicleDocument & { attachments: Attachment[] };

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function listDocuments(vehicleId: string): Promise<VehicleDocument[]> {
  const { documents } = await jsonFetch<{ documents: VehicleDocument[] }>(
    `/api/v1/vehicles/${vehicleId}/documents`,
  );
  return documents;
}

/**
 * Plain fetch, not routed through the offline write queue (spec 020) — documents.ts explicitly
 * scopes offline sync out (spec.md), unlike service-records.ts/fuel-records.ts.
 */
export function createDocument(
  vehicleId: string,
  input: {
    title: string;
    category: DocumentCategory;
    expiryDate?: string;
    notes?: string;
  },
): Promise<VehicleDocument> {
  return jsonFetch(`/api/v1/vehicles/${vehicleId}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function getDocument(id: string): Promise<DocumentDetail> {
  return jsonFetch(`/api/v1/documents/${id}`);
}

export function updateDocument(
  id: string,
  patch: Partial<Pick<VehicleDocument, "title" | "category" | "expiryDate" | "notes">>,
): Promise<VehicleDocument> {
  return jsonFetch(`/api/v1/documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`/api/v1/documents/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`delete document failed: ${res.status}`);
  }
}

export async function uploadDocumentAttachment(
  documentId: string,
  file: File,
): Promise<Attachment> {
  const upload = await compressImageIfNeeded(file);
  const res = await fetch(`/api/v1/documents/${documentId}/attachments`, {
    method: "POST",
    headers: { "Content-Type": upload.type || "application/octet-stream" },
    body: upload,
  });
  if (!res.ok) {
    throw new AttachmentUploadError(await attachmentErrorCode(res));
  }
  return res.json() as Promise<Attachment>;
}

export function attachmentDownloadUrl(documentId: string, attachmentId: string): string {
  return `/api/v1/documents/${documentId}/attachments/${attachmentId}`;
}
