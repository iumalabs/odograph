import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  addCredentialToUser,
  deleteUser,
  findCredentialById,
  isUniqueConstraintError,
} from "../../src/server/db/repository";
import {
  AUTH_FIXTURE_CREDENTIAL_ID,
  authFixturePublicKeyAsCose,
  challengeOf,
  FIXTURE_2_ORIGIN,
  FIXTURE_ORIGIN,
  REG_FIXTURE_2_CREDENTIAL_ID,
  REG_FIXTURE_CREDENTIAL_ID,
  seedChallenge,
  tamperedAuthenticationResponse,
  tamperedRegistrationResponse,
  validAuthenticationResponse,
  validRegistrationResponse,
  validRegistrationResponse2,
} from "./fixtures/webauthn";

// D1 storage in @cloudflare/vitest-pool-workers is isolated per test *file*,
// not per `it()` (Cloudflare's own docs). Every test that needs to reach
// real WebAuthn crypto verification therefore (re-)seeds its own fixture's
// exact challenge value immediately before the call — a fixture's challenge
// was never issued by this project's own `/options` endpoint, and a
// previous test may already have consumed the same value. Where a test
// needs a *credential* to already exist, it seeds that directly too
// (idempotently — tolerating "already exists" from another test) rather
// than depending on a specific prior test having run first.

function cookieValue(setCookie: string | null): string {
  if (!setCookie) throw new Error("missing Set-Cookie header");
  return setCookie.split(";")[0] ?? "";
}

async function createDevSession(base: string): Promise<{ userId: string; cookie: string }> {
  const res = await SELF.fetch(`${base}/api/v1/_dev/session`, { method: "POST" });
  const body = (await res.json()) as { userId: string };
  return { userId: body.userId, cookie: cookieValue(res.headers.get("set-cookie")) };
}

async function seedCredentialIdempotently(
  input: Parameters<typeof addCredentialToUser>[1],
): Promise<void> {
  try {
    await addCredentialToUser(env.DB, input);
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
  }
}

