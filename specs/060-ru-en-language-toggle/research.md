# Research: RU/EN Language Toggle

## Decision 1: Reactivity mechanism — `useSyncExternalStore` over a module-level store,
matching `src/client/offline/queue.ts`'s existing pattern exactly

**Decision**: Add a module-level store inside `src/client/i18n/strings.ts` (or a sibling
`language.ts`): a mutable `activeLocale` variable, a `listeners` `Set<() => void>`, a
`subscribe(listener)` that adds/returns-a-remover, and `getSnapshot()` returning the current
locale string. `setLanguage(lang)` writes `localStorage`, mutates `activeLocale`, then calls
every listener. `useLanguage()` is `useSyncExternalStore(subscribe, getSnapshot)` paired with
`setLanguage`, returned as `[language, setLanguage]` — the same shape as `theme.ts`'s
`useTheme()`. `t()` stays exactly what it is today: a plain synchronous function reading the
module-level `activeLocale`, callable from anywhere (including outside components, e.g.
non-component helper functions) with no Provider/Context plumbing.

**Rationale**: `src/client/offline/queue.ts` already establishes this exact
subscribe/getSnapshot/`useSyncExternalStore` pattern for exactly this kind of module-level,
outside-React state (its own code comment explains why: `getSnapshot()` must return a
referentially-stable value between notifications, which a plain string trivially satisfies —
primitives compare by value, so no cached-object indirection is even needed here, unlike
`queue.ts`'s object snapshot). Reusing an established in-codebase pattern beats introducing a
second, different way to do the same thing. Separately, `grep -rL "React.memo" src/client`
confirms no component in this codebase uses `React.memo`, so a single `useLanguage()` call
near `App.tsx`'s root causes the entire (un-memoized) tree to re-render on language change —
every already-rendered `t()` call re-evaluates automatically, with no missed subscriber and no
manual "which components need this" bookkeeping.

**Alternatives considered**:
- **React Context provider wrapping the whole tree**: would require every one of the ~40+
  existing call sites that `import { t } from "..."` and call it directly (many outside
  component bodies — e.g. in helper functions) to switch to `useContext`, a much larger and
  riskier diff for equivalent runtime behavior. Rejected — no functional benefit over pub-sub
  here, since the codebase's lack of `React.memo` already gives pub-sub the same
  whole-tree-refresh guarantee Context would provide.
- **Global state library (Zustand/Jotai)**: new dependency for a single boolean-ish piece of
  state; the codebase already has an established, working precedent (`theme.ts`) for exactly
  this shape of preference. Rejected as unnecessary.

## Decision 2: Persistence — `localStorage`, mirroring `theme.ts`

**Decision**: `localStorage` key `odograph:language`, values `"en" | "ru"`, default `"en"`
when absent/invalid. Read once at module load (mirrors `theme.ts`'s `readStoredTheme()`).

**Rationale**: Exact precedent already exists and works (`src/client/theme.ts`'s
`STORAGE_KEY = "odograph:theme"`); no server round-trip needed since this is explicitly a
per-device preference (spec.md Assumptions), consistent with FR-004.

## Decision 3: Translation source and scope

**Decision**: Translate all ~272 keys currently in `strings.ts`'s `en` object. Where the
Claude Design project's own RU copy covers a key with matching meaning, use it as a strong
reference (adapting phrasing to this app's actual key semantics, not copying blindly, since
the design's scope and key names differ — confirmed during spec.md drafting that none of the
keys added in specs 055–059 exist in the original design at all). Every other key gets an
original, natural Russian translation aimed at UI-copy brevity, not literal word-for-word
translation.

**Rationale**: FR-001/SC-001 require 100% coverage — a partial translation table would leave
some screens silently in English after switching, which is worse than not shipping the toggle
at all (a user who explicitly chose Russian sees a mix, and can't tell whether that's a bug or
intentional).

## Decision 4: Toggle placement and behavior

**Decision**: A small text-style `EN / RU` control (matching the design's own toggle
treatment) added to the landing page header and the authenticated app shell's header —
`src/client/components/LandingPage.tsx` and `src/client/components/AppShell.tsx`
respectively, the same two files that already import `useTheme` from `theme.ts` for the
existing theme toggle, confirming both headers already have a natural slot for a second
small toggle control next to it. Clicking calls `setLanguage()` with the other value; no
confirmation, no page reload.

**Rationale**: FR-002/FR-003; matches the design source's own placement per the issue.

## Decision 5: `{param}`-templated strings keep the existing single-form simplification

**Decision**: Russian translations of parameterized strings (e.g. "In {value} days") use one
grammatically-acceptable form per string, the same simplification the English strings already
implicitly make (spec.md Edge Cases). No pluralization engine, no per-count string variants.

**Rationale**: Full ICU-style plural rules is materially larger scope than issue #233 asks for
and has no existing precedent anywhere in this codebase, including for English. Documented as
an accepted limitation, not silently glossed over.

## Decision 6: Automated coverage — a key-parity test, not full manual-only validation

**Decision**: Add `tests/client/i18n.test.ts`, a plain Vitest test (no DOM, no Worker runtime
needed) asserting: (a) `Object.keys(ru)` exactly matches `Object.keys(en)` (catches any key
silently left untranslated — directly enforces SC-001 mechanically, not just via manual
spot-checks); (b) every `{param}`-templated key produces the same set of `{name}` placeholders
in both locales (catches a translation that drops or renames an interpolation point, which
would otherwise fail silently at runtime via `String.prototype.replace` no-op). This requires
widening `vitest.config.ts`'s `test.include` glob from `tests/server/**/*.test.ts` to also
match `tests/client/**/*.test.ts` — the new test needs no `cloudflareTest`/Miniflare bindings
(pure module, no Worker/DOM APIs), so it runs fine under the same Vitest config without a
separate pool.

**Rationale**: specs/059's tasks.md precedent ("no client-side test suite... no DOM to test
against") applies to *rendering/interaction* behavior, which this project indeed can't
practically unit-test without a browser. Key-parity is different: `strings.ts` is a plain,
DOM-free TypeScript module, so this specific check is both feasible and high-value (it is
exactly the failure mode SC-001 warns against) without requiring any new test infrastructure.
Everything requiring an actual rendered DOM (toggle click → visible text change, persistence
across reload) still goes through quickstart.md's manual walkthrough, unchanged from
precedent.

## Decision 7: Constitution amendment required — not a silent violation

**Decision**: `.specify/memory/constitution.md`'s Additional Constraints section currently
states *"Interface language (v1). English only, fully routed through the i18n layer required
by Principle IX, so additional languages can be added later without a string-extraction
rewrite."* This feature is precisely that anticipated "later" moment. Rather than silently
ship a feature that contradicts a literal constitution sentence, `tasks.md` includes an
explicit task to amend that bullet (updating it to describe the RU/EN toggle, keeping
Principle IX's rule itself — language/locale axes stay separate — completely unchanged) and
bump the constitution version per the Governance section's amendment procedure (MINOR:
1.1.0 → 1.2.0, since this expands/updates existing guidance rather than removing or
redefining a Core Principle).

**Rationale**: Governance requires "a PR that knowingly violates a principle MUST say so
explicitly... not violate it silently." The literal "English only" sentence is a locked
product decision, not Principle IX itself (which is about axis separation and is fully
satisfied by this design) — but leaving stale, contradicted text in the constitution after
this PR merges would be exactly the kind of silent drift the Governance section exists to
prevent.
