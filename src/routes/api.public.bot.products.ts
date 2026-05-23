import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  authenticateBot, checkBotRateLimit, clientIp, extractBearer, isUuid, jsonResponse,
  logBotUsage, mapBotError,
} from "@/server/bot-api";

export const Route = createFileRoute("/api/public/bot/products")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ip = clientIp(request);
        const endpoint = "/api/public/bot/products";

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

        const url = new URL(request.url);
        const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
        const rawSize = Number(url.searchParams.get("page_size") ?? "50") || 50;
        const pageSize = Math.min(100, Math.max(1, rawSize));
        const labelParam = url.searchParams.get("label_id");
        const updatedSince = url.searchParams.get("updated_since");

        if (labelParam && !isUuid(labelParam)) {
          logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "GET",
            status_code: 400, error_code: "invalid_label_id", ip });
          return jsonResponse(400, { error: "invalid_label_id", message: "شناسه برچسب نامعتبر است." });
        }

        const { data, error } = await supabaseAdmin.rpc("bot_list_products_for_key", {
          p_key_id: auth.keyId,
          p_label_id: labelParam ?? undefined,
          p_updated_since: updatedSince ?? undefined,
          p_page: page,
          p_page_size: pageSize,
        });

        if (error) {
          let code = "server_error", status = 500, message = "خطای داخلی سرور.";
          const msg = error.message || "";
          if (/forbidden_no_labels/.test(msg)) {
            code = "forbidden_no_labels"; status = 403;
            message = "این کلید به هیچ برچسب محصولی دسترسی ندارد. ابتدا از صفحه «دسترسی برچسب‌های محصول» برچسب مجاز را تنظیم کنید.";
          } else if (/forbidden_label/.test(msg)) {
            code = "forbidden_label"; status = 403;
            message = "این کلید به برچسب درخواست‌شده دسترسی ندارد.";
          } else {
            const m = mapBotError(msg);
            code = m.code; status = m.status; message = m.message;
          }
          logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "GET",
            status_code: status, error_code: code, ip });
          return jsonResponse(status, { error: code, message });
        }

        const list = (data ?? []) as Array<{ total_count: number | string; product: Record<string, unknown> }>;
        const total = list.length ? Number(list[0].total_count ?? 0) : 0;
        const products = list.map((r) => r.product);

        logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "GET",
          status_code: 200, ip, response_count: products.length });

        return jsonResponse(200, {
          products,
          pagination: {
            page, page_size: pageSize, total,
            total_pages: Math.ceil(total / pageSize),
          },
        });
      },
    },
  },
});