/**
 * C-4 / C-5 · واردسازی تماس‌های ایزابل به `call_logs` — فقط سمت سرور.
 *
 * سه قاعده‌ای که این ماژول بر آن‌ها ایستاده، و هر سه تصمیم مالک‌اند نه انتخاب کد:
 *
 *  D-40  · تاریخ شروع از ردیف تنظیمات `issabel_import_since_date` خوانده می‌شود.
 *          اگر آن ردیف نباشد یا خالی باشد، importer **اجرا نمی‌شود** — نه
 *          «از ابتدای تاریخ»، نه یک مقدار پیش‌فرض در کد. این تنها چیزی است که
 *          جلوی جاروی ۱٬۸۶۵٬۲۴۸ ردیفی را در یک اجرای بدون‌ناظر می‌گیرد.
 *  D-56a · یک ردیف به ازای هر `linkedid`. `external_id = linkedid`.
 *  D-56c · بی‌پاسخ فقط `NO ANSWER` و `BUSY`.
 *
 * بازمحاسبهٔ امتیاز (کاری که C-1 دسته‌ای کرد) **یک بار در پایان** صدا زده
 * می‌شود، نه به ازای هر ردیف. شمارندهٔ فراخوانی در خروجی برمی‌گردد تا این
 * ادعا قابل اندازه‌گیری باشد و فقط ادعا نماند.
 *
 * Need 3 · بعد از درج موفق، `derive_staff_call_metrics(_for_date)` برای هر روز
 * تقویمیِ متمایزِ تهران در بچِ واردشده صدا زده می‌شود (GRANT فقط service_role —
 * همین‌جاست که `supabaseAdmin` درست است). خطای derive واردسازی را fail نمی‌کند؛
 * در فیلدهای نتیجه جمع می‌شود.
 *
 * اگر env/پیکربندی Issabel غایب باشد، importer با `config_missing` برمی‌گردد و
 * `call_logs` خالی می‌ماند — UI میز فروش همچنان از مسیر دستی
 * `sales_interaction_create` قابل استفاده است.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  fetchIssabelCalls,
  readIssabelConfig,
  type GroupedCall,
} from "./issabel-cdr.server";

export const IMPORT_SOURCE = "issabel_cdr" as const;
export const SETTING_SINCE_DATE = "issabel_import_since_date" as const;
export const SETTING_DIAL_PREFIX = "issabel_outbound_dial_prefix" as const;

/**
 * `src/integrations/supabase/types.ts` تولیدشده است و سه چیز را هنوز نمی‌داند:
 * جدول `call_log_extensions` (موج ۶)، تابع `call_import_match_persons`
 * (مهاجرت ۵۱۲)، و اینکه `call_logs.employee_id` از مهاجرت ۵۱۲ به بعد
 * NULL-پذیر است.
 *
 * آن فایل عمداً بازتولید نشد: بازتولیدش تغییرات schema همهٔ mission های
 * موازیِ در جریان روی همین پایگاه را هم داخل می‌کشد. به‌جایش فقط همین سه
 * نقطهٔ تماس به‌صورت موضعی و مستند cast می‌شوند.
 */
type MatchedPersonRow = { raw_number: string; person_id: string };
type SupabaseError = { message: string } | null;

type UntypedSupabaseSurface = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: SupabaseError }>;
  from(table: string): {
    select(columns: string): PromiseLike<{
      data: { extension: string | null; employee_id: string | null }[] | null;
      error: SupabaseError;
    }>;
    insert(
      rows: unknown[],
      options: { count: "exact" },
    ): PromiseLike<{ error: SupabaseError; count: number | null }>;
  };
};

const untypedDb = supabaseAdmin as unknown as UntypedSupabaseSurface;

/** سقف سخت تعداد تماس در هر اجرا. cron هم از همین رد نمی‌شود. */
const DEFAULT_MAX_CALLS = 5000;
const MAX_CALLS_CEILING = 20000;
const PAGE_SIZE = 500;
/**
 * تماس‌های خیلی تازه وارد نمی‌شوند: پاهای بعدیِ یک تماس ممکن است هنوز در حال
 * نوشته‌شدن باشند و گروه‌بندی ناقص شود.
 */
