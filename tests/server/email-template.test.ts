import { describe, expect, it } from "vitest";
import {
  type EmailContent,
  renderEmailHtml,
  renderEmailText,
} from "../../src/server/email/template";

const MAGIC_LINK_CASES: Array<{ purpose: string; content: EmailContent }> = [
  {
    purpose: "new-account",
    content: {
      purposeTag: "NEW ACCOUNT",
      headline: "Create your account",
      bodyText: "Click below to finish creating your odograph account.",
      ctaLabel: "Create account",
      ctaUrl: "https://odograph.iuma.dev/api/v1/auth/magic-link/verify?token=abc",
      expiryNote: "EXPIRES IN 15 MINUTES — single use, then this link stops working.",
      details: [
        { label: "ACCOUNT", value: "new@example.com" },
        { label: "INSTANCE", value: "odograph.iuma.dev" },
      ],
      fallbackNote: "Didn't request this? Safe to ignore — no account changes were made.",
    },
  },
  {
    purpose: "sign-in",
    content: {
      purposeTag: "SIGN-IN LINK",
      headline: "Sign in to odograph",
      bodyText: "Click below to sign in to your odograph account.",
      ctaLabel: "Sign in",
      ctaUrl: "https://odograph.iuma.dev/api/v1/auth/magic-link/verify?token=def",
      expiryNote: "EXPIRES IN 15 MINUTES — single use, then this link stops working.",
      details: [
        { label: "ACCOUNT", value: "existing@example.com" },
        { label: "INSTANCE", value: "odograph.iuma.dev" },
      ],
      fallbackNote: "Didn't request this? Safe to ignore — no account changes were made.",
    },
  },
  {
    purpose: "link",
    content: {
      purposeTag: "CONFIRM EMAIL",
      headline: "Confirm this email address",
      bodyText: "Click below to confirm linking this email address to your odograph account.",
      ctaLabel: "Confirm email",
      ctaUrl: "https://odograph.iuma.dev/api/v1/auth/magic-link/verify?token=ghi",
      expiryNote: "EXPIRES IN 15 MINUTES — single use, then this link stops working.",
      details: [
        { label: "ACCOUNT", value: "second@example.com" },
        { label: "INSTANCE", value: "odograph.iuma.dev" },
      ],
      fallbackNote: "Didn't request this? Safe to ignore — no account changes were made.",
    },
  },
];

const NEW_ACCOUNT_CASE = MAGIC_LINK_CASES[0]!.content;

const REMINDER_CASE: EmailContent = {
  purposeTag: "REMINDER",
  headline: "Oil change is overdue",
  bodyText: 'Your reminder "Oil change" for Civic is overdue.',
  ctaLabel: null,
  ctaUrl: null,
  expiryNote: null,
  details: [],
  fallbackNote: null,
};

describe("renderEmailHtml / renderEmailText (specs/055-transactional-email-template)", () => {
  for (const { purpose, content } of MAGIC_LINK_CASES) {
    it(`renders a non-empty html and text body containing the CTA url for the ${purpose} purpose (FR-004)`, () => {
      const html = renderEmailHtml(content);
      const text = renderEmailText(content);
      expect(html.length).toBeGreaterThan(0);
      expect(text.length).toBeGreaterThan(0);
      expect(html).toContain(content.ctaUrl);
      expect(text).toContain(content.ctaUrl);
    });

    it(`includes the expiry note text for the ${purpose} purpose (FR-005)`, () => {
      const html = renderEmailHtml(content);
      const text = renderEmailText(content);
      expect(html).toContain(content.expiryNote);
      expect(text).toContain(content.expiryNote);
    });

    it(`includes the fallback note text for the ${purpose} purpose (FR-006)`, () => {
      const html = renderEmailHtml(content);
      const text = renderEmailText(content);
      expect(html).toContain(content.fallbackNote);
      expect(text).toContain(content.fallbackNote);
    });
  }

  it("renders no button markup at all when ctaLabel/ctaUrl are null", () => {
    const html = renderEmailHtml(REMINDER_CASE);
    expect(html).not.toContain("<a href=");
  });

  it("never renders a fabricated placeholder for a details row that's absent (Principle IV)", () => {
    const withoutInstance: EmailContent = {
      ...NEW_ACCOUNT_CASE,
      details: [{ label: "ACCOUNT", value: "solo@example.com" }],
    };
    const html = renderEmailHtml(withoutInstance);
    expect(html).toContain("ACCOUNT");
    expect(html).not.toContain("INSTANCE");
  });

  it('contains exactly one <style> block and no <link rel="stylesheet"> (FR-002/FR-009)', () => {
    const html = renderEmailHtml(NEW_ACCOUNT_CASE);
    const styleBlockCount = (html.match(/<style[ >]/g) ?? []).length;
    expect(styleBlockCount).toBe(1);
    expect(html).not.toContain('rel="stylesheet"');
  });

  it("still renders a well-formed, non-empty layout with the <style> block stripped (FR-002 fallback)", () => {
    const html = renderEmailHtml(NEW_ACCOUNT_CASE);
    const stripped = html.replace(/<style>[\s\S]*?<\/style>/, "");
    expect(stripped.length).toBeGreaterThan(0);
    expect(stripped).toContain("<body");
    expect(stripped).toContain(NEW_ACCOUNT_CASE.ctaUrl);
    expect(stripped).toContain(NEW_ACCOUNT_CASE.headline);
  });

  it("renders the reminder-shaped content (no CTA, no expiry, no details, no fallback note) with none of those optional sections present", () => {
    const html = renderEmailHtml(REMINDER_CASE);
    const text = renderEmailText(REMINDER_CASE);
    expect(html).toContain("REMINDER");
    expect(text).toContain(REMINDER_CASE.bodyText);
    expect(html).not.toContain("<a href=");
    expect(html).not.toContain("REQUEST DETAILS");
    expect(html).not.toContain("Button not working?");
    // Still has the shared header/footer chrome.
    expect(html).toContain("odograph");
  });
});
