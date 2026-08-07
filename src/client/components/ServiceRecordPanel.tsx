import { useState } from "react";
import type { Attachment, ServiceRecord } from "../service-records";
import type { WithSyncStatus } from "../offline/merge";
import { AddIcon, CameraIcon, ReceiptIcon, ServiceIcon, UploadIcon } from "../design/icons";
import { t } from "../i18n/strings";

type ServiceRecordPanelProps = {
  records: WithSyncStatus<ServiceRecord>[];
  serviceDate: string;
  onServiceDateChange: (value: string) => void;
  serviceDescription: string;
  onServiceDescriptionChange: (value: string) => void;
  onAddRecord: () => void;
  onUploadAttachment: (recordId: string, file: File) => Promise<void>;
  attachmentsByRecordId: Record<string, Attachment[]>;
  onDismissDuplicate: (recordId: string) => void;
  onUpdateRecord: (
    recordId: string,
    patch: {
      serviceDate: string;
      description: string;
      odometerReading: number | null;
      cost: number | null;
      notes: string | null;
    },
  ) => void;
  onDeleteRecord: (recordId: string) => void;
};

const mono9 = { font: "400 9.5px var(--font-mono)", color: "var(--dim)", letterSpacing: ".08em" };

const editInputStyle = {
  background: "var(--panel2)",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-md)",
  padding: "8px 10px",
  color: "var(--fg)",
  font: "500 12.5px var(--font-mono)",
  outline: "none",
};

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

// Extracted from App.tsx's service-record section (spec 008 T017-T020), styled per the mockups'
// ТО (service records) screen — adapted to this project's actual ServiceRecord/Attachment fields
// (no self/shop toggle, since that field doesn't exist in this schema).
export function ServiceRecordPanel(props: ServiceRecordPanelProps) {
  const {
    records,
    serviceDate,
    onServiceDateChange,
    serviceDescription,
    onServiceDescriptionChange,
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
  const [draftServiceDate, setDraftServiceDate] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftOdometerReading, setDraftOdometerReading] = useState("");
  const [draftCost, setDraftCost] = useState("");
  const [draftNotes, setDraftNotes] = useState("");

  function startEdit(record: ServiceRecord) {
    setEditingId(record.id);
    setDraftServiceDate(record.serviceDate);
    setDraftDescription(record.description);
    setDraftOdometerReading(record.odometerReading != null ? String(record.odometerReading) : "");
    setDraftCost(record.cost != null ? String(record.cost) : "");
    setDraftNotes(record.notes ?? "");
  }

  function saveEdit(recordId: string) {
    onUpdateRecord(recordId, {
      serviceDate: draftServiceDate,
      description: draftDescription,
      odometerReading: draftOdometerReading === "" ? null : Number(draftOdometerReading),
      cost: draftCost === "" ? null : Number(draftCost),
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
              <ServiceIcon size={18} />
            </div>
            <span style={{ font: "500 12.5px var(--font-ui)" }}>{t("noServiceRecordsYet")}</span>
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
                          <span style={mono9}>{t("serviceDateLabel")}</span>
                          <input
                            type="date"
                            value={draftServiceDate}
                            onChange={(event) => setDraftServiceDate(event.target.value)}
                            style={editInputStyle}
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
                          <span style={mono9}>{t("serviceDescriptionLabel")}</span>
                          <input
                            type="text"
                            value={draftDescription}
                            onChange={(event) => setDraftDescription(event.target.value)}
                            style={editInputStyle}
                          />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={mono9}>{t("odometerLabel")}</span>
                          <input
                            type="number"
                            value={draftOdometerReading}
                            onChange={(event) => setDraftOdometerReading(event.target.value)}
                            style={editInputStyle}
                          />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={mono9}>{t("costLabel")}</span>
                          <input
                            type="number"
                            value={draftCost}
                            onChange={(event) => setDraftCost(event.target.value)}
                            style={editInputStyle}
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
                            style={editInputStyle}
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
                          {record.serviceDate}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ font: "500 13px var(--font-ui)" }}>
                            {record.description}
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
                        {record.odometerReading != null && (
                          <span style={{ font: "400 12.5px var(--font-mono)", color: "var(--fg)" }}>
                            {record.odometerReading}
                          </span>
                        )}
                        {record.cost != null && (
                          <span style={{ font: "400 12.5px var(--font-mono)", color: "var(--fg)" }}>
                            {record.cost}
                          </span>
                        )}
                        {record.duplicateOfId != null && (
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
          <span style={mono9}>{t("serviceDateLabel")}</span>
          <input
            type="date"
            value={serviceDate}
            onChange={(event) => onServiceDateChange(event.target.value)}
            style={{
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              padding: "11px 12px",
              color: "var(--fg)",
              font: "500 14px var(--font-mono)",
              outline: "none",
            }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 200px" }}>
          <span style={mono9}>{t("serviceDescriptionLabel")}</span>
          <input
            type="text"
            value={serviceDescription}
            onChange={(event) => onServiceDescriptionChange(event.target.value)}
            style={{
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              padding: "11px 12px",
              color: "var(--fg)",
              font: "500 13.5px var(--font-ui)",
              outline: "none",
              width: "100%",
              boxSizing: "border-box",
            }}
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
          {t("addServiceRecord")}
        </button>
      </div>
    </div>
  );
}
