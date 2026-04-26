import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  authenticateBot, clientIp, extractBearer, isUuid, jsonResponse,
  logBotUsage, mapBotError,
} from "@/server/bot-api";

export const Route = createFileRoute("/api/public/bot/dynamic-tables/$tableId/rows")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ip = clientIp(request);
        const tableId = params.tableId;
        const endpoint = `/api/public/bot/dynamic-tables/${tableId}/rows`;

        if (!isUuid(tableId)) {
          logBotUsage({ api_key_id: null, table_id: null, endpoint, method: "GET",
            status_code: 400, error_code: "invalid_table_id", ip });
          return jsonResponse(400, { error: "invalid_table_id", message: "شناسه جدول نامعتبر است." });
        }

        const auth = await authenticateBot(extractBearer(request.headers.get("authorization")));
        if (!auth.ok) {
          logBotUsage({ api_key_id: null, table_id: tableId, endpoint, method: "GET",
            status_code: auth.status, error_code: auth.code, ip });
          return jsonResponse(auth.status, { error: auth.code, message: auth.message });
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
          logBotUsage({ api_key_id: auth.keyId, table_id: tableId, endpoint, method: "GET",
            status_code: m.status, error_code: m.code, ip });
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

        logBotUsage({ api_key_id: auth.keyId, table_id: tableId, endpoint, method: "GET",
          status_code: 200, ip, response_count: rows.length });

        return jsonResponse(200, {
          rows,
          pagination: {
            page, page_size: pageSize, total,
            total_pages: Math.ceil(total / pageSize),
          },
        });
      },
    },
  },
});