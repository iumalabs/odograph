const VPIC_DECODE_URL = "https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues";
const MIN_PLAUSIBLE_VIN_LENGTH = 11;
// A real VIN is always 17 chars; this is a generous upper bound, not a strict format check (NHTSA
// itself is the format authority per spec.md) — it exists only to stop an oversized string from
// being relayed to a third party through this app's identity (code-review finding).
const MAX_PLAUSIBLE_VIN_LENGTH = 25;
const MIN_PLAUSIBLE_MODEL_YEAR = 1900;

export type DecodeResult =
  | { ok: true; make: string | null; model: string | null; year: number | null }
  | { ok: false };

type VpicResult = {
  Make?: string;
  Model?: string;
  ModelYear?: string;
};

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function maxPlausibleModelYear(): number {
  return new Date().getUTCFullYear() + 10;
}

function parseYear(value: string | undefined): number | null {
  if (!value) return null;
  const year = Number(value);
  if (!Number.isInteger(year)) return null;
  if (year < MIN_PLAUSIBLE_MODEL_YEAR || year > maxPlausibleModelYear()) return null;
  return year;
}

/**
 * Never throws — mirrors google.ts's exchangeCodeForTokens and send-reminder-push.ts's
 * sendReminderPushNotification (research.md). NHTSA always answers 200 for a well-formed request,
 * even for an undecodable VIN — the real signal is empty Make/Model/ModelYear in the payload, not
 * the HTTP status, so `ok: false` covers both "couldn't reach NHTSA" and "NHTSA had nothing usable"
 * (spec.md — distinguishing them in the UI is explicitly not required). Each field is mapped
 * independently: a VIN with Make but no Model comes back { make: "...", model: null }, never a
 * guessed model (constitution Principle IV).
 *
 * `ErrorCode` is deliberately NOT used as a pass/fail gate: live testing against the real API
 * showed NHTSA returns a non-"0" ErrorCode (e.g. a check-digit mismatch) alongside perfectly valid,
 * populated Make/Model/ModelYear — treating any non-"0" code as failure discarded real, useful
 * data. `ErrorCode` is also sometimes a comma-separated list of codes, not a single value, making
 * it unreliable as a simple equality check. Emptiness of the fields themselves is the actual
 * "found" signal (confirmed: a genuinely undecodable VIN comes back with Make/Model/ModelYear all
 * empty too).
 */
export async function decodeVin(
  vin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DecodeResult> {
  const trimmedVin = vin.trim();
  if (
    trimmedVin.length < MIN_PLAUSIBLE_VIN_LENGTH || trimmedVin.length > MAX_PLAUSIBLE_VIN_LENGTH
  ) {
    return { ok: false };
  }

  try {
    const url = `${VPIC_DECODE_URL}/${encodeURIComponent(trimmedVin)}?format=json`;
    const response = await fetchImpl(url);
    if (!response.ok) {
      return { ok: false };
    }
    const body = await response.json() as { Results?: VpicResult[] };
    const result = body.Results?.[0];
    if (!result) {
      return { ok: false };
    }
    const make = emptyToNull(result.Make);
    const model = emptyToNull(result.Model);
    const year = parseYear(result.ModelYear);
    if (make === null && model === null && year === null) {
      return { ok: false };
    }
    return { ok: true, make, model, year };
  } catch {
    return { ok: false };
  }
}
