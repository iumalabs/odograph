import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

function uniqueEmail(label: string): string {
  return `${label}-${crypto.randomUUID()}@example.invalid`;
}

function requestMagicLink(email: string): Promise<Response> {
  return SELF.fetch("https://example.com/api/v1/auth/magic-link/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

type TokenResponse = { token: string | null; expiresAt: string | null };

function fetchDevToken(email?: string): Promise<Response> {
  const url = new URL("https://example.com/api/v1/_dev/magic-link-token");
  if (email !== undefined) url.searchParams.set("email", email);
  return SELF.fetch(url.toString());
}

function verify(token: string): Promise<Response> {
  const url = new URL("https://example.com/api/v1/auth/magic-link/verify");
  url.searchParams.set("token", token);
  return SELF.fetch(url.toString(), { redirect: "manual" });
}

describe("GET /api/v1/_dev/magic-link-token (User Story 1)", () => {
  it("returns the pending token and expiry for an email that just requested a magic link (FR-001)", async () => {
    const email = uniqueEmail("pending");
    await requestMagicLink(email);

    const res = await fetchDevToken(email);
    expect(res.status).toBe(200);
    const body = (await res.json()) as TokenResponse;
    expect(typeof body.token).toBe("string");
    expect(typeof body.expiresAt).toBe("string");
  });

  it("a token retrieved via this endpoint completes real sign-in through the real verify route (FR-006)", async () => {
    const email = uniqueEmail("completes-signin");
    await requestMagicLink(email);
    const { token } = (await (await fetchDevToken(email)).json()) as TokenResponse;

    const res = await verify(token as string);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("magicLink=ok");
    expect(res.headers.get("set-cookie")).toBeTruthy();
  });

  it("returns null token/expiresAt for an email with no pending token (FR-002)", async () => {
    const res = await fetchDevToken(uniqueEmail("never-requested"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: null, expiresAt: null });
  });

  it("returns null token/expiresAt when the email query param is missing entirely (FR-002, edge case)", async () => {
    const res = await fetchDevToken();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: null, expiresAt: null });
  });
});
