// odograph.dev was never onboarded in Cloudflare's Email Sending product (distinct from Email
// Routing, which is enabled for the zone but doesn't cover outbound send) — every email from this
// address has silently failed to send. Cloudflare Email Sending is configured per exact domain,
// not inherited by subdomains — auth@odograph.iuma.dev 502'd until odograph.iuma.dev was
// onboarded there as its own domain, separately from the parent iuma.dev zone (issue #223).
const FROM_ADDRESS = "auth@odograph.iuma.dev";

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

  try {
    await env.EMAIL.send({
      to: input.to,
      from: FROM_ADDRESS,
      subject,
      text: `Your reminder "${input.itemLabel}" for ${input.vehicleName} ${statusText}.`,
      html: `<p>Your reminder "${input.itemLabel}" for ${input.vehicleName} ${statusText}.</p>`,
    });
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "unknown_error" };
  }
}
