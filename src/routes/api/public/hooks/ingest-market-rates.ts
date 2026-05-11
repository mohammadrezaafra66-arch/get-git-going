/**
 * MR-AUTO.1 — Scheduled (cron) market-rate ingestion endpoint.
 *
 * Secured by shared header `Authorization: Bearer ${MARKET_RATES_CRON_SECRET}`
 * (also accepts `X-Cron-Secret`). Uses the service-role client to call the same
 * RPCs as the manual ingest path. All external calls are gated by feature flags
 * and fail gracefully — core app must keep working if Navasan is unreachable.
 *
 * Scheduling:
 *   - Self-host: pg_cron (see supabase/migrations/) every 15 minutes.
 *   - Lovable: blocked / manual setup required (Cloudflare Workers may also be
 *     geo-blocked from Navasan; honest report only — no fake scheduler).
 *
 * NEVER calls TGJU in this phase (endpoint/symbol mapping unconfirmed).
 */

import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  fetchBrsApi,
  fetchTgjuPublic,
  type ProviderResult,
} from "@/lib/market-rates-providers.server";

type IngestStatus = "completed" | "failed" | "skipped" | "disabled" | "unauthorized";

type SourceCode = "NAVASAN_API" | "BRSAPI_PUBLIC" | "TGJU_PUBLIC";

interface SourceRunResult {
  source: SourceCode;
  status: IngestStatus;
  fetched: number;
  inserted: number;
  suspect: number;
  reason: string | null;
  run_id: string | null;
}

interface IngestResponse {
  ok: boolean;
  status: IngestStatus;
  sources: SourceRunResult[];
  reason: string | null;
  timestamp: string;
}

function flagOn(name: string): boolean {
  const v = (process.env[name] ?? "").toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function safeTimeoutMs(): number {
  const raw = Number(process.env.EXTERNAL_API_TIMEOUT_MS ?? "15000");
  if (!isFinite(raw) || raw < 15_000) return 15_000;
  if (raw > 60_000) return 60_000;
  return Math.floor(raw);
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, "").trim());
    return isFinite(n) ? n : null;
  }
  return null;
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

