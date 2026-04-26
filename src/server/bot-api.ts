/**
 * Server-only helpers for the public bot API endpoints (Phase 4.7).
 * Uses the admin (service-role) Supabase client and the SECURITY DEFINER RPCs
 * `bot_authenticate_key`, `bot_query_table_rows`, `bot_update_table_row`.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type BotAuthContext = {
  keyId: string;
  name: string;
};

export type BotErrorResult = {
  ok: false;
  status: number;
  code: string;
  message: string;
};

export type BotAuthResult =
  | ({ ok: true } & BotAuthContext)
  | BotErrorResult;

const ERR_PERSIAN: Record<string, { status: number; message: string }> = {
  invalid_key:        { status: 401, message: "کلید API نامعتبر است یا با هیچ کلید فعالی مطابقت ندارد." },
  inactive_key:       { status: 401, message: "این کلید API غیرفعال شده است. مدیر باید آن را دوباره فعال کند." },
  expired_key:        { status: 401, message: "تاریخ انقضای این کلید API گذشته است." },
  missing_key:        { status: 401, message: "هدر «Authorization: Bearer <API_KEY>» الزامی است." },
  forbidden_table:    { status: 403, message: "این کلید به جدول درخواست‌شده دسترسی ندارد. لطفاً جدول را در صفحه «دسترسی جداول» به این کلید متصل کنید." },
  forbidden_read:     { status: 403, message: "این کلید مجوز خواندن این جدول را ندارد." },
  forbidden_update:   { status: 403, message: "این کلید مجوز به‌روزرسانی این جدول را ندارد." },
  row_not_found:      { status: 404, message: "ردیفی با این شناسه در این جدول یافت نشد." },
  row_table_mismatch: { status: 400, message: "این ردیف به جدول مشخص‌شده تعلق ندارد." },
  invalid_values:     { status: 400, message: "بدنه درخواست باید یک آبجکت JSON معتبر شامل فیلد values باشد." },
  no_updatable_values:{ status: 400, message: "هیچ مقداری برای به‌روزرسانی ارسال نشده است." },
};

const RATE_LIMIT_PERSIAN: Record<string, string> = {
  rate_limit_per_minute:  "تعداد درخواست‌های این کلید در دقیقه از حد مجاز (۱۲۰) عبور کرد. لطفاً ۶۰ ثانیه بعد دوباره تلاش کنید.",
  rate_limit_per_day:     "تعداد درخواست‌های این کلید در روز از حد مجاز (۵۰۰۰) عبور کرد. تا فردا منتظر بمانید یا کلید دیگری استفاده کنید.",
  rate_limit_ip_failures: "تعداد درخواست‌های ناموفق از این IP بیش از حد مجاز (۳۰ در ۱۰ دقیقه) است. کمی صبر کنید و دوباره تلاش کنید.",
};

export type RateLimitResult =
  | { ok: true }
  | { ok: false; status: 429; code: string; message: string; retryAfter: number };

/**
 * Apply simple usage-log–based rate limits.
 *  - Per key: 120 req/min, 5000 req/day
 *  - Unauthenticated IP: 30 failed req / 10 minutes
 */
