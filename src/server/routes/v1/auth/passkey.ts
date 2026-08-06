import { Hono } from "hono";
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import {
  addCredentialToUser,
  createCredentialedUser,
  findCredentialById,
  isUniqueConstraintError,
  updateCredentialCounter,
} from "../../../db/repository";
import {
  createAuthenticationOptions,
  createRegistrationOptions,
  verifyAuthentication,
  verifyRegistration,
} from "../../../auth/passkey";
import { issueSession } from "../../../auth/session";
import { rateLimitByIp, rateLimitBySession } from "../../../auth/rate-limit";
import { tenantContext } from "../../../middleware/tenant-context";
import type { AppEnv } from "../../../types";

export const passkeyAuth = new Hono<AppEnv>();

// --- Registration (User Story 1) --------------------------------------------

passkeyAuth.post("/register/options", rateLimitByIp, async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const email = typeof body.email === "string"
    ? body.email
    : `${crypto.randomUUID()}@example.invalid`;
  const options = await createRegistrationOptions(c.env.DB, c.req.url, email);
  return c.json(options);
});

passkeyAuth.post("/register/verify", rateLimitByIp, async (c) => {
  const body = await c.req.json().catch(() => null) as
    | { response: RegistrationResponseJSON; email: string }
    | null;
  if (!body?.response || typeof body.email !== "string") {
    return c.json({ error: "invalid_request" }, 400);
  }

  const result = await verifyRegistration(c.env.DB, c.req.url, body.response);
  if (!result.verified) {
    // debug is TEMPORARY (issue #46) — remove once root-caused.
    return c.json({ error: "verification_failed", debug: result.debug }, 400);
  }

  try {
    const { tenantId, userId } = await createCredentialedUser(c.env.DB, {
      email: body.email,
      credentialId: result.credentialId,
      publicKey: result.publicKey,
      counter: result.counter,
      transports: result.transports,
    });
    const { cookie } = await issueSession(c.env.DB, userId);
    c.header("Set-Cookie", cookie);
    return c.json({ userId, tenantId });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return c.json({ error: "credential_already_registered" }, 409);
    }
    throw error;
  }
});

// --- Login (User Story 2) ---------------------------------------------------

passkeyAuth.post("/login/options", rateLimitByIp, async (c) => {
  const options = await createAuthenticationOptions(c.env.DB, c.req.url);
  return c.json(options);
});

passkeyAuth.post("/login/verify", rateLimitByIp, async (c) => {
  const body = await c.req.json().catch(() => null) as AuthenticationResponseJSON | null;
  if (!body?.id) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const credential = await findCredentialById(c.env.DB, body.id);
  if (!credential) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const result = await verifyAuthentication(c.env.DB, c.req.url, body, {
    id: credential.id,
    publicKey: credential.publicKey as Uint8Array<ArrayBuffer>,
    counter: credential.counter,
    transports: (credential.transports ?? undefined) as AuthenticatorTransportFuture[] | undefined,
  });
  if (!result.verified) {
    // debug is TEMPORARY (issue #46) — remove once root-caused.
    return c.json({ error: "unauthorized", debug: result.debug }, 401);
  }

  await updateCredentialCounter(c.env.DB, credential.id, result.newCounter);
  const { cookie } = await issueSession(c.env.DB, credential.userId);
  c.header("Set-Cookie", cookie);
  return c.json({ userId: credential.userId });
});

// --- Add a second passkey (User Story 3) ------------------------------------

passkeyAuth.post("/add/options", tenantContext, rateLimitBySession, async (c) => {
  const options = await createRegistrationOptions(c.env.DB, c.req.url, c.get("tenant").userId);
  return c.json(options);
});

passkeyAuth.post("/add/verify", tenantContext, rateLimitBySession, async (c) => {
  const body = await c.req.json().catch(() => null) as
    | { response: RegistrationResponseJSON }
    | null;
  if (!body?.response) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const result = await verifyRegistration(c.env.DB, c.req.url, body.response);
  if (!result.verified) {
    // debug is TEMPORARY (issue #46) — remove once root-caused.
    return c.json({ error: "verification_failed", debug: result.debug }, 400);
  }

  try {
    await addCredentialToUser(c.env.DB, {
      userId: c.get("tenant").userId,
      credentialId: result.credentialId,
      publicKey: result.publicKey,
      counter: result.counter,
      transports: result.transports,
    });
    return c.json({ credentialId: result.credentialId });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return c.json({ error: "credential_already_registered" }, 409);
    }
    throw error;
  }
});