function makeResponse(body: IngestResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function checkSecret(request: Request): boolean {
  const expected = (process.env.MARKET_RATES_CRON_SECRET ?? "").trim();
  if (!expected) return false; // no secret configured = denied
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
  const xcron = (request.headers.get("x-cron-secret") ?? "").trim();
  // constant-time-ish compare
  const a = bearer || xcron;
  if (!a || a.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= a.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Run a single source: open audit run, fetch normalized ticks, persist, finish run.
 * Never throws — always returns a SourceRunResult.
 */
async function runSource(args: {
  code: SourceCode;
  fetcher: () => Promise<ProviderResult>;
}): Promise<SourceRunResult> {
  const { code, fetcher } = args;
  const supabase = supabaseAdmin;

  const { data: runId, error: runErr } = await supabase.rpc(
    "start_market_rate_ingestion_run",
    { p_source_code: code },
  );
  if (runErr || !runId) {
    return {
      source: code,
      status: "failed",
      fetched: 0,
      inserted: 0,
      suspect: 0,
      reason: `start_run_failed: ${runErr?.message ?? "unknown"}`,
      run_id: null,
    };
  }
  const runIdStr = runId as string;

  const { data: src } = await supabase
    .from("market_rate_sources")
    .select("id")
    .eq("code", code)
    .maybeSingle();
  const { data: mappings } = await supabase
    .from("market_rate_source_mappings")
    .select("indicator_id, source_symbol, normalize_multiplier, is_enabled")
    .eq("source_id", src?.id ?? "00000000-0000-0000-0000-000000000000")
    .eq("is_enabled", true);

  if (!src || !mappings || mappings.length === 0) {
    await supabase.rpc("finish_market_rate_ingestion_run", {
      p_run_id: runIdStr,
      p_status: "skipped",
      p_fetched: 0,
      p_inserted: 0,
      p_suspect: 0,
      p_error: "no active mappings",
    });
    return {
      source: code,
      status: "skipped",
      fetched: 0,
      inserted: 0,
      suspect: 0,
      reason: "no_active_mappings",
      run_id: runIdStr,
    };
  }

  const result = await fetcher();
  if (!result.ok) {
    console.error(`[market-rates cron] ${code} fetch failed:`, result.reason);
    await supabase.rpc("finish_market_rate_ingestion_run", {
      p_run_id: runIdStr,
      p_status: "failed",
      p_fetched: 0,
      p_inserted: 0,
      p_suspect: 0,
      p_error: result.reason.slice(0, 500),
    });
    return {
      source: code,
      status: "failed",
      fetched: 0,
      inserted: 0,
      suspect: 0,
      reason: result.reason,
      run_id: runIdStr,
    };
  }

  let fetched = 0;
  let inserted = 0;
  let suspect = 0;
  const observedAt = new Date().toISOString();

  for (const m of mappings as Array<{
    indicator_id: string;
    source_symbol: string;
    normalize_multiplier: number;
  }>) {
    const tick = result.ticks[m.source_symbol];
    if (!tick) continue;
    fetched += 1;
    const normalized = tick.value * Number(m.normalize_multiplier ?? 1);

    const { data: rec, error: recErr } = await supabase.rpc(
      "record_external_market_rate_tick",
      {
        p_indicator_id: m.indicator_id,
        p_source_id: src.id,
        p_value: normalized,
        p_observed_at: observedAt,
        p_source_reported_at: tick.reportedAt ?? undefined,
        p_raw_payload: tick.raw as never,
        p_unit: "toman",
      },
    );
    if (recErr) {
      console.error(`[market-rates cron] ${code} insert failed:`, recErr.message);
      continue;
    }
    inserted += 1;
    const row = Array.isArray(rec) ? rec[0] : rec;
    if (row && (row as { status_out?: string }).status_out === "suspect") {
      suspect += 1;
    }
  }

  await supabase.rpc("finish_market_rate_ingestion_run", {
    p_run_id: runIdStr,
    p_status: "completed",
    p_fetched: fetched,
    p_inserted: inserted,
    p_suspect: suspect,
    p_error: undefined,
  });

  return {
    source: code,
    status: "completed",
    fetched,
    inserted,
    suspect,
    reason: null,
    run_id: runIdStr,
  };
}

async function fetchNavasan(): Promise<ProviderResult> {
  const apiKey = (process.env.NAVASAN_API_KEY ?? "").trim();
  if (!apiKey) return { ok: false, reason: "navasan_api_key_missing" };
  try {
    const baseUrl = (process.env.NAVASAN_BASE_URL ?? "https://www.navasan.tech/api").replace(/\/$/, "");
    const url = `${baseUrl}/latest/?api_key=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithTimeout(url, safeTimeoutMs());
    if (!res.ok) return { ok: false, reason: `navasan_http_${res.status}` };
    const payload = (await res.json()) as Record<string, unknown>;
    if (!payload || typeof payload !== "object") return { ok: false, reason: "navasan_invalid_payload" };
    const out: Record<string, { value: number; reportedAt: string | null; raw: unknown }> = {};
    let count = 0;
    for (const [sym, node] of Object.entries(payload)) {
      if (!node || typeof node !== "object") continue;
      const o = node as Record<string, unknown>;
      const value = toNumber(o.value);
      if (value == null || value <= 0) continue;
      out[sym] = { value, reportedAt: typeof o.date === "string" ? o.date : null, raw: o };
      count += 1;
    }
    if (count === 0) return { ok: false, reason: "navasan_empty_payload" };
    return { ok: true, ticks: out, rawCount: count };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `navasan_fetch_failed: ${msg}` };
  }
}

async function handle(request: Request): Promise<Response> {
  const ts = new Date().toISOString();
  const baseEmpty = (status: IngestStatus, reason: string | null): IngestResponse => ({
    ok: status === "completed" || status === "skipped" || status === "disabled",
    status,
    sources: [],
    reason,
    timestamp: ts,
  });

  if (!checkSecret(request)) {
    return makeResponse(baseEmpty("unauthorized", "missing_or_invalid_cron_secret"), 401);
  }

  if (!flagOn("MARKET_RATES_AUTO_INGEST_ENABLED")) {
    return makeResponse(baseEmpty("disabled", "MARKET_RATES_AUTO_INGEST_ENABLED=false"));
  }
  if (!flagOn("MARKET_RATES_EXTERNAL_ENABLED")) {
    return makeResponse(baseEmpty("disabled", "MARKET_RATES_EXTERNAL_ENABLED=false"));
  }

  const sources: SourceRunResult[] = [];

  // Primary: BrsApi (no key)
  if (flagOn("BRSAPI_PUBLIC_ENABLED")) {
    const r = await runSource({ code: "BRSAPI_PUBLIC", fetcher: fetchBrsApi });
    sources.push(r);
    // Fallback to TGJU only if primary inserted nothing
    if (r.inserted === 0 && flagOn("TGJU_PUBLIC_ENABLED")) {
      sources.push(await runSource({ code: "TGJU_PUBLIC", fetcher: fetchTgjuPublic }));
    }
  } else if (flagOn("TGJU_PUBLIC_ENABLED")) {
    sources.push(await runSource({ code: "TGJU_PUBLIC", fetcher: fetchTgjuPublic }));
  }

  // Optional: Navasan if key+flag are set (off by default)
  if (flagOn("NAVASAN_ENABLED")) {
    sources.push(await runSource({ code: "NAVASAN_API", fetcher: fetchNavasan }));
  }

  if (sources.length === 0) {
    return makeResponse(baseEmpty("disabled", "no_source_enabled"));
  }

  const anyCompleted = sources.some((s) => s.status === "completed" && s.inserted > 0);
  const status: IngestStatus = anyCompleted ? "completed" : "failed";

  return makeResponse({
    ok: anyCompleted,
    status,
    sources,
    reason: anyCompleted ? null : "all_sources_failed_or_empty",
    timestamp: ts,
  });
}

export const Route = createFileRoute("/api/public/hooks/ingest-market-rates")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});