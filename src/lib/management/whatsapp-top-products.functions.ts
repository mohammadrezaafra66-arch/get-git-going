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
 * Upstream clamps at 1000 (product_reports.clamp_limit(limit, hi=1000)), so that
 * is the hard ceiling here too — asking for more just wastes a round trip.
 * Measured: limit=1000 returns 1000 rows, limit=5000 also returns 1000.
 *
 * The default is SERVER-SIDE and env-configurable on purpose: the row count must
 * be changeable without a rebuild, unlike a VITE_* value. Empty env = 1000.
 */
const UPSTREAM_MAX_LIMIT = 1000;

function defaultTopProductsLimit(): number {
  const raw = Number(process.env.WHATSAPP_TOP_PRODUCTS_LIMIT);
  if (!Number.isFinite(raw) || raw <= 0) return UPSTREAM_MAX_LIMIT;
  return Math.min(Math.trunc(raw), UPSTREAM_MAX_LIMIT);
}

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
  last_mentioned_at: string | null;
  last_mentioned_shamsi: string | null;
  sources: string[];
}

export interface WhatsappProductSeller {
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
  | { ok: true; product_name: string; mentioners: WhatsappProductSeller[] }
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

type RawTopProduct = Partial<WhatsappTopProduct> & {
  product_name?: string;
  last_mention_shamsi?: string | null;
};

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
    last_mentioned_at: p.last_mentioned_at ?? null,
    last_mentioned_shamsi: p.last_mentioned_shamsi ?? p.last_mention_shamsi ?? null,
    sources: Array.isArray(p.sources) ? p.sources.map(String) : [],
  };
}

function normalizeSeller(raw: Record<string, unknown>): WhatsappProductSeller {
  const contacts = raw.all_contacts;
  return {
    timestamp: typeof raw.timestamp === "string" ? raw.timestamp : null,
    timestamp_shamsi:
      (typeof raw.timestamp_shamsi === "string" && raw.timestamp_shamsi) ||
      (typeof raw.time_shamsi === "string" && raw.time_shamsi) ||
      null,
    group_name: typeof raw.group_name === "string" ? raw.group_name : null,
    sender_display_name:
      (typeof raw.sender_display_name === "string" && raw.sender_display_name) ||
      (typeof raw.sender_name === "string" && raw.sender_name) ||
      null,
    sender_phone: typeof raw.sender_phone === "string" ? raw.sender_phone : null,
    sender_phone_secondary:
      typeof raw.sender_phone_secondary === "string" ? raw.sender_phone_secondary : null,
    all_contacts: Array.isArray(contacts) ? contacts.map(String) : [],
    message_preview: typeof raw.message_preview === "string" ? raw.message_preview : null,
  };
}

export async function getWhatsappTopProductsSnapshot(input?: {
  range?: number;
  limit?: number;
  search?: string | null;
}): Promise<WhatsappTopProductsResult> {
  const range = input?.range ?? 30;
  const limit = Math.min(input?.limit ?? defaultTopProductsLimit(), UPSTREAM_MAX_LIMIT);
  const params = new URLSearchParams({
    days: String(range),
    limit: String(limit),
  });
  if (input?.search?.trim()) params.set("search", input.search.trim());

  try {
    // Mirror the source page's own reporting endpoint exactly. The older
    // /reports/top-products endpoint is a compatibility API with a different
    // shape and is not the table the user sees on /reporting.
    const json = (await getJson(`${baseUrl()}/api/v1/reporting/top-products?${params}`)) as {
      generated_at?: string;
      products?: RawTopProduct[];
    };
    return {
      ok: true,
      generated_at: json.generated_at ?? null,
      products: Array.isArray(json.products) ? json.products.map(normalizeTopProduct) : [],
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "unreachable" };
  }
}

export async function getWhatsappProductSellersSnapshot(input: {
  productName: string;
  range?: number;
  limit?: number;
}): Promise<WhatsappMentionersResult> {
  const range = input.range ?? 30;
  const limit = input.limit ?? 100;
  const params = new URLSearchParams({
    product_name: input.productName,
    days: String(range),
    limit: String(limit),
  });

  try {
    const json = (await getJson(`${baseUrl()}/api/v1/reporting/product-sellers?${params}`)) as {
      product_name?: string;
      sellers?: Record<string, unknown>[];
    };
    return {
      ok: true,
      product_name: json.product_name ?? input.productName,
      mentioners: Array.isArray(json.sellers) ? json.sellers.map(normalizeSeller) : [],
    };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "unreachable" };
  }
}

export const fetchWhatsappTopProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthNode20])
  .inputValidator((input: unknown) =>
    z
      .object({
        range: z.number().int().positive().max(365).optional(),
        limit: z.number().int().positive().max(UPSTREAM_MAX_LIMIT).optional(),
        // Searched UPSTREAM over the full merged set, BEFORE the limit is applied
        // (product_reports.top_products_rows). Never filtered client-side here, so
        // a match ranked below the visible window is still found.
        search: z.string().trim().min(1).max(200).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<WhatsappTopProductsResult> => {
    await assertAllowed(context.userId);
    return getWhatsappTopProductsSnapshot({
      range: data.range,
      limit: data.limit,
      search: data.search,
    });
  });

export const fetchWhatsappMentioners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthNode20])
  .inputValidator((input: unknown) =>
    z
      .object({
        productName: z.string().min(1).max(300),
        range: z.number().int().positive().max(365).optional(),
        limit: z.number().int().positive().max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<WhatsappMentionersResult> => {
    await assertAllowed(context.userId);
    return getWhatsappProductSellersSnapshot({
      productName: data.productName,
      range: data.range,
      limit: data.limit,
    });
  });
