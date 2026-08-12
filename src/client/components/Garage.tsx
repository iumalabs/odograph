import { useEffect, useState } from "react";
import type { Vehicle } from "../vehicles";
import type { WithSyncStatus } from "../offline/merge";
import { getVehicleAggregates } from "../vehicle-aggregates";
import { listReminderRules } from "../reminder-rules";
import type { ReminderRule } from "../reminder-rules";
import { AddIcon, CarIcon } from "../design/icons";
import { t } from "../i18n/strings";

type GarageProps = {
  vehicles: WithSyncStatus<Vehicle>[];
  selectedVehicleId: string | null;
  onSelectVehicle: (id: string) => void;
  vehicleName: string;
  onVehicleNameChange: (value: string) => void;
  vehicleOdometerUnit: "km" | "mi";
  onVehicleOdometerUnitChange: (value: "km" | "mi") => void;
  vehicleVin: string;
  onVehicleVinChange: (value: string) => void;
  vehicleMake: string;
  onVehicleMakeChange: (value: string) => void;
  vehicleModel: string;
  onVehicleModelChange: (value: string) => void;
  vehicleYear: string;
  onVehicleYearChange: (value: string) => void;
  vinLookupPending: boolean;
  onLookupVin: () => void;
  vinLookupNotFound: boolean;
  onAddVehicle: () => void;
};

const chipStyle = {
  font: "500 10.5px var(--font-mono)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-sm)",
  padding: "4px 8px",
  color: "var(--dim)",
};

type VehicleSummary = {
  currentOdometer: number | null;
  mostUrgentReminder: ReminderRule | null;
};

/** Overdue outranks coming-up; on_track/not_enough_data never qualify (research.md). */
function mostUrgentReminder(rules: ReminderRule[]): ReminderRule | null {
  const overdue = rules.find((rule) => rule.status === "overdue");
  if (overdue) return overdue;
  return rules.find((rule) => rule.status === "coming_up") ?? null;
}

