import { renderEmailHtml, renderEmailText } from "../email/template";
import type { EmailContent } from "../email/template";

// odograph.dev was never onboarded in Cloudflare's Email Sending product (distinct from Email
// Routing, which is enabled for the zone but doesn't cover outbound send) — every email from this
// address has silently failed to send. Cloudflare Email Sending is configured per exact domain,
// not inherited by subdomains — auth@odograph.iuma.dev 502'd until odograph.iuma.dev was
// onboarded there as its own domain, separately from the parent iuma.dev zone (issue #223).
const FROM_ADDRESS = "auth@odograph.iuma.dev";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Deliberately permissive syntactic check — not a deliverability check. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// A magic-link email's verify link and INSTANCE field must never trust the incoming request's own
// hostname in production — during the odograph.dev → odograph.iuma.dev migration, both domains
// briefly routed to this same Worker in parallel (wrangler.toml's env.production comment), so a
// request submitted from the old domain produced an email pointing back at it (production
// incident, 2026-08-26, reported by the user directly). odograph.dev has since been removed from
// Cloudflare's custom domains entirely, but pinning to the one real production origin stays
// correct defense-in-depth regardless — nothing about `requestUrl` should ever be trusted as the
// canonical domain for a security-sensitive email. Preview/development keep using the request's
// own origin unchanged: preview's URL is a different, dynamic one per PR (env.preview has no fixed
// custom domain at all), so there is no fixed canonical origin to pin there, and pinning would
// break every preview/local magic-link test.
const CANONICAL_PRODUCTION_ORIGIN = "https://odograph.iuma.dev";

function canonicalOrigin(env: Env, requestUrl: string): string {
  return env.ENVIRONMENT === "production" ? CANONICAL_PRODUCTION_ORIGIN : requestUrl;
}

function buildVerifyUrl(origin: string, token: string): string {
  const url = new URL("/api/v1/auth/magic-link/verify", origin);
  url.searchParams.set("token", token);
  return url.toString();
}

export type SendMagicLinkResult = { sent: true } | { sent: false; error: string };

export type MagicLinkEmailPurpose = "new-account" | "sign-in" | "link";

const SUBJECTS: Record<MagicLinkEmailPurpose, string> = {
  "new-account": "Welcome to Odograph — finish creating your account",
  "sign-in": "Your Odograph sign-in link",
  "link": "Confirm linking this email to your Odograph account",
};

const PURPOSE_TAGS: Record<MagicLinkEmailPurpose, string> = {
  "new-account": "NEW ACCOUNT",
  "sign-in": "SIGN-IN LINK",
  "link": "CONFIRM EMAIL",
};

const HEADLINES: Record<MagicLinkEmailPurpose, string> = {
  "new-account": "Create your account",
  "sign-in": "Sign in to odograph",
  "link": "Confirm this email address",
};

const BODY_TEXTS: Record<MagicLinkEmailPurpose, string> = {
  "new-account": "Click below to finish creating your odograph account.",
  "sign-in": "Click below to sign in to your odograph account.",
  "link": "Click below to confirm linking this email address to your odograph account.",
};

const CTA_LABELS: Record<MagicLinkEmailPurpose, string> = {
  "new-account": "Create account",
  "sign-in": "Sign in",
  "link": "Confirm email",
};

/**
 * Sends the actual email. Always attempts to send regardless of whether the
 * account is new — only the copy differs (FR-006's response-parity
 * requirement is about the HTTP response, not the email content, which the
 * recipient — and only the recipient — necessarily sees differently).
 *
 * `purpose` has a third value, "link" (specs/005, analyze finding M1), so a
 * linking email never misleadingly claims to be a signup or plain sign-in
 * email — a recipient (who may not be the person who submitted the request)
 * needs accurate copy to decide whether to click it.
 */
export async function sendMagicLinkEmail(
  env: Env,
  input: { email: string; token: string; requestUrl: string; purpose: MagicLinkEmailPurpose },
): Promise<SendMagicLinkResult> {
  const origin = canonicalOrigin(env, input.requestUrl);
  const verifyUrl = buildVerifyUrl(origin, input.token);
  const subject = SUBJECTS[input.purpose];

  const content: EmailContent = {
    purposeTag: PURPOSE_TAGS[input.purpose],
    headline: HEADLINES[input.purpose],
    bodyText: BODY_TEXTS[input.purpose],
    ctaLabel: CTA_LABELS[input.purpose],
    ctaUrl: verifyUrl,
    expiryNote: "EXPIRES IN 15 MINUTES — single use, then this link stops working.",
    details: [
      { label: "ACCOUNT", value: input.email },
      { label: "INSTANCE", value: new URL(origin).hostname },
    ],
    fallbackNote: "Didn't request this? Safe to ignore — no account changes were made.",
  };

  try {
    await env.EMAIL.send({
      to: input.email,
      from: FROM_ADDRESS,
      subject,
      text: renderEmailText(content),
      html: renderEmailHtml(content),
    });
    return { sent: true };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : "unknown_error" };
  }
}
