-- Ensure pgcrypto is installed in the standard extensions schema
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Fix bot_authenticate_key: use extensions.digest (search_path=public can't see pgcrypto)
CREATE OR REPLACE FUNCTION public.bot_authenticate_key(p_raw_key text)
RETURNS TABLE (key_id uuid, name text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hash text;
  _id uuid;
  _name text;
  _active boolean;
  _expires timestamptz;
BEGIN
  IF p_raw_key IS NULL OR length(btrim(p_raw_key)) < 8 THEN
    RAISE EXCEPTION 'invalid_key';
  END IF;

  _hash := encode(extensions.digest(p_raw_key, 'sha256'), 'hex');

  SELECT k.id, k.name, k.is_active, k.expires_at
    INTO _id, _name, _active, _expires
  FROM public.bot_api_keys k
  WHERE k.key_hash = _hash;

  IF _id IS NULL THEN RAISE EXCEPTION 'invalid_key'; END IF;
  IF NOT _active THEN RAISE EXCEPTION 'inactive_key'; END IF;
  IF _expires IS NOT NULL AND _expires < now() THEN RAISE EXCEPTION 'expired_key'; END IF;

  UPDATE public.bot_api_keys SET last_used_at = now() WHERE id = _id;

  RETURN QUERY SELECT _id, _name;
END;
$$;

REVOKE ALL ON FUNCTION public.bot_authenticate_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bot_authenticate_key(text) TO service_role;

-- Fix create_bot_api_key: use extensions.gen_random_bytes and extensions.digest
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

  _raw := 'bk_' || encode(extensions.gen_random_bytes(20), 'hex');
  _prefix := substring(_raw FROM 1 FOR 10);
  _hash := encode(extensions.digest(_raw, 'sha256'), 'hex');

  INSERT INTO public.bot_api_keys (name, key_hash, key_prefix, is_active, created_by, expires_at)
  VALUES (btrim(p_name), _hash, _prefix, true, _uid, p_expires_at)
  RETURNING bot_api_keys.id INTO _id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_uid, 'bot_api_keys', _id::text, 'bot_api_key_created',
          jsonb_build_object('name', btrim(p_name), 'expires_at', p_expires_at, 'key_prefix', _prefix));

  RETURN QUERY SELECT _id, _raw, _prefix;
END;
$$;