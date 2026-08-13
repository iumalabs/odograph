import { useState } from "react";

export type DistanceUnit = "km" | "mi";

const STORAGE_KEY = "odograph:distanceUnit";

const KM_TO_MI = 0.621371;
const MI_TO_KM = 1.609344;

/** Exact, fixed conversion (specs/047 research.md) — never an approximation presented as
 * precision, and never a division-based aggregate (constitution Principle II doesn't apply to a
 * fixed multiply, unlike fuel economy or cost-per-distance). No-op when units already match. */
export function convertDistance(value: number, from: DistanceUnit, to: DistanceUnit): number {
  if (from === to) return value;
  return from === "km" ? value * KM_TO_MI : value * MI_TO_KM;
}

function readStoredDistanceUnit(): DistanceUnit {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "mi" ? "mi" : "km";
}

/** Mirrors currency.ts's exact localStorage-backed pattern — call once, from App.tsx, and thread
 * the resulting value down as a prop (research.md: this codebase uses no Context API). Independent
 * of any vehicle's own stored odometerUnit — this is a global display preference only. */
export function useDistanceUnit(): [DistanceUnit, (next: DistanceUnit) => void] {
  const [unit, setUnitState] = useState<DistanceUnit>(readStoredDistanceUnit);

  function setUnit(next: DistanceUnit) {
    localStorage.setItem(STORAGE_KEY, next);
    setUnitState(next);
  }

  return [unit, setUnit];
}
