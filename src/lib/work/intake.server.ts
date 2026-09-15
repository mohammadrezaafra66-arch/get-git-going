/**
 * Server-only intake summary helper.
 * Uses aiChat when a provider is available; otherwise local summarizeIntake.
 * Never import this from browser modules.
 */

import { aiChat } from "@/lib/ai/client.server";
import {
  buildIntakeTranscript,
  summarizeIntake,
  type IntakeAnswer,
  type SummarizeIntakeOptions,
} from "./intake";

export interface SummarizeIntakeServerResult {
  summary: string;
  source: "ai" | "local";
  transcript: string;
}

/**
 * Prefer AI condensation; fall back to local concatenate summary.
 * No dedicated AiUsageKey yet — uses default provider walk (no usageKey).
 */
export async function summarizeIntakeWithAi(
  answers: IntakeAnswer[],
  opts?: SummarizeIntakeOptions,
): Promise<SummarizeIntakeServerResult> {
  const transcript = buildIntakeTranscript(answers);
  const local = summarizeIntake(answers, opts);

  const userParts = [
    opts?.title ? `عنوان: ${opts.title}` : null,
    opts?.description ? `شرح: ${opts.description}` : null,
    transcript ? `رونوشت پرسش‌نامه:\n${transcript}` : null,
  ].filter(Boolean);

  if (!userParts.length) {
    return { summary: local, source: "local", transcript };
  }

  const result = await aiChat({
    temperature: 0.2,
    timeoutMs: 45_000,
    messages: [
      {
        role: "system",
        content: [
          "تو خلاصه‌نویس ثبت کار سازمانی هستی.",
          "فقط به فارسی، مختصر (۳ تا ۶ جمله)، بدون Markdown سنگین.",
          "هدف، اثر در صورت تأخیر، حوزه، فوریت و معیار پذیرش را اگر در متن هست ذکر کن.",
          "اگر اطلاعات کم است حدس نزن؛ فقط آنچه داده شده را جمع‌بندی کن.",
        ].join(" "),
      },
      {
        role: "user",
        content: `این پاسخ‌های ثبت کار را در یک خلاصهٔ قابل‌ذخیره در فیلد intake_summary جمع کن:\n\n${userParts.join("\n\n")}`,
      },
    ],
  });

  if (result.ok && result.value.trim()) {
    return { summary: result.value.trim(), source: "ai", transcript };
  }

  return { summary: local, source: "local", transcript };
}
