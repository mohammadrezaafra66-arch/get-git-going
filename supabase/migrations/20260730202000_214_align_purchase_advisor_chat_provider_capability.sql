-- Requirement 214.1
-- The purchase advisor chat route may point at a provider that has a chat_model
-- and key, but whose capabilities array was saved without "chat". In that case
-- the shared AI client correctly filters the provider out and falls back to the
-- next chat-capable provider. On LAN this made purchase_advisor.chat fall back
-- to Ollama and time out.
--
-- This is a data-alignment migration only. It does not change provider keys,
-- priorities, usage routes, or permissions.

UPDATE public.ai_providers AS p
SET
  capabilities = (
    SELECT array_agg(DISTINCT capability ORDER BY capability)
    FROM unnest(coalesce(p.capabilities, '{}'::text[]) || ARRAY['chat']) AS capability
  ),
  updated_at = now()
WHERE p.chat_model IS NOT NULL
  AND NOT ('chat' = ANY(coalesce(p.capabilities, '{}'::text[])))
  AND EXISTS (
    SELECT 1
    FROM public.ai_usage_routes AS r
    WHERE r.provider_id = p.id
      AND r.capability = 'chat'
      AND r.is_enabled
  );
