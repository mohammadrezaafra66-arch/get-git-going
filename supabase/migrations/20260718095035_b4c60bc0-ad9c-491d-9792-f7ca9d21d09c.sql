DROP FUNCTION IF EXISTS public.search_messenger_messages_semantic(uuid, vector, integer);
DROP INDEX IF EXISTS public.message_embeddings_embedding_idx;

TRUNCATE TABLE public.message_embeddings;

ALTER TABLE public.message_embeddings
  ALTER COLUMN embedding TYPE vector(1536);

ALTER TABLE public.message_embeddings
  ADD COLUMN IF NOT EXISTS model_version text;

CREATE INDEX IF NOT EXISTS message_embeddings_embedding_idx
  ON public.message_embeddings
  USING hnsw (embedding vector_cosine_ops);

CREATE OR REPLACE FUNCTION public.search_messenger_messages_semantic(
  p_group_id uuid,
  p_query_embedding vector,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(message_id uuid, content text, created_at timestamptz, sender_id uuid, similarity double precision)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.id, m.content, m.created_at, m.sender_id,
         1 - (e.embedding <=> p_query_embedding) AS similarity
  FROM public.message_embeddings e
  JOIN public.messenger_messages m ON m.id = e.message_id
  WHERE e.group_id = p_group_id
    AND public.is_messenger_group_member(p_group_id, auth.uid())
    AND m.deleted_at IS NULL
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT LEAST(p_limit, 50);
$$;

GRANT EXECUTE ON FUNCTION public.search_messenger_messages_semantic(uuid, vector, integer) TO authenticated;