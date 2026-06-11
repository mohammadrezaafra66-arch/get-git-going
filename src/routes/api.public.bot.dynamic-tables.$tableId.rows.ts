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

export const Route = createFileRoute("/api/public/bot/dynamic-tables/$tableId/rows")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ip = clientIp(request);
        const tableId = params.tableId;
        const endpoint = `/api/public/bot/dynamic-tables/${tableId}/rows`;

        if (!isUuid(tableId)) {
          logBotUsage({
            api_key_id: null,
            table_id: null,
            endpoint,
            method: "GET",
            status_code: 400,
            error_code: "invalid_table_id",
            ip,
          });
          return jsonResponse(400, {
            error: "invalid_table_id",
            message: "شناسه جدول نامعتبر است.",
          });
        }

        const auth = await authenticateBot(extractBearer(request.headers.get("authorization")));
        if (!auth.ok) {
          logBotUsage({
            api_key_id: null,
            table_id: tableId,
            endpoint,
            method: "GET",
            status_code: auth.status,
            error_code: auth.code,
            ip,
          });
          // Apply IP-based rate limit on auth failures so brute force is throttled
          await checkBotRateLimit(null, ip);
          return jsonResponse(auth.status, { error: auth.code, message: auth.message });
        }

        const rl = await checkBotRateLimit(auth.keyId, ip);
        if (!rl.ok) {
          logBotUsage({
            api_key_id: auth.keyId,
            table_id: tableId,
            endpoint,
            method: "GET",
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

        const url = new URL(request.url);
        const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
        const rawSize = Number(url.searchParams.get("page_size") ?? "50") || 50;
        const pageSize = Math.min(100, Math.max(1, rawSize));
        const search = url.searchParams.get("search");

        const { data, error } = await supabaseAdmin.rpc("bot_query_table_rows", {
          p_key_id: auth.keyId,
          p_table_id: tableId,
          p_search: search ?? undefined,
          p_page: page,
          p_page_size: pageSize,
        });

        if (error) {
          const m = mapBotError(error.message);
          logBotUsage({
            api_key_id: auth.keyId,
            table_id: tableId,
            endpoint,
            method: "GET",
            status_code: m.status,
            error_code: m.code,
            ip,
          });
          return jsonResponse(m.status, { error: m.code, message: m.message });
        }

        const list = (data ?? []) as Array<{
          total_count: number | string;
          out_row_id: string;
          out_row_number: number | string;
          out_is_active: boolean;
          out_created_at: string;
          out_updated_at: string;
          out_values: Record<string, unknown>;
        }>;
        const total = list.length ? Number(list[0].total_count ?? 0) : 0;
        const rows = list.map((r) => ({
          row_id: r.out_row_id,
          row_number: Number(r.out_row_number),
          is_active: !!r.out_is_active,
          created_at: r.out_created_at,
          updated_at: r.out_updated_at,
          values: r.out_values ?? {},
        }));

        logBotUsage({
          api_key_id: auth.keyId,
          table_id: tableId,
          endpoint,
          method: "GET",
          status_code: 200,
          ip,
          response_count: rows.length,
        });

        return jsonResponse(200, {
          rows,
          pagination: {
            page,
            page_size: pageSize,
            total,
            total_pages: Math.ceil(total / pageSize),
          },
        });
      },

      POST: async ({ request, params }) => {
        const ip = clientIp(request);
        const tableId = params.tableId;
        const endpoint = `/api/public/bot/dynamic-tables/${tableId}/rows`;

        if (!isUuid(tableId)) {
          logBotUsage({
            api_key_id: null,
            table_id: null,
            endpoint,
            method: "POST",
            status_code: 400,
            error_code: "invalid_table_id",
            ip,
          });
          return jsonResponse(400, {
            error: "invalid_table_id",
            message: "شناسه جدول نامعتبر است.",
          });
        }

        const auth = await authenticateBot(extractBearer(request.headers.get("authorization")));
        if (!auth.ok) {
          logBotUsage({
            api_key_id: null,
            table_id: tableId,
            endpoint,
            method: "POST",
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
            method: "POST",
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
            method: "POST",
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
            method: "POST",
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
            method: "POST",
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

        // Accept either { values: {...} } (preferred) or a flat object.
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
            method: "POST",
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

        const { data, error } = await supabaseAdmin.rpc("bot_create_table_row", {
          p_key_id: auth.keyId,
          p_table_id: tableId,
          p_values: values as unknown as never,
        });

        if (error) {
          const m = mapBotError(error.message);
          logBotUsage({
            api_key_id: auth.keyId,
            table_id: tableId,
            endpoint,
            method: "POST",
            status_code: m.status,
            error_code: m.code,
            ip,
            request_size: raw.length,
          });
          return jsonResponse(m.status, { error: m.code, message: m.message });
        }

        const row = (Array.isArray(data) ? data[0] : data) as {
          out_row_id: string;
          out_row_number: number | string;
          out_is_active: boolean;
          out_created_at: string;
          out_updated_at: string;
          out_values: Record<string, unknown>;
        } | null;

        if (!row) {
          logBotUsage({
            api_key_id: auth.keyId,
            table_id: tableId,
            endpoint,
            method: "POST",
            status_code: 500,
            error_code: "server_error",
            ip,
            request_size: raw.length,
          });
          return jsonResponse(500, { error: "server_error", message: "ساخت ردیف ناموفق بود." });
        }

        logBotUsage({
          api_key_id: auth.keyId,
          table_id: tableId,
          endpoint,
          method: "POST",
          status_code: 201,
          ip,
          request_size: raw.length,
          response_count: Object.keys(row.out_values ?? {}).length,
        });

        return jsonResponse(201, {
          row_id: row.out_row_id,
          row_number: Number(row.out_row_number),
          is_active: !!row.out_is_active,
          created_at: row.out_created_at,
          updated_at: row.out_updated_at,
          values: row.out_values ?? {},
        });
      },
    },
  },
});