const TRAILING_LAG_SECONDS = 120;
/**
 * هر اجرا کمی عقب‌تر از watermark شروع می‌کند تا پایی که دیر رسیده از قلم نیفتد.
 * ایندکس یکتای `call_logs_external_id_unique_idx` تکراری‌ها را می‌گیرد.
 */
const WATERMARK_OVERLAP_MINUTES = 60;

export type ImportIssabelCallsResult = {
  ok: true;
  window: { since: string; until: string };
  cdr_rows_read: number;
  calls_grouped: number;
  calls_already_imported: number;
  calls_inserted: number;
  customers_matched: number;
  unknown_numbers: number;
  employees_attached: number;
  reached_cap: boolean;
  /** باید همیشه ۱ باشد — اثبات اینکه بازمحاسبه یک بار در پایان اجرا شد، نه به ازای هر ردیف. */
  recompute_invocations: number;
  recompute_result: unknown;
  /** روزهای تقویمی تهران که برایشان `derive_staff_call_metrics` صدا زده شد. */
  derive_days: string[];
  derive_invocations: number;
  derive_results: unknown[];
  /** خطاهای soft — واردسازی موفق مانده؛ UI می‌تواند هشدار نشان دهد. */
  derive_errors: { day: string; message: string }[];
};

const TEHRAN_DAY_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** روز تقویمی تهران از `started_at` — هم‌تراز با `(started_at AT TIME ZONE 'Asia/Tehran')::date`. */
export function tehranCalendarDaysFromStartedAts(startedAts: string[]): string[] {
  const days = new Set<string>();
  for (const iso of startedAts) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    days.add(TEHRAN_DAY_FMT.format(d));
  }
  return [...days].sort();
}

export type ImportIssabelCallsFailure = {
  ok: false;
  error:
    | "config_missing"
    | "since_setting_missing"
    | "since_setting_invalid"
    | "settings_read_failed"
    | "cdr_read_failed"
    | "insert_failed"
    | "match_failed";
  message: string;
  details?: unknown;
};

type SettingsRow = { key: string; value: string | null };

async function readSettings(): Promise<
  { ok: true; sinceDate: string; dialPrefix: string } | ImportIssabelCallsFailure
