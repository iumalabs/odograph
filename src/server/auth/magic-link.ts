const FROM_ADDRESS = "auth@odograph.dev";

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

/**
 * Sends the actual email. Always attempts to send regardless of whether the
 * account is new — only the copy differs (FR-006's response-parity
 * requirement is about the HTTP response, not the email content, which the
 * recipient — and only the recipient — necessarily sees differently).
 */
export async function sendMagicLinkEmail(
  env: Env,
  input: { email: string; token: string; requestUrl: string; isNewAccount: boolean },
): Promise<SendMagicLinkResult> {
  const verifyUrl = buildVerifyUrl(input.requestUrl, input.token);
  const subject = input.isNewAccount
    ? "Welcome to Odograph — finish creating your account"
    : "Your Odograph sign-in link";
  const action = input.isNewAccount ? "finish creating your account" : "sign in";

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
