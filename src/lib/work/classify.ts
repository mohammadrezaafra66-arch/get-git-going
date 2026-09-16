/**
 * Rule-based FA/EN classification for Calm Mind work intake.
 * Pure functions — no network. Unit-testable with node:test.
 */

import type { WorkItemKind, WorkItemPriority } from "./types";

export interface ClassifyWorkInput {
  text: string;
  title?: string;
}

export interface ClassifyWorkResult {
  kind: WorkItemKind;
  suggestedTitle: string;
  group: string | null;
  priority: WorkItemPriority;
  /** 0–1 heuristic confidence */
  confidence: number;
  reasons?: string[];
}

const BUG_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bbugs?\b/i, reason: "کلمهٔ bug" },
  { re: /\berror\b/i, reason: "کلمهٔ error" },
  { re: /\bcrash(es|ed|ing)?\b/i, reason: "کلمهٔ crash" },
  { re: /\bfail(ure|ed|ing)?\b/i, reason: "کلمهٔ fail" },
  { re: /\bbroken\b/i, reason: "کلمهٔ broken" },
  { re: /باگ/, reason: "کلمهٔ باگ" },
  { re: /خطا/, reason: "کلمهٔ خطا" },
  { re: /اشکال/, reason: "کلمهٔ اشکال" },
  { re: /خراب/, reason: "کلمهٔ خراب" },
  { re: /کار\s*نمی\s*کند|کار\s*نمیکند/, reason: "عبارت کار نمی‌کند" },
  { re: /مشکل\s*(فنی|سیستم|نرم‌?افزار)?/, reason: "کلمهٔ مشکل" },
];

const CHANGE_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bfeature\b/i, reason: "کلمهٔ feature" },
  { re: /\benhancement\b/i, reason: "کلمهٔ enhancement" },
  { re: /\bimprovement\b/i, reason: "کلمهٔ improvement" },
  { re: /\bchange\s*request\b/i, reason: "عبارت change request" },
  { re: /درخواست\s*تغییر/, reason: "عبارت درخواست تغییر" },
  { re: /تغییر\s*(دهید|داده|بده|کن)/, reason: "عبارت تغییر" },
  { re: /افزودن|اضافه\s*کردن|اضافه\s*شود/, reason: "عبارت افزودن/اضافه" },
  { re: /قابلیت\s*جدید|امکان\s*جدید/, reason: "عبارت قابلیت/امکان جدید" },
  { re: /بهبود/, reason: "کلمهٔ بهبود" },
  { re: /پیشنهاد/, reason: "کلمهٔ پیشنهاد" },
];

const QUESTION_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\?/, reason: "علامت سؤال ?" },
  { re: /؟/, reason: "علامت سؤال ؟" },
  { re: /\bhow\b|\bwhat\b|\bwhy\b|\bwhen\b|\bwhere\b|\bwho\b/i, reason: "کلمهٔ پرسشی انگلیسی" },
  { re: /سؤال|سوال/, reason: "کلمهٔ سؤال" },
  { re: /چگونه|چطور|چرا|آیا|کدام|چیست|چی\s*هست/, reason: "کلمهٔ پرسشی فارسی" },
  { re: /می\s*خواهم\s*بدانم|میخواهم\s*بدانم/, reason: "عبارت می‌خواهم بدانم" },
];

const HIGH_PRIORITY: Array<{ re: RegExp; reason: string }> = [
  { re: /\burgent\b/i, reason: "urgent" },
  { re: /\basap\b/i, reason: "asap" },
  { re: /\bcritical\b/i, reason: "critical" },
  { re: /\bemergency\b/i, reason: "emergency" },
  { re: /فوری/, reason: "فوری" },
  { re: /اورژانس/, reason: "اورژانس" },
  { re: /خیلی\s*مهم|بسیار\s*مهم/, reason: "خیلی/بسیار مهم" },
  { re: /اولویت\s*(بالا|زیاد)/, reason: "اولویت بالا" },
];

const LOW_PRIORITY: Array<{ re: RegExp; reason: string }> = [
  { re: /\blow\s*priority\b/i, reason: "low priority" },
  { re: /\bwhenever\b/i, reason: "whenever" },
  { re: /کم\s*اهمیت|کماهمیت/, reason: "کم‌اهمیت" },
  { re: /اولویت\s*(پایین|کم)/, reason: "اولویت پایین" },
  { re: /عجله\s*ای\s*نیست|عجله‌ای\s*نیست/, reason: "عجله‌ای نیست" },
  { re: /وقتی\s*وقت\s*داشتید|هر\s*وقت/, reason: "هر وقت / وقتی وقت داشتید" },
];

