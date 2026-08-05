export type SendMagicLinkResult = { sent: true };

export async function requestMagicLink(email: string): Promise<SendMagicLinkResult> {
  const res = await fetch("/api/v1/auth/magic-link/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    throw new Error(`magic-link request failed: ${res.status}`);
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
    throw new Error(`magic-link link request failed: ${res.status}`);
  }
  return res.json() as Promise<SendMagicLinkResult>;
}
