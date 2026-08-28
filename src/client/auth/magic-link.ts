export type SendMagicLinkResult = { sent: true };

// The server's own error codes (src/server/routes/v1/auth/magic-link.ts's /request and /link,
// plus rate-limit.ts's shared 429 shape) — "unknown" covers anything else so a caller always has a
// code to switch on rather than needing a separate not-a-typed-error branch (issue #288).
export type MagicLinkRequestErrorCode =
  | "invalid_email"
  | "send_failed"
  | "rate_limited"
  | "unknown";

export class MagicLinkRequestError extends Error {
  code: MagicLinkRequestErrorCode;

  constructor(code: MagicLinkRequestErrorCode) {
    super(`magic-link request failed: ${code}`);
    this.code = code;
  }
}

async function magicLinkErrorCode(res: Response): Promise<MagicLinkRequestErrorCode> {
  try {
    const body = (await res.json()) as { error?: string };
    if (
      body.error === "invalid_email" || body.error === "send_failed" ||
      body.error === "rate_limited"
    ) {
      return body.error;
    }
  } catch {
    // response body wasn't JSON — fall through to "unknown"
  }
  return "unknown";
}

export async function requestMagicLink(email: string): Promise<SendMagicLinkResult> {
  const res = await fetch("/api/v1/auth/magic-link/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    throw new MagicLinkRequestError(await magicLinkErrorCode(res));
  }
  return res.json() as Promise<SendMagicLinkResult>;
}

/** Requires an authenticated session — see POST /api/v1/auth/magic-link/link (specs/005). */
export async function requestMagicLinkLink(email: string): Promise<SendMagicLinkResult> {
  const res = await fetch("/api/v1/auth/magic-link/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    throw new MagicLinkRequestError(await magicLinkErrorCode(res));
  }
  return res.json() as Promise<SendMagicLinkResult>;
}
