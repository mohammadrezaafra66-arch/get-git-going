-- =====================================================================
-- 153 - Phase 7: AI provider registry + admin-managed, decryptable keys
-- =====================================================================
-- Five call sites currently hardcode ai.gateway.lovable.dev with their own
-- fetch, model name and error handling, and the only credential is an empty
-- LOVABLE_API_KEY in .env.lan. This migration provides the storage half of a
-- shared client: which providers exist, what each can do, whether it is
-- healthy, and where its key lives.
--
-- ---------------------------------------------------------------------
-- WHERE THE ENCRYPTION KEY LIVES, AND WHAT THAT ACTUALLY BUYS
-- ---------------------------------------------------------------------
-- A provider key must be DECRYPTABLE, because it is sent outbound on every
-- call. That rules out the bot_api_keys pattern, which hashes because it only
-- ever needs to verify. shop_settings is plaintext and unfit for a secret.
--
-- This deployment already has `supabase_vault` 0.2.8 and `pgsodium` 3.1.8
-- installed, and pgsodium's root key is a 0600 file owned by postgres at
-- /etc/postgresql-custom/pgsodium_root.key -- that is, OUTSIDE the database.
-- Verified working before writing this migration: vault.create_secret stored
-- opaque ciphertext and vault.decrypted_secrets returned the exact plaintext.
--
-- So keys go in the vault, and this table stores only a secret id plus a short
-- display prefix. Honest statement of what that protects against:
--
--   PROTECTED: a database-only exposure. pg_dump, a copied backup volume, a
--   stolen .sql file or a SQL-injection read all yield ciphertext, because the
--   root key is not in the database and is not in the dump.
--
--   NOT PROTECTED: host or container compromise. Anyone who can read files in
--   the db container, or run docker exec, reads the root key and therefore
--   every secret. There is no KMS, no HSM and no external secret manager in
--   this deployment, so that is the ceiling. Inventing one here would be
--   pretend security.
--
--   OPERATIONAL TRAP: the root key file is NOT part of a database dump. A
--   restore of the database alone, onto a host without that same file, leaves
--   every stored key permanently undecryptable. Back the key file up
--   separately, or be prepared to re-enter the provider keys.
--
-- The plaintext key crosses the boundary exactly twice: inbound when an admin
-- saves it, and outbound when the server reads it to make a call. It is never
-- selected into any admin-facing query, never returned by any function granted
-- to `authenticated`, and never logged. The UI sees `key_prefix` only.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 1. Provider registry
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_providers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL UNIQUE,
  label        text NOT NULL,
  kind         text NOT NULL,
  base_url     text NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  -- Lower runs first. The client walks providers in this order and uses the
  -- first one that both declares the capability and is reachable.
  priority     integer NOT NULL DEFAULT 100,
  chat_model   text,
  embed_model  text,
  vision_model text,
  -- Which capabilities this provider is ALLOWED to serve. Deliberately not
  -- derived from "does the model exist" -- a model can exist and still be
  -- unfit, which is exactly the qwen3.6 vision case seeded below.
  capabilities text[] NOT NULL DEFAULT '{}'::text[],
  -- vault.secrets(id). NULL means this provider needs no key (e.g. a LAN
  -- Ollama). Intentionally NOT a foreign key: vault.secrets is not in the
  -- public schema and an FK there would couple our DDL to vault's internals.
  secret_id    uuid,
  -- Display only. Never the key.
  key_prefix   text,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid,
  CONSTRAINT ai_providers_kind_check
    CHECK (kind IN ('ollama', 'openai_compatible')),
  CONSTRAINT ai_providers_capabilities_check
    CHECK (capabilities <@ ARRAY['chat', 'embeddings', 'vision']::text[]),
  CONSTRAINT ai_providers_name_len
    CHECK (char_length(btrim(name)) BETWEEN 2 AND 60),
  CONSTRAINT ai_providers_base_url_len
    CHECK (char_length(btrim(base_url)) BETWEEN 4 AND 500),
  CONSTRAINT ai_providers_key_prefix_len
    CHECK (key_prefix IS NULL OR char_length(key_prefix) <= 12)
);

CREATE INDEX IF NOT EXISTS idx_ai_providers_active_priority
  ON public.ai_providers (is_active, priority);

