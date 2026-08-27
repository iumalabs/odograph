import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { createCredentialedUser, linkOidcIdentity } from "../../src/server/db/repository";
import {
  buildCloudflareConfig,
  CLOUDFLARE_PROVIDER,
  completeCloudflareLink,
  completeCloudflareSignIn,
} from "../../src/server/auth/oidc/cloudflare";
import { FIXTURE_AUDIENCE, fixtureJwks, signFixtureIdToken } from "./fixtures/oidc";

// Mirrors tests/server/oidc-auth.test.ts's full case list one-for-one (analyze finding C1/SC-002 —
// full parity, not a subset) — the only real difference is which config/complete* functions get
// called and the fixture token's issuer, since verification/resolution logic itself is fully
// shared (src/server/auth/oidc/client.ts) between both providers.

const TEST_CONFIG = buildCloudflareConfig("test-team", "test-client-id");
const CLOUDFLARE_ISSUER = TEST_CONFIG.issuers[0]!;

function uniqueSub(label: string): string {
  return `${label}-${crypto.randomUUID()}`;
}

async function signIn(
  overrides: Partial<Parameters<typeof signFixtureIdToken>[0]>,
): ReturnType<typeof completeCloudflareSignIn> {
  const idToken = await signFixtureIdToken({
    sub: uniqueSub("subject"),
    email: `${crypto.randomUUID()}@example.invalid`,
    issuer: CLOUDFLARE_ISSUER,
    ...overrides,
  });
  return completeCloudflareSignIn(env.DB, TEST_CONFIG, idToken, {
    jwks: await fixtureJwks(),
    audience: FIXTURE_AUDIENCE,
  });
}

async function probeTenantId(cookie: string): Promise<string> {
  const res = await SELF.fetch("https://example.com/api/v1/vehicles", {
    method: "POST",
    headers: { Cookie: cookieValue(cookie), "Content-Type": "application/json" },
    body: JSON.stringify({ name: "probe", odometerUnit: "km" }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { tenantId: string };
  return body.tenantId;
}

function cookieValue(setCookie: string): string {
  return setCookie.split(";")[0] ?? "";
}

async function createDevSession(): Promise<{ userId: string; cookie: string }> {
  const res = await SELF.fetch("https://example.com/api/v1/_dev/session", { method: "POST" });
  const body = (await res.json()) as { userId: string };
  return { userId: body.userId, cookie: (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "" };
}

function requestLink(cookie?: string): Promise<Response> {
  return SELF.fetch("https://example.com/api/v1/auth/oidc/cloudflare/link", {
    redirect: "manual",
    headers: cookie ? { Cookie: cookie } : undefined,
  });
}

describe("Cloudflare OIDC lifecycle (User Story 1)", () => {
  it("a fixture ID token for a subject never seen before creates exactly one tenant/user/identity and returns a working session", async () => {
    const result = await signIn({});
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const tenantId = await probeTenantId(result.cookie);
    expect(tenantId).toBeTruthy();
  });

  it("a second call with the same subject resolves to the same tenant, not a new one", async () => {
    const sub = uniqueSub("repeat");
    const email = `${crypto.randomUUID()}@example.invalid`;

    const first = await signIn({ sub, email });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");
    const firstTenantId = await probeTenantId(first.cookie);

    const second = await signIn({ sub, email });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("unreachable");
    const secondTenantId = await probeTenantId(second.cookie);

    expect(secondTenantId).toBe(firstTenantId);
  });

  it("a callback with a state value never issued by /start redirects to /?oidc=error with no cookie", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/v1/auth/oidc/cloudflare/callback?state=never-issued&code=abc",
      { redirect: "manual" },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://example.com/?oidc=error&provider=cloudflare",
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("a callback carrying ?error=access_denied redirects to /?oidc=error before any state lookup", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/v1/auth/oidc/cloudflare/callback?error=access_denied",
      { redirect: "manual" },
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://example.com/?oidc=error&provider=cloudflare",
    );
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("a fixture ID token that fails verification (wrong audience) is rejected with no session issued", async () => {
    const result = await signIn({ audience: "some-other-client-id" });
    expect(result.ok).toBe(false);
  });

  it("a fixture ID token that fails verification (expired) is rejected with no session issued", async () => {
    const result = await signIn({ expiresIn: "-1h" });
    expect(result.ok).toBe(false);
  });

  it("a fixture ID token with email_verified: false still resolves/creates an account like any other", async () => {
    const result = await signIn({ email_verified: false });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const tenantId = await probeTenantId(result.cookie);
    expect(tenantId).toBeTruthy();
  });
});

describe("Cloudflare OIDC cross-method isolation (User Story 1)", () => {
  it("a Cloudflare sign-in for an email already used by a passkey account creates its own distinct account (D-004)", async () => {
    const email = `${crypto.randomUUID()}@example.invalid`;
    const { tenantId: passkeyTenantId } = await createCredentialedUser(env.DB, {
      email,
      credentialId: crypto.randomUUID(),
      publicKey: new Uint8Array([1, 2, 3]),
      counter: 0,
      transports: null,
    });

    const result = await signIn({ email });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const cloudflareTenantId = await probeTenantId(result.cookie);

    expect(cloudflareTenantId).not.toBe(passkeyTenantId);
  });
});

describe("account linking (specs/061 User Story 2)", () => {
  it("an authenticated user links a Cloudflare identity, and the resulting session is for the linking user, not a new tenant", async () => {
    const { userId, cookie } = await createDevSession();
    const idToken = await signFixtureIdToken({
      sub: uniqueSub("link-subject"),
      email: `${crypto.randomUUID()}@example.invalid`,
      issuer: CLOUDFLARE_ISSUER,
    });

    const result = await completeCloudflareLink(env.DB, TEST_CONFIG, idToken, {
      jwks: await fixtureJwks(),
      audience: FIXTURE_AUDIENCE,
      linkingUserId: userId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const linkedTenantId = await probeTenantId(result.cookie);
    const originalTenantId = await probeTenantId(cookie);
    expect(linkedTenantId).toBe(originalTenantId);
  });

  it("rejects linking an identity already linked to a different account", async () => {
    const other = await createDevSession();
    const sub = uniqueSub("already-linked-different");
    await linkOidcIdentity(env.DB, CLOUDFLARE_PROVIDER, sub, other.userId);

    const { userId } = await createDevSession();
    const idToken = await signFixtureIdToken({
      sub,
      email: `${crypto.randomUUID()}@example.invalid`,
      issuer: CLOUDFLARE_ISSUER,
    });

    const result = await completeCloudflareLink(env.DB, TEST_CONFIG, idToken, {
      jwks: await fixtureJwks(),
      audience: FIXTURE_AUDIENCE,
      linkingUserId: userId,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects linking an identity already linked to the caller's own account, same as any other", async () => {
    const { userId } = await createDevSession();
    const sub = uniqueSub("already-linked-own");
    await linkOidcIdentity(env.DB, CLOUDFLARE_PROVIDER, sub, userId);

    const idToken = await signFixtureIdToken({
      sub,
      email: `${crypto.randomUUID()}@example.invalid`,
      issuer: CLOUDFLARE_ISSUER,
    });
    const result = await completeCloudflareLink(env.DB, TEST_CONFIG, idToken, {
      jwks: await fixtureJwks(),
      audience: FIXTURE_AUDIENCE,
      linkingUserId: userId,
    });
    expect(result.ok).toBe(false);
  });

  it("refuses /link without a session, before any state row is created", async () => {
    const res = await requestLink();
    expect(res.status).toBe(401);
  });
});
