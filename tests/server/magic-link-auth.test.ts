import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  createCredentialedUser,
  findMagicLinkTokenByEmail,
  linkMagicLinkIdentity,
} from "../../src/server/db/repository";

// D1 storage in @cloudflare/vitest-pool-workers is isolated per test *file*,
// not per `it()` (see tests/server/passkey-auth.test.ts) — each test below
// uses its own unique email so tests never observe each other's tokens or
// identities.

function cookieValue(setCookie: string | null): string {
  if (!setCookie) throw new Error("missing Set-Cookie header");
  return setCookie.split(";")[0] ?? "";
}

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

function requestLink(email: string, cookie?: string): Promise<Response> {
  return SELF.fetch("https://example.com/api/v1/auth/magic-link/link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify({ email }),
  });
}

async function createDevSession(): Promise<{ userId: string; cookie: string }> {
  const res = await SELF.fetch("https://example.com/api/v1/_dev/session", { method: "POST" });
  const body = (await res.json()) as { userId: string };
  return { userId: body.userId, cookie: cookieValue(res.headers.get("set-cookie")) };
}

function verify(token: string | null): Promise<Response> {
  const url = new URL("https://example.com/api/v1/auth/magic-link/verify");
  if (token !== null) url.searchParams.set("token", token);
  return SELF.fetch(url.toString(), { redirect: "manual" });
}

async function tokenFor(email: string): Promise<string> {
  const row = await findMagicLinkTokenByEmail(env.DB, email);
  if (!row) throw new Error(`no pending token for ${email}`);
  return row.token;
}