DROP TRIGGER IF EXISTS trg_ai_providers_updated_at ON public.ai_providers;
CREATE TRIGGER trg_ai_providers_updated_at
  BEFORE UPDATE ON public.ai_providers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 2. Provider health, per capability
-- ---------------------------------------------------------------------
-- Per capability, not per provider: a provider can be perfectly healthy for
-- chat and out of credit for vision, and collapsing that into one status
-- would hide the thing an admin needs to see.
CREATE TABLE IF NOT EXISTS public.ai_provider_health (
  provider_id        uuid NOT NULL REFERENCES public.ai_providers(id) ON DELETE CASCADE,
  capability         text NOT NULL,
  last_status        text NOT NULL,
  last_ok_at         timestamptz,
  last_error_at      timestamptz,
  last_error_code    text,
  last_error_message text,
  last_latency_ms    integer,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, capability),
  CONSTRAINT ai_provider_health_capability_check
    CHECK (capability IN ('chat', 'embeddings', 'vision')),
  CONSTRAINT ai_provider_health_status_check
    CHECK (last_status IN ('ok', 'error', 'rate_limited', 'credit_exhausted', 'unavailable')),
  CONSTRAINT ai_provider_health_msg_len
    CHECK (last_error_message IS NULL OR char_length(last_error_message) <= 500)
);

-- ---------------------------------------------------------------------
-- 3. RLS -- admin reads, nobody writes directly
-- ---------------------------------------------------------------------
ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_health ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_providers_admin_read ON public.ai_providers;
CREATE POLICY ai_providers_admin_read
  ON public.ai_providers FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS ai_provider_health_admin_read ON public.ai_provider_health;
CREATE POLICY ai_provider_health_admin_read
  ON public.ai_provider_health FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No INSERT/UPDATE/DELETE policy for `authenticated` on purpose. All writes go
-- through the SECURITY DEFINER functions below, so the key handling cannot be
-- bypassed by a direct PostgREST write.

GRANT SELECT ON public.ai_providers TO authenticated;
GRANT SELECT ON public.ai_provider_health TO authenticated;

