import { expect, test } from "@playwright/test";
import { mergeFileStats } from "../support/coverage.ts";

// Regression coverage for issue #89: a source file recorded independently by
// two different worker processes (e.g. the original attempt and its retry,
// each a fresh worker with its own empty accumulator — see coverage.ts's
// module doc comment) must have its hits unioned, not have one recording
// silently discard the other's.
test.describe("mergeFileStats (issue #89 cross-worker coverage aggregation)", () => {
  test("a function hit in only one of two recordings counts as covered", () => {
    const workerA = { total: 2, covered: 1, functionHits: [true, false] };
    const workerB = { total: 2, covered: 1, functionHits: [false, true] };

    const merged = mergeFileStats(workerA, workerB);

    expect(merged).toEqual({ total: 2, covered: 2, functionHits: [true, true] });
  });

  test("a function missed by both recordings stays uncovered", () => {
    const workerA = { total: 3, covered: 1, functionHits: [true, false, false] };
    const workerB = { total: 3, covered: 1, functionHits: [true, false, false] };

    const merged = mergeFileStats(workerA, workerB);

    expect(merged).toEqual({ total: 3, covered: 1, functionHits: [true, false, false] });
  });

  test("tolerates a length mismatch by treating the missing tail as not-yet-observed", () => {
    const shorter = { total: 1, covered: 1, functionHits: [true] };
    const longer = { total: 2, covered: 1, functionHits: [false, true] };

    const merged = mergeFileStats(shorter, longer);

    expect(merged).toEqual({ total: 2, covered: 2, functionHits: [true, true] });
  });
});
