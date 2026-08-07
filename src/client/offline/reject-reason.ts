import { t } from "../i18n/strings";

/**
 * Formats a stored `rejectReason` (the server's raw response body — sometimes JSON like
 * `{"error":"invalid_request"}`, sometimes plain text like Hono's default 404 body) for display
 * (FR-002). Recognized shapes get a friendlier phrase; anything else is shown as-is rather than
 * inventing an explanation for a shape this function doesn't know (constitution Principle IV).
 */
export function formatRejectReason(reason: string | null): string {
  if (!reason) return t("rejectReasonUnknown");

  try {
    const parsed = JSON.parse(reason) as { error?: string };
    if (parsed.error === "invalid_request") return t("rejectReasonInvalidRequest");
  } catch {
    // Not JSON — fall through to showing the raw text.
  }

  return reason;
}
