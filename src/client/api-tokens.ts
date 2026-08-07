export type ApiToken = {
  id: string;
  userId: string;
  label: string;
  scope: "read" | "write";
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function createApiToken(
  label: string,
  scope: "read" | "write",
): Promise<ApiToken & { token: string }> {
  return jsonFetch("/api/v1/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, scope }),
  });
}

export async function listApiTokens(): Promise<ApiToken[]> {
  const { tokens } = await jsonFetch<{ tokens: ApiToken[] }>("/api/v1/tokens");
  return tokens;
}

export async function revokeApiToken(id: string): Promise<void> {
  const res = await fetch(`/api/v1/tokens/${id}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`revoke api token failed: ${res.status}`);
  }
}
