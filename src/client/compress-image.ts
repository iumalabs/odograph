// Client-side downscale for large photo attachments (specs/052) — never blocks an upload: any
// unsupported type or failure at any step falls back to the original, unmodified File (FR-004).

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

const COMPRESSIBLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function withJpegExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}.jpg`;
}

/**
 * Resizes a JPEG/PNG/WebP file to at most 1600px on its longest side, re-encoded as JPEG
 * (quality 0.82) — a receipt/odometer photo only needs to be legible, not print-quality
 * (research.md). Relies on createImageBitmap's imageOrientation:"from-image" to apply the photo's
 * EXIF rotation during decode, so the re-encoded output is already correctly oriented with no
 * separate correction step (FR-006). Returns the original file unchanged for any non-image type,
 * any file already within the size threshold, or if compression would produce a larger file than
 * the original (FR-002, FR-003, FR-007) — and on any decode/encode failure (FR-004).
 */
export async function compressImageIfNeeded(file: File): Promise<File> {
  if (!COMPRESSIBLE_TYPES.has(file.type)) return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      if (Math.max(bitmap.width, bitmap.height) <= MAX_DIMENSION) return file;

      const scale = MAX_DIMENSION / Math.max(bitmap.width, bitmap.height);
      const width = Math.round(bitmap.width * scale);
      const height = Math.round(bitmap.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
      });
      if (!blob || blob.size >= file.size) return file;

      return new File([blob], withJpegExtension(file.name), { type: "image/jpeg" });
    } finally {
      bitmap.close();
    }
  } catch {
    return file;
  }
}
