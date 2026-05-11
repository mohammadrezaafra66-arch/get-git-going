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

type IngestStatus = "completed" | "failed" | "skipped" | "disabled" | "unauthorized";

interface IngestResponse {
  ok: boolean;
  source: "NAVASAN_API";
  status: IngestStatus;
  fetched: number;
  inserted: number;
  suspect: number;
  skipped_count: number;
  reason: string | null;
  run_id: string | null;
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

async function handle(request: Request): Promise<Response> {
  const ts = new Date().toISOString();
  const base = (status: IngestStatus, reason: string | null, runId: string | null = null) => ({
    ok: status === "completed" || status === "skipped" || status === "disabled",
    source: "NAVASAN_API" as const,
    status,
    fetched: 0,
    inserted: 0,
    suspect: 0,
    skipped_count: status === "skipped" || status === "disabled" ? 1 : 0,
    reason,
    run_id: runId,
    timestamp: ts,
  });

  if (!checkSecret(request)) {
    return makeResponse(base("unauthorized", "missing_or_invalid_cron_secret"), 401);
  }

  if (!flagOn("MARKET_RATES_AUTO_INGEST_ENABLED")) {
    return makeResponse(base("disabled", "MARKET_RATES_AUTO_INGEST_ENABLED=false"));
  }
  if (!flagOn("MARKET_RATES_EXTERNAL_ENABLED")) {
    return makeResponse(base("disabled", "MARKET_RATES_EXTERNAL_ENABLED=false"));
  }
  if (!flagOn("NAVASAN_ENABLED")) {
    return makeResponse(base("disabled", "NAVASAN_ENABLED=false"));
  }
  const apiKey = (process.env.NAVASAN_API_KEY ?? "").trim();
  if (!apiKey) {
    return makeResponse(base("skipped", "NAVASAN_API_KEY missing"));
  }

  const supabase = supabaseAdmin;

  // Start audit run (best-effort).
  const { data: runId, error: runErr } = await supabase.rpc(
    "start_market_rate_ingestion_run",
    { p_source_code: "NAVASAN_API" },
  );
  if (runErr || !runId) {
    return makeResponse(
      base("failed", `start_run_failed: ${runErr?.message ?? "unknown"}`),
      200,
    );
  }
  const runIdStr = runId as string;

  // Load source + mappings
  const { data: src } = await supabase
    .from("market_rate_sources")
    .select("id")
    .eq("code", "NAVASAN_API")
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
    return makeResponse(base("skipped", "no_active_mappings", runIdStr));
  }

  // Fetch Navasan
  let payload: Record<string, unknown>;
  try {
    const baseUrl = (process.env.NAVASAN_BASE_URL ?? "https://www.navasan.tech/api").replace(
      /\/$/,
      "",
    );
    const url = `${baseUrl}/latest/?api_key=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithTimeout(url, safeTimeoutMs());
    if (!res.ok) throw new Error(`Navasan HTTP ${res.status}`);
    payload = (await res.json()) as Record<string, unknown>;
    if (!payload || typeof payload !== "object") {
      throw new Error("invalid_navasan_payload");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[market-rates cron] navasan fetch failed:", msg);
    await supabase.rpc("finish_market_rate_ingestion_run", {
      p_run_id: runIdStr,
      p_status: "failed",
      p_fetched: 0,
      p_inserted: 0,
      p_suspect: 0,
      p_error: msg.slice(0, 500),
    });
    return makeResponse(
      { ...base("failed", `navasan_fetch_failed: ${msg}`, runIdStr) },
      200, // 200 so cron stops alerting; status field carries truth
    );
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
    const node = payload[m.source_symbol];
    if (!node || typeof node !== "object") continue;
    const obj = node as Record<string, unknown>;
    const value = toNumber(obj.value);
    if (value == null || value <= 0) continue;
    fetched += 1;
    const normalized = value * Number(m.normalize_multiplier ?? 1);
    const reportedAt = typeof obj.date === "string" ? obj.date : null;

    const { data: rec, error: recErr } = await supabase.rpc(
      "record_external_market_rate_tick",
      {
        p_indicator_id: m.indicator_id,
        p_source_id: src.id,
        p_value: normalized,
        p_observed_at: observedAt,
        p_source_reported_at: reportedAt ?? undefined,
        p_raw_payload: obj as never,
        p_unit: "toman",
      },
    );
    if (recErr) {
      console.error("[market-rates cron] insert failed:", recErr.message);
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

  return makeResponse({
    ok: true,
    source: "NAVASAN_API",
    status: "completed",
    fetched,
    inserted,
    suspect,
    skipped_count: 0,
    reason: null,
    run_id: runIdStr,
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