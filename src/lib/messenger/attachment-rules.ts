// Phase 4 — قوانین مشترک پیوست پیام‌رسان (UI + serverFn pre-check)
// سقف‌ها باید با messenger_attachment_size_ok در migration Phase 2 یکسان بمانند.

export type AttachmentKind = "image" | "video" | "audio" | "pdf" | "word" | "excel" | "zip";

export type AttachmentRule = {
  kind: AttachmentKind;
  exts: readonly string[];
  mimes: readonly (string | RegExp)[];
  maxBytes: number;
  label: string;
};

const MB = 1024 * 1024;

export const ATTACHMENT_RULES: readonly AttachmentRule[] = [
  {
    kind: "image",
    exts: ["jpg", "jpeg", "png", "webp", "gif"],
    mimes: [/^image\/(jpeg|png|webp|gif)$/i],
    maxBytes: 5 * MB,
    label: "تصویر",
  },
  {
    kind: "video",
    exts: ["mp4", "webm", "mov"],
    mimes: [/^video\/(mp4|webm|quicktime)$/i],
    maxBytes: 50 * MB,
    label: "ویدئو",
  },
  {
    kind: "audio",
    // توجه: webm/mp4/ogg با video هم‌پسوند هستند؛ تفکیک نهایی بر اساس MIME
    // در getRuleByExtAndMime انجام می‌شود.
    exts: ["webm", "mp4", "ogg", "oga", "m4a", "mp3"],
    mimes: [/^audio\/(webm|mp4|ogg|mpeg|x-m4a|aac|opus).*/i],
    maxBytes: 25 * MB,
    label: "صوت",
  },
  {
    kind: "pdf",
    exts: ["pdf"],
    mimes: ["application/pdf"],
    maxBytes: 20 * MB,
    label: "PDF",
  },
  {
    kind: "word",
    exts: ["doc", "docx"],
    mimes: [
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    maxBytes: 10 * MB,
    label: "Word",
  },
  {
    kind: "excel",
    exts: ["xls", "xlsx"],
    mimes: [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    maxBytes: 5 * MB,
    label: "Excel",
  },
  {
    kind: "zip",
    exts: ["zip"],
    mimes: ["application/zip", "application/x-zip-compressed"],
    maxBytes: 5 * MB,
    label: "ZIP",
  },
] as const;

export function getExt(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  if (idx < 0 || idx === fileName.length - 1) return "";
  return fileName.slice(idx + 1).toLowerCase();
}

export function getRuleByExt(ext: string): AttachmentRule | null {
  const e = ext.toLowerCase();
  // برای پسوندهای مشترک audio/video (webm, mp4, ogg) بدون mime، رفتار پیشین حفظ شود (video)
  return (
    ATTACHMENT_RULES.find((r) => r.kind !== "audio" && r.exts.includes(e)) ??
    ATTACHMENT_RULES.find((r) => r.exts.includes(e)) ??
    null
  );
}

export function getRuleByExtAndMime(ext: string, mime: string): AttachmentRule | null {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("audio/")) {
    return ATTACHMENT_RULES.find((r) => r.kind === "audio") ?? null;
  }
  return getRuleByExt(ext);
}

export function mimeMatchesRule(rule: AttachmentRule, mime: string): boolean {
  const m = (mime || "").toLowerCase();
  return rule.mimes.some((entry) =>
    typeof entry === "string" ? entry.toLowerCase() === m : entry.test(m),
  );
}

export function acceptAttribute(): string {
  return ATTACHMENT_RULES.flatMap((r) => r.exts.map((e) => "." + e)).join(",");
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * MB) return `${(n / MB).toFixed(1)} MB`;
  return `${(n / (1024 * MB)).toFixed(1)} GB`;
}

export const ABSOLUTE_MAX_BYTES = 52_428_800; // 50MB hard cap (matches Phase 3 RPC)
