// Phase 6 — Embedding + جست‌وجوی معنایی پیام‌رسان (Lovable AI Gateway)
// خروجی همیشه { ok, reason? } — هرگز throw نمی‌کند تا UX قطع نشود.
import { createServerFn } from "@tanstack/react-start";
// Node-20-safe wrapper — see messenger-auth-middleware.ts for rationale.
import { requireSupabaseAuthNode20 as requireSupabaseAuth } from "@/integrations/supabase/messenger-auth-middleware";
import { z } from "zod";
import { aiEmbed } from "@/lib/ai/client.server";
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
const BACKFILL_LIMIT = 50;

/**
 * `message_embeddings.embedding` is `vector(1536)`, sized for
 * openai/text-embedding-3-small. pgvector fixes the width per column, so a
 * provider returning any other width cannot be stored here.
 *
 * This matters concretely: the LAN Ollama runs bge-m3 at 1024 and sits at
 * priority 10, so it is tried FIRST. Passing requiredDimension makes the
 * shared client treat its 1024-wide answer as unusable and walk on to a
 * provider that matches, instead of handing back a vector that would fail on
 * insert — or worse, land in a column that happened to accept it.
 *
 * Changing this number means re-indexing every row, so it is derived from the
 * column, not from whichever model is configured today.
 */
const MESSAGE_EMBEDDING_DIMENSION = 1536;

async function callEmbedding(
  text: string,
): Promise<{ vec?: number[]; model?: string; reason?: string }> {
  const r = await aiEmbed({
    input: text,
    timeoutMs: EMBED_TIMEOUT_MS,
    requiredDimension: MESSAGE_EMBEDDING_DIMENSION,
  });
  if (!r.ok) {
    console.warn("[embed] unavailable:", r.reason);
    return { reason: r.reason === "no_provider" ? "disabled" : r.reason };
  }
  const vec = r.value.vectors[0];
  if (!Array.isArray(vec) || vec.length === 0) return { reason: "empty_embedding" };
  // The model that actually answered, not a hardcoded constant — otherwise
  // model_version lies the moment the provider order changes.
  return { vec, model: r.model };
}

// Best-effort backfill for text messages in a group that don't have embeddings yet.
// Runs inline (bounded) so first search after switching models works without a job.
async function backfillGroupEmbeddings(supabase: SupabaseClient, groupId: string): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from("message_embeddings")
      .select("message_id")
      .eq("group_id", groupId);
    const existingIds = new Set((existing ?? []).map((r) => r.message_id as string));

    const { data: msgs } = await supabase
      .from("messenger_messages")
      .select("id, content, group_id")
      .eq("group_id", groupId)
      .eq("type", "text")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(BACKFILL_LIMIT);

    const todo = (msgs ?? []).filter((m) => {
      const c = (m.content ?? "").trim();
      return c && !existingIds.has(m.id as string);
    });
    if (todo.length === 0) return;

    for (const m of todo) {
      const content = (m.content ?? "").trim();
      const { vec, model } = await callEmbedding(content);
      if (!vec) continue;
      const literal = `[${vec.join(",")}]`;
      await supabase.from("message_embeddings").upsert(
        {
          message_id: m.id,
          group_id: m.group_id,
          embedding: literal as unknown as string,
          content_excerpt: content.slice(0, 200),
          model_version: model ?? "unknown",
        },
        { onConflict: "message_id" },
      );
    }
  } catch (e) {
    console.warn("[backfill] unexpected:", (e as Error)?.message);
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

      const { vec, model, reason } = await callEmbedding(content);
      if (!vec) return { ok: false, reason: reason || "no_vector" };

      // pgvector text format: "[0.1,0.2,...]"
      const literal = `[${vec.join(",")}]`;
      const excerpt = content.slice(0, 200);

      const { error: upErr } = await supabase.from("message_embeddings").upsert(
        {
          message_id: msg.id,
          group_id: msg.group_id,
          embedding: literal as unknown as string,
          content_excerpt: excerpt,
          model_version: model ?? "unknown",
        },
        { onConflict: "message_id" },
      );
      if (upErr) {
        console.warn("[lovable-embed] upsert failed:", upErr.message);
        return { ok: false, reason: "upsert_failed" };
      }

      return { ok: true };
    } catch (e) {
      console.warn("[lovable-embed] unexpected:", (e as Error)?.message);
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

      // Best-effort backfill of missing embeddings before searching
      await backfillGroupEmbeddings(supabase, data.group_id);

      const { vec, reason } = await callEmbedding(data.query);
      if (!vec) return { ok: false, reason: reason || "no_vector" };

      const literal = `[${vec.join(",")}]`;
      const { data: rows, error } = await supabase.rpc("search_messenger_messages_semantic", {
        p_group_id: data.group_id,
        p_query_embedding: literal as unknown as string,
        p_limit: 10,
      });
      if (error) {
        console.warn("[semantic-search] rpc failed:", error.message);
        return { ok: false, reason: "rpc_failed" };
      }
      const hits: SemanticSearchHit[] = (
        (rows ?? []) as Array<{
          message_id: string;
          content: string;
          created_at: string;
          sender_id: string | null;
          similarity: number;
        }>
      ).map((r) => ({
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
