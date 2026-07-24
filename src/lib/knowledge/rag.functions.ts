/**
 * Knowledge RAG — reindex and grounded question answering.
 *
 * HONEST STATUS: knowledge_documents currently holds 0 rows, so this indexes
 * nothing and answers nothing until somebody writes a document. It is a
 * pipeline that activates on first use, not a working feature with an empty
 * screen.
 *
 * Auth follows the pattern in src/routes/api/messenger/ai-chat.ts: the caller's
 * JWT is used for anything the user is allowed to see, and retrieval is gated
 * inside the SQL function rather than here.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { aiChat, aiEmbed } from "@/lib/ai/client.server";
import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_SIZE,
  chunkPersianText,
  isCorruptedText,
} from "./chunking";

/** Must match knowledge_document_chunks.embedding, which is vector(1024). */
const CHUNK_EMBEDDING_DIMENSION = 1024;

/** Retrieved chunks below this cosine similarity are treated as unrelated. */
const MIN_SIMILARITY = 0.35;

const NOT_FOUND_FA = "در اسناد موجود پاسخی پیدا نکردم.";

export interface ReindexReport {
  ok: boolean;
  documentsSeen: number;
  documentsIndexed: number;
  documentsSkippedCorrupted: number;
  documentsSkippedEmpty: number;
  chunksWritten: number;
  /** Set when no embeddings provider could serve the run. */
  messageFa?: string;
  model?: string;
  dimension?: number;
}

export const reindexKnowledgeDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ documentId: z.string().uuid().nullable().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<ReindexReport> => {
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (roleRows ?? []).map((r) => String(r.role));
    if (!roles.includes("admin") && !roles.includes("manager")) {
      throw new Error("فقط مدیر یا سرپرست می‌تواند نمایه‌سازی را اجرا کند.");
    }

    let q = supabaseAdmin
      .from("knowledge_documents")
      .select("id, title, content, is_published")
      .eq("is_published", true);
    if (data.documentId) q = q.eq("id", data.documentId);

    const { data: docs, error } = await q;
    if (error) throw new Error(error.message);

    const report: ReindexReport = {
      ok: true,
      documentsSeen: (docs ?? []).length,
      documentsIndexed: 0,
      documentsSkippedCorrupted: 0,
      documentsSkippedEmpty: 0,
      chunksWritten: 0,
    };

    for (const doc of docs ?? []) {
      const body = `${doc.title ?? ""}\n\n${doc.content ?? ""}`.trim();

      if (!body) {
        report.documentsSkippedEmpty += 1;
        continue;
      }
      // Runs of `?` are the known Persian-corruption pattern in this database.
      // Embedding them would produce vectors that match nothing meaningfully
      // and would pollute every later search, so skip and report the count.
      if (isCorruptedText(body)) {
        report.documentsSkippedCorrupted += 1;
        continue;
      }

      const chunks = chunkPersianText(body, {
        size: DEFAULT_CHUNK_SIZE,
        overlap: DEFAULT_CHUNK_OVERLAP,
      });
      if (chunks.length === 0) {
        report.documentsSkippedEmpty += 1;
        continue;
      }

      const embedded = await aiEmbed({
        input: chunks.map((c) => c.content),
        requiredDimension: CHUNK_EMBEDDING_DIMENSION,
      });
      if (!embedded.ok) {
        // No usable provider: stop rather than half-index the corpus, and say
        // so instead of reporting a successful run that wrote nothing.
        return { ...report, ok: false, messageFa: embedded.messageFa };
      }
      report.model = embedded.model;
      report.dimension = embedded.value.dimension;

      const payload = chunks.map((c, i) => ({
        chunk_index: c.chunk_index,
        content: c.content,
        token_estimate: c.token_estimate,
        embedding: `[${embedded.value.vectors[i].join(",")}]`,
        embedding_model: embedded.model,
        embedding_dimension: embedded.value.dimension,
      }));

      // Through the caller's client: the RPC checks has_any_role(auth.uid()).
      const { data: written, error: wErr } = await context.supabase.rpc(
        "replace_knowledge_document_chunks" as never,
        { p_document_id: doc.id, p_chunks: payload } as never,
      );
      if (wErr) throw new Error(wErr.message);

      report.documentsIndexed += 1;
      report.chunksWritten += Number(written ?? 0);
    }

    return report;
  });

export interface AskSource {
  documentId: string;
  title: string;
  chunkIndex: number;
  similarity: number;
}

export interface AskResult {
  ok: boolean;
  answer: string;
  sources: AskSource[];
  /** True when the model was given no usable context at all. */
  noContext: boolean;
}

export const askKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ question: z.string().trim().min(3).max(500) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<AskResult> => {
    const embedded = await aiEmbed({
      input: data.question,
      requiredDimension: CHUNK_EMBEDDING_DIMENSION,
    });
    if (!embedded.ok) {
      return { ok: false, answer: embedded.messageFa, sources: [], noContext: true };
    }

    const literal = `[${embedded.value.vectors[0].join(",")}]`;
    // The caller's client, so search_knowledge_chunks_semantic evaluates
    // kd_role_can_view against the real auth.uid(). A restricted document must
    // not surface to a role that cannot view it, and that gate lives in SQL.
    const { data: rows, error } = await context.supabase.rpc(
      "search_knowledge_chunks_semantic" as never,
      { p_query_embedding: literal, p_limit: 8 } as never,
    );
    if (error) {
      return { ok: false, answer: "خطا در جست‌وجوی اسناد.", sources: [], noContext: true };
    }

    const hits = ((rows ?? []) as unknown as AskHitRow[]).filter(
      (h) => Number(h.similarity) >= MIN_SIMILARITY,
    );

    if (hits.length === 0) {
      // No retrieved context means no grounded answer is possible. Return the
      // exact not-found sentence rather than letting the model improvise — a
      // confident wrong answer is worse than "I don't know".
      return { ok: true, answer: NOT_FOUND_FA, sources: [], noContext: true };
    }

    const contextBlock = hits
      .map((h, i) => `[سند ${i + 1}: ${h.title}]\n${h.content}`)
      .join("\n\n---\n\n");

    const systemPrompt = [
      "تو دستیار اسناد داخلی شرکت هستی.",
      "فقط و فقط بر اساس متن‌های زیر پاسخ بده.",
      "اگر پاسخ در متن‌ها نیست، دقیقاً همین جمله را بنویس و چیز دیگری ننویس:",
      NOT_FOUND_FA,
      "هرگز از دانش عمومی خودت استفاده نکن و هرگز حدس نزن.",
      "پاسخ را فقط به زبان فارسی بنویس.",
    ].join(" ");

    const answer = await aiChat({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `متن‌های موجود:\n\n${contextBlock}\n\nپرسش: ${data.question}` },
      ],
      temperature: 0,
    });

    if (!answer.ok) {
      return { ok: false, answer: answer.messageFa, sources: [], noContext: false };
    }

    const text = answer.value.trim();
    const saidNotFound = text.includes(NOT_FOUND_FA);

    return {
      ok: true,
      answer: saidNotFound ? NOT_FOUND_FA : text,
      // No sources when the model itself says the context lacks the answer —
      // citing documents beside "I could not find it" invites the reader to
      // assume the answer came from them.
      sources: saidNotFound
        ? []
        : hits.map((h) => ({
            documentId: h.document_id,
            title: h.title,
            chunkIndex: h.chunk_index,
            similarity: Number(h.similarity),
          })),
      noContext: saidNotFound,
    };
  });

interface AskHitRow {
  chunk_id: string;
  document_id: string;
  title: string;
  content: string;
  chunk_index: number;
  similarity: number;
}
