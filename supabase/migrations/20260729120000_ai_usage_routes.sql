-- AI usage routing per feature/module.
--
-- Purpose:
--   Let admins decide which AI provider serves each concrete AI feature,
--   instead of relying only on global provider priority.
--
-- Semantics:
--   provider_id NULL + is_enabled true  => automatic priority-based selection.
--   provider_id set  + fallback false   => only that provider is used.
--   provider_id set  + fallback true    => selected provider first, then normal failover.
--   is_enabled false                    => the feature has no provider and degrades as disabled.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.ai_usage_routes;

CREATE TABLE IF NOT EXISTS public.ai_usage_routes (
  service_key       text PRIMARY KEY,
  capability        text NOT NULL,
  provider_id       uuid NULL REFERENCES public.ai_providers(id) ON DELETE SET NULL,
  is_enabled        boolean NOT NULL DEFAULT true,
  fallback_enabled  boolean NOT NULL DEFAULT false,
  updated_by        uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_routes_capability_check
    CHECK (capability IN ('chat', 'embeddings', 'vision')),
  CONSTRAINT ai_usage_routes_service_key_check
    CHECK (service_key IN (
      'purchase_advisor.chat',
      'knowledge_ask.chat',
      'knowledge_ask.embeddings',
      'knowledge_index.embeddings',
      'messenger_chat.chat',
      'messenger_semantic_search.embeddings',
      'product_ad_copy.chat',
      'receipt_ocr.vision'
    ))
);

DROP TRIGGER IF EXISTS trg_ai_usage_routes_updated_at ON public.ai_usage_routes;
CREATE TRIGGER trg_ai_usage_routes_updated_at
  BEFORE UPDATE ON public.ai_usage_routes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.ai_usage_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_routes_admin_read ON public.ai_usage_routes;
CREATE POLICY ai_usage_routes_admin_read
  ON public.ai_usage_routes FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS ai_usage_routes_admin_write ON public.ai_usage_routes;
CREATE POLICY ai_usage_routes_admin_write
  ON public.ai_usage_routes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_usage_routes TO authenticated;
GRANT ALL ON public.ai_usage_routes TO service_role;

INSERT INTO public.ai_usage_routes (service_key, capability, provider_id, is_enabled, fallback_enabled)
VALUES
  ('purchase_advisor.chat', 'chat', NULL, true, true),
  ('knowledge_ask.chat', 'chat', NULL, true, true),
  ('knowledge_ask.embeddings', 'embeddings', NULL, true, true),
  ('knowledge_index.embeddings', 'embeddings', NULL, true, true),
  ('messenger_chat.chat', 'chat', NULL, true, true),
  ('messenger_semantic_search.embeddings', 'embeddings', NULL, true, true),
  ('product_ad_copy.chat', 'chat', NULL, true, true),
  ('receipt_ocr.vision', 'vision', NULL, true, true)
ON CONFLICT (service_key) DO NOTHING;

COMMENT ON TABLE public.ai_usage_routes IS
  'Per-feature AI provider routing. Admins can force a provider, disable a feature, or keep automatic priority-based selection.';
