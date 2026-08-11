import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { COVERAGE_ENABLED, mergeAndGenerate, OUTPUT_DIR, PARTIAL_DIR } from "./coverage.ts";
import type { FileStats } from "./coverage.ts";

/**
 * Playwright `globalTeardown`: runs exactly once, after every worker
 * (including every retry) has finished — see the aggregation design in
 * `coverage.ts`'s module doc comment. Merges every worker's partial into
 * one accumulator, generates the real report once, then cleans up the
 * partials.
 */
export default function globalTeardown(): void {
  if (!COVERAGE_ENABLED) return;

  if (!existsSync(PARTIAL_DIR)) {
    console.log("\nClient coverage: no worker recorded any coverage this run.\n");
    return;
  }

  const partialFiles = readdirSync(PARTIAL_DIR).filter((f) => f.endsWith(".json"));
  const partials = partialFiles.map((f) =>
    JSON.parse(readFileSync(`${PARTIAL_DIR}/${f}`, "utf8")) as Record<string, FileStats>
  );

  const { overallPct, fileCount } = mergeAndGenerate(partials);
  rmSync(PARTIAL_DIR, { recursive: true, force: true });

  console.log(
    `\nClient coverage (${fileCount} file${fileCount === 1 ? "" : "s"} under src/client/, ` +
      `merged from ${partialFiles.length} worker${partialFiles.length === 1 ? "" : "s"}): ` +
      `${overallPct}% of functions called at least once — report at ${OUTPUT_DIR}/index.html\n`,
  );
}
