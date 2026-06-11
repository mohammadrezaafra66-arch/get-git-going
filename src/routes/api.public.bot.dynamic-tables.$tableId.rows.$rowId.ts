import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  authenticateBot,
  checkBotRateLimit,
  clientIp,
  extractBearer,
  isUuid,
  jsonResponse,
  logBotUsage,
  mapBotError,
} from "@/server/bot-api";

const MAX_BODY_BYTES = 64 * 1024;

export const Route = createFileRoute("/api/public/bot/dynamic-tables/$tableId/rows/$rowId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const ip = clientIp(request);
        const tableId = params.tableId;
        const rowId = params.rowId;
        const endpoint = `/api/public/bot/dynamic-tables/${tableId}/rows/${rowId}`;

        if (!isUuid(tableId) || !isUuid(rowId)) {
          logBotUsage({
            api_key_id: null,
            table_id: null,
            endpoint,
            method: "PATCH",
            status_code: 400,
            error_code: "invalid_id",
            ip,
          });
          return jsonResponse(400, {
            error: "invalid_id",
            message: "شناسه جدول یا ردیف نامعتبر است.",
          });
        }

        const auth = await authenticateBot(extractBearer(request.headers.get("authorization")));
        if (!auth.ok) {
          logBotUsage({
            api_key_id: null,
            table_id: tableId,
            endpoint,
            method: "PATCH",
            status_code: auth.status,
            error_code: auth.code,
            ip,
          });
          await checkBotRateLimit(null, ip);
          return jsonResponse(auth.status, { error: auth.code, message: auth.message });
        }

        const rl = await checkBotRateLimit(auth.keyId, ip);
        if (!rl.ok) {
          logBotUsage({
            api_key_id: auth.keyId,
            table_id: tableId,
            endpoint,
            method: "PATCH",
            status_code: 429,
            error_code: rl.code,
            ip,
          });
          return new Response(JSON.stringify({ error: rl.code, message: rl.message }), {
            status: 429,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Retry-After": String(rl.retryAfter),
            },
          });
        }

        // Read & size-limit body
        let raw: string;
        try {
          raw = await request.text();
        } catch {
          logBotUsage({
            api_key_id: auth.keyId,
            table_id: tableId,
            endpoint,
            method: "PATCH",
            status_code: 400,
            error_code: "body_read_failed",
            ip,
          });
          return jsonResponse(400, {
            error: "body_read_failed",
            message: "خواندن بدنه درخواست ممکن نشد.",
          });
        }
        if (raw.length > MAX_BODY_BYTES) {
          logBotUsage({
            api_key_id: auth.keyId,
            table_id: tableId,
            endpoint,
            method: "PATCH",
            status_code: 413,
            error_code: "body_too_large",
            ip,
            request_size: raw.length,
          });
          return jsonResponse(413, {
            error: "body_too_large",
            message: "اندازه بدنه درخواست بیش از حد مجاز است.",
          });
        }

        let body: unknown;
        try {
          body = raw.length ? JSON.parse(raw) : {};
        } catch {
          logBotUsage({
            api_key_id: auth.keyId,
            table_id: tableId,
            endpoint,
            method: "PATCH",
            status_code: 400,
            error_code: "invalid_json",
            ip,
            request_size: raw.length,
          });
          return jsonResponse(400, {
            error: "invalid_json",
            message: "بدنه درخواست JSON معتبر نیست.",
          });
        }

        const values =
          body &&
          typeof body === "object" &&
          !Array.isArray(body) &&
          "values" in (body as Record<string, unknown>)
            ? (body as { values: unknown }).values
            : body;

        if (!values || typeof values !== "object" || Array.isArray(values)) {
          logBotUsage({
            api_key_id: auth.keyId,
            table_id: tableId,
            endpoint,
            method: "PATCH",
            status_code: 400,
            error_code: "invalid_values",
            ip,
            request_size: raw.length,
          });
          return jsonResponse(400, {
            error: "invalid_values",
            message: "فیلد values باید یک آبجکت JSON باشد.",
          });
        }

        const { data, error } = await supabaseAdmin.rpc("bot_update_table_row", {
          p_key_id: auth.keyId,
          p_table_id: tableId,
          p_row_id: rowId,
          p_values: values as unknown as never,
        });

        if (error) {
          const m = mapBotError(error.message);
          logBotUsage({
            api_key_id: auth.keyId,
            table_id: tableId,
            endpoint,
            method: "PATCH",
            status_code: m.status,
            error_code: m.code,
            ip,
            request_size: raw.length,
          });
          return jsonResponse(m.status, { error: m.code, message: m.message });
        }

        const row = (Array.isArray(data) ? data[0] : data) as {
          updated_count: number | null;
          applied_keys: string[] | null;
        } | null;
        const applied = row?.applied_keys ?? [];

        logBotUsage({
          api_key_id: auth.keyId,
          table_id: tableId,
          endpoint,
          method: "PATCH",
          status_code: 200,
          ip,
          request_size: raw.length,
          response_count: applied.length,
        });

        return jsonResponse(200, {
          row_id: rowId,
          updated_count: applied.length,
          applied_columns: applied,
        });
      },
    },
  },
});
