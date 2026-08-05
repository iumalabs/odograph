const FROM_ADDRESS = "auth@odograph.dev";

export type SendReminderDueEmailResult = { sent: true } | { sent: false; error: string };

/**
 * Mirrors sendMagicLinkEmail()'s exact contract (src/server/auth/magic-link.ts): never throws,
 * always resolves to a sent/error result — evaluateAllReminders' per-row try/catch relies on this
 * function never being the thing that throws (research.md Decision 6).
 */
export async function sendReminderDueEmail(
  env: Env,
  input: { to: string; vehicleName: string; ruleLabel: string; status: "coming_up" | "overdue" },
): Promise<SendReminderDueEmailResult> {
  const statusText = input.status === "overdue" ? "is overdue" : "is coming up";
  const subject = `${input.vehicleName}: ${input.ruleLabel} ${statusText}`;

  try {
    await env.EMAIL.send({
      to: input.to,
      from: FROM_ADDRESS,
      subject,
      text: `Your reminder "${input.ruleLabel}" for ${input.vehicleName} ${statusText}.`,
      html: `<p>Your reminder "${input.ruleLabel}" for ${input.vehicleName} ${statusText}.</p>`,
    });
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "unknown_error" };
  }
}
