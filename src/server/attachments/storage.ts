// R2 access lives here, not in repository.ts (constitution Principle I is about D1 tenant
// isolation specifically) — mirrors how session.ts already keeps KV logic separate from
// repository.ts's D1-only scope.

export type AttachmentResourceType =
  | "service-records"
  | "fuel-records"
  | "documents"
  | "vehicle-photos";

/**
 * Tenant-scoped key path (research.md) — defense in depth alongside the D1-side ownership check;
 * a bug that somehow bypassed the D1 check still couldn't let one tenant enumerate or guess
 * another tenant's object keys, since the tenant id segment is never returned to a client directly.
 */
export function attachmentKey(
  tenantId: string,
  resourceType: AttachmentResourceType,
  resourceId: string,
  attachmentId: string,
): string {
  return `tenants/${tenantId}/${resourceType}/${resourceId}/${attachmentId}`;
}

export async function putAttachment(
  bucket: R2Bucket,
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  await bucket.put(key, bytes, { httpMetadata: { contentType } });
}

export function getAttachment(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
  return bucket.get(key);
}

export async function deleteAttachments(bucket: R2Bucket, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await bucket.delete(keys);
}
