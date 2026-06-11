/**
 * MR-AUTO.1B — No-API-key public market-rate providers.
 *
 * Server-only. Imported by `/api/public/hooks/ingest-market-rates`.
 * Each fetcher returns a normalized `{ symbol -> NormalizedTick }` map so
 * the ingest endpoint can join with `market_rate_source_mappings.source_symbol`
 * without caring about the wire format.
 *
 * Both providers are Iranian aggregators that may be geo-blocked from
 * Cloudflare Workers. Failures are typed and never throw.
 */

export interface NormalizedTick {
  value: number;
  reportedAt: string | null;
  raw: unknown;
}

export type ProviderResult =
  | { ok: true; ticks: Record<string, NormalizedTick>; rawCount: number }
  | { ok: false; reason: string };

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

async function fetchWithTimeout(url: string, ms: number, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      ...(init ?? {}),
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AfraKalaBot/1.0)",
        Accept: "application/json,text/plain,*/*",
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

/**
 * BrsApi.ir public free endpoint — gold + currency, no key required.
 * Returns shape: { gold: [{symbol,name,price,...}], currency: [{symbol,name,price,...}] }
 * We map by `symbol` (e.g. "USD", "EUR", "IR_GOLD_18K", "IR_COIN_EMAMI").
 */
export async function fetchBrsApi(): Promise<ProviderResult> {
  const url = process.env.BRSAPI_PUBLIC_URL ?? "https://brsapi.ir/Api/Market/Gold_Currency.php";
  try {
    const res = await fetchWithTimeout(url, safeTimeoutMs());
    if (!res.ok) return { ok: false, reason: `brsapi_http_${res.status}` };
    const json = (await res.json()) as Record<string, unknown>;
    const ticks: Record<string, NormalizedTick> = {};
    let count = 0;
    const collect = (arr: unknown) => {
      if (!Array.isArray(arr)) return;
      for (const it of arr) {
        if (!it || typeof it !== "object") continue;
        const o = it as Record<string, unknown>;
        const sym = typeof o.symbol === "string" ? o.symbol.trim() : null;
        const price = toNumber(o.price ?? o.value);
        if (!sym || price == null || price <= 0) continue;
        const reportedAt =
          typeof o.date === "string" ? o.date : typeof o.time === "string" ? o.time : null;
        ticks[sym] = { value: price, reportedAt, raw: o };
        count += 1;
      }
    };
    collect((json as { gold?: unknown }).gold);
    collect((json as { currency?: unknown }).currency);
    collect((json as { cryptocurrency?: unknown }).cryptocurrency);
    if (count === 0) return { ok: false, reason: "brsapi_empty_payload" };
    return { ok: true, ticks, rawCount: count };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `brsapi_fetch_failed: ${msg}` };
  }
}

/**
 * TGJU public aggregate JSON — used by tgju.org itself.
 * Returns shape: { current: { symbol_key: { p, h, l, t, ... } } } where `p` is price.
 * We map by symbol_key (e.g. "price_dollar_rl", "geram18", "sekee", "retail_sekee").
 */
export async function fetchTgjuPublic(): Promise<ProviderResult> {
  const url = process.env.TGJU_PUBLIC_URL ?? "https://call3.tgju.org/ajax.json";
  try {
    const res = await fetchWithTimeout(url, safeTimeoutMs());
    if (!res.ok) return { ok: false, reason: `tgju_http_${res.status}` };
    const json = (await res.json()) as Record<string, unknown>;
    const current = (json as { current?: Record<string, unknown> }).current;
    if (!current || typeof current !== "object") {
      return { ok: false, reason: "tgju_missing_current" };
    }
    const ticks: Record<string, NormalizedTick> = {};
    let count = 0;
    for (const [sym, node] of Object.entries(current)) {
      if (!node || typeof node !== "object") continue;
      const o = node as Record<string, unknown>;
      const price = toNumber(o.p ?? o.price);
      if (price == null || price <= 0) continue;
      const reportedAt = typeof o.t === "string" ? o.t : typeof o.time === "string" ? o.time : null;
      ticks[sym] = { value: price, reportedAt, raw: o };
      count += 1;
    }
    if (count === 0) return { ok: false, reason: "tgju_empty_payload" };
    return { ok: true, ticks, rawCount: count };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `tgju_fetch_failed: ${msg}` };
  }
}
