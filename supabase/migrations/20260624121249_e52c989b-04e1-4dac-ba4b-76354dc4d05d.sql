-- Phase 6 — دستیار هوشمند پیام‌رسان (AI + pgvector)

CREATE EXTENSION IF NOT EXISTS vector;

-- =========================================================
-- جدول ai_conversations: تاریخچه گفتگو با دستیار هوشمند
-- =========================================================
CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id uuid NULL REFERENCES public.messenger_groups(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL,
  model text,
  tokens_in int,
  tokens_out int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ai_conversations_user_group_created_idx
  ON public.ai_conversations (user_id, group_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_conversations_select_own"
  ON public.ai_conversations FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "ai_conversations_insert_own"
  ON public.ai_conversations FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "ai_conversations_delete_own"
  ON public.ai_conversations FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- =========================================================
-- جدول message_embeddings: embedding پیام‌های متنی برای جست‌وجوی معنایی
-- =========================================================
CREATE TABLE public.message_embeddings (
  message_id uuid PRIMARY KEY REFERENCES public.messenger_messages(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.messenger_groups(id) ON DELETE CASCADE,
  embedding vector(768) NOT NULL,
  content_excerpt text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX message_embeddings_group_idx
  ON public.message_embeddings (group_id);

CREATE INDEX message_embeddings_vec_idx
  ON public.message_embeddings USING hnsw (embedding vector_cosine_ops);

GRANT SELECT, INSERT ON public.message_embeddings TO authenticated;
GRANT ALL ON public.message_embeddings TO service_role;

ALTER TABLE public.message_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_embeddings_select_group_member"
  ON public.message_embeddings FOR SELECT TO authenticated
  USING (public.is_messenger_group_member(group_id, auth.uid()));

CREATE POLICY "message_embeddings_insert_sender"
  ON public.message_embeddings FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messenger_messages mm
      WHERE mm.id = message_id
        AND mm.sender_id = auth.uid()
    )
  );

-- DELETE: فقط service_role (هیچ policy برای authenticated) — CASCADE از messenger_messages

-- =========================================================
-- RPC: جست‌وجوی معنایی محدود به اعضای گروه
-- =========================================================
CREATE OR REPLACE FUNCTION public.search_messenger_messages_semantic(
  p_group_id uuid,
  p_query_embedding vector(768),
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  message_id uuid,
  content text,
  created_at timestamptz,
  sender_id uuid,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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

REVOKE EXECUTE ON FUNCTION public.search_messenger_messages_semantic(uuid, vector, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_messenger_messages_semantic(uuid, vector, int) TO authenticated, service_role;