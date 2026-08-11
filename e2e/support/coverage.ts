import { test as base } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * Client-side code coverage for the e2e suite, via Chromium's own V8
 * coverage (CDP `page.coverage`) — not vitest/istanbul instrumentation, so
 * nothing in the root `vite.config.ts` needs to change.
 *
 * `deno task dev` (the target under test — see playwright.config.ts's
 * webServer) is a *dev* Vite server: it serves each source module at its
 * own near-original path (`/src/client/App.tsx`, transformed in place)
 * rather than a single hashed production bundle under `/assets/*.js` — the
 * hashed form is what production serves, not this suite's target.
 *
 * Metric is **function-level coverage** ("was this function called at
 * least once?"), not line/branch coverage — deliberately. V8's block-level
 * coverage data nests nested-range carve-outs inside each function's own
 * range; correctly turning that into line coverage is exactly what
 * v8-to-istanbul exists to do, but it (and istanbul-lib-report) fail to
 * load under Deno's Node-compat `require()` specifically when pulled in
 * transitively through Playwright's own test-file loader (reproduces even
 * though a standalone `deno run` importing the same package directly works
 * fine — a narrower, nested-require-specific interop gap). Function-level
 * coverage needs only each function's own top-level range count, with zero
 * risk of mis-implementing nested-range math, and zero extra dependencies.
 *
 * Only covers what runs *in the browser* — the React client. The Worker/
 * API code (src/server/**) runs in a separate Miniflare process the
 * browser never loads as JS, so it's structurally invisible to this
 * approach; that's server-side test coverage's job (vitest, root project),
 * not this suite's.
 *
 * Opt-in via COVERAGE=1 — startJSCoverage/stopJSCoverage adds real
 * per-test overhead, so a normal `deno task test` run skips it entirely.
 *
 * ## Cross-worker aggregation (issue #89)
 *
 * The accumulator below is a module-level singleton, which only holds data
 * for the current *worker process*. That used to be treated as "the whole
 * run's data", on the assumption that `workers: 1` means one continuous
 * process end to end. That assumption is false: Playwright starts a brand
 * new worker process for every retry (`WorkerInfo.workerIndex` — "When a
 * worker is restarted, for example after a failure, the new worker process
 * gets a new unique workerIndex"), and this suite's own CI runs confirm it
 * empirically — a clean 0-failure run prints this fixture's summary
 * exactly once, but a run with 19 failures (each retried once) printed it
 * 39 times, with the reported percentage bouncing non-monotonically
 * (50.9 → 45.9 → 51.2 → 43 → 50 → ...) instead of trending up, because each
 * new worker's accumulator started empty and its full report write
 * clobbered the previous worker's files.
 *
 * So: per-worker teardown (the `coverageReport` fixture below) now only
 * flushes a *cheap partial* (a JSON dump of this worker's own accumulated
 * `byFile` map) to `PARTIAL_DIR`, one file per worker index — no HTML/XML
 * generation, no full-report write, on every recycle. The real report
 * (summary.txt/index.html/coverage-summary.json/cobertura.xml) is
 * generated exactly once, in `globalTeardown` (see
 * `coverage-global-teardown.ts`), by merging every worker's partial.
 */
export const COVERAGE_ENABLED = process.env.COVERAGE === "1";
// Playwright loads spec/support files as CommonJS, so this is relative to
// the process cwd — always `e2e/` since that's where `deno task
// test:coverage` runs from.
export const OUTPUT_DIR = `${process.cwd()}/coverage`;
export const PARTIAL_DIR = `${OUTPUT_DIR}/.partial`;

// deno-lint-ignore no-explicit-any
type JSCoverageEntry = any;

function clientRelativePath(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const marker = "/src/client/";
    const index = pathname.indexOf(marker);
    if (index === -1) return null;
    // Vite dev serves CSS as a JS module (injects a <style> tag), which V8
    // instruments same as any other script — excluded here since "function
    // coverage" of a CSS-injection wrapper isn't a meaningful signal.
    if (!/\.tsx?$/.test(pathname)) return null;
    return pathname.slice(index + 1);
  } catch {
    return null;
  }
}

export interface FileStats {
  total: number;
  covered: number;
  // Per-function hit/miss, in encounter order — kept (not just the total/
  // covered counts) so the Cobertura export below has something concrete to
  // map each function onto a distinct synthetic <line>.
  functionHits: boolean[];
}

interface FileRow {
  file: string;
  pct: number;
  covered: number;
  total: number;
  functionHits: boolean[];
}

function xmlEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(
    /"/g,
    "&quot;",
  );
}

