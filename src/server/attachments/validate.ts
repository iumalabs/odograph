// Magic-byte (file signature) detection — the declared Content-Type header is never trusted for
// the accept/reject decision, only what the bytes actually are (constitution Principle V, FR-010).
// Hand-rolled rather than a dependency: for exactly four known formats this is smaller, has zero
// supply-chain surface, and is trivially auditable in one screen (research.md).

export type DetectedFileType = "jpeg" | "png" | "webp" | "pdf";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB (spec.md Assumptions)

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

/** Returns null if the bytes don't match any allowed format's signature. */
export function detectFileType(bytes: Uint8Array): DetectedFileType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "webp";
  }
  return null;
}

export function contentTypeFor(type: DetectedFileType): string {
  switch (type) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
  }
}
