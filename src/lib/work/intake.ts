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
  /** Prompt text when questions are dynamic (AI / kind-pack) */
  prompt?: string;
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

/**
 * Kind-aware local pack (browser-safe) — used when AI questions are unavailable.
 */
export function localIntakeQuestionsForKind(
  kind: import("./types").WorkItemKind = "note",
): IntakeQuestion[] {
  const tailoredOpen: IntakeQuestion[] = (() => {
    switch (kind) {
      case "bug":
        return [
          {
            id: "dyn_open_repro",
            prompt: "چطور این مشکل را بازتولید کنیم؟ (گام‌به‌گام کوتاه)",
            type: "open",
          },
          {
            id: "dyn_open_expected",
            prompt: "رفتار درست چه باید باشد و الان چه می‌بینید؟",
            type: "open",
          },
          {
            id: "dyn_open_impact",
            prompt: "کدام کاربر یا فرآیند الان متوقف یا آسیب‌دیده است؟",
            type: "open",
          },
          {
            id: "open_stakeholders",
            prompt: INTAKE_OPEN_QUESTIONS[3]!.prompt,
            type: "open",
          },
          {
            id: "open_done",
            prompt: "چه زمانی می‌گوییم باگ رفع شده؟ (معیار پذیرش)",
            type: "open",
          },
        ];
      case "change_request":
        return [
          {
            id: "dyn_open_need",
            prompt: "این تغییر کدام نیاز کسب‌وکار را برطرف می‌کند؟",
            type: "open",
          },
          {
            id: "dyn_open_scope",
            prompt: "محدودهٔ تغییر چیست و چه چیزی عمداً خارج از محدوده است؟",
            type: "open",
          },
          {
            id: "open_impact",
            prompt: INTAKE_OPEN_QUESTIONS[2]!.prompt,
            type: "open",
          },
          {
            id: "open_stakeholders",
            prompt: INTAKE_OPEN_QUESTIONS[3]!.prompt,
            type: "open",
          },
          {
            id: "open_done",
            prompt: INTAKE_OPEN_QUESTIONS[4]!.prompt,
            type: "open",
          },
        ];
      case "question":
        return [
          {
            id: "dyn_open_ask",
            prompt: "دقیقاً چه چیزی را می‌خواهید بدانید یا تصمیم بگیرید؟",
            type: "open",
          },
          {
            id: "dyn_open_tried",
            prompt: "تا الان چه کارهایی کرده‌اید یا کجا را نگاه کرده‌اید؟",
            type: "open",
          },
          {
            id: "open_context",
            prompt: INTAKE_OPEN_QUESTIONS[1]!.prompt,
            type: "open",
          },
          {
            id: "open_stakeholders",
            prompt: "پاسخ این سؤال را چه کسی باید بدهد یا تأیید کند؟",
            type: "open",
          },
          {
            id: "open_done",
            prompt: "با چه پاسخی این موضوع برای شما بسته می‌شود؟",
            type: "open",
          },
        ];
      default:
        return [...INTAKE_OPEN_QUESTIONS];
    }
  })();

  return [...tailoredOpen, ...INTAKE_MCQ_QUESTIONS];
}
const QUESTION_BY_ID = new Map(
  INTAKE_ALL_QUESTIONS.map((q) => [q.id, q] as const),
);

function resolveAnswerDisplay(
  answer: IntakeAnswer,
  extraById?: Map<string, IntakeQuestion>,
): { prompt: string; display: string } {
  const q = extraById?.get(answer.questionId) ?? QUESTION_BY_ID.get(answer.questionId);
  const prompt = answer.prompt?.trim() || q?.prompt || answer.questionId;
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
export function buildIntakeTranscript(
  answers: IntakeAnswer[],
  questions?: IntakeQuestion[],
): string {
  const extra =
    questions && questions.length
      ? new Map(questions.map((q) => [q.id, q] as const))
      : undefined;
  const lines: string[] = [];
  for (const a of answers ?? []) {
    const { prompt, display } = resolveAnswerDisplay(a, extra);
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
  opts?: SummarizeIntakeOptions & { questions?: IntakeQuestion[] },
): string {
  const parts: string[] = [];
  const title = opts?.title?.trim();
  const description = opts?.description?.trim();
  if (title) parts.push(`عنوان پیشنهادی: ${title}`);
  if (description) parts.push(`شرح اولیه: ${description}`);

  const extra =
    opts?.questions && opts.questions.length
      ? new Map(opts.questions.map((q) => [q.id, q] as const))
      : undefined;

  const answered = (answers ?? [])
    .map((a) => {
      const { prompt, display } = resolveAnswerDisplay(a, extra);
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
