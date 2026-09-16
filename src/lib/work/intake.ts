/**
 * Non-technical work intake questionnaire — browser-safe.
 * Local questions + transcript/summary fallback (no AI imports).
 */

export type IntakeQuestionType = "open" | "mcq";

export interface IntakeQuestionOption {
  id: string;
  label: string;
}

export interface IntakeQuestion {
  id: string;
  prompt: string;
  type: IntakeQuestionType;
  /** Present when type === "mcq" */
  options?: IntakeQuestionOption[];
}

export interface IntakeAnswer {
  questionId: string;
  /** Free text or selected option id / label */
  value: string;
  /** Optional human-readable label when value is an option id */
  label?: string;
}

export interface SummarizeIntakeOptions {
  /** Optional original free-text description from the describe step */
  description?: string;
  /** Optional suggested title */
  title?: string;
}

/** ۵ سؤال باز توصیفی برای کاربران غیرفنی */
export const INTAKE_OPEN_QUESTIONS: IntakeQuestion[] = [
  {
    id: "open_goal",
    prompt: "هدف نهایی این کار چیست؟ وقتی تمام شود، چه چیزی باید درست یا آماده باشد؟",
    type: "open",
  },
  {
    id: "open_context",
    prompt: "الان وضعیت فعلی چگونه است و چه چیزی شما را به ثبت این کار واداشت؟",
    type: "open",
  },
  {
    id: "open_impact",
    prompt: "اگر این کار انجام نشود یا دیر انجام شود، چه اثر یا آسیبی دارد؟",
    type: "open",
  },
  {
    id: "open_stakeholders",
    prompt: "چه افراد یا واحدهایی درگیر این موضوع هستند یا باید از نتیجه باخبر شوند؟",
    type: "open",
  },
  {
    id: "open_done",
    prompt: "از نظر شما «تمام‌شدن» این کار یعنی چه؟ معیار پذیرش چیست؟",
    type: "open",
  },
];

/** ۵ سؤال چندگزینه‌ای کسب‌وکاری */
export const INTAKE_MCQ_QUESTIONS: IntakeQuestion[] = [
  {
    id: "mcq_urgency",
    prompt: "فوریت این کار چقدر است؟",
    type: "mcq",
    options: [
      { id: "urgent_today", label: "امروز باید تصمیم یا اقدام شود" },
      { id: "this_week", label: "این هفته کافی است" },
      { id: "no_rush", label: "عجله‌ای نیست" },
      { id: "unknown_urgency", label: "هنوز مشخص نیست" },
    ],
  },
  {
    id: "mcq_area",
    prompt: "بیشتر به کدام حوزه مربوط است؟",
    type: "mcq",
    options: [
      { id: "sales", label: "فروش" },
      { id: "finance", label: "مالی" },
      { id: "support", label: "پشتیبانی" },
      { id: "dev", label: "توسعه / فنی" },
      { id: "customer_followup", label: "پیگیری مشتری" },
      { id: "general", label: "عمومی / سایر" },
    ],
  },
  {
    id: "mcq_kind",
    prompt: "این مورد بیشتر شبیه کدام نوع است؟",
    type: "mcq",
    options: [
      { id: "question", label: "سؤال / نیاز به راهنمایی" },
      { id: "change_request", label: "درخواست تغییر یا قابلیت جدید" },
      { id: "bug", label: "باگ یا خطای سیستم" },
      { id: "note", label: "یادداشت / پیگیری عمومی" },
    ],
  },
  {
    id: "mcq_blocker",
    prompt: "آیا الان چیزی جلوی پیش‌رفتن کار را گرفته است؟",
    type: "mcq",
    options: [
      { id: "blocked_yes", label: "بله، منتظر شخص یا اطلاعات هستم" },
      { id: "blocked_partial", label: "تا حدی؛ می‌شود بخشی را شروع کرد" },
      { id: "blocked_no", label: "خیر، می‌توان همین حالا شروع کرد" },
    ],
  },
  {
    id: "mcq_visibility",
    prompt: "نتیجهٔ کار باید برای چه کسانی قابل‌دیدن باشد؟",
    type: "mcq",
    options: [
      { id: "self_only", label: "فقط خودم و مسئول مستقیم" },
      { id: "team", label: "تیم یا واحد مربوط" },
      { id: "org", label: "چند واحد / سطح سازمانی" },
    ],
  },
];

/** همهٔ سؤالات به‌ترتیب: بازها سپس چندگزینه‌ای‌ها */
export const INTAKE_ALL_QUESTIONS: IntakeQuestion[] = [
  ...INTAKE_OPEN_QUESTIONS,
  ...INTAKE_MCQ_QUESTIONS,
];

const QUESTION_BY_ID = new Map(
  INTAKE_ALL_QUESTIONS.map((q) => [q.id, q] as const),
);

function resolveAnswerDisplay(answer: IntakeAnswer): { prompt: string; display: string } {
  const q = QUESTION_BY_ID.get(answer.questionId);
  const prompt = q?.prompt ?? answer.questionId;
  const raw = String(answer.value ?? "").trim();
  if (answer.label?.trim()) {
    return { prompt, display: answer.label.trim() };
  }
  if (q?.type === "mcq" && q.options) {
    const opt = q.options.find((o) => o.id === raw);
    if (opt) return { prompt, display: opt.label };
  }
  return { prompt, display: raw };
}

/**
 * Build a plain-text transcript of intake Q&A (Persian labels).
 */
export function buildIntakeTranscript(answers: IntakeAnswer[]): string {
  const lines: string[] = [];
  for (const a of answers ?? []) {
    const { prompt, display } = resolveAnswerDisplay(a);
    if (!display) continue;
    lines.push(`سؤال: ${prompt}`);
    lines.push(`پاسخ: ${display}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}

/**
 * Local (non-AI) Persian summary: concatenate description + answered items.
 * Safe for browser; wizard can call this without a network round-trip.
 */
export function summarizeIntake(
  answers: IntakeAnswer[],
  opts?: SummarizeIntakeOptions,
): string {
  const parts: string[] = [];
  const title = opts?.title?.trim();
  const description = opts?.description?.trim();
  if (title) parts.push(`عنوان پیشنهادی: ${title}`);
  if (description) parts.push(`شرح اولیه: ${description}`);

  const answered = (answers ?? [])
    .map((a) => {
      const { prompt, display } = resolveAnswerDisplay(a);
      if (!display) return null;
      return `— ${prompt}\n  ${display}`;
    })
    .filter(Boolean) as string[];

  if (answered.length) {
    parts.push("خلاصهٔ پاسخ‌های پرسش‌نامه:");
    parts.push(answered.join("\n"));
  }

  if (!parts.length) {
    return "خلاصهٔ ثبت کار خالی است؛ پاسخی ثبت نشده.";
  }
  return parts.join("\n\n");
}
