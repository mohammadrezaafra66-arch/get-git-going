import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  authenticateBot, checkBotRateLimit, clientIp, extractBotKey, isUuid, jsonResponse,
  logBotUsage, mapBotError,
} from "@/server/bot-api";

export const Route = createFileRoute("/api/public/bot/products/$productId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ip = clientIp(request);
        const productId = params.productId;
        const endpoint = `/api/public/bot/products/${productId}`;

        if (!isUuid(productId)) {
          logBotUsage({ api_key_id: null, table_id: null, endpoint, method: "GET",
            status_code: 400, error_code: "invalid_product_id", ip });
          return jsonResponse(400, { error: "invalid_product_id", message: "شناسه محصول نامعتبر است." });
        }

        const auth = await authenticateBot(extractBotKey(request));
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

        const { data, error } = await supabaseAdmin.rpc("bot_get_product_for_key", {
          p_key_id: auth.keyId,
          p_product_id: productId,
        });

        if (error) {
          let code = "server_error", status = 500, message = "خطای داخلی سرور.";
          const msg = error.message || "";
          if (/forbidden_product/.test(msg)) {
            code = "forbidden_product"; status = 403;
            message = "این کلید به این محصول دسترسی ندارد (هیچ‌یک از برچسب‌های مجاز این کلید روی محصول نیست).";
          } else {
            const m = mapBotError(msg);
            code = m.code; status = m.status; message = m.message;
          }
          logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "GET",
            status_code: status, error_code: code, ip });
          return jsonResponse(status, { error: code, message });
        }

        if (!data) {
          logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "GET",
            status_code: 404, error_code: "product_not_found", ip });
          return jsonResponse(404, { error: "product_not_found", message: "محصولی با این شناسه یافت نشد." });
        }

        logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "GET",
          status_code: 200, ip, response_count: 1 });

        return jsonResponse(200, { product: data });
      },
    },
  },
});