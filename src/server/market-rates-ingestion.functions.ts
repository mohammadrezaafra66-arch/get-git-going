/**
 * FX.2 — External market rates ingestion (Navasan + TGJU).
 *
 * - Server-only. API keys read via process.env at handler runtime.
 * - Each integration is OPTIONAL and OFF by default via feature flags.
 * - Failure of one source must not break the other or manual entry.
 * - All writes go through public.record_external_market_rate_tick (RLS + audit).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ALLOWED_ROLES = new Set(["admin", "manager", "accountant"]);
const FETCH_TIMEOUT_MS = 15_000;
const MAX_RAW_PAYLOAD_CHARS = 4000;

type SourceCode = "NAVASAN_API" | "TGJU_API";

export interface IngestionResult {
  source_code: SourceCode;
  status: "completed" | "failed" | "skipped";
  fetched: number;
  inserted: number;
  suspect: number;
  error: string | null;
  message_fa: string;
  run_id: string | null;
}

const InputSchema = z.object({
  source_code: z.enum(["NAVASAN_API", "TGJU_API", "ALL"]),
});

function flagOn(name: string): boolean {
  const v = (process.env[name] ?? "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function truncatePayload(obj: unknown): unknown {
  try {
    const s = JSON.stringify(obj);
    if (s.length <= MAX_RAW_PAYLOAD_CHARS) return obj;
    return { _truncated: true, preview: s.slice(0, MAX_RAW_PAYLOAD_CHARS) };
  } catch {
    return { _unserializable: true };
  }
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    return isFinite(n) ? n : null;
  }
  return null;
}

/** Navasan: GET {BASE}/latest/?api_key=... -> { usd: { value, date, change }, ... } */
async function fetchNavasanRaw(): Promise<Record<string, unknown>> {
  const key = process.env.NAVASAN_API_KEY ?? "";
  const base = process.env.NAVASAN_BASE_URL ?? "https://www.navasan.tech/api";
  if (!key) throw new Error("NAVASAN_API_KEY مقدار ندارد");
  const url = `${base.replace(/\/$/, "")}/latest/?api_key=${encodeURIComponent(key)}`;
  const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
  if (!res.ok) throw new Error(`Navasan HTTP ${res.status}`);
  const json = (await res.json()) as Record<string, unknown>;
  if (!json || typeof json !== "object") throw new Error("پاسخ Navasan نامعتبر");
  return json;
}

/** Pull (value, source_reported_at) for a Navasan symbol entry */
function extractNavasanEntry(
  payload: Record<string, unknown>,
  symbol: string,
): { value: number; reportedAt: string | null; raw: unknown } | null {
  const node = payload[symbol];
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  const value = toNumber(obj.value);
  if (value == null || value <= 0) return null;
  const date = typeof obj.date === "string" ? obj.date : null;
  return { value, reportedAt: date, raw: obj };
}

