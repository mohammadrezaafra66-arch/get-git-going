/**
 * Pure Jaccard helpers for Calm Mind merge scan.
 * Run: npx --yes tsx --test src/lib/work/similarity.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  jaccardSimilarity,
  meetsMergeThreshold,
  normalizeWorkTokens,
  scoreWorkItems,
} from "./similarity.ts";
import { WORK_MERGE_SIMILARITY_THRESHOLD } from "./types.ts";

describe("normalizeWorkTokens", () => {
  it("lowercases and drops short tokens", () => {
    assert.deepEqual(normalizeWorkTokens("Hello, Hi! a"), ["hello", "hi"]);
  });
});

describe("jaccardSimilarity", () => {
  it("is 1 for identical token sets", () => {
    assert.equal(jaccardSimilarity(["a", "b"], ["b", "a"]), 1);
  });

  it("scores overlapping titles above threshold", () => {
    const score = scoreWorkItems(
      {
        title: "رفع باگ فاکتور فروش",
        body: "خطا در ثبت",
        intake_summary: "از پیام چت",
      },
      {
        title: "رفع باگ فاکتور خرید",
        body: "خطا در ثبت مبلغ",
        intake_summary: null,
      },
    );
    assert.ok(
      score >= WORK_MERGE_SIMILARITY_THRESHOLD,
      `expected >= ${WORK_MERGE_SIMILARITY_THRESHOLD}, got ${score}`,
    );
    assert.equal(meetsMergeThreshold(score), true);
  });

  it("scores unrelated items below threshold", () => {
    const score = scoreWorkItems(
      { title: "خرید قهوه", body: null, intake_summary: null },
      { title: "گزارش انبار تهران", body: "موجودی", intake_summary: null },
    );
    assert.ok(score < WORK_MERGE_SIMILARITY_THRESHOLD);
  });
});
