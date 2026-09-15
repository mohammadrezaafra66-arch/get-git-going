/**
 * Pure classify + intake probes.
 * Run: npx --yes tsx --test src/lib/work/classify.test.ts src/lib/work/intake.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyWorkItem, suggestTitleFromText } from "./classify.ts";

describe("classifyWorkItem", () => {
  it("maps bug keywords to bug + high priority", () => {
    const r = classifyWorkItem({
      text: "باگ فوری در ثبت فاکتور مالی — خطا هنگام ذخیره",
    });
    assert.equal(r.kind, "bug");
    assert.equal(r.priority, "high");
    assert.equal(r.group, "مالی");
    assert.ok(r.confidence >= 0.5);
    assert.ok((r.reasons ?? []).length > 0);
  });

  it("maps change request heuristics", () => {
    const r = classifyWorkItem({
      text: "درخواست تغییر: افزودن قابلیت جدید در فروش",
      title: "feature فروش",
    });
    assert.equal(r.kind, "change_request");
    assert.equal(r.group, "فروش");
  });

  it("maps question marks to question", () => {
    const r = classifyWorkItem({ text: "چگونه گزارش ماهانه را دانلود کنم؟" });
    assert.equal(r.kind, "question");
  });

  it("defaults to note when no strong keywords", () => {
    const r = classifyWorkItem({ text: "یادداشت جلسه هماهنگی فردا صبح" });
    assert.equal(r.kind, "note");
    assert.equal(r.priority, "normal");
  });

  it("suggests truncated title from first line", () => {
    const long = "الف".repeat(100);
    assert.equal(suggestTitleFromText(long).endsWith("…"), true);
    assert.ok(suggestTitleFromText(long).length <= 81);
  });
});