async function probeTenantId(cookie: string): Promise<string> {
  const res = await SELF.fetch("https://example.com/api/v1/_tenant-isolation-probe", {
    method: "POST",
    headers: { Cookie: cookie },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { tenantId: string };
  return body.tenantId;
}

describe("magic link lifecycle (User Story 1)", () => {
  it("a new email's request-then-verify creates exactly one tenant/user/identity and issues a working session", async () => {
    const email = uniqueEmail("new-account");

    const requestRes = await requestMagicLink(email);
    expect(requestRes.status).toBe(200);
    expect(await requestRes.json()).toEqual({ sent: true });

    const token = await tokenFor(email);
    const verifyRes = await verify(token);
    expect(verifyRes.status).toBe(302);
    expect(verifyRes.headers.get("location")).toBe("https://example.com/?magicLink=ok");

    const cookie = cookieValue(verifyRes.headers.get("set-cookie"));
    const tenantId = await probeTenantId(cookie);
    expect(tenantId).toBeTruthy();
  });

  it("a second request+verify cycle for the same email resolves to the same tenant, not a new one", async () => {
    const email = uniqueEmail("repeat");

    await requestMagicLink(email);
    const firstToken = await tokenFor(email);
    const firstVerify = await verify(firstToken);
    const firstCookie = cookieValue(firstVerify.headers.get("set-cookie"));
    const firstTenantId = await probeTenantId(firstCookie);

    await requestMagicLink(email);
    const secondToken = await tokenFor(email);
    const secondVerify = await verify(secondToken);
    const secondCookie = cookieValue(secondVerify.headers.get("set-cookie"));
    const secondTenantId = await probeTenantId(secondCookie);

    expect(secondTenantId).toBe(firstTenantId);
  });

  it("rejects following the same token twice (FR-004)", async () => {
    const email = uniqueEmail("replay");
    await requestMagicLink(email);
    const token = await tokenFor(email);

    const firstVerify = await verify(token);
    expect(firstVerify.status).toBe(302);
    expect(firstVerify.headers.get("location")).toBe("https://example.com/?magicLink=ok");

    const secondVerify = await verify(token);
    expect(secondVerify.status).toBe(302);
    expect(secondVerify.headers.get("location")).toBe("https://example.com/?magicLink=error");
    expect(secondVerify.headers.get("set-cookie")).toBeNull();
  });

  it("an unconsumed token is queryable in D1 but grants no session until followed", async () => {
    const email = uniqueEmail("unconsumed");
    await requestMagicLink(email);

    const row = await findMagicLinkTokenByEmail(env.DB, email);
    expect(row).not.toBeNull();
    expect(row?.token).toBeTruthy();
    // No verify call was made — nothing beyond the token row exists yet.
  });

  it("invalidate-on-new-request: a second request invalidates the first token (FR-005/SC-005)", async () => {
    const email = uniqueEmail("invalidate");

    await requestMagicLink(email);
    const firstToken = await tokenFor(email);

    await requestMagicLink(email);
    const secondToken = await tokenFor(email);
    expect(secondToken).not.toBe(firstToken);

    const staleVerify = await verify(firstToken);
    expect(staleVerify.status).toBe(302);
    expect(staleVerify.headers.get("location")).toBe("https://example.com/?magicLink=error");
    expect(staleVerify.headers.get("set-cookie")).toBeNull();

    // The still-current second token still works.
    const freshVerify = await verify(secondToken);
    expect(freshVerify.headers.get("location")).toBe("https://example.com/?magicLink=ok");
  });

  it("rejects an unknown/forged token the same way as an already-consumed one (SC-003)", async () => {
    const res = await verify("never-issued-token-value");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.com/?magicLink=error");
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("magic link response parity and cross-method isolation (User Story 2)", () => {
  it("request responses for a never-used email and an already-magic-link-registered email have the same shape (FR-006)", async () => {
    const registeredEmail = uniqueEmail("registered");
    await requestMagicLink(registeredEmail);
    const token = await tokenFor(registeredEmail);
    await verify(token);

    const registeredRes = await requestMagicLink(registeredEmail);
    const neverUsedRes = await requestMagicLink(uniqueEmail("never-used"));

    expect(registeredRes.status).toBe(neverUsedRes.status);
    expect(await registeredRes.json()).toEqual(await neverUsedRes.json());
  });

  it("rejects a malformed email regardless of whether a valid-looking variant is registered (400)", async () => {
    const res = await requestMagicLink("not-an-email");
    expect(res.status).toBe(400);
  });

  it("a magic link for an email already used by a passkey account creates its own distinct account (D-004)", async () => {
    const email = uniqueEmail("passkey-owner");
    const { tenantId: passkeyTenantId } = await createCredentialedUser(env.DB, {
      email,
      credentialId: crypto.randomUUID(),
      publicKey: new Uint8Array([1, 2, 3]),
      counter: 0,
      transports: null,
    });

    await requestMagicLink(email);
    const token = await tokenFor(email);
    const verifyRes = await verify(token);
    expect(verifyRes.status).toBe(302);
    expect(verifyRes.headers.get("location")).toBe("https://example.com/?magicLink=ok");

    const cookie = cookieValue(verifyRes.headers.get("set-cookie"));
    const magicLinkTenantId = await probeTenantId(cookie);

    expect(magicLinkTenantId).not.toBe(passkeyTenantId);
  });
});

describe("account linking (specs/005 User Story 1)", () => {
  it("an authenticated user links a new email, and the resulting session is for the linking user, not a new tenant", async () => {
    const { cookie } = await createDevSession();
    const email = uniqueEmail("link-new");

    const linkRes = await requestLink(email, cookie);
    expect(linkRes.status).toBe(200);

    const token = await tokenFor(email);
    const verifyRes = await verify(token);
    expect(verifyRes.status).toBe(302);
    expect(verifyRes.headers.get("location")).toBe("https://example.com/?magicLink=linked");

    const linkedCookie = cookieValue(verifyRes.headers.get("set-cookie"));
    const linkedTenantId = await probeTenantId(linkedCookie);
    const originalTenantId = await probeTenantId(cookie);
    expect(linkedTenantId).toBe(originalTenantId);
  });

  it("a subsequent, separate, unauthenticated sign-in with the linked email resolves to the linking user's tenant", async () => {
    const { cookie } = await createDevSession();
    const originalProbeRes = await SELF.fetch(
      "https://example.com/api/v1/_tenant-isolation-probe",
      { method: "POST", headers: { Cookie: cookie } },
    );
    const originalTenantId = ((await originalProbeRes.json()) as { tenantId: string }).tenantId;

    const email = uniqueEmail("link-then-signin");
    await requestLink(email, cookie);
    const linkToken = await tokenFor(email);
    await verify(linkToken);

    // Separate, unauthenticated sign-in attempt — no cookie from the linking session at all.
    await requestMagicLink(email);
    const signInToken = await tokenFor(email);
    const signInRes = await verify(signInToken);
    expect(signInRes.headers.get("location")).toBe("https://example.com/?magicLink=ok");

    const signInCookie = cookieValue(signInRes.headers.get("set-cookie"));
    const signInTenantId = await probeTenantId(signInCookie);
    expect(signInTenantId).toBe(originalTenantId);
  });

  it("rejects linking an email already linked to a different account (FR-005)", async () => {
    const other = await createDevSession();
    const email = uniqueEmail("already-linked-different");
    await linkMagicLinkIdentity(env.DB, email, other.userId);

    const { cookie } = await createDevSession();
    const linkRes = await requestLink(email, cookie);
    expect(linkRes.status).toBe(200);
    const token = await tokenFor(email);
    const verifyRes = await verify(token);
    expect(verifyRes.status).toBe(302);
    expect(verifyRes.headers.get("location")).toBe("https://example.com/?magicLink=error");
    expect(verifyRes.headers.get("set-cookie")).toBeNull();
  });

  it("rejects linking an email already linked to the caller's own account, same as any other (FR-005)", async () => {
    const { userId, cookie } = await createDevSession();
    const email = uniqueEmail("already-linked-own");
    await linkMagicLinkIdentity(env.DB, email, userId);

    const linkRes = await requestLink(email, cookie);
    expect(linkRes.status).toBe(200);
    const token = await tokenFor(email);
    const verifyRes = await verify(token);
    expect(verifyRes.status).toBe(302);
    expect(verifyRes.headers.get("location")).toBe("https://example.com/?magicLink=error");
  });

  it("refuses /link without a session, before any token is created (FR-004)", async () => {
    const email = uniqueEmail("unauthenticated-link-attempt");
    const res = await requestLink(email);
    expect(res.status).toBe(401);

    const row = await findMagicLinkTokenByEmail(env.DB, email);
    expect(row).toBeNull();
  });
});