-- ---------------------------------------------------------------------
-- 4. Admin write path
-- ---------------------------------------------------------------------
-- p_api_key semantics, which the admin UI depends on:
--   NULL           -> leave the stored key untouched (an edit that is not
--                     about the key must not silently wipe it)
--   ''  (empty)    -> remove the stored key entirely
--   anything else  -> replace the stored key
CREATE OR REPLACE FUNCTION public.admin_upsert_ai_provider(
  p_id           uuid,
  p_name         text,
  p_label        text,
  p_kind         text,
  p_base_url     text,
  p_is_active    boolean,
  p_priority     integer,
  p_chat_model   text,
  p_embed_model  text,
  p_vision_model text,
  p_capabilities text[],
  p_api_key      text DEFAULT NULL,
  p_notes        text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id         uuid;
  v_secret_id  uuid;
  v_prefix     text;
  v_key        text;
  v_name       text := btrim(coalesce(p_name, ''));
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'فقط مدیر سیستم می‌تواند ارائه‌دهنده هوش مصنوعی را تغییر دهد.'
      USING ERRCODE = '42501';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'نام ارائه‌دهنده نمی‌تواند خالی باشد.' USING ERRCODE = '23514';
  END IF;

  v_key := p_api_key;

  IF p_id IS NULL THEN
    INSERT INTO public.ai_providers (
      name, label, kind, base_url, is_active, priority,
      chat_model, embed_model, vision_model, capabilities, notes, created_by
    ) VALUES (
      v_name, p_label, p_kind, btrim(p_base_url), coalesce(p_is_active, true),
      coalesce(p_priority, 100), p_chat_model, p_embed_model, p_vision_model,
      coalesce(p_capabilities, '{}'::text[]), p_notes, auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.ai_providers SET
      name         = v_name,
      label        = p_label,
      kind         = p_kind,
      base_url     = btrim(p_base_url),
      is_active    = coalesce(p_is_active, is_active),
      priority     = coalesce(p_priority, priority),
      chat_model   = p_chat_model,
      embed_model  = p_embed_model,
      vision_model = p_vision_model,
      capabilities = coalesce(p_capabilities, capabilities),
      notes        = p_notes
    WHERE id = p_id
    RETURNING id, secret_id INTO v_id, v_secret_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'ارائه‌دهنده مورد نظر پیدا نشد.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Key handling. Note every branch writes key_prefix alongside secret_id, so
  -- the two can never drift apart and show a prefix for a key that is gone.
  IF v_key IS NOT NULL THEN
    IF btrim(v_key) = '' THEN
      IF v_secret_id IS NOT NULL THEN
        DELETE FROM vault.secrets WHERE id = v_secret_id;
      END IF;
      UPDATE public.ai_providers
         SET secret_id = NULL, key_prefix = NULL
       WHERE id = v_id;
    ELSE
      v_prefix := left(btrim(v_key), 6);
      IF v_secret_id IS NULL THEN
        v_secret_id := vault.create_secret(
          btrim(v_key),
          'ai_provider_key_' || v_id::text,
          'AfraKala AI provider key for ' || v_name
        );
      ELSE
        PERFORM vault.update_secret(v_secret_id, btrim(v_key));
      END IF;
      UPDATE public.ai_providers
         SET secret_id = v_secret_id, key_prefix = v_prefix
       WHERE id = v_id;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (
    auth.uid(), 'ai_provider', v_id::text,
    CASE WHEN p_id IS NULL THEN 'ai_provider_created' ELSE 'ai_provider_updated' END,
    -- Records THAT the key changed, never the key.
    jsonb_build_object(
      'name', v_name,
      'kind', p_kind,
      'capabilities', coalesce(p_capabilities, '{}'::text[]),
      'is_active', p_is_active,
      'key_changed', (v_key IS NOT NULL)
    )
  );

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_ai_provider(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_id uuid;
  v_name      text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'فقط مدیر سیستم می‌تواند ارائه‌دهنده هوش مصنوعی را حذف کند.'
      USING ERRCODE = '42501';
  END IF;

  SELECT secret_id, name INTO v_secret_id, v_name
    FROM public.ai_providers WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ارائه‌دهنده مورد نظر پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.ai_providers WHERE id = p_id;

  -- After the row is gone, so a failure here cannot leave a provider pointing
  -- at a deleted secret.
  IF v_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = v_secret_id;
  END IF;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'ai_provider', p_id::text, 'ai_provider_deleted',
          jsonb_build_object('name', v_name));
END;
$$;

-- ---------------------------------------------------------------------
-- 5. Server-only: read a key, record health
-- ---------------------------------------------------------------------
-- Granted to service_role ONLY. The shared client runs server-side with the
-- service-role client, so the plaintext key never reaches a browser. An
-- `authenticated` caller -- including an admin -- cannot execute this.
CREATE OR REPLACE FUNCTION public.ai_get_provider_key(p_provider_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret_id uuid;
  v_key       text;
BEGIN
  SELECT secret_id INTO v_secret_id
    FROM public.ai_providers WHERE id = p_provider_id AND is_active;

  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE id = v_secret_id;

  RETURN v_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_record_provider_health(
  p_provider_id   uuid,
  p_capability    text,
  p_status        text,
  p_error_code    text DEFAULT NULL,
  p_error_message text DEFAULT NULL,
  p_latency_ms    integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ai_provider_health AS h (
    provider_id, capability, last_status, last_ok_at, last_error_at,
    last_error_code, last_error_message, last_latency_ms, updated_at
  ) VALUES (
    p_provider_id, p_capability, p_status,
    CASE WHEN p_status = 'ok' THEN now() END,
    CASE WHEN p_status <> 'ok' THEN now() END,
    p_error_code, left(coalesce(p_error_message, ''), 500), p_latency_ms, now()
  )
  ON CONFLICT (provider_id, capability) DO UPDATE SET
    last_status        = excluded.last_status,
    -- Keep the last SUCCESS timestamp across failures: "worked at 09:00,
    -- failing since 09:40" is the useful shape, and overwriting last_ok_at
    -- with NULL on every error would destroy it.
    last_ok_at         = coalesce(excluded.last_ok_at, h.last_ok_at),
    last_error_at      = coalesce(excluded.last_error_at, h.last_error_at),
    last_error_code    = excluded.last_error_code,
    last_error_message = excluded.last_error_message,
    last_latency_ms    = coalesce(excluded.last_latency_ms, h.last_latency_ms),
    updated_at         = now();
END;
$$;

-- ---------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_upsert_ai_provider(uuid, text, text, text, text, boolean, integer, text, text, text, text[], text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_upsert_ai_provider(uuid, text, text, text, text, boolean, integer, text, text, text, text[], text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_delete_ai_provider(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_delete_ai_provider(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.ai_get_provider_key(uuid) FROM public;
REVOKE ALL ON FUNCTION public.ai_get_provider_key(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_get_provider_key(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.ai_record_provider_health(uuid, text, text, text, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.ai_record_provider_health(uuid, text, text, text, text, integer) TO service_role;

-- ---------------------------------------------------------------------
-- 7. Audit entity allow-list
-- ---------------------------------------------------------------------
-- Additive only. This is the LIVE list as dumped from the database with
-- pg_get_functiondef, plus 'ai_provider'. Do NOT rebuild this list from an old
-- migration file: the 20260628 version of this function carries a completely
-- different (and much shorter) set of entity types, and CREATE OR REPLACE from
-- it would silently drop about sixty currently-valid types.
CREATE OR REPLACE FUNCTION public.is_valid_audit_entity_type(_entity_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _entity_type = ANY(ARRAY[
    'ai_provider',
    'inquiry','invoice','customer','product','profile','user_role','supplier',
    'purchase_request','purchase_receipt','document','workflow_setting',
    'delivery_receipt','scoring_parameter','parameter_weight',
    'dynamic_entity_score','daily_capital_setting',
    'salesperson_capital_allocation_dynamic','customer_capital_allocation_dynamic',
    'category','brand','price_list','pricing_rule','sale_list','sales_quote',
    'payment_receipt','journal_entry','task','knowledge_article','mission',
    'achievement','league_season','gamification_kpi','gamification_reward',
    'employee_score','penalty_appeal','performance_penalty','credit_request',
    'credit_scoring_rule','feedback','feedback_item','message','messenger_group',
    'notification_event','api_key','didar_activity','market_rate_source',
    'currency_source','currency_rate','academy_course','academy_lesson',
    'academy_quiz','bank_account','external_party','person','call_log',
    'price_alert_rule','stock_alert_request','shipping_cost_rule','settlement_type',
    'payment_term','validation_rule','price_change_reason','recent_purchase_setting',
    'shop_settings','pricing_board_setting','product_label','product_attribute',
    'dynamic_table','marketing_channel','knowledge_document','daily_capital_input',
    'daily_capital_snapshot','capital_allocation_ledger'
  ]);
$$;

-- ---------------------------------------------------------------------
-- 8. Seed the LAN Ollama provider
-- ---------------------------------------------------------------------
-- capabilities deliberately EXCLUDES 'vision'. qwen3.6 can see, but the
-- 2026-07-24 probe showed it misreads Persian digits reproducibly -- it read a
-- 45,000,000 amount as 25,000,000 on a clean image. Leaving 'vision' out is
-- what makes the shared client route vision to the keyed provider instead of
-- silently corrupting financial data. Re-add it only if a future model probes
-- clean on Persian digits.
INSERT INTO public.ai_providers (
  name, label, kind, base_url, is_active, priority,
  chat_model, embed_model, vision_model, capabilities, notes
) VALUES (
  'ollama',
  'اولاما (محلی)',
  'ollama',
  'http://192.168.170.8:11434',
  true,
  10,
  'qwen2.5:7b',
  'bge-m3:latest',
  'qwen3.6:latest',
  ARRAY['chat', 'embeddings']::text[],
  'qwen3.6 پاسخ تصویری فارسی را می‌خواند اما ارقام فارسی را اشتباه می‌خواند؛ به همین دلیل قابلیت بینایی برای این ارائه‌دهنده فعال نشده است.'
)
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE public.ai_providers IS
  'AI provider registry. Keys live in Supabase Vault (secret_id); this table stores only a display prefix. See migration 153 header for the threat model.';
COMMENT ON COLUMN public.ai_providers.capabilities IS
  'Capabilities this provider is ALLOWED to serve. Not derived from model availability - a model can exist and still be unfit (qwen3.6 vision).';
COMMENT ON TABLE public.ai_provider_health IS
  'Last known result per (provider, capability). Written server-side by the shared AI client.';
