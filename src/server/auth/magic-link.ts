// odograph.dev was never onboarded in Cloudflare's Email Sending product (distinct from Email
// Routing, which is enabled for the zone but doesn't cover outbound send) — every email from this
// address has silently failed to send. iuma.dev is already configured there (issue #223).
const FROM_ADDRESS = "auth@odograph.iuma.dev";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Deliberately permissive syntactic check — not a deliverability check. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildVerifyUrl(requestUrl: string, token: string): string {
  const url = new URL("/api/v1/auth/magic-link/verify", requestUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export type SendMagicLinkResult = { sent: true } | { sent: false; error: string };

export type MagicLinkEmailPurpose = "new-account" | "sign-in" | "link";

const SUBJECTS: Record<MagicLinkEmailPurpose, string> = {
  "new-account": "Welcome to Odograph — finish creating your account",
  "sign-in": "Your Odograph sign-in link",
  "link": "Confirm linking this email to your Odograph account",
};

const ACTIONS: Record<MagicLinkEmailPurpose, string> = {
  "new-account": "finish creating your account",
  "sign-in": "sign in",
  "link": "confirm linking this email to your account",
};

/**
 * Sends the actual email. Always attempts to send regardless of whether the
 * account is new — only the copy differs (FR-006's response-parity
 * requirement is about the HTTP response, not the email content, which the
 * recipient — and only the recipient — necessarily sees differently).
 *
 * `purpose` has a third value, "link" (specs/005, analyze finding M1), so a
 * linking email never misleadingly claims to be a signup or plain sign-in
 * email — a recipient (who may not be the person who submitted the request)
 * needs accurate copy to decide whether to click it.
 */
export async function sendMagicLinkEmail(
  env: Env,
  input: { email: string; token: string; requestUrl: string; purpose: MagicLinkEmailPurpose },
): Promise<SendMagicLinkResult> {
  const verifyUrl = buildVerifyUrl(input.requestUrl, input.token);
  const subject = SUBJECTS[input.purpose];
  const action = ACTIONS[input.purpose];

  try {
    await env.EMAIL.send({
      to: input.email,
      from: FROM_ADDRESS,
      subject,
      text:
        `Click to ${action}: ${verifyUrl}\n\nThis link expires in 15 minutes and can only be used once.`,
      html:
        `<p><a href="${verifyUrl}">Click here to ${action}</a></p><p>This link expires in 15 minutes and can only be used once.</p>`,
    });
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "unknown_error" };
  }
}
