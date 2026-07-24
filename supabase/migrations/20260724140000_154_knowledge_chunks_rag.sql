-- =====================================================================
-- 154 - Phase 8.2: knowledge document chunks + semantic retrieval
-- =====================================================================
-- Storage and retrieval for document-grounded question answering over
-- public.knowledge_documents.
--
-- BE HONEST ABOUT WHAT THIS DOES TODAY: knowledge_documents has 0 rows. This
-- pipeline therefore indexes nothing until somebody writes a document. It is
-- infrastructure that activates on first use, not a working feature with an
-- empty screen.
--
-- ---------------------------------------------------------------------
-- DIMENSION: 1024, AND WHY NOT 1536
-- ---------------------------------------------------------------------
-- bge-m3 produces 1024-dimensional vectors. That is measured, not assumed --
-- Ollama's /api/embed returned exactly 1024 floats on 2026-07-24, and the
-- shared client re-measures the width on every call.
--
-- public.message_embeddings is vector(1536) because it was built for
-- openai/text-embedding-3-small. Copying 1536 here would have produced a
-- column no configured model can fill.
--
-- pgvector fixes the dimension per column, so a future model change means a
-- NEW COLUMN and a full re-index; it cannot be widened in place. To make a
-- mismatch detectable instead of silently wrong, every chunk stores the model
-- name and the dimension that produced it. The re-index path is:
--   1. add embedding_v2 vector(<new dim>) alongside embedding
--   2. re-embed with the new model, filling embedding_v2 + model/dimension
--   3. switch the search function to the new column
--   4. drop the old column
-- Rows whose embedding_model no longer matches the active model are stale by
-- definition and can be found with a plain WHERE.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.knowledge_document_chunks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    uuid NOT NULL REFERENCES public.knowledge_documents(id) ON DELETE CASCADE,
  chunk_index    integer NOT NULL,
  content        text NOT NULL,
  token_estimate integer,
  embedding      vector(1024),
  -- Stored per chunk, not per table: this is what makes a model swap
  -- detectable rather than silently wrong.
  embedding_model     text,
  embedding_dimension integer,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index),
  CONSTRAINT kdc_content_len CHECK (char_length(content) BETWEEN 1 AND 8000),
  CONSTRAINT kdc_chunk_index_nonneg CHECK (chunk_index >= 0),
  CONSTRAINT kdc_dimension_matches CHECK (embedding_dimension IS NULL OR embedding_dimension = 1024)
);

CREATE INDEX IF NOT EXISTS idx_kdc_document ON public.knowledge_document_chunks (document_id);

-- IVFFlat/HNSW are not created here on purpose: with 0 rows an index would be
-- built on an empty table and a sequential scan is faster than either until
-- the corpus is real. Add one when the chunk count justifies it.

-- ---------------------------------------------------------------------
-- RLS -- the leak this prevents
-- ---------------------------------------------------------------------
-- A chunk carries the document's text. If chunk visibility did not reproduce
-- the parent document's access_level, a finance_only document's contents would
-- be readable by a salesperson through the chunk table even though the
-- document row itself is hidden. So the policy JOINS to the parent and reuses
-- the SAME access function the documents table uses -- kd_role_can_view --
-- rather than restating the rule and letting the two drift apart.
ALTER TABLE public.knowledge_document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kdc_read_via_parent ON public.knowledge_document_chunks;
CREATE POLICY kdc_read_via_parent
  ON public.knowledge_document_chunks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.knowledge_documents d
      WHERE d.id = knowledge_document_chunks.document_id
        AND d.is_published
        AND public.kd_role_can_view(auth.uid(), d.access_level)
    )
  );

-- No write policy for `authenticated`: chunks are derived data, written only
-- by the reindex RPC below (SECURITY DEFINER, admin/manager gated).
GRANT SELECT ON public.knowledge_document_chunks TO authenticated;

-- ---------------------------------------------------------------------
-- Retrieval -- modelled on search_messenger_messages_semantic
-- ---------------------------------------------------------------------
-- Same shape as the existing template: SECURITY DEFINER, cosine <=>, the
-- access gate INSIDE the WHERE (not left to the caller), and a hard cap of
-- LEAST(p_limit, 50) so a caller cannot ask for the whole corpus.
CREATE OR REPLACE FUNCTION public.search_knowledge_chunks_semantic(
  p_query_embedding vector(1024),
  p_limit int DEFAULT 8
)
RETURNS TABLE (
  chunk_id     uuid,
  document_id  uuid,
  title        text,
  content      text,
  chunk_index  integer,
  similarity   float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.document_id, d.title, c.content, c.chunk_index,
         1 - (c.embedding <=> p_query_embedding) AS similarity
  FROM public.knowledge_document_chunks c
  JOIN public.knowledge_documents d ON d.id = c.document_id
  WHERE c.embedding IS NOT NULL
    AND d.is_published
    AND public.kd_role_can_view(auth.uid(), d.access_level)
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT LEAST(p_limit, 50);
$$;

REVOKE EXECUTE ON FUNCTION public.search_knowledge_chunks_semantic(vector, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_knowledge_chunks_semantic(vector, int) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- Write path for the reindex job
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_knowledge_document_chunks(
  p_document_id uuid,
  p_chunks      jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::text, 'manager'::text]) THEN
    RAISE EXCEPTION 'فقط مدیر یا سرپرست می‌تواند نمایه‌سازی اسناد را اجرا کند.'
      USING ERRCODE = '42501';
  END IF;

  -- Replace wholesale rather than upsert: a re-chunked document can produce
  -- FEWER chunks than before, and leaving the tail behind would keep orphaned
  -- text searchable after it was edited out of the document.
  DELETE FROM public.knowledge_document_chunks WHERE document_id = p_document_id;

  INSERT INTO public.knowledge_document_chunks (
    document_id, chunk_index, content, token_estimate,
    embedding, embedding_model, embedding_dimension
  )
  SELECT
    p_document_id,
    (elem->>'chunk_index')::integer,
    elem->>'content',
    (elem->>'token_estimate')::integer,
    (elem->>'embedding')::vector,
    elem->>'embedding_model',
    (elem->>'embedding_dimension')::integer
  FROM jsonb_array_elements(p_chunks) AS elem;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_knowledge_document_chunks(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_knowledge_document_chunks(uuid, jsonb) TO authenticated, service_role;

COMMENT ON TABLE public.knowledge_document_chunks IS
  'Chunked + embedded knowledge documents for RAG. vector(1024) = bge-m3, measured not assumed. Model and dimension are stored per chunk so a model swap is detectable. RLS joins the parent document and reuses kd_role_can_view.';