export const ingestMarketRatesExternal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<IngestionResult[]> => {
    const { supabase, userId } = context;

    // Role check (defense in depth on top of RPC checks)
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    if (!roles.some((r) => ALLOWED_ROLES.has(r))) {
      throw new Error("Forbidden");
    }

    const masterOn = flagOn("MARKET_RATES_EXTERNAL_ENABLED");
    const targets: SourceCode[] =
      data.source_code === "ALL"
        ? ["NAVASAN_API", "TGJU_API"]
        : [data.source_code];

    const results: IngestionResult[] = [];

    for (const code of targets) {
      const sourceFlag =
        code === "NAVASAN_API" ? flagOn("NAVASAN_ENABLED") : flagOn("TGJU_ENABLED");

      // Always create a run row (started) for audit trail
      const { data: runId, error: runErr } = await supabase.rpc(
        "start_market_rate_ingestion_run",
        { p_source_code: code },
      );
      if (runErr || !runId) {
        results.push({
          source_code: code,
          status: "failed",
          fetched: 0,
          inserted: 0,
          suspect: 0,
          error: runErr?.message ?? "ثبت اجرای دریافت ناموفق",
          message_fa: "آغاز اجرای دریافت ممکن نشد",
          run_id: null,
        });
        continue;
      }

      if (!masterOn || !sourceFlag) {
        await supabase.rpc("finish_market_rate_ingestion_run", {
          p_run_id: runId, p_status: "skipped",
          p_fetched: 0, p_inserted: 0, p_suspect: 0,
          p_error: !masterOn
            ? "MARKET_RATES_EXTERNAL_ENABLED=false"
            : `${code} disabled`,
        });
        results.push({
          source_code: code, status: "skipped", fetched: 0, inserted: 0, suspect: 0,
          error: null,
          message_fa: "این منبع در پیکربندی سرور غیرفعال است.",
          run_id: runId as string,
        });
        continue;
      }

      // Load source id + active mappings
      const { data: src } = await supabase
        .from("market_rate_sources").select("id").eq("code", code).maybeSingle();
      const { data: mappings } = await supabase
        .from("market_rate_source_mappings")
        .select("indicator_id, source_symbol, normalize_multiplier, is_enabled")
        .eq("source_id", src?.id ?? "00000000-0000-0000-0000-000000000000")
        .eq("is_enabled", true);

      if (!src || !mappings || mappings.length === 0) {
        await supabase.rpc("finish_market_rate_ingestion_run", {
          p_run_id: runId, p_status: "skipped",
          p_fetched: 0, p_inserted: 0, p_suspect: 0,
          p_error: "هیچ نگاشت فعالی برای این منبع وجود ندارد",
        });
        results.push({
          source_code: code, status: "skipped", fetched: 0, inserted: 0, suspect: 0,
          error: null, message_fa: "نگاشت فعال برای این منبع تعریف نشده است.",
          run_id: runId as string,
        });
        continue;
      }

      try {
        let payload: Record<string, unknown>;
        if (code === "NAVASAN_API") {
          payload = await fetchNavasanRaw();
        } else {
          // TGJU: endpoint/symbol رسمی هنوز تأیید نشده → graceful skip (بدون throw، بدون fetch خارجی).
          await supabase.rpc("finish_market_rate_ingestion_run", {
            p_run_id: runId, p_status: "skipped",
            p_fetched: 0, p_inserted: 0, p_suspect: 0,
            p_error: "TGJU fetcher تأیید نشده؛ منتظر endpoint/symbol رسمی",
          });
          results.push({
            source_code: code, status: "skipped",
            fetched: 0, inserted: 0, suspect: 0, error: null,
            message_fa: "اتصال TGJU هنوز فعال نیست؛ نیاز به تأیید endpoint و نمادهای رسمی دارد.",
            run_id: runId as string,
          });
          continue;
        }

        let fetched = 0, inserted = 0, suspect = 0;
        const observedAt = new Date().toISOString();

        for (const m of mappings as Array<{
          indicator_id: string; source_symbol: string; normalize_multiplier: number;
        }>) {
          const entry = extractNavasanEntry(payload, m.source_symbol);
          if (!entry) continue;
          fetched += 1;
          const normalized = entry.value * Number(m.normalize_multiplier ?? 1);

          const { data: rec, error: recErr } = await supabase.rpc(
            "record_external_market_rate_tick",
            {
              p_indicator_id: m.indicator_id,
              p_source_id: src.id,
              p_value: normalized,
              p_observed_at: observedAt,
              p_source_reported_at: entry.reportedAt ?? undefined,
              p_raw_payload: truncatePayload(entry.raw) as never,
              p_unit: "toman",
            },
          );
          if (recErr) {
            console.error("[market-rates] insert failed:", recErr.message);
            continue;
          }
          inserted += 1;
          const row = Array.isArray(rec) ? rec[0] : rec;
          if (row && (row as { status_out?: string }).status_out === "suspect") {
            suspect += 1;
          }
        }

        await supabase.rpc("finish_market_rate_ingestion_run", {
          p_run_id: runId, p_status: "completed",
          p_fetched: fetched, p_inserted: inserted, p_suspect: suspect,
          p_error: undefined,
        });
        results.push({
          source_code: code, status: "completed", fetched, inserted, suspect,
          error: null,
          message_fa: `دریافت موفق: ${inserted} نرخ ثبت شد (${suspect} مشکوک)`,
          run_id: runId as string,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[market-rates] ${code} failed:`, msg);
        await supabase.rpc("finish_market_rate_ingestion_run", {
          p_run_id: runId, p_status: "failed",
          p_fetched: 0, p_inserted: 0, p_suspect: 0, p_error: msg.slice(0, 500),
        });
        results.push({
          source_code: code, status: "failed", fetched: 0, inserted: 0, suspect: 0,
          error: msg, message_fa: `دریافت از این منبع ناموفق بود: ${msg}`,
          run_id: runId as string,
        });
      }
    }

    return results;
  });

const StatusInputSchema = z.object({}).passthrough();

export interface ExternalSourcesStatus {
  master_enabled: boolean;
  navasan_enabled: boolean;
  tgju_enabled: boolean;
  navasan_has_key: boolean;
  tgju_has_key: boolean;
}

export const getExternalRatesStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StatusInputSchema.parse(input ?? {}))
  .handler(async ({ context }): Promise<ExternalSourcesStatus> => {
    const { supabase, userId } = context;
    const { data: roleRows } = await supabase
      .from("user_roles").select("role").eq("user_id", userId);
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    if (!roles.some((r) => ALLOWED_ROLES.has(r))) {
      throw new Response("Forbidden", { status: 403 });
    }
    return {
      master_enabled: flagOn("MARKET_RATES_EXTERNAL_ENABLED"),
      navasan_enabled: flagOn("NAVASAN_ENABLED"),
      tgju_enabled: flagOn("TGJU_ENABLED"),
      navasan_has_key: !!process.env.NAVASAN_API_KEY,
      tgju_has_key: !!process.env.TGJU_API_KEY,
    };
  });