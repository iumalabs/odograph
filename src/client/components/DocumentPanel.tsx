import { useState } from "react";
import type { Attachment, DocumentCategory, VehicleDocument } from "../documents";
import { AddIcon, AlertIcon, CameraIcon, ReceiptIcon, UploadIcon } from "../design/icons";
import { t } from "../i18n/strings";

type DocumentPanelProps = {
  documents: VehicleDocument[];
  title: string;
  onTitleChange: (value: string) => void;
  category: DocumentCategory;
  onCategoryChange: (value: DocumentCategory) => void;
  onAddDocument: () => void;
  onUploadAttachment: (documentId: string, file: File) => Promise<void>;
  attachmentsByDocumentId: Record<string, Attachment[]>;
  onUpdateDocument: (
    documentId: string,
    patch: {
      title: string;
      category: DocumentCategory;
      expiryDate: string | null;
      notes: string | null;
    },
  ) => void;
  onDeleteDocument: (documentId: string) => void;
};

const CATEGORIES: DocumentCategory[] = [
  "registration",
  "insurance",
  "warranty",
  "inspection",
  "other",
];

function categoryLabel(category: DocumentCategory): string {
  switch (category) {
    case "registration":
      return t("documentCategoryRegistration");
    case "insurance":
      return t("documentCategoryInsurance");
    case "warranty":
      return t("documentCategoryWarranty");
    case "inspection":
      return t("documentCategoryInspection");
    case "other":
      return t("documentCategoryOther");
  }
}

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

