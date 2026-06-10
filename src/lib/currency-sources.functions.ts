/**
 * Server-side fetch of an external currency rate using a stored API key.
 * The API key never leaves the server — the client only receives the parsed
 * numeric rate. Restricted to admin/accountant roles (matches the UI guard).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const InputSchema = z.object({
  sourceId: z.string().uuid(),
  currency: z.enum(["usd", "aed"]),
});

const ALLOWED_ROLES = new Set(["admin", "accountant"]);
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Block private, loopback, link-local, and reserved IP ranges to prevent SSRF
 * against internal infrastructure (cloud metadata, DB ports, etc.).
 */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // IPv6 loopback / unspecified / link-local / unique-local
  if (h === "::1" || h === "::" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  // IPv4 literal?
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
  }
  return false;
}

function assertSafeUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("URL منبع نامعتبر است");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("فقط آدرس‌های http/https مجاز هستند");
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new Error("آدرس داخلی/خصوصی مجاز نیست");
  }
  return parsed;
}

export interface AutoFetchRateResult {
  rate: number;
}

export const autoFetchCurrencyRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<AutoFetchRateResult> => {
    const { supabase, userId } = context;

    // Role check — only privileged finance roles may trigger external fetches.
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    if (!roles.some((r) => ALLOWED_ROLES.has(r))) {
      throw new Error("forbidden");
    }

    // Read the source server-side (RLS still applies as the user).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: src, error: srcErr } = await supabaseAdmin
      .from("currency_sources")
      .select("id, url, api_key, is_active")
      .eq("id", data.sourceId)
      .maybeSingle();
    if (srcErr) throw new Error(srcErr.message);
    if (!src) throw new Error("منبع یافت نشد");
    if (!src.is_active) throw new Error("منبع غیرفعال است");
    if (!src.url) throw new Error("URL منبع تعریف نشده است");

    // SSRF guard — reject internal/private targets before fetching.
    assertSafeUrl(src.url);

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (src.api_key) headers.Authorization = `Bearer ${src.api_key}`;
      res = await fetch(src.url, { signal: ctrl.signal, headers });
    } finally {
      clearTimeout(t);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();
    let parsed: number | null = null;
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      const candidate =
        (j as Record<string, unknown>)[data.currency] ??
        (j as Record<string, unknown>).rate ??
        (j as Record<string, unknown>).price ??
        (j as Record<string, unknown>).value;
      if (typeof candidate === "number") parsed = candidate;
      else if (typeof candidate === "string") parsed = Number(candidate);
    } catch {
      /* not JSON */
    }
    if (parsed === null) {
      const num = Number(text.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(num) && num > 0) parsed = num;
    }
    if (!parsed || parsed <= 0) {
      throw new Error("نرخ معتبری در پاسخ منبع یافت نشد");
    }
    return { rate: parsed };
  });