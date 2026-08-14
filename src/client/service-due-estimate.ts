import type { ReminderRule } from "./reminder-rules";

export type ServiceDueEstimate = {
  description: string;
  estimatedOdometer: number;
  averageInterval: number;
  basedOnRecordCount: number;
} | null;

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Server-computed live estimate for the service-entry form (specs/053 — constitution Principle II
 * forbids computing this grouping/averaging client-side). Mirrors fetchFuelPreview's shape: a plain
 * GET the form re-fetches, never a mutation.
 */
export async function fetchServiceDueEstimate(vehicleId: string): Promise<ServiceDueEstimate> {
  const { estimate } = await jsonFetch<{ estimate: ServiceDueEstimate }>(
    `/api/v1/vehicles/${vehicleId}/service-due-estimate`,
  );
  return estimate;
}

export class ServiceDueEstimateUnavailableError extends Error {
  constructor() {
    super("service due estimate is no longer available");
  }
}

/**
 * Turns a shown estimate into a real reminder rule (specs/053 FR-008). Not routed through the
 * offline write queue (unlike createReminderRule) — the caller needs the 201/409 outcome
 * immediately to decide whether to clear the hint or show an unavailable error, and this action
 * only ever fires while online (it's a response to a just-fetched GET, not an offline-capable
 * create). `POST .../accept` still goes through the server's `idempotent` middleware, so a
 * duplicate call with the same idempotency key is still safe.
 */
export async function acceptServiceDueEstimate(
  vehicleId: string,
  description: string,
): Promise<ReminderRule> {
  const res = await fetch(`/api/v1/vehicles/${vehicleId}/service-due-estimate/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify({ description }),
  });
  if (res.status === 409) {
    throw new ServiceDueEstimateUnavailableError();
  }
  if (!res.ok) {
    throw new Error(`accept service due estimate failed: ${res.status}`);
  }
  return res.json() as Promise<ReminderRule>;
}
