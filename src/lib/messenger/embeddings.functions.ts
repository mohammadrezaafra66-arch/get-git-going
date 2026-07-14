// Phase 6 — Embedding + جست‌وجوی معنایی پیام‌رسان (Ollama self-hosted)
// خروجی همیشه { ok, reason? } — هرگز throw نمی‌کند تا UX قطع نشود.
import { createServerFn } from "@tanstack/react-start";
// Node-20-safe wrapper — see messenger-auth-middleware.ts for rationale.
import { requireSupabaseAuthNode20 as requireSupabaseAuth } from "@/integrations/supabase/messenger-auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

const embedInput = z.object({
  message_id: z.string().uuid({ message: "شناسه پیام نامعتبر است" }),
});

const searchInput = z.object({
  group_id: z.string().uuid({ message: "شناسه گروه نامعتبر است" }),
  query: z.string().min(1).max(500),
});

export type EmbedResult = { ok: boolean; reason?: string };
export type SemanticSearchHit = {
  message_id: string;
  content: string;
  created_at: string;
  sender_id: string | null;
  similarity: number;
};
export type SemanticSearchResult =
  | { ok: true; hits: SemanticSearchHit[] }
  | { ok: false; reason: string; hits?: never };

const EMBED_TIMEOUT_MS = 30_000;

async function callOllamaEmbedding(text: string): Promise<{ vec?: number[]; reason?: string }> {
  const apiUrl = process.env.OLLAMA_API_URL?.trim();
  if (!apiUrl) return { reason: "disabled" };
  const model = process.env.OLLAMA_EMBED_MODEL?.trim() || "nomic-embed-text";
  const url = apiUrl.replace(/\/+$/, "") + "/api/embeddings";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn("[ollama-embed] non-OK", res.status);
      return { reason: `http_${res.status}` };
    }
    const json = (await res.json()) as { embedding?: number[] };
    const vec = json?.embedding;
    if (!Array.isArray(vec) || vec.length === 0) return { reason: "empty_embedding" };
    return { vec };
  } catch (e) {
    const reason = (e as Error)?.name === "AbortError" ? "timeout" : "fetch_failed";
    console.warn("[ollama-embed] fetch error:", reason);
    return { reason };
  } finally {
    clearTimeout(timer);
  }
}

export const generateMessageEmbedding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => embedInput.parse(data))
  .handler(async ({ data, context }): Promise<EmbedResult> => {
    const ctx = context as { userId: string; supabase: SupabaseClient };
    const { userId, supabase } = ctx;

    try {
      const { data: msg, error: mErr } = await supabase
        .from("messenger_messages")
        .select("id, sender_id, type, content, group_id")
        .eq("id", data.message_id)
        .maybeSingle();
      if (mErr || !msg) return { ok: false, reason: "not_found" };
      if (msg.sender_id !== userId) return { ok: false, reason: "forbidden" };
      if (msg.type !== "text") return { ok: false, reason: "not_text" };
      const content = (msg.content ?? "").trim();
      if (!content) return { ok: false, reason: "empty_content" };

      const { vec, reason } = await callOllamaEmbedding(content);
      if (!vec) return { ok: false, reason: reason || "no_vector" };

      // pgvector text format: "[0.1,0.2,...]"
      const literal = `[${vec.join(",")}]`;
      const excerpt = content.slice(0, 200);

      const { error: upErr } = await supabase
        .from("message_embeddings")
        .upsert(
          {
            message_id: msg.id,
            group_id: msg.group_id,
            embedding: literal as unknown as string,
            content_excerpt: excerpt,
          },
          { onConflict: "message_id" },
        );
      if (upErr) {
        console.warn("[ollama-embed] upsert failed:", upErr.message);
        return { ok: false, reason: "upsert_failed" };
      }

      return { ok: true };
    } catch (e) {
      console.warn("[ollama-embed] unexpected:", (e as Error)?.message);
      return { ok: false, reason: "unexpected" };
    }
  });

export const semanticSearchMessenger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => searchInput.parse(data))
  .handler(async ({ data, context }): Promise<SemanticSearchResult> => {
    const ctx = context as { userId: string; supabase: SupabaseClient };
    const { userId, supabase } = ctx;
    try {
      const { data: membership } = await supabase
        .from("messenger_group_members")
        .select("group_id")
        .eq("group_id", data.group_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!membership) return { ok: false, reason: "not_member" };

      const { vec, reason } = await callOllamaEmbedding(data.query);
      if (!vec) return { ok: false, reason: reason || "no_vector" };

      const literal = `[${vec.join(",")}]`;
      const { data: rows, error } = await supabase.rpc(
        "search_messenger_messages_semantic",
        {
          p_group_id: data.group_id,
          p_query_embedding: literal as unknown as string,
          p_limit: 10,
        },
      );
      if (error) {
        console.warn("[semantic-search] rpc failed:", error.message);
        return { ok: false, reason: "rpc_failed" };
      }
      const hits: SemanticSearchHit[] = ((rows ?? []) as Array<{
        message_id: string;
        content: string;
        created_at: string;
        sender_id: string | null;
        similarity: number;
      }>).map((r) => ({
        message_id: r.message_id,
        content: r.content,
        created_at: r.created_at,
        sender_id: r.sender_id,
        similarity: Number(r.similarity ?? 0),
      }));
      return { ok: true, hits };
    } catch (e) {
      console.warn("[semantic-search] unexpected:", (e as Error)?.message);
      return { ok: false, reason: "unexpected" };
    }
  });