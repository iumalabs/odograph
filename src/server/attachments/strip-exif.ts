// Hand-rolled JPEG EXIF/GPS stripping (constitution Principle V, FR-012) — no well-maintained,
// Workers-compatible library does this narrowly (research.md); the operation is simple enough
// (delete a byte range, never parse or rewrite EXIF semantics) that hand-rolling is both smaller
// and more trustworthy than adapting a Node-oriented library.
//
// JPEG structure: FFD8 (SOI), then a sequence of FFxx markers. Markers FFD0-FFD9 (RSTn/SOI/EOI)
// and FF01 (TEM) carry no length/payload; every other marker is followed by a 2-byte big-endian
// length (including those 2 length bytes) and that much payload. EXIF lives in APP1 (FFE1)
// segments, always before the first SOS (FFDA) — after SOS, everything is entropy-coded scan data
// (and eventually EOI), not marker-structured, and is copied through verbatim.

/** A no-op passthrough for non-JPEG bytes — callers only invoke this for detected JPEGs. */
export function stripJpegExif(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return bytes;
  }

  const chunks: Uint8Array[] = [bytes.subarray(0, 2)]; // SOI
  let i = 2;

  while (i < bytes.length) {
    if (bytes[i] !== 0xff) {
      // Malformed/unexpected — bail safely, copy the rest through unmodified.
      chunks.push(bytes.subarray(i));
      break;
    }

    const marker = bytes[i + 1];
    if (marker === undefined) {
      // Truncated marker at the very end — nothing more to walk.
      chunks.push(bytes.subarray(i));
      break;
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      chunks.push(bytes.subarray(i, i + 2));
      i += 2;
      if (marker === 0xd9) break; // EOI
      continue;
    }

    const lengthHigh = bytes[i + 2];
    const lengthLow = bytes[i + 3];
    if (lengthHigh === undefined || lengthLow === undefined) {
      // Truncated length field — bail safely, copy the rest through unmodified.
      chunks.push(bytes.subarray(i));
      break;
    }

    const length = (lengthHigh << 8) | lengthLow;
    const segmentEnd = i + 2 + length;

    if (marker === 0xe1) {
      // APP1 (EXIF/GPS, sometimes XMP) — drop the whole segment.
      i = segmentEnd;
      continue;
    }

    chunks.push(bytes.subarray(i, segmentEnd));
    i = segmentEnd;

    if (marker === 0xda) {
      // SOS — the rest of the file is entropy-coded scan data, not further
      // marker-structured. Copy it through verbatim and stop.
      chunks.push(bytes.subarray(i));
      break;
    }
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
