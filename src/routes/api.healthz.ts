import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/healthz — the container healthcheck endpoint.
 *
 * It used to return a constant {ok:true}, which meant Docker reported the web
 * container healthy straight through a database outage. A healthcheck that
 * cannot fail is not a healthcheck.
 *
 * WHAT FAILS THE CHECK vs WHAT ONLY DEGRADES IT
 *   database (hard)  — the app is fully auth-gated and every page reads through
 *                      Supabase. If PostgREST/Postgres is unreachable this
 *                      instance genuinely cannot serve traffic, so it returns
 *                      503 and Docker marks it unhealthy.
 *   whatsapp (soft)  — the WhatsApp/AfraPayam platform bridge is an optional
 *                      integration. An outage there must NOT restart the web
 *                      container, so it is reported as a degraded sub-status
 *                      and never changes the HTTP status code.
 *
 * SPEED — the compose healthcheck allows 5s (interval 30s). The two probes run
 * in PARALLEL with 2000ms / 1500ms timeouts, so the worst case is ~2s.
 *
 * The database probe uses the publishable (anon) key, not the service-role key:
 * a 200 proves the whole web -> Kong -> PostgREST -> Postgres path is alive,
 * and RLS legitimately returning zero rows is still a 200. There is no reason
 * for a liveness probe to hold more privilege than that.
 *
 * WHICH TABLE THE PROBE READS — not an arbitrary choice.
 * This probe used to read `shop_settings`. Migration 477 revoked anon's SELECT on
 * 188 tables including that one, so from 477 onwards PostgREST answered 401, the
 * probe reported `database: down`, and Docker marked the web container `unhealthy`
 * continuously while the app itself was serving perfectly. Measured 2026-09-07,
 * before this fix:
 *   GET /api/healthz -> 503
 *   {"ok":false,...,"database":{"state":"down","ms":7,"detail":"HTTP 401"}}
 *   docker inspect afrakala-lan-web --format '{{.State.Health.Status}}' -> unhealthy
 *
 * The fix is NOT to re-grant anything to anon — that would reopen exactly what 477
 * closed. It is to point the probe at a table anon is *supposed* to be able to read.
 * `currencies` is one of the eleven tables listed as KEEP_OPEN in
 * e2e/security/og103-anon-table-grants-stay-closed.spec.ts, and that spec asserts in
 * BOTH directions: the 188 stay closed, and the eleven stay readable ("⛔ the eleven
 * stay readable by anon — the direction nobody checks"). So this probe's dependency is
 * now pinned by a test — the property `shop_settings` never had. A future hardening
 * sweep that closed `currencies` would fail og103 first, instead of silently breaking
 * the healthcheck again.
 *
 * If this table ever has to change, pick another name from that KEEP_OPEN list rather
 * than granting anon a new one.
 */

const DB_TIMEOUT_MS = 2000;
const BRIDGE_TIMEOUT_MS = 1500;

type ProbeState = "up" | "down" | "not_configured";

interface Probe {
  state: ProbeState;
  ms: number;
  detail?: string;
}

async function timedFetch(url: string, timeoutMs: number, headers?: Record<string, string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

async function checkDatabase(): Promise<Probe> {
  const started = Date.now();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    // Missing configuration is a real fault: this instance cannot serve.
    return { state: "down", ms: 0, detail: "SUPABASE_URL/SUPABASE_PUBLISHABLE_KEY not set" };
  }
  try {
    const res = await timedFetch(
      `${url.replace(/\/+$/, "")}/rest/v1/currencies?select=id&limit=1`,
      DB_TIMEOUT_MS,
      { apikey: key, Authorization: `Bearer ${key}` },
    );
    const ms = Date.now() - started;
    if (!res.ok) return { state: "down", ms, detail: `HTTP ${res.status}` };
    return { state: "up", ms };
  } catch (err) {
    return {
      state: "down",
      ms: Date.now() - started,
      detail: err instanceof Error ? err.name : "fetch failed",
    };
  }
}

async function checkWhatsappBridge(): Promise<Probe> {
  const started = Date.now();
  const base = process.env.WHATSAPP_PLATFORM_BASE_URL;
  if (!base) return { state: "not_configured", ms: 0 };
  try {
    // Any HTTP response means the bridge is reachable -- the root path is not
    // a routed endpoint there and answers 404, which is still proof of life.
    const res = await timedFetch(base.replace(/\/+$/, "") + "/", BRIDGE_TIMEOUT_MS);
    return { state: "up", ms: Date.now() - started, detail: `HTTP ${res.status}` };
  } catch (err) {
    return {
      state: "down",
      ms: Date.now() - started,
      detail: err instanceof Error ? err.name : "fetch failed",
    };
  }
}

export const Route = createFileRoute("/api/healthz")({
  server: {
    handlers: {
      GET: async () => {
        const started = Date.now();
        const [database, whatsapp] = await Promise.all([checkDatabase(), checkWhatsappBridge()]);

        const healthy = database.state === "up";
        const degraded = healthy && whatsapp.state === "down";
        const status = !healthy ? "unhealthy" : degraded ? "degraded" : "healthy";

        return new Response(
          JSON.stringify({
            ok: healthy,
            status,
            checks: { database, whatsapp },
            durationMs: Date.now() - started,
          }),
          {
            // Only a genuine "do not send me traffic" condition is non-200.
            // A degraded bridge stays 200 so Docker does not restart the app.
            status: healthy ? 200 : 503,
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
            },
          },
        );
      },
    },
  },
});