describe("passkey registration (User Story 1)", () => {
  it("registers a new account, issues a session, and rejects a replay of the same response (FR-001, FR-002, FR-007)", async () => {
    const optionsRes = await SELF.fetch(`${FIXTURE_ORIGIN}/api/v1/auth/passkey/register/options`, {
      method: "POST",
    });
    expect(optionsRes.status).toBe(200);

    const response = validRegistrationResponse();
    await seedChallenge(env.DB, challengeOf(response), "registration");

    const res = await SELF.fetch(`${FIXTURE_ORIGIN}/api/v1/auth/passkey/register/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response, email: "fixture@example.invalid" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string; tenantId: string };
    expect(body.userId).toBeTruthy();
    expect(body.tenantId).toBeTruthy();

    const cookie = cookieValue(res.headers.get("set-cookie"));
    const probeRes = await SELF.fetch(`${FIXTURE_ORIGIN}/api/v1/vehicles`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "probe", odometerUnit: "km" }),
    });
    expect(probeRes.status).toBe(201);
    const probeBody = (await probeRes.json()) as { tenantId: string };
    expect(probeBody.tenantId).toBe(body.tenantId);

    // Replay: the exact same response again — its challenge was already
    // consumed above, so this must fail before ever reaching the
    // duplicate-credential check.
    const replayRes = await SELF.fetch(`${FIXTURE_ORIGIN}/api/v1/auth/passkey/register/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response, email: "fixture@example.invalid" }),
    });
    expect(replayRes.status).toBe(400);
  });

  it("rejects duplicate credential registration independently of replay (FR-006)", async () => {
    const { userId } = await createDevSession(FIXTURE_ORIGIN);
    await seedCredentialIdempotently({
      userId,
      credentialId: REG_FIXTURE_CREDENTIAL_ID,
      publicKey: new Uint8Array([1, 2, 3]),
      counter: 0,
      transports: null,
    });

    const response = validRegistrationResponse();
    await seedChallenge(env.DB, challengeOf(response), "registration");

    const res = await SELF.fetch(`${FIXTURE_ORIGIN}/api/v1/auth/passkey/register/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response, email: "duplicate@example.invalid" }),
    });
    expect(res.status).toBe(409);
  });

  it("rejects a tampered response and creates nothing (FR-008, FR-010)", async () => {
    const response = tamperedRegistrationResponse();
    await seedChallenge(env.DB, challengeOf(response), "registration");

    const res = await SELF.fetch(`${FIXTURE_ORIGIN}/api/v1/auth/passkey/register/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response, email: "tampered@example.invalid" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown/stale challenge before writing any row", async () => {
    // Deliberately not seeded — same observable failure as an expired one.
    const res = await SELF.fetch(`${FIXTURE_ORIGIN}/api/v1/auth/passkey/register/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        response: validRegistrationResponse(),
        email: "stale@example.invalid",
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("passkey login (User Story 2)", () => {
  async function seedLoginCredential(): Promise<string> {
    const { userId } = await createDevSession(FIXTURE_ORIGIN);
    const publicKey = await authFixturePublicKeyAsCose();
    await seedCredentialIdempotently({
      userId,
      credentialId: AUTH_FIXTURE_CREDENTIAL_ID,
      publicKey,
      counter: 0,
      transports: null,
    });
    return userId;
  }

  it("resolves login to the credential's existing tenant, not a new one (FR-003)", async () => {
    const userId = await seedLoginCredential();

    const optionsRes = await SELF.fetch(`${FIXTURE_ORIGIN}/api/v1/auth/passkey/login/options`, {
      method: "POST",
    });
    expect(optionsRes.status).toBe(200);

    const response = validAuthenticationResponse();
    await seedChallenge(env.DB, challengeOf(response), "authentication");

    const res = await SELF.fetch(`${FIXTURE_ORIGIN}/api/v1/auth/passkey/login/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { userId: string };
    expect(body.userId).toBe(userId);
  });

  it("rejects a response for an unregistered credential (FR-004, SC-003)", async () => {
    // No credential seeded under this id in this test.
    const response = validAuthenticationResponse();
    await seedChallenge(env.DB, challengeOf(response), "authentication");

    const res = await SELF.fetch(`${FIXTURE_ORIGIN}/api/v1/auth/passkey/login/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...response, id: "never-registered-credential-id" }),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    // Same shape/error code as a registered-but-invalid response below — a
    // client can't distinguish the two cases (SC-003).
    expect(body.error).toBe("unauthorized");
  });

  it("rejects a tampered response (FR-008) with the same shape as an unregistered credential", async () => {
    await seedLoginCredential();
    const response = tamperedAuthenticationResponse();
    await seedChallenge(env.DB, challengeOf(response), "authentication");

    const res = await SELF.fetch(`${FIXTURE_ORIGIN}/api/v1/auth/passkey/login/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unauthorized");
  });

  it("rejects a stale/already-consumed challenge before crypto verification runs (SC-004)", async () => {
    await seedLoginCredential();
    // Deliberately not (re-)seeded.
    const res = await SELF.fetch(`${FIXTURE_ORIGIN}/api/v1/auth/passkey/login/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validAuthenticationResponse()),
    });
    expect(res.status).toBe(401);
  });
});

describe("passkey add — second credential (User Story 3)", () => {
  it("lets an authenticated user register a second passkey", async () => {
    const { userId, cookie } = await createDevSession(FIXTURE_2_ORIGIN);

    const optionsRes = await SELF.fetch(`${FIXTURE_2_ORIGIN}/api/v1/auth/passkey/add/options`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(optionsRes.status).toBe(200);

    const response = validRegistrationResponse2();
    await seedChallenge(env.DB, challengeOf(response), "registration");

    const verifyRes = await SELF.fetch(`${FIXTURE_2_ORIGIN}/api/v1/auth/passkey/add/verify`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ response }),
    });
    expect(verifyRes.status).toBe(200);
    const body = (await verifyRes.json()) as { credentialId: string };
    expect(body.credentialId).toBe(REG_FIXTURE_2_CREDENTIAL_ID);

    const stored = await findCredentialById(env.DB, REG_FIXTURE_2_CREDENTIAL_ID);
    expect(stored?.userId).toBe(userId);
  });

  it("rejects adding a credential already registered to any account (FR-006, 409)", async () => {
    const owner = await createDevSession(FIXTURE_2_ORIGIN);
    await seedCredentialIdempotently({
      userId: owner.userId,
      credentialId: REG_FIXTURE_2_CREDENTIAL_ID,
      publicKey: new Uint8Array([1]),
      counter: 0,
      transports: null,
    });

    const other = await createDevSession(FIXTURE_2_ORIGIN);
    const response = validRegistrationResponse2();
    await seedChallenge(env.DB, challengeOf(response), "registration");

    const res = await SELF.fetch(`${FIXTURE_2_ORIGIN}/api/v1/auth/passkey/add/verify`, {
      method: "POST",
      headers: { Cookie: other.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ response }),
    });
    expect(res.status).toBe(409);
  });
});

describe("webauthn_credentials cascade-deletes with its user", () => {
  it("removes credentials when the owning user is hard-deleted", async () => {
    const { userId } = await createDevSession(FIXTURE_ORIGIN);
    const credentialId = crypto.randomUUID();
    await addCredentialToUser(env.DB, {
      userId,
      credentialId,
      publicKey: new Uint8Array([1, 2, 3]),
      counter: 0,
      transports: null,
    });
    expect(await findCredentialById(env.DB, credentialId)).not.toBeNull();

    await deleteUser(env.DB, userId);

    expect(await findCredentialById(env.DB, credentialId)).toBeNull();
  });
});
