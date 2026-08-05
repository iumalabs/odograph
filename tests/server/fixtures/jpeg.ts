// A hand-built, minimal JPEG byte sequence — just enough marker structure (SOI, an optional
// APP1/EXIF segment, SOS, EOI) to exercise stripJpegExif's marker-walking without needing a real,
// decodable image or an external test-image file (research.md's testing strategy).

export const GPS_MARKER = "FAKE-GPS-49.2827N-123.1207W";

function encodeAscii(str: string): number[] {
  return Array.from(str).map((ch) => ch.charCodeAt(0));
}

export function buildFixtureJpeg(options: { includeExif: boolean }): Uint8Array {
  const bytes: number[] = [0xff, 0xd8]; // SOI

  if (options.includeExif) {
    const exifHeader = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"
    const app1Payload = [...exifHeader, ...encodeAscii(GPS_MARKER)];
    const app1Length = app1Payload.length + 2; // the length field includes its own 2 bytes
    bytes.push(0xff, 0xe1, (app1Length >> 8) & 0xff, app1Length & 0xff, ...app1Payload);
  }

  // Minimal SOS: just the marker + a length field covering only itself (no extra scan-header
  // bytes — this fixture only needs to exercise marker-walking, not decode as a real image),
  // followed by a few bytes of fake entropy-coded scan data, then EOI.
  bytes.push(0xff, 0xda, 0x00, 0x02);
  bytes.push(0x00, 0x01, 0x02, 0x03);
  bytes.push(0xff, 0xd9); // EOI

  return new Uint8Array(bytes);
}
