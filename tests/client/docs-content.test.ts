import { describe, expect, it } from "vitest";
import { en, ru } from "../../src/client/docs-content";
import type { DocBlock, DocSection } from "../../src/client/docs-content";

// Mechanical enforcement of issue #267 (Help/Documentation content silently staying English when
// RU is selected) — mirrors tests/client/i18n.test.ts's role for strings.ts: a structural parity
// check catches a missing/mismatched section or block the same way a missing key would, without
// needing to compare the actual translated prose.

function blockShape(block: DocBlock): string {
  if (block.kind === "list") return `list(${block.items.length})`;
  return block.kind;
}

function sectionShape(section: DocSection): string {
  return `${section.id}:${section.blocks.map(blockShape).join(",")}`;
}

describe("ru docs-content coverage (issue #267)", () => {
  it("has the same sections, in the same order, as en", () => {
    expect(ru.map((s) => s.id)).toEqual(en.map((s) => s.id));
  });

  it("every section has the same block sequence (kind + list-item count) as its en counterpart", () => {
    expect(ru.map(sectionShape)).toEqual(en.map(sectionShape));
  });

  it("no section's lead paragraph is left identical to the English original (a real translation, not a copy)", () => {
    // Section *titles* aren't checked here — a one-or-two-word technical term (e.g.
    // "Self-hosting") can legitimately stay identical across languages, same precedent as
    // strings.ts keeping brand/technical terms like "Google" unchanged in `ru`. A full-sentence
    // lead paragraph accidentally matching verbatim is the real signal of a forgotten section.
    for (let i = 0; i < en.length; i++) {
      const enSection = en[i]!;
      const ruSection = ru[i]!;
      expect(ruSection.lead, `section "${enSection.id}" lead`).not.toBe(enSection.lead);
    }
  });
});