/** Detectable group hints (Persian labels used in work_items.group_name). */
const GROUP_HINTS: Array<{ group: string; re: RegExp; reason: string }> = [
  { group: "فروش", re: /فروش|sales?\b|سفارش\s*فروش/i, reason: "گروه فروش" },
  { group: "مالی", re: /مالی|حسابدار|پرداخت|فاکتور|finance|accounting/i, reason: "گروه مالی" },
  {
    group: "پشتیبانی",
    re: /پشتیبانی|support|تیکت|مشتری\s*ناراضی/i,
    reason: "گروه پشتیبانی",
  },
  {
    group: "توسعه",
    re: /توسعه|برنامه\s*نویس|developer|dev\b|کدنویسی|frontend|backend/i,
    reason: "گروه توسعه",
  },
  {
    group: "پیگیری مشتری",
    re: /پیگیری\s*مشتری|follow[\s-]?up|پیگیری\s*سفارش/i,
    reason: "گروه پیگیری مشتری",
  },
  { group: "عمومی", re: /عمومی|general|سایر/i, reason: "گروه عمومی" },
];

function matchReasons(
  haystack: string,
  patterns: Array<{ re: RegExp; reason: string }>,
): string[] {
  const out: string[] = [];
  for (const p of patterns) {
    if (p.re.test(haystack)) out.push(p.reason);
  }
  return out;
}

/** Short Persian-friendly title from first non-empty line / truncated text. */
export function suggestTitleFromText(text: string, explicitTitle?: string): string {
  const given = (explicitTitle ?? "").trim();
  if (given) {
    return given.length > 80 ? `${given.slice(0, 77).trimEnd()}…` : given;
  }
  const raw = String(text ?? "").trim();
  if (!raw) return "کار بدون عنوان";
  const firstLine =
    raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) ?? raw;
  return firstLine.length > 80 ? `${firstLine.slice(0, 77).trimEnd()}…` : firstLine;
}

function classifyKind(haystack: string): {
  kind: WorkItemKind;
  reasons: string[];
  confidence: number;
} {
  const bug = matchReasons(haystack, BUG_PATTERNS);
  const change = matchReasons(haystack, CHANGE_PATTERNS);
  const question = matchReasons(haystack, QUESTION_PATTERNS);

  // Prefer bug over change_request when both fire (e.g. "bug fix feature").
  if (bug.length > 0 && bug.length >= change.length && bug.length >= question.length) {
    return {
      kind: "bug",
      reasons: bug.slice(0, 3),
      confidence: Math.min(0.55 + bug.length * 0.12, 0.95),
    };
  }
  if (change.length > 0 && change.length >= question.length) {
    return {
      kind: "change_request",
      reasons: change.slice(0, 3),
      confidence: Math.min(0.55 + change.length * 0.12, 0.92),
    };
  }
  if (question.length > 0) {
    return {
      kind: "question",
      reasons: question.slice(0, 3),
      confidence: Math.min(0.5 + question.length * 0.12, 0.9),
    };
  }
  return {
    kind: "note",
    reasons: ["هیچ کلیدواژهٔ قوی‌ای یافت نشد → یادداشت"],
    confidence: 0.35,
  };
}

function classifyPriority(haystack: string): {
  priority: WorkItemPriority;
  reasons: string[];
} {
  const high = matchReasons(haystack, HIGH_PRIORITY);
  const low = matchReasons(haystack, LOW_PRIORITY);
  if (high.length > 0 && high.length >= low.length) {
    return { priority: "high", reasons: high.slice(0, 2) };
  }
  if (low.length > 0) {
    return { priority: "low", reasons: low.slice(0, 2) };
  }
  return { priority: "normal", reasons: [] };
}

function classifyGroup(haystack: string): { group: string | null; reasons: string[] } {
  for (const g of GROUP_HINTS) {
    if (g.re.test(haystack)) {
      return { group: g.group, reasons: [g.reason] };
    }
  }
  return { group: null, reasons: [] };
}

/**
 * Classify free-text work description (optional title) into kind/priority/group.
 */
export function classifyWorkItem(input: ClassifyWorkInput): ClassifyWorkResult {
  const text = String(input.text ?? "").trim();
  const title = input.title != null ? String(input.title).trim() : undefined;
  const haystack = [title, text].filter(Boolean).join("\n");

  const kindResult = classifyKind(haystack);
  const priorityResult = classifyPriority(haystack);
  const groupResult = classifyGroup(haystack);

  const reasons = [
    ...kindResult.reasons,
    ...priorityResult.reasons,
    ...groupResult.reasons,
  ];

  let confidence = kindResult.confidence;
  if (priorityResult.priority !== "normal") confidence = Math.min(confidence + 0.05, 0.98);
  if (groupResult.group) confidence = Math.min(confidence + 0.03, 0.98);
  if (!text) {
    confidence = Math.min(confidence, 0.2);
    reasons.push("متن خالی بود");
  }

  return {
    kind: kindResult.kind,
    suggestedTitle: suggestTitleFromText(text, title),
    group: groupResult.group,
    priority: priorityResult.priority,
    confidence: Math.round(confidence * 100) / 100,
    reasons,
  };
}
