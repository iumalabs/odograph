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