// Mirrors ServiceRecordPanel.tsx's shape (specs/007/008) — no offline-queue sync status or
// duplicate-detection UI, since documents (specs/023) explicitly scope both out.
export function DocumentPanel(props: DocumentPanelProps) {
  const {
    documents,
    title,
    onTitleChange,
    category,
    onCategoryChange,
    onAddDocument,
    onUploadAttachment,
    attachmentsByDocumentId,
    onUpdateDocument,
    onDeleteDocument,
  } = props;

  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  const [justUploadedId, setJustUploadedId] = useState<string | null>(null);
  const [cameraTargetId, setCameraTargetId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCategory, setDraftCategory] = useState<DocumentCategory>("other");
  const [draftExpiryDate, setDraftExpiryDate] = useState("");
  const [draftNotes, setDraftNotes] = useState("");

  function startEdit(document: VehicleDocument) {
    setEditingId(document.id);
    setDraftTitle(document.title);
    setDraftCategory(document.category);
    setDraftExpiryDate(document.expiryDate ?? "");
    setDraftNotes(document.notes ?? "");
  }

  /** Same as startEdit, except the stale expiry date is never pre-filled — the owner must always
   * type the real new date (constitution Principle IV: no interpolated data, specs/036). */
  function startRenew(document: VehicleDocument) {
    setEditingId(document.id);
    setDraftTitle(document.title);
    setDraftCategory(document.category);
    setDraftExpiryDate("");
    setDraftNotes(document.notes ?? "");
  }

  function saveEdit(documentId: string) {
    onUpdateDocument(documentId, {
      title: draftTitle,
      category: draftCategory,
      expiryDate: draftExpiryDate === "" ? null : draftExpiryDate,
      notes: draftNotes === "" ? null : draftNotes,
    });
    setEditingId(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {documents.length === 0
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
              <ReceiptIcon size={18} />
            </div>
            <span style={{ font: "500 12.5px var(--font-ui)" }}>{t("noDocumentsYet")}</span>
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
            {documents.map((document) => {
              const attachments = attachmentsByDocumentId[document.id] ?? [];
              const isEditing = editingId === document.id;
              return (
                <div
                  key={document.id}
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
                        <label
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            flex: "1 1 160px",
                          }}
                        >
                          <span style={mono9}>{t("documentTitleLabel")}</span>
                          <input
                            type="text"
                            value={draftTitle}
                            onChange={(event) => setDraftTitle(event.target.value)}
                            style={editInputStyle}
                          />
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={mono9}>{t("documentCategoryLabel")}</span>
                          <select
                            value={draftCategory}
                            onChange={(event) =>
                              setDraftCategory(event.target.value as DocumentCategory)}
                            style={editInputStyle}
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>{categoryLabel(c)}</option>
                            ))}
                          </select>
                        </label>
                        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={mono9}>{t("documentExpiryDateLabel")}</span>
                          <input
                            type="date"
                            value={draftExpiryDate}
                            onChange={(event) => setDraftExpiryDate(event.target.value)}
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
                            onClick={() => saveEdit(document.id)}
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
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ font: "500 13px var(--font-ui)" }}>
                            {document.title}
                          </div>
                          <div
                            style={{
                              font: "400 10.5px var(--font-mono)",
                              color: "var(--dim)",
                              marginTop: 5,
                            }}
                          >
                            {categoryLabel(document.category)}
                            {document.expiryDate ? ` · ${document.expiryDate}` : ""}
                          </div>
                          {document.notes && (
                            <div
                              style={{
                                font: "400 10.5px var(--font-mono)",
                                color: "var(--dim)",
                                marginTop: 5,
                              }}
                            >
                              {document.notes}
                            </div>
                          )}
                        </div>
                        {document.isExpired && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              font: "500 10.5px var(--font-mono)",
                              color: "var(--warn)",
                              border: "1px solid var(--warn)",
                              borderRadius: "var(--radius-sm)",
                              padding: "4px 8px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <AlertIcon size={12} />
                            {t("documentExpiredLabel")}
                          </span>
                        )}
                        {document.reminderStatus === "coming_up" && (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 5,
                              font: "500 10.5px var(--font-mono)",
                              color: "var(--dim)",
                              border: "1px solid var(--line)",
                              borderRadius: "var(--radius-sm)",
                              padding: "4px 8px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            <AlertIcon size={12} />
                            {t("documentComingUpLabel")}
                          </span>
                        )}
                      </div>
                    )}

                  {!isEditing && document.windowFraction !== null && (
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
                          width: `${document.windowFraction * 100}%`,
                          height: "100%",
                          background: document.isExpired ? "var(--warn)" : "var(--acc)",
                        }}
                      />
                    </div>
                  )}

                  {!isEditing && (
                    <div
                      style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}
                    >
                      {(document.isExpired || document.reminderStatus === "coming_up") && (
                        <button
                          type="button"
                          onClick={() => startRenew(document)}
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
                          {t("renewRecord")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => startEdit(document)}
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
                        onClick={() => onDeleteDocument(document.id)}
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
                          setUploadTargetId(uploadTargetId === document.id ? null : document.id);
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
                      {uploadTargetId === document.id && (
                        <input
                          type="file"
                          onChange={async (event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            await onUploadAttachment(document.id, file);
                            setUploadTargetId(null);
                            setJustUploadedId(document.id);
                          }}
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setUploadTargetId(null);
                          setCameraTargetId(cameraTargetId === document.id ? null : document.id);
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
                      {cameraTargetId === document.id && (
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          onChange={async (event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            await onUploadAttachment(document.id, file);
                            setCameraTargetId(null);
                            setJustUploadedId(document.id);
                          }}
                        />
                      )}
                      {justUploadedId === document.id && (
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
        <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 200px" }}>
          <span style={mono9}>{t("documentTitleLabel")}</span>
          <input
            type="text"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
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
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={mono9}>{t("documentCategoryLabel")}</span>
          <select
            value={category}
            onChange={(event) => onCategoryChange(event.target.value as DocumentCategory)}
            style={{
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: "var(--radius-md)",
              padding: "11px 12px",
              color: "var(--fg)",
              font: "500 13.5px var(--font-ui)",
              outline: "none",
            }}
          >
            {CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={onAddDocument}
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
          {t("addDocument")}
        </button>
      </div>
    </div>
  );
}
