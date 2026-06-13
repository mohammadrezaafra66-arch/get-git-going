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
