-- Phase 4.6: Bot API Key management
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Add new columns to bot_api_keys
ALTER TABLE public.bot_api_keys
  ADD COLUMN IF NOT EXISTS key_prefix text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_bot_api_keys_active ON public.bot_api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_bot_api_keys_prefix ON public.bot_api_keys(key_prefix);

-- 2) Per-table access mapping
CREATE TABLE IF NOT EXISTS public.bot_api_key_table_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES public.bot_api_keys(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.dynamic_tables(id) ON DELETE CASCADE,
  can_read boolean NOT NULL DEFAULT true,
  can_update boolean NOT NULL DEFAULT false,
  allowed_update_columns uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (api_key_id, table_id)
);

CREATE INDEX IF NOT EXISTS idx_bakta_key ON public.bot_api_key_table_access(api_key_id);
CREATE INDEX IF NOT EXISTS idx_bakta_table ON public.bot_api_key_table_access(table_id);

ALTER TABLE public.bot_api_key_table_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bakta_admin_manager_all" ON public.bot_api_key_table_access;
CREATE POLICY "bakta_admin_manager_all" ON public.bot_api_key_table_access
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'manager'::app_role]));

DROP TRIGGER IF EXISTS trg_bakta_updated ON public.bot_api_key_table_access;
CREATE TRIGGER trg_bakta_updated BEFORE UPDATE ON public.bot_api_key_table_access
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) RPC: create a new bot API key. Returns the raw key once.
CREATE OR REPLACE FUNCTION public.create_bot_api_key(
  p_name text,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS TABLE (id uuid, raw_key text, key_prefix text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _id uuid;
  _raw text;
  _prefix text;
  _hash text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  -- Generate a random key: prefix "bk_" + 40 hex chars
  _raw := 'bk_' || encode(gen_random_bytes(20), 'hex');
  _prefix := substring(_raw FROM 1 FOR 10);  -- e.g. "bk_abcd12"
  _hash := encode(digest(_raw, 'sha256'), 'hex');

  INSERT INTO public.bot_api_keys (name, key_hash, key_prefix, is_active, created_by, expires_at)
  VALUES (btrim(p_name), _hash, _prefix, true, _uid, p_expires_at)
  RETURNING bot_api_keys.id INTO _id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'bot_api_keys', _id::text, 'bot_api_key_created',
          jsonb_build_object('name', btrim(p_name), 'expires_at', p_expires_at, 'key_prefix', _prefix));

  RETURN QUERY SELECT _id, _raw, _prefix;
END;
$$;

-- 4) RPC: toggle active
CREATE OR REPLACE FUNCTION public.set_bot_api_key_active(
  p_key_id uuid,
  p_is_active boolean
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.bot_api_keys SET is_active = p_is_active WHERE id = p_key_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'bot_api_keys', p_key_id::text,
          CASE WHEN p_is_active THEN 'bot_api_key_activated' ELSE 'bot_api_key_deactivated' END,
          jsonb_build_object('is_active', p_is_active));
END;
$$;

-- 5) RPC: upsert per-table access for a key
CREATE OR REPLACE FUNCTION public.set_bot_api_key_table_access(
  p_key_id uuid,
  p_table_id uuid,
  p_can_read boolean,
  p_can_update boolean,
  p_allowed_update_columns uuid[] DEFAULT '{}'::uuid[]
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _valid_cols uuid[];
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Verify key + table exist
  IF NOT EXISTS (SELECT 1 FROM public.bot_api_keys WHERE id = p_key_id) THEN
    RAISE EXCEPTION 'key_not_found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dynamic_tables WHERE id = p_table_id) THEN
    RAISE EXCEPTION 'table_not_found';
  END IF;

  -- Constrain allowed_update_columns to columns that actually belong to that table
  SELECT COALESCE(array_agg(c.id), '{}'::uuid[]) INTO _valid_cols
  FROM public.dynamic_table_columns c
  WHERE c.table_id = p_table_id
    AND c.id = ANY (COALESCE(p_allowed_update_columns, '{}'::uuid[]));

  INSERT INTO public.bot_api_key_table_access
    (api_key_id, table_id, can_read, can_update, allowed_update_columns)
  VALUES (p_key_id, p_table_id, COALESCE(p_can_read, true), COALESCE(p_can_update, false), _valid_cols)
  ON CONFLICT (api_key_id, table_id) DO UPDATE
    SET can_read = EXCLUDED.can_read,
        can_update = EXCLUDED.can_update,
        allowed_update_columns = EXCLUDED.allowed_update_columns,
        updated_at = now();

  -- Maintain legacy allowed_table_ids array for back-compat
  UPDATE public.bot_api_keys k
  SET allowed_table_ids = COALESCE((
    SELECT array_agg(DISTINCT a.table_id)
    FROM public.bot_api_key_table_access a
    WHERE a.api_key_id = k.id
  ), '{}'::uuid[])
  WHERE k.id = p_key_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'bot_api_keys', p_key_id::text, 'bot_api_key_access_updated',
          jsonb_build_object(
            'table_id', p_table_id,
            'can_read', COALESCE(p_can_read, true),
            'can_update', COALESCE(p_can_update, false),
            'allowed_update_columns', _valid_cols
          ));
END;
$$;

-- 6) RPC: remove access mapping
CREATE OR REPLACE FUNCTION public.delete_bot_api_key_table_access(
  p_key_id uuid,
  p_table_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.has_any_role(_uid, ARRAY['admin'::app_role, 'manager'::app_role]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  DELETE FROM public.bot_api_key_table_access
  WHERE api_key_id = p_key_id AND table_id = p_table_id;

  UPDATE public.bot_api_keys k
  SET allowed_table_ids = COALESCE((
    SELECT array_agg(DISTINCT a.table_id)
    FROM public.bot_api_key_table_access a
    WHERE a.api_key_id = k.id
  ), '{}'::uuid[])
  WHERE k.id = p_key_id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'bot_api_keys', p_key_id::text, 'bot_api_key_access_removed',
          jsonb_build_object('table_id', p_table_id));
END;
$$;

REVOKE ALL ON FUNCTION public.create_bot_api_key(text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_bot_api_key_active(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_bot_api_key_table_access(uuid, uuid, boolean, boolean, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_bot_api_key_table_access(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_bot_api_key(text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_bot_api_key_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_bot_api_key_table_access(uuid, uuid, boolean, boolean, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_bot_api_key_table_access(uuid, uuid) TO authenticated;