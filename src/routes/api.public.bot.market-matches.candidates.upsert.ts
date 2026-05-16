import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  authenticateBot, checkBotRateLimit, clientIp, extractBearer, jsonResponse, logBotUsage,
} from "@/server/bot-api";

const MAX_BODY_BYTES = 16 * 1024;
const ALLOWED_SOURCES = new Set(["torob", "purchista", "other"]);
const MAX_URL_LEN = 2048;
const MAX_ID_LEN = 255;
const MAX_TITLE_LEN = 1000;
const MAX_NOTES_LEN = 2000;

export const Route = createFileRoute("/api/public/bot/market-matches/candidates/upsert")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = clientIp(request);
        const endpoint = "/api/public/bot/market-matches/candidates/upsert";

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
          logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "POST",
            status_code: 400, error_code: "body_read_failed", ip });
          return jsonResponse(400, { error: "body_read_failed", message: "خواندن بدنه ممکن نشد." });
        }
        if (raw.length > MAX_BODY_BYTES) {
          logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "POST",
            status_code: 413, error_code: "body_too_large", ip, request_size: raw.length });
          return jsonResponse(413, { error: "body_too_large", message: "بدنه بیش از حد مجاز است." });
        }

        let body: Record<string, unknown>;
        try {
          const parsed = raw.length ? JSON.parse(raw) : {};
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("not object");
          }
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
        if (sourceProductUrl && sourceProductUrl.length > MAX_URL_LEN) {
          return jsonResponse(400, { error: "invalid_payload", message: "source_product_url طولانی‌تر از حد مجاز است." });
        }
        if (sourceProductId && sourceProductId.length > MAX_ID_LEN) {
          return jsonResponse(400, { error: "invalid_payload", message: "source_product_id طولانی‌تر از حد مجاز است." });
        }

        const sourceTitle = typeof body.source_title === "string" ? body.source_title.trim() : "";
        if (!sourceTitle) {
          logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "POST",
            status_code: 400, error_code: "invalid_payload", ip, request_size: raw.length });
          return jsonResponse(400, { error: "invalid_payload", message: "source_title الزامی است." });
        }
        if (sourceTitle.length > MAX_TITLE_LEN) {
          return jsonResponse(400, { error: "invalid_payload", message: "source_title بیش از حد طولانی است." });
        }

        const normalized = typeof body.normalized_source_title === "string"
          ? body.normalized_source_title.trim().slice(0, MAX_TITLE_LEN) || null
          : null;

        let confidence: number | null = null;
        if (body.confidence_score !== undefined && body.confidence_score !== null) {
          const n = Number(body.confidence_score);
          if (!Number.isFinite(n) || n < 0 || n > 100) {
            logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "POST",
              status_code: 400, error_code: "invalid_confidence_score", ip, request_size: raw.length });
            return jsonResponse(400, { error: "invalid_confidence_score",
              message: "confidence_score باید بین 0 و 100 باشد." });
          }
          confidence = n;
        }

        const notes = typeof body.notes === "string"
          ? body.notes.trim().slice(0, MAX_NOTES_LEN) || null
          : null;

        const { data, error } = await supabaseAdmin.rpc("upsert_market_product_match_candidate", {
          p_source_name: sourceName as "torob" | "purchista" | "other",
          p_source_product_url: sourceProductUrl,
          p_source_product_id: sourceProductId,
          p_source_title: sourceTitle,
          p_normalized_source_title: normalized,
          p_confidence_score: confidence,
          p_notes: notes,
        });

        if (error) {
          console.error("[bot-market-matches] upsert error:", error.message);
          logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "POST",
            status_code: 500, error_code: "server_error", ip, request_size: raw.length });
          return jsonResponse(500, { error: "server_error", message: "خطای داخلی هنگام ثبت کاندید." });
        }

        const row = (Array.isArray(data) ? data[0] : data) as
          | { match_id: string; match_status: string; created_or_updated: string }
          | null;
        if (!row) {
          logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "POST",
            status_code: 500, error_code: "server_error", ip, request_size: raw.length });
          return jsonResponse(500, { error: "server_error", message: "خروجی نامعتبر از RPC." });
        }

        const status = row.created_or_updated === "created" ? 201 : 200;
        logBotUsage({ api_key_id: auth.keyId, table_id: null, endpoint, method: "POST",
          status_code: status, ip, request_size: raw.length });

        // Intentionally exclude afrakala_product_id — candidates are never auto-linked.
        return jsonResponse(status, {
          match_id: row.match_id,
          match_status: row.match_status,
          created_or_updated: row.created_or_updated,
        });
      },
    },
  },
});