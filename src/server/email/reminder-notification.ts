import { renderEmailHtml, renderEmailText } from "./template";
import type { EmailContent } from "./template";

// Deliberately a different local-part from magic-link.ts's own FROM_ADDRESS (issue #285) — a
// reminder/expiry notification isn't an authentication email, and sharing auth@ made the two
// indistinguishable at a glance in a user's inbox. No separate Cloudflare onboarding needed for
// this: Email Sending verifies at the domain level, not per address (confirmed against Cloudflare's
// own docs) — odograph.iuma.dev is already onboarded (issue #223), so any address on it, including
// this one, sends immediately.
const FROM_ADDRESS = "notifications@odograph.iuma.dev";

export type SendReminderDueEmailResult = { sent: true } | { sent: false; error: string };

/**
 * Mirrors sendMagicLinkEmail()'s exact contract (src/server/auth/magic-link.ts): never throws,
 * always resolves to a sent/error result — evaluateAllReminders' per-row try/catch relies on this
 * function never being the thing that throws (research.md Decision 6).
 *
 * Shared between evaluateAllReminders (itemLabel = a reminder rule's label) and
 * evaluateAllDocumentReminders (itemLabel = a document's title) — specs/024 research.md renamed
 * this from a reminder-rule-specific `ruleLabel` rather than adding a second, near-duplicate
 * function.
 */
export async function sendReminderDueEmail(
  env: Env,
  input: { to: string; vehicleName: string; itemLabel: string; status: "coming_up" | "overdue" },
): Promise<SendReminderDueEmailResult> {
  const statusText = input.status === "overdue" ? "is overdue" : "is coming up";
  const subject = `${input.vehicleName}: ${input.itemLabel} ${statusText}`;

  const content: EmailContent = {
    purposeTag: "REMINDER",
    headline: `${input.itemLabel} ${statusText}`,
    bodyText: `Your reminder "${input.itemLabel}" for ${input.vehicleName} ${statusText}.`,
    ctaLabel: null,
    ctaUrl: null,
    expiryNote: null,
    details: [],
    fallbackNote: null,
  };

  try {
    await env.EMAIL.send({
      to: input.to,
      from: FROM_ADDRESS,
      subject,
      text: renderEmailText(content),
      html: renderEmailHtml(content),
    });
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "unknown_error" };
  }
}
