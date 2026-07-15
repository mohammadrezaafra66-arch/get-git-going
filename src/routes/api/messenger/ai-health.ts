import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const HEALTH_TIMEOUT_MS = 15_000;

type OllamaTagsResponse = {
  models?: Array<{ name?: string; model?: string }>;
};

function getOllamaHeaders() {
  const headers: Record<string, string> = {};
  const apiKey = process.env.OLLAMA_API_KEY?.trim();
  if (!apiKey) return headers;

  const authHeader = process.env.OLLAMA_AUTH_HEADER?.trim() || "Authorization";
  headers[authHeader] = authHeader.toLowerCase() === "authorization" ? `Bearer ${apiKey}` : apiKey;
  return headers;
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export const Route = createFileRoute("/api/messenger/ai-health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return json({ ok: false, reason: "server_misconfigured" }, 500);
        }

        const authHeader = request.headers.get("authorization");
        if (!authHeader) return json({ ok: false, reason: "unauthorized" }, 401);

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
          global: { headers: { Authorization: authHeader } },
        });

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr || !userData?.user) return json({ ok: false, reason: "unauthorized" }, 401);

        const apiUrl = process.env.OLLAMA_API_URL?.trim();
        const model = process.env.OLLAMA_MODEL?.trim() || "llama3.2:8b";
        if (!apiUrl) {
          return json({ ok: false, reason: "disabled", has_url: false, model });
        }

        let tagsUrl: string;
        try {
          tagsUrl = new URL("/api/tags", apiUrl.replace(/\/+$/, "") + "/").toString();
        } catch {
          return json({ ok: false, reason: "invalid_url", has_url: true, model });
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

        try {
          const res = await fetch(tagsUrl, {
            method: "GET",
            headers: getOllamaHeaders(),
            signal: controller.signal,
          });

          if (!res.ok) {
            return json({
              ok: false,
              reason: res.status === 401 || res.status === 403 ? "forbidden" : "http_error",
              has_url: true,
              status: res.status,
              model,
            });
          }

          const body = (await res.json().catch(() => ({}))) as OllamaTagsResponse;
          const models = body.models ?? [];
          const modelExists = models.some((item) => item.name === model || item.model === model);

          return json({
            ok: modelExists,
            reason: modelExists ? "ok" : "model_missing",
            has_url: true,
            status: res.status,
            model,
          });
        } catch (e) {
          const reason = (e as Error)?.name === "AbortError" ? "timeout" : "fetch_failed";
          return json({ ok: false, reason, has_url: true, model });
        } finally {
          clearTimeout(timer);
        }
      },
    },
  },
});
