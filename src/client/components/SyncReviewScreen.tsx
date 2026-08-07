import { AlertIcon } from "../design/icons";
import { t } from "../i18n/strings";
import { describeAction } from "../offline/describe-action";
import { formatRejectReason } from "../offline/reject-reason";
import { discardRejected, retryRejected } from "../offline/queue";
import type { PendingAction } from "../offline/types";

type SyncReviewScreenProps = {
  actions: PendingAction[];
};

// Global — every vehicle at once, never scoped to whichever one happens to be selected elsewhere
// in the app (spec 021 FR-001/research.md), since a rejection can happen on any of them.
export function SyncReviewScreen({ actions }: SyncReviewScreenProps) {
  const rejected = actions.filter((a) => a.status === "rejected");

  if (rejected.length === 0) {
    return (
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
          <AlertIcon size={18} />
        </div>
        <span style={{ font: "500 12.5px var(--font-ui)" }}>{t("syncReviewEmpty")}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid var(--line)",
        background: "var(--panel)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
      }}
    >
      {rejected.map((action) => (
        <div
          key={action.id}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 9,
            padding: "14px 18px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <div style={{ font: "500 13px var(--font-ui)" }}>{describeAction(action)}</div>
          <div style={{ font: "400 10.5px var(--font-mono)", color: "var(--warn)" }}>
            {t("syncReviewReasonLabel")}: {formatRejectReason(action.rejectReason)}
          </div>
          <div style={{ display: "flex", gap: 7 }}>
            <button
              type="button"
              onClick={() => retryRejected(action.id)}
              style={{
                background: "transparent",
                border: "1px solid var(--acc)",
                borderRadius: "var(--radius-sm)",
                padding: "4px 8px",
                color: "var(--acc)",
                font: "500 10.5px var(--font-mono)",
                cursor: "pointer",
              }}
            >
              {t("retryAction")}
            </button>
            <button
              type="button"
              onClick={() => discardRejected(action.id)}
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
              {t("discardAction")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
