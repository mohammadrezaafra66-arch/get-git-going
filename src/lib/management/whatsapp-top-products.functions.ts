import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuthNode20 } from "@/integrations/supabase/messenger-auth-middleware";

/**
 * Server-side read-only proxy to the SEPARATE WhatsApp platform (claudegreenapi),
 * which owns real customer-conversation demand data.
 *
 * Base URL is a SERVER-ONLY, env-configurable value (never a VITE_* client var,
 * which would bake into the bundle and can't be re-pointed after the machine
 * move). Mirrors the NAVASAN_BASE_URL convention. Default points at the current
 * co-located platform; override via WHATSAPP_PLATFORM_BASE_URL in .env.lan.
 */
const baseUrl = () =>
  (process.env.WHATSAPP_PLATFORM_BASE_URL ?? "http://192.168.170.8:8002").replace(/\/+$/, "");

const TIMEOUT_MS = 5000;
const ALLOWED_ROLES = ["admin", "manager", "accountant"];

/**
 * Kept in sync with the WhatsApp platform's just-expanded reporting filters:
 *  - ALL_TIME_DAYS: the platform's بازه picker now goes up to "all time"; its report cutoff is
 *    `now - days` with no upper bound, so a ~100-year day-count is an effectively unbounded window.
 *  - MAX_PUBLIC_LIMIT: the platform's UI تعداد picker now goes to 1000, but the PUBLIC
 *    /api/v1/reports/top-products endpoint this proxy calls clamps the count at 500 — so 500 is the
 *    real ceiling reachable from here.
 *  - DEFAULT_LIMIT: pull a wider default slice than the original 150 so the low-mention
 *    "خارج از دستیار" tail isn't silently truncated, given the now-much-larger available range.
 */
export const ALL_TIME_DAYS = 36500;
export const MAX_PUBLIC_LIMIT = 500;
export const DEFAULT_LIMIT = 300;

export interface WhatsappTopProduct {
  /** Set only when the platform matched the mention to a catalog product. */
  product_id: string | null;
  /** true = product exists in our assistant catalog, false = "خارج از دستیار". */
  in_assistant: boolean;
  /** Platform-supplied Persian label for the flag above. */
  assistant_status: string | null;
  rank: number;
  product_name: string;
  mention_count: number;
  group_count: number;
  sender_count: number;
  /** Where this product was mentioned, per the platform's V40 source tagging:
   *  "pv" (private message), "group" (group message), "status" (WhatsApp Status/story,
   *  incl. products detected from story images). May contain several when a product was
   *  seen across channels. Empty only on an older platform build that predates tagging. */
  sources: string[];
  last_mentioned_at: string | null;
  last_mentioned_shamsi: string | null;
}

export interface WhatsappMentioner {
  timestamp: string | null;
  timestamp_shamsi: string | null;
  group_name: string | null;
  sender_display_name: string | null;
  sender_phone: string | null;
  sender_phone_secondary: string | null;
  all_contacts: string[];
  message_preview: string | null;
}

export type WhatsappTopProductsResult =
  | { ok: true; generated_at: string | null; products: WhatsappTopProduct[] }
  | { ok: false; reason: string };

export type WhatsappMentionersResult =
  | { ok: true; product_name: string; mentioners: WhatsappMentioner[] }
  | { ok: false; reason: string };

/** Defense-in-depth: the page already guards admin/manager/accountant, but a
 *  server function is directly callable, so re-check the caller's role here
 *  (read user_roles directly — has_role is overloaded and unresolvable via RPC). */
async function assertAllowed(userId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => String(r.role));
  if (!roles.some((r) => ALLOWED_ROLES.includes(r))) {
    throw new Error("دسترسی لازم برای این داده را ندارید.");
  }
}

/** Fetch JSON with a hard timeout so a hung external call can't stall the page. */
async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

type RawTopProduct = Partial<WhatsappTopProduct> & { product_name?: string };

/** Tolerate the pre-fix upstream shape, which had no assistant-match fields:
 *  only an explicit `false` marks a row as non-catalog, so an older platform
 *  build degrades to "all catalog" rather than mislabelling everything. */
function normalizeTopProduct(p: RawTopProduct): WhatsappTopProduct {
  return {
    product_id: p.product_id ?? null,
    in_assistant: p.in_assistant !== false,
    assistant_status: p.assistant_status ?? null,
    rank: Number(p.rank ?? 0),
    product_name: String(p.product_name ?? ""),
    mention_count: Number(p.mention_count ?? 0),
    group_count: Number(p.group_count ?? 0),
    sender_count: Number(p.sender_count ?? 0),
    // Keep only clean string tags; an older platform build that omits `sources`
    // degrades to an empty list (no source chips) rather than erroring.
    sources: Array.isArray(p.sources)
      ? p.sources.filter((s): s is string => typeof s === "string" && s.length > 0)
      : [],
    last_mentioned_at: p.last_mentioned_at ?? null,
    last_mentioned_shamsi: p.last_mentioned_shamsi ?? null,
  };
}

export const fetchWhatsappTopProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthNode20])
  .inputValidator((input: unknown) =>
    z
      .object({
        // The platform's بازه (range) picker was expanded up to "all time"; accept any
        // positive day count (ALL_TIME_DAYS ≈ 100 years is its unbounded sentinel).
        range: z.number().int().positive().max(ALL_TIME_DAYS).optional(),
        // The platform's public reports endpoint clamps the count at 500 (its تعداد picker
        // now offers up to 1000, but /api/v1/reports caps at 500), so 500 is the real max
        // reachable from here.
        limit: z.number().int().positive().max(MAX_PUBLIC_LIMIT).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<WhatsappTopProductsResult> => {
    await assertAllowed(context.userId);
    const range = data.range ?? 30;
    // The platform reports EVERY product mentioned in real messages — both
    // catalog matches and non-catalog/competitor items ("خارج از دستیار"), which
    // sit in the low-mention tail. A small limit silently truncates that tail and
    // makes the card look catalog-only. Now that the platform serves a much larger
    // window, pull a wider slice by default (still within the 500 public ceiling).
    const limit = data.limit ?? DEFAULT_LIMIT;
    try {
      const json = (await getJson(
        `${baseUrl()}/api/v1/reports/top-products?range=${range}&limit=${limit}`,
      )) as { generated_at?: string; products?: RawTopProduct[] };
      return {
        ok: true,
        generated_at: json.generated_at ?? null,
        products: Array.isArray(json.products) ? json.products.map(normalizeTopProduct) : [],
      };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "unreachable" };
    }
  });

export const fetchWhatsappMentioners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthNode20])
  .inputValidator((input: unknown) =>
    z
      .object({
        productName: z.string().min(1).max(300),
        // Match the expanded بازه range so a mentioners drill-down over a wider window works too.
        range: z.number().int().positive().max(ALL_TIME_DAYS).optional(),
        limit: z.number().int().positive().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<WhatsappMentionersResult> => {
    await assertAllowed(context.userId);
    const range = data.range ?? 30;
    const limit = data.limit ?? 100;
    // {product_name} is the product's NAME STRING — always URL-encode it.
    const seg = encodeURIComponent(data.productName);
    try {
      const json = (await getJson(
        `${baseUrl()}/api/v1/reports/top-products/${seg}/mentioners?range=${range}&limit=${limit}`,
      )) as { product_name?: string; mentioners?: WhatsappMentioner[] };
      return {
        ok: true,
        product_name: json.product_name ?? data.productName,
        mentioners: Array.isArray(json.mentioners) ? json.mentioners : [],
      };
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : "unreachable" };
    }
  });
