export type VinLookupResult = {
  found: boolean;
  make: string | null;
  model: string | null;
  year: number | null;
};

const NOT_FOUND: VinLookupResult = { found: false, make: null, model: null, year: null };

/**
 * A plain fetch, deliberately NOT routed through the offline write queue — this is a read-only
 * pre-submit assist step, not part of the vehicle-creation write (FR-009). Never throws: any
 * network/parse failure resolves to the same "not found" shape a genuinely undecodable VIN would,
 * so the caller doesn't need its own try/catch.
 */
export async function lookupVin(vin: string): Promise<VinLookupResult> {
  try {
    const res = await fetch(`/api/v1/vin-lookup/${encodeURIComponent(vin)}`);
    if (!res.ok) return NOT_FOUND;
    return await res.json() as VinLookupResult;
  } catch {
    return NOT_FOUND;
  }
}
