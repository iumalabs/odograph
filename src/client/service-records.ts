export type ServiceRecord = {
  id: string;
  tenantId: string;
  vehicleId: string;
  serviceDate: string;
  description: string;
  odometerReading: number | null;
  cost: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Attachment = {
  id: string;
  contentType: string;
  size: number;
  createdAt: string;
};

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

export function createServiceRecord(
  vehicleId: string,
  input: {
    serviceDate: string;
    description: string;
    odometerReading?: number;
    cost?: number;
    notes?: string;
  },
): Promise<ServiceRecord> {
  return jsonFetch(`/api/v1/vehicles/${vehicleId}/service-records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function getServiceRecord(id: string): Promise<ServiceRecordDetail> {
  return jsonFetch(`/api/v1/service-records/${id}`);
}

export function updateServiceRecord(
  id: string,
  patch: Partial<ServiceRecord>,
): Promise<ServiceRecord> {
  return jsonFetch(`/api/v1/service-records/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function deleteServiceRecord(id: string): Promise<void> {
  const res = await fetch(`/api/v1/service-records/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`delete service record failed: ${res.status}`);
  }
}

export async function uploadAttachment(serviceRecordId: string, file: File): Promise<Attachment> {
  const res = await fetch(`/api/v1/service-records/${serviceRecordId}/attachments`, {
    method: "POST",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) {
    throw new Error(`upload attachment failed: ${res.status}`);
  }
  return res.json() as Promise<Attachment>;
}

export function attachmentDownloadUrl(serviceRecordId: string, attachmentId: string): string {
  return `/api/v1/service-records/${serviceRecordId}/attachments/${attachmentId}`;
}
