import { useEffect, useState } from "react";
import type { Attachment, FuelPreview, FuelRecord } from "../fuel-records";
import { fetchFuelPreview } from "../fuel-records";
import type { WithSyncStatus } from "../offline/merge";
import { AddIcon, CameraIcon, FuelIcon, ReceiptIcon, UploadIcon } from "../design/icons";
import { t } from "../i18n/strings";

type FuelRecordPanelProps = {
  vehicleId: string;
  records: WithSyncStatus<FuelRecord>[];
  currencySymbol: string;
  fuelDate: string;
  onFuelDateChange: (value: string) => void;
  odometerReading: string;
  onOdometerReadingChange: (value: string) => void;
  volume: string;
  onVolumeChange: (value: string) => void;
  cost: string;
  onCostChange: (value: string) => void;
  onAddRecord: () => void;
  onUploadAttachment: (recordId: string, file: File) => Promise<void>;
  attachmentsByRecordId: Record<string, Attachment[]>;
  onDismissDuplicate: (recordId: string) => void;
  onUpdateRecord: (
    recordId: string,
    patch: {
      fuelDate: string;
      odometerReading: number;
      volume: number;
      cost: number;
      station: string | null;
      notes: string | null;
    },
  ) => void;
  onDeleteRecord: (recordId: string) => void;
};

const mono9 = { font: "400 9.5px var(--font-mono)", color: "var(--dim)", letterSpacing: ".08em" };

function editActionButtonStyle(color: string) {
  return {
    background: "transparent",
    border: `1px solid ${color}`,
    borderRadius: "var(--radius-sm)",
    padding: "8px 10px",
    color,
    font: "600 10.5px var(--font-ui)",
    cursor: "pointer",
  };
}

const numberInputStyle = {
  background: "var(--panel2)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-md)",
  padding: "11px 12px",
  color: "var(--fg)",
  font: "500 14px var(--font-mono)",
  outline: "none",
  width: "100%",
  boxSizing: "border-box" as const,
};

