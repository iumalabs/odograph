export type VehicleMatch = {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
};

export type RecordMatch = {
  id: string;
  vehicleId: string;
  vehicleName: string;
  date: string | null;
  title: string;
  notes: string | null;
};

export type SearchResults = {
  vehicles: VehicleMatch[];
  serviceRecords: RecordMatch[];
  fuelRecords: RecordMatch[];
  documents: RecordMatch[];
};

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function search(query: string): Promise<SearchResults> {
  return jsonFetch(`/api/v1/search?q=${encodeURIComponent(query)}`);
}
