const STORAGE_KEY = "odograph:selectedVehicleId";

/** Mirrors theme.ts/currency.ts/distance.ts's localStorage-backed pattern — the vehicle picker
 * should never sit unselected (there's always something to remember or fall back to once at
 * least one vehicle exists), so App.tsx reads/writes this directly rather than through a
 * useState-returning hook like the others: the actual selected id also depends on the fetched
 * vehicle list, which isn't known synchronously at first render. */
export function readStoredSelectedVehicleId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function storeSelectedVehicleId(id: string): void {
  localStorage.setItem(STORAGE_KEY, id);
}
