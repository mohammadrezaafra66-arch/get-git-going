/**
 * Server-only: generate task-specific intake questions via AI.
 * Falls back to kind-aware local templates when AI is unavailable.
 */

import { aiChat } from "@/lib/ai/client.server";
import {
  INTAKE_ALL_QUESTIONS,
  localIntakeQuestionsForKind,
  type IntakeQuestion,
} from "./intake";
import type { WorkItemKind } from "./types";

export interface GenerateIntakeQuestionsInput {
  description: string;
  title?: string;
  kind?: WorkItemKind;
  memoryHints?: string[];
}

export interface GenerateIntakeQuestionsResult {
  questions: IntakeQuestion[];
  source: "ai" | "local";
}

const KIND_FOCUS: Record<WorkItemKind, string> = {
  bug: "باگ یا خطای سیستم — علت، بازتولید، شدت، و معیار رفع",
  change_request: "درخواست تغییر یا قابلیت — نیاز کسب‌وکار، محدوده، و پذیرش",
  question: "سؤال یا نیاز به راهنمایی — ابهام، مخاطب پاسخ، و نتیجهٔ مطلوب",
  note: "یادداشت یا پیگیری عمومی — هدف، موعد، و افراد مرتبط",
};

function sanitizeQuestions(raw: unknown): IntakeQuestion[] | null {
  if (!Array.isArray(raw) || raw.length < 4) return null;
  const out: IntakeQuestion[] = [];
  for (const row of raw.slice(0, 12)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = String(r.id ?? "").trim().slice(0, 64);
    const prompt = String(r.prompt ?? "").trim().slice(0, 400);
    const type = r.type === "mcq" ? "mcq" : r.type === "open" ? "open" : null;
    if (!id || !prompt || !type) continue;
    if (type === "mcq") {
      const optsRaw = Array.isArray(r.options) ? r.options : [];
      const options = optsRaw
        .map((o) => {
          if (!o || typeof o !== "object") return null;
          const oo = o as Record<string, unknown>;
          const oid = String(oo.id ?? "").trim().slice(0, 64);
          const label = String(oo.label ?? "").trim().slice(0, 200);
          if (!oid || !label) return null;
          return { id: oid, label };
        })
        .filter(Boolean) as { id: string; label: string }[];
      if (options.length < 2) continue;
      out.push({ id, prompt, type, options });
    } else {
      out.push({ id, prompt, type });
    }
  }
  if (out.length < 4) return null;
  return out;
}

function extractJsonArray(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence?.[1]?.trim() ?? trimmed;
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start < 0 || end <= start) throw new Error("no json array");
  return JSON.parse(body.slice(start, end + 1));
}

export async function generateIntakeQuestionsWithAi(
  input: GenerateIntakeQuestionsInput,
): Promise<GenerateIntakeQuestionsResult> {
  const description = input.description.trim();
  const kind = input.kind ?? "note";
  const local = localIntakeQuestionsForKind(kind);

  if (!description) {
    return { questions: local, source: "local" };
  }

  const memory =
    (input.memoryHints ?? [])
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 8)
      .map((t, i) => `${i + 1}. ${t}`)
      .join("\n") || "—";

  const result = await aiChat({
    temperature: 0.35,
    timeoutMs: 8_000,
    messages: [
      {
        role: "system",
        content: [
          "تو طراح پرسش‌نامهٔ ثبت کار سازمانی برای کاربران غیرفنی هستی (فروش، مالی، اداری).",
          "فقط JSON خالص برگردان: آرایه‌ای از ۴ تا ۱۰ سؤال.",
          'هر سؤال: {"id":"snake_case","prompt":"متن فارسی","type":"open"|"mcq","options":[{"id":"...","label":"..."}]}',
          "برای type=open فیلد options نگذار. برای mcq حداقل ۲ و حداکثر ۵ گزینه.",
          "سوال‌ها باید مخصوص همین کار باشند نه عمومی کلیشه‌ای.",
          "از عنوان کارهای اخیر فقط برای آشنایی با زمینهٔ سازمان استفاده کن؛ کپی نکن.",
          `تمرکز نوع کار: ${KIND_FOCUS[kind]}`,
          "بدون Markdown توضیحی بیرون از JSON.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          input.title ? `عنوان پیشنهادی: ${input.title}` : null,
          `نوع تشخیص‌داده‌شده: ${kind}`,
          `شرح کار:\n${description.slice(0, 4000)}`,
          `کارهای باز اخیر (حافظهٔ سبک):\n${memory}`,
          "سوال‌های مرتبط را بساز.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  if (result.ok && result.value.trim()) {
    try {
      const parsed = extractJsonArray(result.value);
      const questions = sanitizeQuestions(parsed);
      if (questions) {
        return { questions, source: "ai" };
      }
    } catch {
      // fall through
    }
  }

  return {
    questions: local.length ? local : [...INTAKE_ALL_QUESTIONS],
    source: "local",
  };
}
