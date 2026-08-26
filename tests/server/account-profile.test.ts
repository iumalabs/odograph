import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// D1 storage in @cloudflare/vitest-pool-workers is isolated per test *file*, not per `it()` — each
// session below gets its own tenant, so tests never observe each other's data.

function cookieValue(setCookie: string | null): string {
  if (!setCookie) throw new Error("missing Set-Cookie header");
  return setCookie.split(";")[0] ?? "";
}

async function createSession(
  email?: string,
): Promise<{ cookie: string; tenantId: string; userId: string }> {
  const res = await SELF.fetch("https://example.com/api/v1/_dev/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(email ? { email } : {}),
  });
  const body = (await res.json()) as { tenantId: string; userId: string };
  return { cookie: cookieValue(res.headers.get("set-cookie")), ...body };
}

function getAccountReq(cookie: string): Promise<Response> {
  return SELF.fetch("https://example.com/api/v1/account", { headers: { Cookie: cookie } });
}

function signOutReq(cookie: string): Promise<Response> {
  return SELF.fetch("https://example.com/api/v1/account/sign-out", {
    method: "POST",
    headers: { Cookie: cookie },
  });
}

type ApiTokenBody = { label: string; scope: "read" | "write" };
type CreatedToken = { token: string };

async function createApiToken(cookie: string, body: ApiTokenBody): Promise<CreatedToken> {
  const res = await SELF.fetch("https://example.com/api/v1/tokens", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as CreatedToken;
}

describe("GET /api/v1/account (specs/058-account-page)", () => {
  it("returns the real email for the calling session", async () => {
    const { cookie } = await createSession("profile-check@example.invalid");
    const res = await getAccountReq(cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { email: string };
    expect(body.email).toBe("profile-check@example.invalid");
  });

  it("returns 401 with no session", async () => {
    const res = await SELF.fetch("https://example.com/api/v1/account");
    expect(res.status).toBe(401);
  });

  it("rejects a bearer API token — never readable via a token (Constitution Principle VI)", async () => {
    const { cookie } = await createSession();
    const { token } = await createApiToken(cookie, { label: "test", scope: "read" });
    const res = await SELF.fetch("https://example.com/api/v1/account", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it("reports zero linked methods for a freshly created account", async () => {
    const { cookie } = await createSession();
    const res = await getAccountReq(cookie);
    const body = (await res.json()) as {
      passkeyCount: number;
      hasGoogle: boolean;
      linkedEmails: string[];
    };
    expect(body.passkeyCount).toBe(0);
    expect(body.hasGoogle).toBe(false);
    expect(body.linkedEmails).toEqual([]);
  });

  it("reports real linked methods once they exist", async () => {
    const { cookie, userId } = await createSession();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO webauthn_credentials (id, user_id, public_key, counter) VALUES (?, ?, ?, 0)",
      ).bind("cred-1", userId, new Uint8Array([1, 2, 3])),
      env.DB.prepare(
        "INSERT INTO oidc_identities (provider, subject, user_id) VALUES ('google', 'sub-1', ?)",
      ).bind(userId),
      env.DB.prepare(
        "INSERT INTO magic_link_identities (email, user_id) VALUES (?, ?)",
      ).bind("second-email@example.invalid", userId),
    ]);

    const res = await getAccountReq(cookie);
    const body = (await res.json()) as {
      passkeyCount: number;
      hasGoogle: boolean;
      linkedEmails: string[];
    };
    expect(body.passkeyCount).toBe(1);
    expect(body.hasGoogle).toBe(true);
    expect(body.linkedEmails).toEqual(["second-email@example.invalid"]);
  });

  it("returns the real session expiry", async () => {
    const { cookie } = await createSession();
    const res = await getAccountReq(cookie);
    const body = (await res.json()) as { sessionExpiresAt: string | null };
    expect(body.sessionExpiresAt).not.toBeNull();
    expect(new Date(body.sessionExpiresAt as string).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("POST /api/v1/account/sign-out (specs/058-account-page)", () => {
  it("invalidates the session — a follow-up request with the same cookie is unauthorized", async () => {
    const { cookie } = await createSession();
    const signOutRes = await signOutReq(cookie);
    expect(signOutRes.status).toBe(200);
    expect(await signOutRes.json()).toEqual({ signedOut: true });

    const followUp = await getAccountReq(cookie);
    expect(followUp.status).toBe(401);
  });

  it("returns 401 (not a crash) with no session", async () => {
    const res = await SELF.fetch("https://example.com/api/v1/account/sign-out", {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });
});
