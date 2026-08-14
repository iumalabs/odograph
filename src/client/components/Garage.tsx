import { useEffect, useRef, useState } from "react";
import type { Vehicle } from "../vehicles";
import { vehiclePhotoUrl } from "../vehicles";
import type { WithSyncStatus } from "../offline/merge";
import { getVehicleAggregates } from "../vehicle-aggregates";
import { listReminderRules } from "../reminder-rules";
import type { ReminderRule } from "../reminder-rules";
import { listVehiclePhotos } from "../vehicle-photos";
import { convertDistance } from "../distance";
import type { DistanceUnit } from "../distance";
import { AddIcon, CarIcon, PhotoIcon } from "../design/icons";
import { t } from "../i18n/strings";

type GarageProps = {
  vehicles: WithSyncStatus<Vehicle>[];
  /** Header display preference (specs/047) — independent of each vehicle's own stored
   * odometerUnit below, which stays the source of truth for what gets persisted. */
  distanceUnit: DistanceUnit;
  selectedVehicleId: string | null;
  onSelectVehicle: (id: string) => void;
  /** Jumps straight to that vehicle's photo gallery screen (design mockup's g.photoAct) —
   * selects it first, same as onSelectVehicle, then navigates; App.tsx composes both. */
  onViewPhotos: (id: string) => void;
  /** Sets or replaces the vehicle's single cover photo (design mockup's drag-and-drop dropzone
   * on the card itself) — distinct from onViewPhotos' multi-photo gallery. */
  onUploadPhoto: (id: string, file: File) => void;
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

const statLabelStyle = {
  font: "400 9.5px var(--font-mono)",
  color: "var(--dim)",
  letterSpacing: ".08em",
};

const statValueStyle = {
  font: "500 25px var(--font-mono)",
  letterSpacing: "-.03em",
  marginTop: 4,
};

/** Status → color, matching ReminderRulePanel.tsx's existing badge convention (specs/041
 * research.md) rather than a new gradient. */
const REMINDER_STATUS_COLOR: Record<string, string> = {
  overdue: "var(--warn)",
  coming_up: "var(--acc)",
  on_track: "var(--dim)",
};

type VehicleSummary = {
  currentOdometer: number | null;
  averageFuelEconomy: number | null;
  mostUrgentReminder: ReminderRule | null;
  photoCount: number;
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
    distanceUnit,
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
    onViewPhotos,
    onUploadPhoto,
  } = props;

  const [summaries, setSummaries] = useState<Record<string, VehicleSummary>>({});
  const photoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      vehicles.map(async (vehicle) => {
        const [aggregates, reminderRules, photos] = await Promise.all([
          getVehicleAggregates(vehicle.id, distanceUnit).catch(() => null),
          listReminderRules(vehicle.id).catch(() => [] as ReminderRule[]),
          listVehiclePhotos(vehicle.id).catch(() => []),
        ]);
        return [vehicle.id, {
          currentOdometer: aggregates?.currentOdometer ?? null,
          averageFuelEconomy: aggregates?.averageFuelEconomy ?? null,
          mostUrgentReminder: mostUrgentReminder(reminderRules),
          photoCount: photos.length,
        }] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setSummaries(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [vehicles, distanceUnit]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {vehicles.map((vehicle) => {
        const spec = [vehicle.make, vehicle.model, vehicle.year ? String(vehicle.year) : null]
          .filter(Boolean)
          .join(" ");
        const isSelected = selectedVehicleId === vehicle.id;
        const summary = summaries[vehicle.id];
        const currentOdometer = summary?.currentOdometer ?? null;
        const displayOdometer = currentOdometer != null
          ? Math.round(convertDistance(currentOdometer, vehicle.odometerUnit, distanceUnit))
          : null;
        const averageFuelEconomy = summary?.averageFuelEconomy ?? null;
        const urgentReminder = summary?.mostUrgentReminder ?? null;
        const remainingFraction = urgentReminder?.remainingFraction ?? null;
        const barFillPercent = remainingFraction !== null
          ? Math.min(1, Math.max(0, 1 - remainingFraction)) * 100
          : null;
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
              flexDirection: "row",
              gap: 16,
              alignItems: "flex-start",
            }}
          >
            <div
              role="button"
              tabIndex={0}
              title={t("uploadVehiclePhotoLabel")}
              onClick={(event) => {
                event.stopPropagation();
                photoInputRefs.current[vehicle.id]?.click();
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const file = event.dataTransfer.files?.[0];
                if (file) onUploadPhoto(vehicle.id, file);
              }}
              style={{
                width: 160,
                height: 120,
                flex: "none",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                background: "var(--panel2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                cursor: "pointer",
                border: vehicle.hasPhoto ? "1px solid var(--line)" : "1px dashed var(--line)",
              }}
            >
              <input
                ref={(el) => {
                  photoInputRefs.current[vehicle.id] = el;
                }}
                type="file"
                accept="image/*"
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onUploadPhoto(vehicle.id, file);
                  event.target.value = "";
                }}
                style={{ display: "none" }}
              />
              {vehicle.hasPhoto
                ? (
                  // position:absolute + inset:0, not width/height:100% — a percentage height on
                  // a non-stretched flex/grid child doesn't reliably resolve against the parent's
                  // box (browsers fall back to the image's own intrinsic size instead), which let
                  // an unusually tall source photo render near its natural size and get clipped
                  // to a near-arbitrary vertical sliver by the parent's overflow:hidden. Taking
                  // the image out of flow with inset:0 pins it to the parent's actual pixel box,
                  // so object-fit: cover crops the excess evenly from the edges as intended.
                  <img
                    src={vehiclePhotoUrl(vehicle.id)}
                    alt={t("vehiclePhotoAlt", { name: vehicle.name })}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                )
                : (
                  <span
                    style={{
                      font: "400 9.5px var(--font-mono)",
                      color: "var(--dim)",
                      letterSpacing: ".06em",
                    }}
                  >
                    {t("vehiclePhotoPlaceholder")}
                  </span>
                )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <span style={{ font: "600 20px var(--font-ui)", letterSpacing: "-.02em" }}>
                  {vehicle.name}
                </span>
                {spec && (
                  <span style={{ font: "400 11px var(--font-mono)", color: "var(--dim)" }}>
                    {spec}
                  </span>
                )}
                <span
                  role="button"
                  tabIndex={0}
                  title={t("viewPhotoGallery")}
                  onClick={(event) => {
                    event.stopPropagation();
                    onViewPhotos(vehicle.id);
                  }}
                  style={{
                    marginLeft: "auto",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    font: "500 10.5px var(--font-mono)",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--radius-sm)",
                    padding: "4px 8px",
                    color: "var(--dim)",
                    cursor: "pointer",
                  }}
                >
                  <PhotoIcon size={11} />
                  {t("photoCountLabel", { count: String(summary?.photoCount ?? 0) })}
                </span>
                {urgentReminder && (
                  <span
                    style={{
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

              <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
                <div>
                  <div style={statLabelStyle}>{t("odometerLabel")}, {distanceUnit}</div>
                  <div style={statValueStyle}>
                    {displayOdometer != null ? displayOdometer : t("fuelEconomyNotEnoughData")}
                  </div>
                </div>
                <div>
                  <div style={statLabelStyle}>{t("averageFuelEconomyLabel")}</div>
                  <div style={{ ...statValueStyle, color: "var(--acc)" }}>
                    {averageFuelEconomy != null
                      ? averageFuelEconomy.toFixed(1)
                      : t("fuelEconomyNotEnoughData")}
                  </div>
                </div>
              </div>

              {urgentReminder && barFillPercent != null && (
                <div
                  style={{
                    height: 5,
                    background: "var(--panel2)",
                    borderRadius: 3,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${barFillPercent}%`,
                      height: "100%",
                      background: REMINDER_STATUS_COLOR[urgentReminder.status] ?? "var(--dim)",
                    }}
                  />
                </div>
              )}

              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {vehicle.vin && <span style={chipStyle}>{vehicle.vin}</span>}
                <span style={chipStyle}>{vehicle.odometerUnit}</span>
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
