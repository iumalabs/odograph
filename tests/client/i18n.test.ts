import { describe, expect, it } from "vitest";
import { locales } from "../../src/client/i18n/strings";

// research.md Decision 6: mechanical enforcement of SC-001 ("no screen silently stays in
// English after switching to Russian") — a partial translation table is a worse failure mode
// than not shipping the toggle at all, since a user who explicitly chose Russian can't tell a
// missing translation from an intentional English string.

function placeholderNames(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!).sort();
}

describe("ru locale coverage", () => {
  it("has exactly the same keys as en — no key left untranslated", () => {
    const enKeys = Object.keys(locales.en).sort();
    const ruKeys = Object.keys(locales.ru).sort();
    expect(ruKeys).toEqual(enKeys);
  });

  it("preserves every {param} placeholder name in each translated string", () => {
    for (const key of Object.keys(locales.en) as (keyof typeof locales.en)[]) {
      const enPlaceholders = placeholderNames(locales.en[key]);
      const ruPlaceholders = placeholderNames(locales.ru[key]);
      expect(ruPlaceholders, `key "${key}"`).toEqual(enPlaceholders);
    }
  });
});