// Mirrors ServiceRecordPanel.tsx's structure exactly (spec 008/009 T016) — the one genuinely new
// piece is the fuelEconomy column, rendered in var(--acc) when present or an explicit "—" in
// var(--dim) when null, never a blank cell (spec 009 research.md).
export function FuelRecordPanel(props: FuelRecordPanelProps) {
  const {
    vehicleId,
    records,
    currencySymbol,
    fuelDate,
    onFuelDateChange,
    odometerReading,
    onOdometerReadingChange,
    volume,
    onVolumeChange,
    cost,
    onCostChange,
    onAddRecord,
    onUploadAttachment,
    attachmentsByRecordId,
    onDismissDuplicate,
    onUpdateRecord,
    onDeleteRecord,
  } = props;

  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  const [justUploadedId, setJustUploadedId] = useState<string | null>(null);
  const [cameraTargetId, setCameraTargetId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftFuelDate, setDraftFuelDate] = useState("");
  const [draftOdometerReading, setDraftOdometerReading] = useState("");
  const [draftVolume, setDraftVolume] = useState("");
  const [draftCost, setDraftCost] = useState("");
  const [draftStation, setDraftStation] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [preview, setPreview] = useState<FuelPreview | null>(null);

  // Debounced, server-computed create-form preview (specs/040 — constitution Principle II forbids
  // computing this division client-side; the "live" part is only the debounced re-fetch as the
  // owner types, never local arithmetic). odometerReading/volume are parsed here only as a cheap
  // non-blank/parseable gate on whether to ask at all — the actual division-safety and
  // comparison-against-history computation always happens server-side.
  useEffect(() => {
    const parsedOdometer = Number(odometerReading);
    const parsedVolume = Number(volume);
    const parsedCost = cost === "" ? null : Number(cost);
    if (
      odometerReading === "" || volume === "" || !Number.isFinite(parsedOdometer) ||
      !Number.isFinite(parsedVolume) || parsedOdometer <= 0 || parsedVolume <= 0 ||
      (parsedCost !== null && !Number.isFinite(parsedCost))
    ) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      fetchFuelPreview(vehicleId, parsedOdometer, parsedVolume, parsedCost)
        .then((result) => {
          if (!cancelled) setPreview(result);
        })
        .catch(() => {
          if (!cancelled) setPreview(null);
        });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [vehicleId, odometerReading, volume, cost]);

  function startEdit(record: FuelRecord) {
    setEditingId(record.id);
    setDraftFuelDate(record.fuelDate);
    setDraftOdometerReading(String(record.odometerReading));
    setDraftVolume(String(record.volume));
    setDraftCost(String(record.cost));
    setDraftStation(record.station ?? "");
    setDraftNotes(record.notes ?? "");
  }

  function saveEdit(recordId: string) {
    onUpdateRecord(recordId, {
      fuelDate: draftFuelDate,
      odometerReading: Number(draftOdometerReading),
      volume: Number(draftVolume),
      cost: Number(draftCost),
      station: draftStation === "" ? null : draftStation,
      notes: draftNotes === "" ? null : draftNotes,
    });
    setEditingId(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {records.length === 0
        ? (
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
              <FuelIcon size={18} />
            </div>
            <span style={{ font: "500 12.5px var(--font-ui)" }}>{t("noFuelRecordsYet")}</span>
          </div>
        )
        : (
          <div
            style={{
              border: "1px solid var(--line)",
              background: "var(--panel)",
              borderRadius: "var(--radius-lg)",
              overflow: "hidden",
            }}
          >
            {records.map((record) => {
              const attachments = attachmentsByRecordId[record.id] ?? [];
              const isEditing = editingId === record.id;
              return (
                <div
                  key={record.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 9,
                    padding: "14px 18px",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  {isEditing
                    ? (
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={mono9}>{t("fuelDateLabel")}</span>
                          <input
                            type="date"
                            value={draftFuelDate}
                            onChange={(event) => setDraftFuelDate(event.target.value)}
                            style={numberInputStyle}
                          />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={mono9}>{t("fuelOdometerLabel")}</span>
                          <input
                            type="number"
                            value={draftOdometerReading}
                            onChange={(event) => setDraftOdometerReading(event.target.value)}
                            style={numberInputStyle}
                          />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={mono9}>{t("fuelVolumeLabel")}</span>
                          <input
                            type="number"
                            value={draftVolume}
                            onChange={(event) => setDraftVolume(event.target.value)}
                            style={numberInputStyle}
                          />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={mono9}>{t("fuelCostLabel")}</span>
                          <input
                            type="number"
                            value={draftCost}
                            onChange={(event) => setDraftCost(event.target.value)}
                            style={numberInputStyle}
                          />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={mono9}>{t("fuelStationLabel")}</span>
                          <input
                            type="text"
                            value={draftStation}
                            onChange={(event) => setDraftStation(event.target.value)}
                            style={numberInputStyle}
                          />
                        </label>
                        <label
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            flex: "1 1 160px",
                          }}
                        >
                          <span style={mono9}>{t("notesLabel")}</span>
                          <input
                            type="text"
                            value={draftNotes}
                            onChange={(event) => setDraftNotes(event.target.value)}
                            style={numberInputStyle}
                          />
                        </label>
                        <div style={{ display: "flex", gap: 7, alignItems: "flex-end" }}>
                          <button
                            type="button"
                            onClick={() => saveEdit(record.id)}
                            style={editActionButtonStyle("var(--acc)")}
                          >
                            {t("saveEdit")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            style={editActionButtonStyle("var(--dim)")}
                          >
                            {t("cancelEdit")}
                          </button>
                        </div>
                      </div>
                    )
                    : (
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <span
                          style={{
                            font: "400 12.5px var(--font-mono)",
                            color: "var(--dim)",
                            flex: "none",
                          }}
                        >
                          {record.fuelDate}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ font: "500 13px var(--font-ui)" }}>
                            {record.station ?? t("fuelStationLabel")}
                          </div>
                          {record.notes && (
                            <div
                              style={{
                                font: "400 10.5px var(--font-mono)",
                                color: "var(--dim)",
                                marginTop: 5,
                              }}
                            >
                              {record.notes}
                            </div>
                          )}
                        </div>
                        <span style={{ font: "400 12.5px var(--font-mono)", color: "var(--fg)" }}>
                          {record.odometerReading}
                        </span>
                        <span style={{ font: "400 12.5px var(--font-mono)", color: "var(--fg)" }}>
                          {record.volume}
                        </span>
                        <span style={{ font: "400 12.5px var(--font-mono)", color: "var(--fg)" }}>
                          {currencySymbol}
                          {record.cost}
                        </span>
                        {record.duplicateOfId != null
                          ? (
                            <span
                              style={{
                                font: "500 10.5px var(--font-mono)",
                                color: "var(--warn)",
                                border: "1px solid var(--warn)",
                                borderRadius: "var(--radius-sm)",
                                padding: "4px 8px",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {t("possibleDuplicateLabel")}
                            </span>
                          )
                          : (
                            <span
                              style={{
                                font: "500 12.5px var(--font-mono)",
                                color: record.fuelEconomy != null ? "var(--acc)" : "var(--dim)",
                                minWidth: 40,
                                textAlign: "right",
                              }}
                            >
                              {record.fuelEconomy != null
                                ? record.fuelEconomy.toFixed(1)
                                : t("fuelEconomyNotEnoughData")}
                            </span>
                          )}
                        {record.syncStatus === "pending" && (
                          <span
                            style={{
                              font: "500 10.5px var(--font-mono)",
                              color: "var(--dim)",
                              border: "1px solid var(--line)",
                              borderRadius: "var(--radius-sm)",
                              padding: "4px 8px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {t("pendingSyncLabel")}
                          </span>
                        )}
                        {record.syncStatus === "rejected" && (
                          <span
                            title={record.rejectReason ?? undefined}
                            style={{
                              font: "500 10.5px var(--font-mono)",
                              color: "var(--warn)",
                              border: "1px solid var(--warn)",
                              borderRadius: "var(--radius-sm)",
                              padding: "4px 8px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {t("rejectedSyncLabel")}
                          </span>
                        )}
                      </div>
                    )}

                  {!isEditing && (
                    <div
                      style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}
                    >
                      {record.duplicateOfId != null && (
                        <button
                          type="button"
                          onClick={() => onDismissDuplicate(record.id)}
                          style={{
                            background: "transparent",
                            border: "1px solid var(--warn)",
                            borderRadius: "var(--radius-sm)",
                            padding: "4px 8px",
                            color: "var(--warn)",
                            font: "500 10.5px var(--font-mono)",
                            cursor: "pointer",
                          }}
                        >
                          {t("dismissDuplicate")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => startEdit(record)}
                        style={{
                          background: "transparent",
                          border: "1px solid var(--line)",
                          borderRadius: "var(--radius-sm)",
                          padding: "4px 8px",
                          color: "var(--dim)",
                          font: "500 10.5px var(--font-mono)",
                          cursor: "pointer",
                        }}
                      >
                        {t("editRecord")}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteRecord(record.id)}
                        style={{
                          background: "transparent",
                          border: "1px solid var(--line)",
                          borderRadius: "var(--radius-sm)",
                          padding: "4px 8px",
                          color: "var(--dim)",
                          font: "500 10.5px var(--font-mono)",
                          cursor: "pointer",
                        }}
                      >
                        {t("deleteRecord")}
                      </button>
                      {attachments.map((attachment) => (
                        <span
                          key={attachment.id}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            font: "500 10.5px var(--font-mono)",
                            border: "1px solid var(--line)",
                            borderRadius: "var(--radius-sm)",
                            padding: "4px 8px",
                            color: "var(--dim)",
                          }}
                        >
                          <ReceiptIcon size={12} />
                          {Math.round(attachment.size / 1024)}KB
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setCameraTargetId(null);
                          setUploadTargetId(uploadTargetId === record.id ? null : record.id);
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          background: "transparent",
                          border: "1px solid var(--line)",
                          borderRadius: "var(--radius-sm)",
                          padding: "4px 8px",
                          color: "var(--dim)",
                          font: "500 10.5px var(--font-mono)",
                          cursor: "pointer",
                        }}
                      >
                        <UploadIcon size={12} />
                        {t("attachmentUploadLabel")}
                      </button>
                      {uploadTargetId === record.id && (
                        <input
                          type="file"
                          onChange={async (event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            await onUploadAttachment(record.id, file);
                            setUploadTargetId(null);
                            setJustUploadedId(record.id);
                          }}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setUploadTargetId(null);
                          setCameraTargetId(cameraTargetId === record.id ? null : record.id);
                        }}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          background: "transparent",
                          border: "1px solid var(--line)",
                          borderRadius: "var(--radius-sm)",
                          padding: "4px 8px",
                          color: "var(--dim)",
                          font: "500 10.5px var(--font-mono)",
                          cursor: "pointer",
                        }}
                      >
                        <CameraIcon size={12} />
                        {t("takePhotoLabel")}
                      </button>
                      {cameraTargetId === record.id && (
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={async (event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            await onUploadAttachment(record.id, file);
                            setCameraTargetId(null);
                            setJustUploadedId(record.id);
                          }}
                        />
                      )}
                      {justUploadedId === record.id && (
                        <span
                          style={{
                            background: "var(--panel2)",
                            border: "1px solid var(--line)",
                            borderRadius: 9,
                            padding: "6px 10px",
                            font: "400 10.5px var(--font-mono)",
                            color: "var(--acc)",
                            animation: "tin .14s ease",
                          }}
                        >
                          {t("uploadAttachment")} ✓
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      <div
        style={{
          border: "1px solid var(--line)",
          background: "var(--panel)",
          borderRadius: "var(--radius-lg)",
          padding: "16px 18px",
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "flex-end",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={mono9}>{t("fuelDateLabel")}</span>
          <input
            type="date"
            value={fuelDate}
            onChange={(event) => onFuelDateChange(event.target.value)}
            style={numberInputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={mono9}>{t("fuelOdometerLabel")}</span>
          <input
            type="number"
            value={odometerReading}
            onChange={(event) => onOdometerReadingChange(event.target.value)}
            style={numberInputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={mono9}>{t("fuelVolumeLabel")}</span>
          <input
            type="number"
            value={volume}
            onChange={(event) => onVolumeChange(event.target.value)}
            style={numberInputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={mono9}>{t("fuelCostLabel")}</span>
          <input
            type="number"
            value={cost}
            onChange={(event) => onCostChange(event.target.value)}
            style={numberInputStyle}
          />
        </label>
        <button
          type="button"
          onClick={onAddRecord}
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
          {t("addFuelRecord")}
        </button>
        {(preview?.economy != null || preview?.costPerDistance != null) && (
          <div style={{ flex: "1 0 100%", display: "flex", gap: 16 }}>
            {preview.economy != null && (
              <span style={{ font: "500 10.5px var(--font-mono)", color: "var(--dim)" }}>
                {t("fuelEconomyPreviewLabel")}: {preview.economy.toFixed(1)}
              </span>
            )}
            {preview.costPerDistance != null && (
              <span style={{ font: "500 10.5px var(--font-mono)", color: "var(--dim)" }}>
                {t("fuelCostPerDistancePreviewLabel")}: {currencySymbol}
                {preview.costPerDistance.toFixed(2)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