// Extracted from App.tsx's vehicle list/form (spec 008 T011-T013). Per-vehicle odometer/reminder
// summary reuses DashboardView.tsx's own fetch pattern verbatim (specs/034 research.md) — no new
// route, no shared hook extracted (out of scope: purely additive to this screen's cards).
export function Garage(props: GarageProps) {
  const {
    vehicles,
    selectedVehicleId,
    onSelectVehicle,
    vehicleName,
    onVehicleNameChange,
    vehicleOdometerUnit,
    onVehicleOdometerUnitChange,
    vehicleVin,
    onVehicleVinChange,
    vehicleMake,
    onVehicleMakeChange,
    vehicleModel,
    onVehicleModelChange,
    vehicleYear,
    onVehicleYearChange,
    vinLookupPending,
    onLookupVin,
    vinLookupNotFound,
    onAddVehicle,
  } = props;

  const [summaries, setSummaries] = useState<Record<string, VehicleSummary>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      vehicles.map(async (vehicle) => {
        const [aggregates, reminderRules] = await Promise.all([
          getVehicleAggregates(vehicle.id).catch(() => null),
          listReminderRules(vehicle.id).catch(() => [] as ReminderRule[]),
        ]);
        return [vehicle.id, {
          currentOdometer: aggregates?.currentOdometer ?? null,
          mostUrgentReminder: mostUrgentReminder(reminderRules),
        }] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setSummaries(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [vehicles]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {vehicles.map((vehicle) => {
        const spec = [vehicle.make, vehicle.model, vehicle.year ? String(vehicle.year) : null]
          .filter(Boolean)
          .join(" ");
        const isSelected = selectedVehicleId === vehicle.id;
        const summary = summaries[vehicle.id];
        const currentOdometer = summary?.currentOdometer ?? null;
        const urgentReminder = summary?.mostUrgentReminder ?? null;
        return (
          <button
            key={vehicle.id}
            type="button"
            onClick={() => onSelectVehicle(vehicle.id)}
            style={{
              textAlign: "left",
              border: `1px solid ${isSelected ? "var(--acc)" : "var(--line)"}`,
              background: "var(--panel)",
              borderRadius: "var(--radius-lg)",
              padding: 16,
              cursor: "pointer",
              color: "var(--fg)",
              display: "flex",
              flexDirection: "column",
              gap: 9,
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ font: "600 20px var(--font-ui)", letterSpacing: "-.02em" }}>
                {vehicle.name}
              </span>
              {spec && (
                <span style={{ font: "400 11px var(--font-mono)", color: "var(--dim)" }}>
                  {spec}
                </span>
              )}
              {urgentReminder && (
                <span
                  style={{
                    marginLeft: "auto",
                    font: "500 10.5px var(--font-mono)",
                    border: `1px solid ${
                      urgentReminder.status === "overdue" ? "var(--warn)" : "var(--line)"
                    }`,
                    borderRadius: "var(--radius-sm)",
                    padding: "4px 8px",
                    color: urgentReminder.status === "overdue" ? "var(--warn)" : "var(--dim)",
                  }}
                >
                  {urgentReminder.label}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {vehicle.vin && <span style={chipStyle}>{vehicle.vin}</span>}
              <span style={chipStyle}>{vehicle.odometerUnit}</span>
              {currentOdometer != null && (
                <span style={chipStyle}>
                  {t("odometerLabel")}: {currentOdometer}
                </span>
              )}
              {vehicle.syncStatus === "pending" && (
                <span style={{ ...chipStyle, color: "var(--dim)" }}>
                  {t("pendingSyncLabel")}
                </span>
              )}
              {vehicle.syncStatus === "rejected" && (
                <span
                  style={{ ...chipStyle, color: "var(--warn)", borderColor: "var(--warn)" }}
                  title={vehicle.rejectReason ?? undefined}
                >
                  {t("rejectedSyncLabel")}
                </span>
              )}
            </div>
          </button>
        );
      })}

      {vehicles.length === 0 && (
        <div
          style={{
            border: "1px dashed var(--line)",
            borderRadius: "var(--radius-lg)",
            padding: 18,
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: "var(--dim)",
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              display: "grid",
              placeItems: "center",
              flex: "none",
            }}
          >
            <CarIcon size={18} />
          </div>
          <span style={{ font: "500 12.5px var(--font-ui)" }}>{t("noVehiclesYet")}</span>
        </div>
      )}

      <div
        style={{
          border: "1px solid var(--line)",
          background: "var(--panel)",
          borderRadius: "var(--radius-lg)",
          padding: 16,
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 160px" }}>
          <span
            style={{
              font: "400 9.5px var(--font-mono)",
              color: "var(--dim)",
              letterSpacing: ".08em",
            }}
          >
            {t("vehicleNameLabel")}
          </span>
          <input
            type="text"
            value={vehicleName}
            onChange={(event) => onVehicleNameChange(event.target.value)}
            style={{
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              padding: "11px 12px",
              color: "var(--fg)",
              font: "500 14px var(--font-ui)",
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span
            style={{
              font: "400 9.5px var(--font-mono)",
              color: "var(--dim)",
              letterSpacing: ".08em",
            }}
          >
            {t("vehicleOdometerUnitLabel")}
          </span>
          <select
            value={vehicleOdometerUnit}
            onChange={(event) => onVehicleOdometerUnitChange(event.target.value as "km" | "mi")}
            style={{
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              padding: "11px 12px",
              color: "var(--fg)",
              font: "500 14px var(--font-ui)",
              outline: "none",
            }}
          >
            <option value="km">km</option>
            <option value="mi">mi</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 160px" }}>
          <span
            style={{
              font: "400 9.5px var(--font-mono)",
              color: "var(--dim)",
              letterSpacing: ".08em",
            }}
          >
            {t("vehicleVinLabel")}
          </span>
          <input
            type="text"
            value={vehicleVin}
            disabled={vinLookupPending}
            maxLength={25}
            onChange={(event) => onVehicleVinChange(event.target.value)}
            style={{
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              padding: "11px 12px",
              color: "var(--fg)",
              font: "500 14px var(--font-ui)",
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
        </label>
        <button
          type="button"
          onClick={onLookupVin}
          disabled={vinLookupPending || vehicleVin.trim().length === 0}
          style={{
            background: "transparent",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-md)",
            padding: "11px 14px",
            color: "var(--dim)",
            font: "600 11.5px var(--font-ui)",
            cursor: vinLookupPending || vehicleVin.trim().length === 0 ? "not-allowed" : "pointer",
          }}
        >
          {vinLookupPending ? t("vinLookupInProgress") : t("lookupVinButton")}
        </button>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 140px" }}>
          <span
            style={{
              font: "400 9.5px var(--font-mono)",
              color: "var(--dim)",
              letterSpacing: ".08em",
            }}
          >
            {t("vehicleMakeLabel")}
          </span>
          <input
            type="text"
            value={vehicleMake}
            disabled={vinLookupPending}
            onChange={(event) => onVehicleMakeChange(event.target.value)}
            style={{
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              padding: "11px 12px",
              color: "var(--fg)",
              font: "500 14px var(--font-ui)",
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 140px" }}>
          <span
            style={{
              font: "400 9.5px var(--font-mono)",
              color: "var(--dim)",
              letterSpacing: ".08em",
            }}
          >
            {t("vehicleModelLabel")}
          </span>
          <input
            type="text"
            value={vehicleModel}
            disabled={vinLookupPending}
            onChange={(event) => onVehicleModelChange(event.target.value)}
            style={{
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              padding: "11px 12px",
              color: "var(--fg)",
              font: "500 14px var(--font-ui)",
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "0 1 90px" }}>
          <span
            style={{
              font: "400 9.5px var(--font-mono)",
              color: "var(--dim)",
              letterSpacing: ".08em",
            }}
          >
            {t("vehicleYearLabel")}
          </span>
          <input
            type="text"
            inputMode="numeric"
            value={vehicleYear}
            disabled={vinLookupPending}
            onChange={(event) => onVehicleYearChange(event.target.value)}
            style={{
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              padding: "11px 12px",
              color: "var(--fg)",
              font: "500 14px var(--font-ui)",
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          />
        </label>
        {vinLookupNotFound && (
          <span
            style={{ font: "400 11px var(--font-mono)", color: "var(--dim)", flex: "1 1 100%" }}
          >
            {t("vinLookupNotFound")}
          </span>
        )}
        <button
          type="button"
          onClick={onAddVehicle}
          style={{
            background: "var(--acc)",
            color: "var(--on-acc)",
            border: "1px solid var(--acc)",
            borderRadius: "var(--radius-md)",
            padding: "11px 14px",
            font: "600 11.5px var(--font-ui)",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
          }}
        >
          <AddIcon size={15} />
          {t("addVehicle")}
        </button>
      </div>
    </div>
  );
}