/**
 * Cobertura XML — the format GitHub's native "Restrict code coverage" and
 * "Require code quality results" ruleset rules ingest (uploaded via
 * `actions/upload-code-coverage`; see .github/workflows/ci.yml). Cobertura's
 * schema is fundamentally line-level (`<line number hits>`), which this
 * suite doesn't produce — it measures function-level coverage (was this
 * function called at least once?), not per-line execution. Rather than fake
 * line numbers that don't correspond to anything in the real source, each
 * function becomes its own synthetic `<line>` (1-indexed by encounter
 * order within the file) with hits=1/0 — an honest, if coarser-grained,
 * mapping onto Cobertura's schema, not a claim of real line coverage.
 * Classes are grouped into one package per file (directory, dotted) since
 * this suite has no notion of Cobertura's other package-level metrics.
 */
function generateCoberturaXml(rows: FileRow[], totalCovered: number, totalFns: number): string {
  const lineRate = totalFns === 0 ? 0 : totalCovered / totalFns;
  const timestamp = Date.now();

  const classesXml = rows.map((row) => {
    const dir = row.file.includes("/") ? row.file.slice(0, row.file.lastIndexOf("/")) : "";
    const packageName = dir.replace(/\//g, ".") || "root";
    const className = row.file.slice(row.file.lastIndexOf("/") + 1).replace(/\.tsx?$/, "");
    const fileLineRate = row.total === 0 ? 1 : row.covered / row.total;
    const linesXml = row.functionHits
      .map((hit, i) => `        <line number="${i + 1}" hits="${hit ? 1 : 0}" branch="false"/>`)
      .join("\n");
    return {
      packageName,
      xml: `    <package name="${
        xmlEscape(packageName)
      }" line-rate="${fileLineRate}" branch-rate="0" complexity="0">
      <classes>
        <class name="${xmlEscape(className)}" filename="${
        xmlEscape(row.file)
      }" line-rate="${fileLineRate}" branch-rate="0" complexity="0">
          <methods/>
          <lines>
${linesXml}
          </lines>
        </class>
      </classes>
    </package>`,
    };
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE coverage SYSTEM "http://cobertura.sourceforge.net/xml/coverage-04.dtd">
<coverage line-rate="${lineRate}" branch-rate="0" lines-covered="${totalCovered}" lines-valid="${totalFns}" branches-covered="0" branches-valid="0" complexity="0" version="1.0" timestamp="${timestamp}">
  <sources>
    <source>.</source>
  </sources>
  <packages>
${classesXml.map((c) => c.xml).join("\n")}
  </packages>
</coverage>
`;
}

/**
 * Unions two recordings of the same file's function hits — a function
 * counts as covered if EITHER recording saw it called. Needed because the
 * same source file gets recorded independently by every worker process
 * that happened to load it (see the module doc comment above); without
 * this, whichever worker's partial merges last would silently discard
 * every other worker's hits for files they share (virtually all of
 * them — shared components, App.tsx, etc.).
 *
 * Assumes both recordings enumerate the same file's top-level function
 * ranges in the same order (true in practice: V8 parses the same script
 * source into the same ranges every time). Defensively tolerates a length
 * mismatch by taking the longer recording's length and treating a missing
 * tail entry in the shorter one as not-yet-observed rather than throwing.
 */
export function mergeFileStats(a: FileStats, b: FileStats): FileStats {
  const length = Math.max(a.functionHits.length, b.functionHits.length);
  const functionHits: boolean[] = [];
  for (let i = 0; i < length; i++) {
    functionHits.push(Boolean(a.functionHits[i]) || Boolean(b.functionHits[i]));
  }
  return { total: length, covered: functionHits.filter(Boolean).length, functionHits };
}

class CoverageAccumulator {
  private byFile = new Map<string, FileStats>();

  add(entries: JSCoverageEntry[]): void {
    for (const entry of entries) {
      const relPath = clientRelativePath(entry.url);
      if (!relPath) continue;
      const stats = this.byFile.get(relPath) ?? { total: 0, covered: 0, functionHits: [] };
      for (const fn of entry.functions as Array<{ ranges: Array<{ count: number }> }>) {
        const topLevel = fn.ranges[0];
        if (!topLevel) continue;
        stats.total += 1;
        const hit = topLevel.count > 0;
        if (hit) stats.covered += 1;
        stats.functionHits.push(hit);
      }
      this.byFile.set(relPath, stats);
    }
  }

  /** This worker's own accumulated data, serializable to its partial file. */
  toPartial(): Record<string, FileStats> {
    return Object.fromEntries(this.byFile);
  }

  /** Merges one file's stats (e.g. from another worker's partial) into this accumulator. */
  mergeFile(file: string, stats: FileStats): void {
    const existing = this.byFile.get(file);
    this.byFile.set(file, existing ? mergeFileStats(existing, stats) : stats);
  }

  generate(): { overallPct: number; fileCount: number } {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    const rows = [...this.byFile.entries()]
      .map(([file, s]) => ({
        file,
        pct: s.total === 0 ? 100 : Math.round((s.covered / s.total) * 1000) / 10,
        covered: s.covered,
        total: s.total,
        functionHits: s.functionHits,
      }))
      .sort((a, b) => a.pct - b.pct);

    let totalCovered = 0;
    let totalFns = 0;
    for (const r of rows) {
      totalCovered += r.covered;
      totalFns += r.total;
    }
    const overallPct = totalFns === 0 ? 0 : Math.round((totalCovered / totalFns) * 1000) / 10;

    const textLines = [
      `Odograph e2e client coverage (function-level: called at least once)`,
      `Overall: ${overallPct}% (${totalCovered}/${totalFns} functions across ${rows.length} files)`,
      ``,
      ...rows.map((r) => `  ${String(r.pct).padStart(5)}%  (${r.covered}/${r.total})  ${r.file}`),
    ];
    writeFileSync(`${OUTPUT_DIR}/summary.txt`, textLines.join("\n") + "\n");

    const rowsHtml = rows.map((r) =>
      `<tr><td>${r.file}</td><td>${r.pct}%</td><td>${r.covered}/${r.total}</td></tr>`
    ).join("\n");
    const html = `<!doctype html><html><head><meta charset="utf-8">
<title>Odograph e2e client coverage</title>
<style>
body{font-family:monospace;padding:24px}
table{border-collapse:collapse;width:100%}
td,th{border:1px solid #ccc;padding:4px 10px;text-align:left}
</style></head><body>
<h1>Odograph e2e client coverage (function-level)</h1>
<p>Overall: <strong>${overallPct}%</strong> (${totalCovered}/${totalFns} functions across ${rows.length} files under src/client/)</p>
<table><thead><tr><th>File</th><th>%</th><th>Functions called / total</th></tr></thead>
<tbody>${rowsHtml}</tbody></table>
</body></html>`;
    writeFileSync(`${OUTPUT_DIR}/index.html`, html);

    // Machine-readable summary for CI's coverage-threshold gate (see
    // support/check-coverage-threshold.ts) — avoids grepping summary.txt.
    writeFileSync(
      `${OUTPUT_DIR}/coverage-summary.json`,
      JSON.stringify(
        {
          overallPct,
          totalCovered,
          totalFunctions: totalFns,
          fileCount: rows.length,
          files: rows.map(({ file, pct, covered, total }) => ({ file, pct, covered, total })),
        },
        null,
        2,
      ),
    );

    writeFileSync(
      `${OUTPUT_DIR}/cobertura.xml`,
      generateCoberturaXml(rows, totalCovered, totalFns),
    );

    return { overallPct, fileCount: rows.length };
  }
}

let accumulator: CoverageAccumulator | null = null;
function getAccumulator(): CoverageAccumulator {
  if (!accumulator) accumulator = new CoverageAccumulator();
  return accumulator;
}

/**
 * Merges every worker's partial (as written by the `coverageReport`
 * fixture below) into one accumulator and generates the real report from
 * it — called exactly once, from `coverage-global-teardown.ts`, after all
 * workers (including retries) have finished.
 */
export function mergeAndGenerate(
  partials: Record<string, FileStats>[],
): { overallPct: number; fileCount: number } {
  const merged = new CoverageAccumulator();
  for (const partial of partials) {
    for (const [file, stats] of Object.entries(partial)) {
      merged.mergeFile(file, stats);
    }
  }
  return merged.generate();
}

// deno-lint-ignore ban-types
export const test = base.extend<{}, { coverageReport: void }>({
  page: async ({ page }, use) => {
    if (!COVERAGE_ENABLED) {
      await use(page);
      return;
    }
    await page.coverage.startJSCoverage({ resetOnNavigation: false });
    await use(page);
    const coverage = await page.coverage.stopJSCoverage();
    getAccumulator().add(coverage);
  },

  // Worker-scoped + auto-use: fires once per worker PROCESS, which is not
  // once per full run — Playwright starts a fresh worker (and thus a fresh
  // module instance, a fresh `accumulator`) on every retry. So this only
  // flushes this worker's own partial to disk; it must not regenerate the
  // real report (see the module doc comment above and
  // `coverage-global-teardown.ts`, which merges every partial exactly
  // once). Playwright parses this function's own parameter list at runtime
  // to resolve fixture dependencies, so the first parameter must be a
  // literal (even if empty) destructuring pattern, not a plain identifier.
  // deno-lint-ignore no-empty-pattern
  coverageReport: [async ({}, use, workerInfo) => {
    await use();
    if (COVERAGE_ENABLED) {
      const partial = getAccumulator().toPartial();
      if (Object.keys(partial).length > 0) {
        mkdirSync(PARTIAL_DIR, { recursive: true });
        writeFileSync(
          `${PARTIAL_DIR}/worker-${workerInfo.workerIndex}.json`,
          JSON.stringify(partial),
        );
      }
    }
  }, { scope: "worker", auto: true }],
});

export { expect } from "@playwright/test";
