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

export interface WhatsappTopProduct {
  rank: number;
  product_name: string;
  mention_count: number;
  group_count: number;
  sender_count: number;
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

export const fetchWhatsappTopProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuthNode20])
  .inputValidator((input: unknown) =>
    z
      .object({
        range: z.number().int().positive().max(365).optional(),
        limit: z.number().int().positive().max(100).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<WhatsappTopProductsResult> => {
    await assertAllowed(context.userId);
    const range = data.range ?? 30;
    const limit = data.limit ?? 30;
    try {
      const json = (await getJson(
        `${baseUrl()}/api/v1/reports/top-products?range=${range}&limit=${limit}`,
      )) as { generated_at?: string; products?: WhatsappTopProduct[] };
      return {
        ok: true,
        generated_at: json.generated_at ?? null,
        products: Array.isArray(json.products) ? json.products : [],
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
        range: z.number().int().positive().max(365).optional(),
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
