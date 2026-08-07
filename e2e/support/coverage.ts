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
 */
const COVERAGE_ENABLED = process.env.COVERAGE === "1";
// Playwright loads spec/support files as CommonJS, so this is relative to
// the process cwd — always `e2e/` since that's where `deno task
// test:coverage` runs from.
const OUTPUT_DIR = `${process.cwd()}/coverage`;

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

interface FileStats {
  total: number;
  covered: number;
}

class CoverageAccumulator {
  private byFile = new Map<string, FileStats>();

  add(entries: JSCoverageEntry[]): void {
    for (const entry of entries) {
      const relPath = clientRelativePath(entry.url);
      if (!relPath) continue;
      const stats = this.byFile.get(relPath) ?? { total: 0, covered: 0 };
      for (const fn of entry.functions as Array<{ ranges: Array<{ count: number }> }>) {
        const topLevel = fn.ranges[0];
        if (!topLevel) continue;
        stats.total += 1;
        if (topLevel.count > 0) stats.covered += 1;
      }
      this.byFile.set(relPath, stats);
    }
  }

  generate(): { overallPct: number; fileCount: number } {
    mkdirSync(OUTPUT_DIR, { recursive: true });

    const rows = [...this.byFile.entries()]
      .map(([file, s]) => ({
        file,
        pct: s.total === 0 ? 100 : Math.round((s.covered / s.total) * 1000) / 10,
        covered: s.covered,
        total: s.total,
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
        { overallPct, totalCovered, totalFunctions: totalFns, fileCount: rows.length, files: rows },
        null,
        2,
      ),
    );

    return { overallPct, fileCount: rows.length };
  }
}

let accumulator: CoverageAccumulator | null = null;
function getAccumulator(): CoverageAccumulator {
  if (!accumulator) accumulator = new CoverageAccumulator();
  return accumulator;
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

  // Worker-scoped + auto-use: this suite runs workers:1, so "once per
  // worker" is "once per full test run" — fires after every test has
  // added its coverage. Playwright parses this function's own parameter
  // list at runtime to resolve fixture dependencies, so the first
  // parameter must be a literal (even if empty) destructuring pattern, not
  // a plain identifier.
  // deno-lint-ignore no-empty-pattern
  coverageReport: [async ({}, use) => {
    await use();
    if (COVERAGE_ENABLED) {
      const { overallPct, fileCount } = getAccumulator().generate();
      console.log(
        `\nClient coverage (${fileCount} file${fileCount === 1 ? "" : "s"} under src/client/): ` +
          `${overallPct}% of functions called at least once — report at ${OUTPUT_DIR}/index.html\n`,
      );
    }
  }, { scope: "worker", auto: true }],
});

export { expect } from "@playwright/test";
