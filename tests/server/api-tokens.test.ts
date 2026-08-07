import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// D1 storage in @cloudflare/vitest-pool-workers is isolated per test *file*, not per `it()` — each
// session below gets its own tenant, so tests never observe each other's data.

function cookieValue(setCookie: string | null): string {
  if (!setCookie) throw new Error("missing Set-Cookie header");
  return setCookie.split(";")[0] ?? "";
}

async function createSession(): Promise<{ cookie: string; tenantId: string; userId: string }> {
  const res = await SELF.fetch("https://example.com/api/v1/_dev/session", { method: "POST" });
  const body = (await res.json()) as { tenantId: string; userId: string };
  return { cookie: cookieValue(res.headers.get("set-cookie")), ...body };
}

type ApiTokenBody = { label: string; scope: "read" | "write" };
type CreatedToken = {
  id: string;
  label: string;
  scope: "read" | "write";
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  token: string;
};

function createTokenReq(cookie: string, body: ApiTokenBody): Promise<Response> {
  return SELF.fetch("https://example.com/api/v1/tokens", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createToken(cookie: string, body: ApiTokenBody): Promise<CreatedToken> {
  const res = await createTokenReq(cookie, body);
  return (await res.json()) as CreatedToken;
}

function listTokensReq(cookie: string): Promise<Response> {
  return SELF.fetch("https://example.com/api/v1/tokens", { headers: { Cookie: cookie } });
}

function revokeTokenReq(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/tokens/${id}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

function createVehicleReq(
  authHeaders: Record<string, string>,
  name = "Test Vehicle",
): Promise<Response> {
  return SELF.fetch("https://example.com/api/v1/vehicles", {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ name, odometerUnit: "km" }),
  });
}

function listVehiclesReq(authHeaders: Record<string, string>): Promise<Response> {
  return SELF.fetch("https://example.com/api/v1/vehicles", { headers: authHeaders });
}

function getVehicleReq(authHeaders: Record<string, string>, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${id}`, { headers: authHeaders });
}

function deleteAccountReq(authHeaders: Record<string, string>): Promise<Response> {
  return SELF.fetch("https://example.com/api/v1/account", {
    method: "DELETE",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: "DELETE MY ACCOUNT" }),
  });
}

describe("api tokens — creation and list (User Story 1)", () => {
  it("rejects a missing/invalid label or scope and creates nothing", async () => {
    const { cookie } = await createSession();

    const noLabel = await createTokenReq(cookie, { label: "", scope: "read" } as ApiTokenBody);
    expect(noLabel.status).toBe(400);

    const badScope = await createTokenReq(
      cookie,
      { label: "x", scope: "admin" } as unknown as ApiTokenBody,
    );
    expect(badScope.status).toBe(400);

    const listRes = await listTokensReq(cookie);
    const { tokens } = (await listRes.json()) as { tokens: unknown[] };
    expect(tokens.length).toBe(0);
  });

  it("returns the plaintext token once at creation and never again in the list (FR-002)", async () => {
    const { cookie } = await createSession();
    const created = await createToken(cookie, { label: "export script", scope: "read" });
    expect(typeof created.token).toBe("string");
    expect(created.token.startsWith("odo_")).toBe(true);

    const listRes = await listTokensReq(cookie);
    const body = await listRes.text();
    expect(body).not.toContain(created.token);
    const { tokens } = JSON.parse(body) as { tokens: Record<string, unknown>[] };
    expect(tokens.length).toBe(1);
    expect(tokens[0]).not.toHaveProperty("token");
    expect(tokens[0]).not.toHaveProperty("tokenHash");
  });
});

describe("api tokens — dual authentication on existing routes (User Story 1)", () => {
  it("a read-write token behaves identically to a session cookie", async () => {
    const { cookie } = await createSession();
    const created = await createToken(cookie, { label: "rw", scope: "write" });

    const createRes = await createVehicleReq(bearer(created.token), "Via token");
    expect(createRes.status).toBe(201);
    const { id } = (await createRes.json()) as { id: string };

    const getRes = await getVehicleReq(bearer(created.token), id);
    expect(getRes.status).toBe(200);
  });

  it("a read-only token can read but is refused on any write, with nothing changed (FR-005)", async () => {
    const { cookie } = await createSession();
    const created = await createToken(cookie, { label: "ro", scope: "read" });

    const listRes = await listVehiclesReq(bearer(created.token));
    expect(listRes.status).toBe(200);

    const writeRes = await createVehicleReq(bearer(created.token));
    expect(writeRes.status).toBe(403);
    expect(await writeRes.json()).toEqual({ error: "read_only_token" });

    const stillEmpty = await listVehiclesReq(bearer(created.token));
    const { vehicles } = (await stillEmpty.json()) as { vehicles: unknown[] };
    expect(vehicles.length).toBe(0);
  });

  it("token management and account deletion refuse a bearer token regardless of scope (FR-006, FR-013)", async () => {
    const { cookie } = await createSession();
    const created = await createToken(cookie, { label: "rw", scope: "write" });

    const createViaToken = await SELF.fetch("https://example.com/api/v1/tokens", {
      method: "POST",
      headers: { ...bearer(created.token), "Content-Type": "application/json" },
      body: JSON.stringify({ label: "escalation attempt", scope: "write" }),
    });
    expect(createViaToken.status).toBe(401);

    const listViaToken = await SELF.fetch("https://example.com/api/v1/tokens", {
      headers: bearer(created.token),
    });
    expect(listViaToken.status).toBe(401);

    const deleteAccountViaToken = await deleteAccountReq(bearer(created.token));
    expect(deleteAccountViaToken.status).toBe(401);

    // Confirm none of the above actually happened: cookie-authenticated whoami still resolves,
    // and the original token still lists exactly one entry.
    const listRes = await listTokensReq(cookie);
    const { tokens } = (await listRes.json()) as { tokens: unknown[] };
    expect(tokens.length).toBe(1);
  });

  it("a missing/malformed/unknown token with no session cookie is refused 401", async () => {
    const noAuth = await listVehiclesReq({});
    expect(noAuth.status).toBe(401);

    const malformed = await listVehiclesReq({ Authorization: "Basic garbage" });
    expect(malformed.status).toBe(401);

    const unknown = await listVehiclesReq(bearer("odo_this-was-never-issued"));
    expect(unknown.status).toBe(401);
  });

  it("(FR-012 tenant isolation) a token cannot reach another owner's resource", async () => {
    const owner = await createSession();
    const created = await createToken(owner.cookie, { label: "rw", scope: "write" });

    const other = await createSession();
    const otherVehicle = await createVehicleReq({ Cookie: other.cookie });
    const { id: otherVehicleId } = (await otherVehicle.json()) as { id: string };

    const crossRead = await getVehicleReq(bearer(created.token), otherVehicleId);
    const madeUp = await getVehicleReq(bearer(created.token), crypto.randomUUID());
    expect(crossRead.status).toBe(404);
    expect(madeUp.status).toBe(404);
    expect(await crossRead.text()).toBe(await madeUp.text());
  });
});

describe("api tokens — revocation (User Story 2)", () => {
  it("a revoked token is refused on its very next use, identically to a never-issued token (FR-009, SC-004)", async () => {
    const { cookie } = await createSession();
    const created = await createToken(cookie, { label: "to revoke", scope: "read" });

    const before = await listVehiclesReq(bearer(created.token));
    expect(before.status).toBe(200);

    const revokeRes = await revokeTokenReq(cookie, created.id);
    expect(revokeRes.status).toBe(204);

    const after = await listVehiclesReq(bearer(created.token));
    const unknown = await listVehiclesReq(bearer("odo_never-issued"));
    expect(after.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await after.text()).toBe(await unknown.text());
  });

  it("revoking one token leaves an owner's other tokens fully working", async () => {
    const { cookie } = await createSession();
    const keep = await createToken(cookie, { label: "keep", scope: "read" });
    const drop = await createToken(cookie, { label: "drop", scope: "read" });

    await revokeTokenReq(cookie, drop.id);

    const stillWorks = await listVehiclesReq(bearer(keep.token));
    expect(stillWorks.status).toBe(200);
  });

  it("a revoked token's list entry is clearly marked, and revoking is idempotent", async () => {
    const { cookie } = await createSession();
    const created = await createToken(cookie, { label: "to revoke", scope: "read" });

    const first = await revokeTokenReq(cookie, created.id);
    expect(first.status).toBe(204);
    const second = await revokeTokenReq(cookie, created.id);
    expect(second.status).toBe(204);

    const listRes = await listTokensReq(cookie);
    const { tokens } = (await listRes.json()) as {
      tokens: { id: string; revokedAt: string | null }[];
    };
    const entry = tokens.find((token) => token.id === created.id);
    expect(entry?.revokedAt).not.toBeNull();
  });

  it("revoking a nonexistent or another owner's token returns 404", async () => {
    const owner = await createSession();
    const other = await createSession();
    const otherToken = await createToken(other.cookie, { label: "not yours", scope: "read" });

    const crossRevoke = await revokeTokenReq(owner.cookie, otherToken.id);
    const madeUpRevoke = await revokeTokenReq(owner.cookie, crypto.randomUUID());
    expect(crossRevoke.status).toBe(404);
    expect(madeUpRevoke.status).toBe(404);
  });
});

describe("api tokens — last-used visibility (User Story 3)", () => {
  it("lastUsedAt is null before first use, then reflects each successful token-authenticated request", async () => {
    const { cookie } = await createSession();
    const created = await createToken(cookie, { label: "watched", scope: "read" });

    const beforeUse = await listTokensReq(cookie);
    const { tokens: before } = (await beforeUse.json()) as {
      tokens: { id: string; lastUsedAt: string | null }[];
    };
    expect(before.find((t) => t.id === created.id)?.lastUsedAt).toBeNull();

    await listVehiclesReq(bearer(created.token));
    const afterFirst = await listTokensReq(cookie);
    const { tokens: afterFirstUse } = (await afterFirst.json()) as {
      tokens: { id: string; lastUsedAt: string | null }[];
    };
    const firstUsedAt = afterFirstUse.find((t) => t.id === created.id)?.lastUsedAt;
    expect(firstUsedAt).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 5));
    await listVehiclesReq(bearer(created.token));
    const afterSecond = await listTokensReq(cookie);
    const { tokens: afterSecondUse } = (await afterSecond.json()) as {
      tokens: { id: string; lastUsedAt: string | null }[];
    };
    const secondUsedAt = afterSecondUse.find((t) => t.id === created.id)?.lastUsedAt;
    expect(secondUsedAt).not.toBeNull();
    expect(secondUsedAt).not.toBe(firstUsedAt);
  });
});

describe("api tokens — cross-cutting: account deletion removes every token (FR-011, SC-006)", () => {
  it("deleting the account removes its tokens from storage, and their former values stop authenticating", async () => {
    const { cookie } = await createSession();
    const created = await createToken(cookie, { label: "doomed", scope: "read" });

    const deleteRes = await deleteAccountReq({ Cookie: cookie });
    expect(deleteRes.status).toBe(204);

    const row = await env.DB.prepare("SELECT id FROM api_tokens WHERE id = ?").bind(created.id)
      .first();
    expect(row).toBeNull();

    const afterDeletion = await listVehiclesReq(bearer(created.token));
    expect(afterDeletion.status).toBe(401);
  });
});
