import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  authenticateBot, checkBotRateLimit, clientIp, extractBearer, jsonResponse, logBotUsage,
} from "@/server/bot-api";

const SLUG_RE = /^[a-z0-9-]{2,64}$/;

export const Route = createFileRoute("/api/public/bot/dynamic-tables/by-slug/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ip = clientIp(request);
        const slug = params.slug;
        const endpoint = `/api/public/bot/dynamic-tables/by-slug/${slug}`;

        if (!SLUG_RE.test(slug)) {
          logBotUsage({ api_key_id: null, table_id: null, endpoint, method: "GET",
            status_code: 400, error_code: "invalid_slug", ip });
          return jsonResponse(400, { error: "invalid_slug", message: "شناسه slug جدول نامعتبر است." });
        }

        const auth = await authenticateBot(extractBearer(request.headers.get("authorization")));
        if (!auth.ok) {
          logBotUsage({ api_key_id: null, table_id: null, endpoint, method: "GET",
            status_code: auth.status, error_code: auth.code, ip });
          await checkBotRateLimit(null, ip);
          return jsonResponse(auth.status, { error: auth.code, message: auth.message });
        }

        const rl = await checkBotRateLimit(auth.keyId, ip);
        if (!rl.ok) {
          logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "GET",
            status_code: 429, error_code: rl.code, ip });
          return new Response(JSON.stringify({ error: rl.code, message: rl.message }), {
            status: 429,
            headers: { "Content-Type": "application/json; charset=utf-8", "Retry-After": String(rl.retryAfter) },
          });
        }

        const { data: table, error: tErr } = await supabaseAdmin
          .from("dynamic_tables")
          .select("id, name, slug, is_active")
          .eq("slug", slug)
          .maybeSingle();

        if (tErr) {
          logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "GET",
            status_code: 500, error_code: "server_error", ip });
          return jsonResponse(500, { error: "server_error", message: "خطا در خواندن اطلاعات جدول." });
        }
        if (!table) {
          logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "GET",
            status_code: 404, error_code: "table_not_found", ip });
          return jsonResponse(404, { error: "table_not_found", message: "جدولی با این slug یافت نشد." });
        }

        // Enforce that the key has access to this table
        const { data: access } = await supabaseAdmin
          .from("bot_api_key_table_access")
          .select("can_read, can_update")
          .eq("api_key_id", auth.keyId)
          .eq("table_id", table.id)
          .maybeSingle();

        if (!access) {
          logBotUsage({ api_key_id: auth.keyId, table_id: table.id, endpoint, method: "GET",
            status_code: 403, error_code: "forbidden_table", ip });
          return jsonResponse(403, {
            error: "forbidden_table",
            message: "این کلید به جدول درخواست‌شده دسترسی ندارد.",
          });
        }

        const { data: cols } = await supabaseAdmin
          .from("dynamic_table_columns")
          .select("column_key, label, data_type, is_required, is_filterable, is_editable_by_bot, is_computed, formula_key, sort_order")
          .eq("table_id", table.id)
          .order("sort_order", { ascending: true });

        logBotUsage({ api_key_id: auth.keyId, table_id: table.id, endpoint, method: "GET",
          status_code: 200, ip, response_count: (cols ?? []).length });

        return jsonResponse(200, {
          table: {
            id: table.id,
            name: table.name,
            slug: table.slug,
            is_active: table.is_active,
          },
          access: {
            can_read: !!access.can_read,
            can_update: !!access.can_update,
          },
          columns: (cols ?? []).map((c) => ({
            column_key: c.column_key,
            label: c.label,
            data_type: c.data_type,
            is_required: !!c.is_required,
            is_filterable: !!c.is_filterable,
            is_editable_by_bot: !!c.is_editable_by_bot,
            is_computed: !!c.is_computed,
            formula_key: c.formula_key ?? null,
          })),
        });
      },
    },
  },
});