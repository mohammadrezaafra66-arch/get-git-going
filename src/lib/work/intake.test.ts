/**
 * Intake questionnaire + local summary probes.
 * Run: npx --yes tsx --test src/lib/work/intake.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  INTAKE_ALL_QUESTIONS,
  INTAKE_MCQ_QUESTIONS,
  INTAKE_OPEN_QUESTIONS,
  buildIntakeTranscript,
  summarizeIntake,
} from "./intake.ts";

describe("intake questions", () => {
  it("exports 5 open + 5 mcq in Persian", () => {
    assert.equal(INTAKE_OPEN_QUESTIONS.length, 5);
    assert.equal(INTAKE_MCQ_QUESTIONS.length, 5);
    assert.equal(INTAKE_ALL_QUESTIONS.length, 10);
    for (const q of INTAKE_OPEN_QUESTIONS) {
      assert.equal(q.type, "open");
      assert.ok(q.prompt.length > 10);
    }
    for (const q of INTAKE_MCQ_QUESTIONS) {
      assert.equal(q.type, "mcq");
      assert.ok((q.options?.length ?? 0) >= 2);
    }
  });
});

describe("buildIntakeTranscript / summarizeIntake", () => {
  it("builds transcript and local Persian summary", () => {
    const answers = [
      { questionId: "open_goal", value: "ارسال گزارش فروش هفتگی" },
      { questionId: "mcq_urgency", value: "this_week" },
      { questionId: "mcq_area", value: "sales" },
    ];
    const transcript = buildIntakeTranscript(answers);
    assert.match(transcript, /هدف نهایی/);
    assert.match(transcript, /ارسال گزارش فروش هفتگی/);
    assert.match(transcript, /این هفته کافی است/);

    const summary = summarizeIntake(answers, {
      title: "گزارش فروش",
      description: "نیاز به خروجی هفتگی",
    });
    assert.match(summary, /عنوان پیشنهادی: گزارش فروش/);
    assert.match(summary, /شرح اولیه/);
    assert.match(summary, /فروش/);
  });
});
