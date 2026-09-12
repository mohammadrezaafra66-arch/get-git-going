SET client_encoding='UTF8';

-- ============================================================================================
-- 535 · Security-3 / S-5 — three confirmed function-body defects (E-6 scope, mission "AfraKala
-- Convergence"). Source: docs/research/convergence/R-5-security-inventory.md, section "S-5".
-- No signature of any touched function changes, so every fix is CREATE OR REPLACE with no
-- DROP FUNCTION (rule 5 does not apply — nothing is overloaded).
-- ============================================================================================


-- ── Fix 1 · delete_bot_api_key_secure — arbitrary-role authorization bug ──────────────────────
--
-- Newest definition on disk: supabase/migrations/20260626145739_..._delete_bot_api_key_secure...
-- .sql:26-70 (migration 463 is newer but touches only GRANT/REVOKE, not the function body --
-- confirmed by `grep -c "CREATE OR REPLACE FUNCTION public.delete_bot_api_key_secure" 463's
-- file` = 0). Live body pulled via pg_get_functiondef on prod_rehearsal_e6 matches that file
-- byte-for-byte, so the fix below is written against the confirmed-live definition, not a
-- possibly-stale one (CLAUDE.md rule 4).
--
-- The defect (live body, :39-42 in the source file):
--   SELECT role::text INTO v_user_role FROM public.user_roles WHERE user_id = v_user_id LIMIT 1;
-- No ORDER BY. `user_roles` allows a user to hold more than one role row (the whole point of
-- the authorization check three lines later is to compare against "the caller's role"), so for
-- a multi-role user Postgres returns whichever row its plan happens to produce first -- not
-- necessarily 'admin' and not necessarily the row that would authorize a legitimate delete.
-- A user holding {admin, sales} could be authorized or refused depending on plan-dependent row
-- order, and a user holding {sales, marketing} whose managed key is 'sales' could be refused
-- outright if 'marketing' happens to be picked.
--
-- Fix: stop collapsing the caller's roles into one value before checking. Authorize if the
-- caller holds *any* qualifying role -- exactly what a single-row SELECT could never express
-- once a user has more than one row.
CREATE OR REPLACE FUNCTION public.delete_bot_api_key_secure(_key_id uuid, _reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_managed_role TEXT;
  v_key_name     TEXT;
  v_user_id      UUID;
BEGIN
  v_user_id := auth.uid();

  SELECT managed_by_role, name INTO v_managed_role, v_key_name
  FROM public.bot_api_keys
  WHERE id = _key_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'KEY_NOT_FOUND: کلید یافت نشد';
  END IF;

  -- Was: SELECT ... role ... LIMIT 1 (no ORDER BY) into a single v_user_role, then compared
  -- once. That collapsed a multi-role caller into one arbitrary role before the check ever
  -- ran. Now: authorize if ANY of the caller's role rows qualifies.
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_user_id
      AND (role::text = 'admin' OR role::text = v_managed_role)
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: شما مجاز به حذف این کلید نیستید'
      USING ERRCODE = 'P0001';
  END IF;

  IF _reason IS NULL OR trim(_reason) = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED: دلیل حذف الزامی است'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.bot_api_key_audit_log (key_id, key_name, action, performed_by, reason)
  VALUES (_key_id, v_key_name, 'delete', v_user_id, _reason);

  UPDATE public.bot_api_keys
  SET is_active = false
  WHERE id = _key_id;

  RETURN true;
END; $function$;


-- ── Fix 2 · admin_upsert_ai_provider / admin_delete_ai_provider — weak RPC-level audit ────────
--
-- Both defined only in supabase/migrations/20260724130000_153_ai_providers_and_key_vault.sql
-- :155-303 (never edited in place, per rule 6). Upsert's own INSERT INTO audit_logs (:251-263)
-- records only new values -- the preceding UPDATE ... RETURNING (:204-217) never reads the
-- pre-update row, so old name/kind/capabilities/is_active are lost from that entry. Delete's
-- own INSERT (:299-301) records only `name`.
--
-- R-5 found the mitigating context the original brief did not have: migration 475
-- (20260906130000_475_audit_ai_routing_changes.sql) already installs an AFTER INSERT OR UPDATE
-- OR DELETE trigger (audit_ai_routing_change(), trg_audit_ai_providers) on ai_providers that
-- captures a COMPLETE before/after diff for every write to the table -- including writes that
-- bypass these two RPCs entirely (verified live on prod_rehearsal_e6: trg_audit_ai_providers
-- exists, AFTER, on ai_providers, function body confirmed to jsonb the full OLD/NEW row and
-- strip only secret_id/key_prefix). Migration 475's own header states removing the RPCs' write
-- was deliberately left alone: "Removing their audit write is an application change and is out
-- of this migration's scope."
--
-- DECISION: option (B) from R-5, not (A). The system-level gap -- a write leaving no trace --
-- is already closed by the trigger; it always fires, and its capture is strictly more complete
-- (full row diff, not "name/kind/capabilities/is_active" a hand-picked subset) than option (A)
-- would add. Re-adding a SELECT...INTO-before-UPDATE / SELECT-before-DELETE snapshot inside
-- each RPC just to widen its OWN audit row would duplicate exactly what the trigger already
-- records for the same write, on the same table, in the same transaction -- two jsonb diffs of
-- the same change with no reader who needs both, and two places to keep in sync if either the
-- redaction list or the column set changes. That is worse, not more defensive. What actually
-- was missing was a signpost: nothing at the RPC's own audit_logs INSERT said its record is
-- partial and where the complete one lives. Fixed here with a comment only -- no logic changes
-- to either function body, so behaviour is byte-identical except for source-text comments.
CREATE OR REPLACE FUNCTION public.admin_upsert_ai_provider(p_id uuid, p_name text, p_label text, p_kind text, p_base_url text, p_is_active boolean, p_priority integer, p_chat_model text, p_embed_model text, p_vision_model text, p_capabilities text[], p_api_key text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- NOTE (535/S-5): this row is a partial, new-values-only, human-readable record --
  -- name/kind/capabilities/is_active plus whether the key changed, never the old values and
  -- never the key itself. It is NOT the authoritative audit trail for this table. That is
  -- trg_audit_ai_providers (migration 475, audit_ai_routing_change()), an AFTER trigger on
  -- ai_providers that captures a complete before/after diff for every write to this table --
  -- including writes that bypass this RPC. Read entity_type='ai_providers' (plural) for the
  -- complete record; this entity_type='ai_provider' (singular) row is a secondary, redundant
  -- one kept only because removing it is an application-visible change outside this fix's scope.
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_ai_provider(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- NOTE (535/S-5): partial record (name only), same caveat as admin_upsert_ai_provider above.
  -- trg_audit_ai_providers (migration 475) recorded the full row -- including this row's
  -- created_by/updated_at/etc, redacted of secret_id/key_prefix -- under entity_type='ai_providers'
  -- (plural) BEFORE this DELETE committed. This entry is a secondary, human-readable pointer.
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'ai_provider', p_id::text, 'ai_provider_deleted',
          jsonb_build_object('name', v_name));
END;
$function$;


-- ── Post-apply sanity: signatures unchanged, functions still owned as SECURITY DEFINER ───────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'delete_bot_api_key_secure'
      AND pg_get_function_identity_arguments(oid) = '_key_id uuid, _reason text'
      AND prosecdef
  ) THEN
    RAISE EXCEPTION '535: delete_bot_api_key_secure signature or SECURITY DEFINER changed unexpectedly';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'admin_upsert_ai_provider' AND prosecdef
  ) THEN
    RAISE EXCEPTION '535: admin_upsert_ai_provider missing or lost SECURITY DEFINER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'admin_delete_ai_provider'
      AND pg_get_function_identity_arguments(oid) = 'p_id uuid'
      AND prosecdef
  ) THEN
    RAISE EXCEPTION '535: admin_delete_ai_provider signature or SECURITY DEFINER changed unexpectedly';
  END IF;
END $$;

INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('20260913103000')
ON CONFLICT (version) DO NOTHING;