> {
  const { data, error } = await supabaseAdmin
    .from("shop_settings")
    .select("key, value")
    .in("key", [SETTING_SINCE_DATE, SETTING_DIAL_PREFIX]);

  if (error) {
    return {
      ok: false,
      error: "settings_read_failed",
      message: "خواندن تنظیمات واردسازی تماس‌ها ناموفق بود.",
      details: error.message,
    };
  }

  const rows = (data ?? []) as SettingsRow[];
  const since = rows.find((r) => r.key === SETTING_SINCE_DATE)?.value?.trim() ?? "";
  const prefix = rows.find((r) => r.key === SETTING_DIAL_PREFIX)?.value?.trim() ?? "";

  // D-40 — نبودِ تاریخ یعنی توقف، نه یک پیش‌فرض.
  if (!since) {
    return {
      ok: false,
      error: "since_setting_missing",
      message:
        `تاریخ شروع واردسازی تنظیم نشده است. تا وقتی کلید «${SETTING_SINCE_DATE}» ` +
        "در تنظیمات مقدار نگرفته باشد، واردسازی اجرا نمی‌شود؛ هیچ مقدار پیش‌فرضی جای آن را نمی‌گیرد.",
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || Number.isNaN(Date.parse(`${since}T00:00:00Z`))) {
    return {
      ok: false,
      error: "since_setting_invalid",
      message: `مقدار «${SETTING_SINCE_DATE}» باید تاریخ میلادی به قالب YYYY-MM-DD باشد.`,
    };
  }

  return { ok: true, sinceDate: since, dialPrefix: prefix };
}

/** آخرین تماسی که از ایزابل وارد شده — تا هر اجرا از اول go-live نخواند. */
async function readWatermark(): Promise<Date | null> {
  const { data, error } = await supabaseAdmin
    .from("call_logs")
    .select("started_at")
    .eq("source", IMPORT_SOURCE)
    .order("started_at", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  const value = (data[0] as { started_at: string | null }).started_at;
  return value ? new Date(value) : null;
}

/** C-5 — تطبیق شماره با شخص، از راه تابع پایگاه‌داده که روی normalize_identifier سوار است. */
async function matchCustomers(
  calls: GroupedCall[],
): Promise<{ ok: true; byNumber: Map<string, string> } | ImportIssabelCallsFailure> {
  const candidates = new Set<string>();
  for (const call of calls) {
    if (call.customerNumberRaw) candidates.add(call.customerNumberRaw);
    if (call.customerNumberStripped) candidates.add(call.customerNumberStripped);
  }
  if (candidates.size === 0) return { ok: true, byNumber: new Map() };

  const byNumber = new Map<string, string>();
  const all = [...candidates];
  for (let i = 0; i < all.length; i += 500) {
    const chunk = all.slice(i, i + 500);
    const { data, error } = await untypedDb.rpc("call_import_match_persons", {
      _raw_numbers: chunk,
    });
    if (error) {
      return {
        ok: false,
        error: "match_failed",
        message: "تطبیق شمارهٔ تماس با اشخاص ناموفق بود.",
        details: error.message,
      };
    }
    for (const row of (data ?? []) as MatchedPersonRow[]) {
      byNumber.set(row.raw_number, row.person_id);
    }
  }
  return { ok: true, byNumber };
}

async function readExtensionMap(): Promise<Map<string, string>> {
  const { data, error } = await untypedDb
    .from("call_log_extensions")
    .select("extension, employee_id");
  const map = new Map<string, string>();
  if (error || !data) return map;
  for (const row of data) {
    if (row.extension && row.employee_id) map.set(row.extension, row.employee_id);
  }
  return map;
}

export type ImportIssabelCallsOptions = {
  maxCalls?: number;
  /**
   * توکن کاربرِ درخواست‌دهنده. بازمحاسبهٔ امتیاز `gamification_assert_manager()`
   * را صدا می‌زند که به `auth.uid()` نگاه می‌کند، پس با کلید service_role
   * (که uid ندارد) خطای ۴۲۵۰۱ می‌دهد و باید با توکن خود کاربر صدا زده شود.
   */
  userAccessToken?: string;
  /**
   * اجرای بدون‌ناظر (cron). در این حالت کاربری وجود ندارد، پس بازمحاسبه از
   * `recompute_employee_scores_from_calls_worker` (مهاجرت ۵۱۳) استفاده می‌کند
   * که فقط به service_role داده شده است.
   */
  workerMode?: boolean;
};

export async function importIssabelCalls(
  options: ImportIssabelCallsOptions = {},
): Promise<ImportIssabelCallsResult | ImportIssabelCallsFailure> {
  const config = readIssabelConfig();
  if (!config.ok) {
    return {
      ok: false,
      error: "config_missing",
      message: `اتصال به مرکز تلفن پیکربندی نشده است. کلیدهای غایب: ${config.missing.join("، ")}`,
    };
  }

  const settings = await readSettings();
  if (!("sinceDate" in settings)) return settings;

  const goLiveUtc = new Date(`${settings.sinceDate}T00:00:00Z`);
  const watermark = await readWatermark();
  const sinceUtc =
    watermark && watermark.getTime() > goLiveUtc.getTime()
      ? new Date(watermark.getTime() - WATERMARK_OVERLAP_MINUTES * 60000)
      : goLiveUtc;
  const untilUtc = new Date(Date.now() - TRAILING_LAG_SECONDS * 1000);

  if (sinceUtc.getTime() >= untilUtc.getTime()) {
    return {
      ok: true,
      window: { since: sinceUtc.toISOString(), until: untilUtc.toISOString() },
      cdr_rows_read: 0,
      calls_grouped: 0,
      calls_already_imported: 0,
      calls_inserted: 0,
      customers_matched: 0,
      unknown_numbers: 0,
      employees_attached: 0,
      reached_cap: false,
      recompute_invocations: 0,
      recompute_result: null,
      derive_days: [],
      derive_invocations: 0,
      derive_results: [],
      derive_errors: [],
    };
  }

  const maxCalls = Math.min(Math.max(1, options.maxCalls ?? DEFAULT_MAX_CALLS), MAX_CALLS_CEILING);

  let fetched;
  try {
    fetched = await fetchIssabelCalls(config.config, {
      sinceUtc,
      untilUtc,
      maxCalls,
      pageSize: PAGE_SIZE,
      dialPrefix: settings.dialPrefix,
    });
  } catch (error) {
    return {
      ok: false,
      error: "cdr_read_failed",
      message: "خواندن اطلاعات تماس از مرکز تلفن ناموفق بود.",
      details: error instanceof Error ? error.message : String(error),
    };
  }

  // کدام تماس‌ها از قبل وارد شده‌اند — idempotency روی linkedid.
  const alreadyImported = new Set<string>();
  const linkedIds = fetched.calls.map((c) => c.linkedId);
  for (let i = 0; i < linkedIds.length; i += 500) {
    const chunk = linkedIds.slice(i, i + 500);
    const { data } = await supabaseAdmin
      .from("call_logs")
      .select("external_id")
      .eq("source", IMPORT_SOURCE)
      .in("external_id", chunk);
    for (const row of (data ?? []) as { external_id: string | null }[]) {
      if (row.external_id) alreadyImported.add(row.external_id);
    }
  }

  const fresh = fetched.calls.filter((c) => !alreadyImported.has(c.linkedId));

  const matched = await matchCustomers(fresh);
  if (!("byNumber" in matched)) return matched;
  const extensionMap = await readExtensionMap();

  let customersMatched = 0;
  let unknownNumbers = 0;
  let employeesAttached = 0;

  const rows = fresh.map((call) => {
    const personId =
      (call.customerNumberStripped ? matched.byNumber.get(call.customerNumberStripped) : undefined) ??
      (call.customerNumberRaw ? matched.byNumber.get(call.customerNumberRaw) : undefined) ??
      null;

    // C-5 — شمارهٔ تطبیق‌نخورده هر دو را می‌گیرد: customer_id تهی و نشانِ صریح.
    const isUnknown = !personId && !call.isInternal && Boolean(call.customerNumberRaw);
    if (personId) customersMatched += 1;
    if (isUnknown) unknownNumbers += 1;

    const employeeId = call.extension ? (extensionMap.get(call.extension) ?? null) : null;
    if (employeeId) employeesAttached += 1;

    return {
      employee_id: employeeId,
      customer_id: personId,
      direction: call.direction,
      duration_seconds: call.durationSeconds,
      started_at: call.startedAtUtc.toISOString(),
      ended_at: call.endedAtUtc.toISOString(),
      external_id: call.linkedId,
      source: IMPORT_SOURCE,
      extension: call.extension,
      is_missed: call.isMissed,
      is_internal: call.isInternal,
      disposition: call.disposition,
      metadata: {
        unknown_number: isUnknown,
        leg_count: call.legCount,
        dcontexts: call.dcontexts,
        queue: call.queue,
        // شمارهٔ خام، همان‌طور که سوییچ نوشت — با پیشوند شماره‌گیری، دست‌نخورده.
        // اگر روزی معلوم شود پیشوند استنتاج‌شدهٔ «۹» غلط بوده، از همین‌جا قابل
        // تشخیص و قابل جبران است، به‌جای اینکه نامرئی بماند.
        raw_number: call.customerNumberRaw,
        stripped_number: call.customerNumberStripped,
        matched_via: personId
          ? call.customerNumberStripped && matched.byNumber.get(call.customerNumberStripped)
            ? "dial_prefix_stripped"
            : "raw"
          : null,
        recording_files: call.recordingFiles,
        leg_uniqueids: call.legUniqueids,
      },
    };
  });

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error, count } = await untypedDb
      .from("call_logs")
      .insert(chunk, { count: "exact" });
    if (error) {
      return {
        ok: false,
        error: "insert_failed",
        message: "ثبت تماس‌ها در call_logs ناموفق بود.",
        details: error.message,
      };
    }
    inserted += count ?? chunk.length;
  }

  try {
    await untypedDb.rpc("link_pending_transcript_sessions", {});
  } catch (err) {
    console.error(
      "[import-issabel] link_pending_transcript_sessions failed:",
      err instanceof Error ? err.message : err,
    );
  }

  // ── بازمحاسبه: دقیقاً یک بار، در پایان. نه داخل حلقهٔ بالا. ──────────────
  let recomputeInvocations = 0;
  let recomputeResult: unknown = null;
  if (inserted > 0) {
    if (options.workerMode) {
      recomputeInvocations = 1;
      const { data, error } = await untypedDb.rpc(
        "recompute_employee_scores_from_calls_worker",
        { _since: sinceUtc.toISOString() },
      );
      recomputeResult = error ? { error: error.message } : data;
    } else if (options.userAccessToken) {
      recomputeInvocations = 1;
      recomputeResult = await invokeBatchRecompute(sinceUtc, options.userAccessToken);
    }
  }

  // ── Need 3 · استخراج آمار تماس به ازای هر روز متمایز بچ (soft-fail) ─────
  // `derive_staff_call_metrics` فقط به service_role داده شده؛ admin client درست است.
  // شکست derive واردسازی را fail نمی‌کند — UI با sales_interaction_create هم کار می‌کند.
  const deriveDays =
    inserted > 0
      ? tehranCalendarDaysFromStartedAts(rows.map((r) => r.started_at))
      : [];
  let deriveInvocations = 0;
  const deriveResults: unknown[] = [];
  const deriveErrors: { day: string; message: string }[] = [];
  for (const day of deriveDays) {
    deriveInvocations += 1;
    try {
      const { data, error } = await untypedDb.rpc("derive_staff_call_metrics", {
        _for_date: day,
      });
      if (error) {
        console.error(
          `[import-issabel] derive_staff_call_metrics failed for ${day}:`,
          error.message,
        );
        deriveErrors.push({ day, message: error.message });
      } else {
        deriveResults.push(data);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[import-issabel] derive_staff_call_metrics threw for ${day}:`, message);
      deriveErrors.push({ day, message });
    }
  }

  return {
    ok: true,
    window: { since: sinceUtc.toISOString(), until: untilUtc.toISOString() },
    cdr_rows_read: fetched.cdrRowsRead,
    calls_grouped: fetched.calls.length,
    calls_already_imported: alreadyImported.size,
    calls_inserted: inserted,
    customers_matched: customersMatched,
    unknown_numbers: unknownNumbers,
    employees_attached: employeesAttached,
    reached_cap: fetched.reachedCap,
    recompute_invocations: recomputeInvocations,
    recompute_result: recomputeResult,
    derive_days: deriveDays,
    derive_invocations: deriveInvocations,
    derive_results: deriveResults,
    derive_errors: deriveErrors,
  };
}

/**
 * `recompute_employee_scores_from_calls` که C-1 ساخت. با توکن خود کاربر صدا
 * زده می‌شود چون `gamification_assert_manager()` به `auth.uid()` نگاه می‌کند.
 */
async function invokeBatchRecompute(since: Date, accessToken: string): Promise<unknown> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) return { skipped: "supabase_config_missing" };

  try {
    const res = await fetch(
      `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/recompute_employee_scores_from_calls`,
      {
        method: "POST",
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ _since: since.toISOString() }),
      },
    );
    const text = await res.text();
    if (!res.ok) return { status: res.status, error: text.slice(0, 500) };
    try {
      return JSON.parse(text);
    } catch {
      return { status: res.status, raw: text.slice(0, 500) };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
