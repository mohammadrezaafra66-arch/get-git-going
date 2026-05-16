import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  authenticateBot, checkBotRateLimit, clientIp, extractBearer, jsonResponse, logBotUsage,
} from "@/server/bot-api";

const MAX_BODY_BYTES = 8 * 1024;
const ALLOWED_SOURCES = new Set(["torob", "purchista", "other"]);
const MAX_URL_LEN = 2048;
const MAX_ID_LEN = 255;

export const Route = createFileRoute("/api/public/bot/market-matches/resolve")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = clientIp(request);
        const endpoint = "/api/public/bot/market-matches/resolve";

        const auth = await authenticateBot(extractBearer(request.headers.get("authorization")));
        if (!auth.ok) {
          logBotUsage({ api_key_id: null, table_id: null, endpoint, method: "POST",
            status_code: auth.status, error_code: auth.code, ip });
          await checkBotRateLimit(null, ip);
          return jsonResponse(auth.status, { error: auth.code, message: auth.message });
        }

        const rl = await checkBotRateLimit(auth.keyId, ip);
        if (!rl.ok) {
          logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "POST",
            status_code: 429, error_code: rl.code, ip });
          return new Response(JSON.stringify({ error: rl.code, message: rl.message }), {
            status: 429,
            headers: { "Content-Type": "application/json; charset=utf-8", "Retry-After": String(rl.retryAfter) },
          });
        }

        let raw: string;
        try { raw = await request.text(); } catch {
          return jsonResponse(400, { error: "body_read_failed", message: "خواندن بدنه ممکن نشد." });
        }
        if (raw.length > MAX_BODY_BYTES) {
          return jsonResponse(413, { error: "body_too_large", message: "بدنه بیش از حد مجاز است." });
        }

        let body: Record<string, unknown>;
        try {
          const parsed = raw.length ? JSON.parse(raw) : {};
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not object");
          body = parsed as Record<string, unknown>;
        } catch {
          logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "POST",
            status_code: 400, error_code: "invalid_payload", ip, request_size: raw.length });
          return jsonResponse(400, { error: "invalid_payload", message: "بدنه JSON معتبر نیست." });
        }

        const sourceName = typeof body.source_name === "string" ? body.source_name.trim() : "";
        if (!ALLOWED_SOURCES.has(sourceName)) {
          logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "POST",
            status_code: 400, error_code: "invalid_source_name", ip, request_size: raw.length });
          return jsonResponse(400, { error: "invalid_source_name",
            message: "source_name باید یکی از torob، purchista یا other باشد." });
        }

        const sourceUrlRaw = typeof body.source_product_url === "string" ? body.source_product_url.trim() : "";
        const sourceIdRaw = typeof body.source_product_id === "string" ? body.source_product_id.trim() : "";
        const sourceProductUrl = sourceUrlRaw.length > 0 ? sourceUrlRaw : null;
        const sourceProductId = sourceIdRaw.length > 0 ? sourceIdRaw : null;

        if (!sourceProductUrl && !sourceProductId) {
          logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "POST",
            status_code: 400, error_code: "missing_source_reference", ip, request_size: raw.length });
          return jsonResponse(400, { error: "missing_source_reference",
            message: "حداقل یکی از source_product_url یا source_product_id الزامی است." });
        }
        if ((sourceProductUrl && sourceProductUrl.length > MAX_URL_LEN)
          || (sourceProductId && sourceProductId.length > MAX_ID_LEN)) {
          return jsonResponse(400, { error: "invalid_payload", message: "طول شناسه‌ها بیش از حد مجاز است." });
        }

        const { data, error } = await supabaseAdmin.rpc("resolve_market_product_match", {
          p_source_name: sourceName as "torob" | "purchista" | "other",
          p_source_product_url: sourceProductUrl as unknown as string,
          p_source_product_id: sourceProductId as unknown as string,
        });

        if (error) {
          console.error("[bot-market-matches] resolve error:", error.message);
          logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "POST",
            status_code: 500, error_code: "server_error", ip, request_size: raw.length });
          return jsonResponse(500, { error: "server_error", message: "خطای داخلی هنگام resolve." });
        }

        const row = (Array.isArray(data) ? data[0] : data) as
          | { match_id: string; afrakala_product_id: string; match_status: string; confidence_score: number | null }
          | null
          | undefined;

        if (!row || row.match_status !== "approved" || !row.afrakala_product_id) {
          logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "POST",
            status_code: 200, error_code: "approved_match_not_found", ip, request_size: raw.length });
          return jsonResponse(200, { resolved: false, reason: "approved_match_not_found" });
        }

        logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "POST",
          status_code: 200, ip, request_size: raw.length });

        return jsonResponse(200, {
          resolved: true,
          match_id: row.match_id,
          afrakala_product_id: row.afrakala_product_id,
          match_status: "approved",
          confidence_score: row.confidence_score,
        });
      },
    },
  },
});