export async function checkBotRateLimit(
  keyId: string | null,
  ip: string | null,
): Promise<RateLimitResult> {
  // The Postgres function accepts NULL for either argument; the generated TS
  // types narrow it to `string`, so cast through `unknown` to pass nulls.
  const { data, error } = await supabaseAdmin.rpc("bot_check_rate_limit", {
    p_key_id: keyId as unknown as string,
    p_ip: ip as unknown as string,
  });
  if (error) {
    console.error("[bot-api] rate-limit check failed:", error.message);
    return { ok: true }; // fail open: never block legitimate traffic on infra error
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { ok: boolean; retry_after_seconds: number | null; reason: string | null }
    | null;
  if (!row || row.ok) return { ok: true };
  const code = row.reason || "rate_limited";
  return {
    ok: false,
    status: 429,
    code,
    message: RATE_LIMIT_PERSIAN[code] ?? "محدودیت نرخ درخواست اعمال شد.",
    retryAfter: Math.max(1, row.retry_after_seconds ?? 60),
  };
}

/** Map a postgres RPC error message to a Persian, status-coded response. */
export function mapBotError(msg: string): { status: number; code: string; message: string } {
  // PostgREST/Supabase often prefix or append context to raised messages.
  // Normalize aggressively: trim, take first line, strip leading "ERROR:" markers.
  const raw = (msg || "").toString();
  const firstLine = raw.split("\n")[0].trim();
  const stripped = firstLine.replace(/^(?:ERROR|FATAL|PANIC)\s*:\s*/i, "").trim();
  const probe = stripped || firstLine || raw;

  // 1) Direct lookups (exact match) on multiple normalized forms
  for (const candidate of [raw, firstLine, stripped, probe]) {
    if (candidate && ERR_PERSIAN[candidate]) {
      return { code: candidate, ...ERR_PERSIAN[candidate] };
    }
  }

  // 2) Substring/word-boundary matching for known plain codes
  for (const code of Object.keys(ERR_PERSIAN)) {
    const re = new RegExp(`(^|[^a-zA-Z0-9_])${code}([^a-zA-Z0-9_]|$)`);
    if (re.test(raw)) {
      return { code, ...ERR_PERSIAN[code] };
    }
  }

  // 3) Prefixed errors like "unknown_column:foo" or "invalid_number_for_column:bar"
  //    The colon-prefixed token may appear anywhere in the message.
  const prefixes: Array<{ key: string; code: string; status: number; msg: (k: string) => string }> = [
    { key: "unknown_column",            code: "unknown_column",   status: 400, msg: (k) => `ستون «${k}» در این جدول تعریف نشده است. لطفاً column_key را بررسی کنید.` },
    { key: "column_not_allowed",        code: "column_not_allowed", status: 403, msg: (k) => `این کلید مجاز به تغییر ستون «${k}» نیست. ستون باید در «ستون‌های قابل به‌روزرسانی» این کلید فعال شود.` },
    { key: "invalid_number_for_column", code: "invalid_number",   status: 400, msg: (k) => `مقدار ارسال‌شده برای ستون «${k}» باید یک عدد معتبر باشد.` },
    { key: "invalid_boolean_for_column",code: "invalid_boolean",  status: 400, msg: (k) => `مقدار ستون «${k}» باید true یا false باشد.` },
    { key: "invalid_date_for_column",   code: "invalid_date",     status: 400, msg: (k) => `مقدار ستون «${k}» باید تاریخ معتبر در قالب YYYY-MM-DD باشد.` },
    { key: "invalid_datetime_for_column",code: "invalid_datetime",status: 400, msg: (k) => `مقدار ستون «${k}» باید تاریخ-زمان ISO معتبر باشد (مثل 2026-04-26T10:00:00Z).` },
    { key: "value_too_long_for_column", code: "value_too_long",   status: 400, msg: (k) => `مقدار ستون «${k}» از حد مجاز طول طولانی‌تر است.` },
  ];
  for (const p of prefixes) {
    const m = new RegExp(`${p.key}:([^\\s"',}\\]]+)`).exec(raw);
    if (m) return { status: p.status, code: p.code, message: p.msg(m[1]) };
  }

  // Legacy startsWith fallbacks (kept for safety)
  if (probe.startsWith("unknown_column:")) {
    const k = probe.split(":")[1] ?? "";
    return { status: 400, code: "unknown_column", message: `ستون «${k}» در این جدول تعریف نشده است. لطفاً column_key را بررسی کنید.` };
  }
  if (probe.startsWith("column_not_allowed:")) {
    const k = probe.split(":")[1] ?? "";
    return { status: 403, code: "column_not_allowed", message: `این کلید مجاز به تغییر ستون «${k}» نیست. ستون باید در «ستون‌های قابل به‌روزرسانی» این کلید فعال شود.` };
  }
  if (probe.startsWith("invalid_number_for_column:")) {
    const k = probe.split(":")[1] ?? "";
    return { status: 400, code: "invalid_number", message: `مقدار ارسال‌شده برای ستون «${k}» باید یک عدد معتبر باشد.` };
  }
  if (probe.startsWith("invalid_boolean_for_column:")) {
    const k = probe.split(":")[1] ?? "";
    return { status: 400, code: "invalid_boolean", message: `مقدار ستون «${k}» باید true یا false باشد.` };
  }
  if (probe.startsWith("invalid_date_for_column:")) {
    const k = probe.split(":")[1] ?? "";
    return { status: 400, code: "invalid_date", message: `مقدار ستون «${k}» باید تاریخ معتبر در قالب YYYY-MM-DD باشد.` };
  }
  if (probe.startsWith("invalid_datetime_for_column:")) {
    const k = probe.split(":")[1] ?? "";
    return { status: 400, code: "invalid_datetime", message: `مقدار ستون «${k}» باید تاریخ-زمان ISO معتبر باشد (مثل 2026-04-26T10:00:00Z).` };
  }
  if (probe.startsWith("value_too_long_for_column:")) {
    const k = probe.split(":")[1] ?? "";
    return { status: 400, code: "value_too_long", message: `مقدار ستون «${k}» از حد مجاز طول طولانی‌تر است.` };
  }
  console.error("[bot-api] unmapped error message:", msg);
  return { status: 500, code: "server_error", message: "خطای داخلی سرور هنگام پردازش درخواست." };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** Extract the bearer token from an Authorization header. */
export function extractBearer(headerValue: string | null | undefined): string | null {
  if (!headerValue) return null;
  const m = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return m ? m[1].trim() : null;
}

/** Authenticate by raw key via the SECURITY DEFINER RPC. */
export async function authenticateBot(rawKey: string | null): Promise<BotAuthResult> {
  if (!rawKey) {
    return { ok: false, status: 401, code: "missing_key", message: "هدر Authorization Bearer لازم است." };
  }
  const { data, error } = await supabaseAdmin.rpc("bot_authenticate_key", { p_raw_key: rawKey });
  if (error) {
    const m = mapBotError(error.message);
    return { ok: false, status: m.status, code: m.code, message: m.message };
  }
  const row = (Array.isArray(data) ? data[0] : data) as { key_id: string; name: string } | null;
  if (!row) {
    return { ok: false, status: 401, code: "invalid_key", message: "کلید API نامعتبر است." };
  }
  return { ok: true, keyId: row.key_id, name: row.name };
}

/** Fire-and-forget usage log insert (does not await; never throws to caller). */
export function logBotUsage(params: {
  api_key_id: string | null;
  table_id: string | null;
  endpoint: string;
  method: string;
  status_code: number;
  error_code?: string | null;
  ip?: string | null;
  request_size?: number | null;
  response_count?: number | null;
}): void {
  void supabaseAdmin
    .from("bot_api_usage_logs")
    .insert({
      api_key_id: params.api_key_id,
      table_id: params.table_id,
      endpoint: params.endpoint,
      method: params.method,
      status_code: params.status_code,
      error_code: params.error_code ?? null,
      ip: params.ip ?? null,
      request_size: params.request_size ?? null,
      response_count: params.response_count ?? null,
    })
    .then(({ error }) => {
      if (error) console.error("[bot-api] usage log failed:", error.message);
    });
}

export function clientIp(request: Request): string | null {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}