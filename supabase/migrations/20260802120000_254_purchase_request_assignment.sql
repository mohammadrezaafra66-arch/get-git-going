SET client_encoding='UTF8';

-- =============================================================================
-- Issue 219 / C4.1 — who is responsible for a purchase request
-- =============================================================================
-- Until now create_purchase_request ended with this:
--
--     select p.id into v_assigned_to
--       from public.profiles p
--       join public.user_roles ur on ur.user_id = p.id
--      where p.is_active = true and ur.role = 'manager'
--      order by p.created_at asc
--      limit 1;
--
-- Whoever happened to be the oldest active manager row became responsible for
-- every purchase request in the system. On this database that is exactly what
-- happened: 42 of 44 requests are assigned to one person, not because anyone
-- chose her, but because of an ORDER BY. This migration removes that.
--
-- The replacement is an explicit chain, and every step of it can be pointed at:
--
--   1. explicit   — an admin/manager named someone when creating the request
--   2. default    — the configured default purchase assignee
--   3. specialist — an active purchase_specialist, chosen deterministically
--   4. unassigned — nobody; managers are told so they can act
--
-- Step 4 is a real outcome, not a failure. A request with no owner is visible
-- and fixable; a request silently owned by an arbitrary manager is neither.
--
-- Deploy order note: this is safe to apply before the frontend ships. The
-- return type widens from uuid to jsonb, and the existing client does not read
-- the returned value at all (it casts it and discards it), so an old frontend
-- against a new database keeps working.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Where the default is stored
-- -----------------------------------------------------------------------------
-- shop_settings is a key/value table (key text, value text). It is the
-- project's settings store, so the default lives there as a key rather than as
-- a new column on a new table. A key/value cell cannot carry a foreign key,
-- which turns out to be the behaviour we want: if the configured user is later
-- deactivated or loses their role, request creation must NOT fail — it must
-- fall through to the next step. Validity is therefore checked when the value
-- is read, and again when it is written.
INSERT INTO public.shop_settings (key, value)
SELECT 'default_purchase_assignee_id', ''
WHERE NOT EXISTS (
  SELECT 1 FROM public.shop_settings WHERE key = 'default_purchase_assignee_id'
);

-- -----------------------------------------------------------------------------
-- 2. What makes someone eligible
-- -----------------------------------------------------------------------------
-- Deliberately stricter than the code it replaces, which only checked
-- is_active. 4 of the 27 currently-active profiles have status='pending' —
-- accounts awaiting approval. Handing an unapproved account responsibility for
-- purchasing is not something anyone asked for, so `status = 'active'` is
-- required as well.
--
-- Roles are checked through has_any_role, so a user who holds several roles
-- qualifies on the strength of any one of them.
CREATE OR REPLACE FUNCTION public.is_valid_purchase_assignee(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _user
      AND p.is_active
      AND p.status = 'active'
      AND public.has_any_role(
            p.id, ARRAY['purchase_specialist','manager','admin']::text[])
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_valid_purchase_assignee(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_valid_purchase_assignee(uuid) TO authenticated;

COMMENT ON FUNCTION public.is_valid_purchase_assignee(uuid) IS
  'Issue 219 C4: may this user be made responsible for a purchase request? '
  'Active, approved, and holding purchase_specialist / manager / admin.';

-- -----------------------------------------------------------------------------
-- 3. Reading the configured default
-- -----------------------------------------------------------------------------
-- Returns NULL for every kind of "not usable": unset, blank, not a uuid, user
-- gone, user deactivated, role lost. The caller then moves to the next step of
-- the chain. A malformed value must never raise — a typo in a settings row is
-- not a reason for the purchase request page to stop working.
CREATE OR REPLACE FUNCTION public.get_default_purchase_assignee()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _raw text;
  _id  uuid;
BEGIN
  SELECT NULLIF(btrim(value), '') INTO _raw
    FROM public.shop_settings WHERE key = 'default_purchase_assignee_id';

  IF _raw IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    _id := _raw::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;

  IF public.is_valid_purchase_assignee(_id) THEN
    RETURN _id;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_default_purchase_assignee() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_default_purchase_assignee() TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. The eligible-people list the UI offers
-- -----------------------------------------------------------------------------
-- A DEFINER function rather than a view, because the caller needs to see names
-- of users they would otherwise have no reason to be able to read. Restricted
-- to admin/manager: nobody else has an assignment control to populate.
CREATE OR REPLACE FUNCTION public.get_purchase_assignee_options()
RETURNS TABLE (user_id uuid, full_name text, roles text[], is_default boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _uid     uuid := auth.uid();
  _default uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.'
      USING ERRCODE = '42501', HINT = 'AUTH_REQUIRED';
  END IF;

  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'شما اجازه تعیین مسئول خرید را ندارید.'
      USING ERRCODE = '42501', HINT = 'ASSIGN_PERMISSION_DENIED';
  END IF;

  _default := public.get_default_purchase_assignee();

  RETURN QUERY
  SELECT p.id,
         COALESCE(p.full_name, '—'),
         ARRAY(SELECT ur.role::text FROM public.user_roles ur
                WHERE ur.user_id = p.id ORDER BY ur.role::text),
         (p.id = _default)
  FROM public.profiles p
  WHERE public.is_valid_purchase_assignee(p.id)
  -- Same deterministic order as the fallback below, so the list a manager sees
  -- and the person the system would pick agree with each other.
  ORDER BY p.created_at, p.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_purchase_assignee_options() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_purchase_assignee_options() TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Writing the configured default
-- -----------------------------------------------------------------------------
-- The shop_settings write policy is admin-only (plus an accountant carve-out
-- for three unrelated keys). C4 requires managers to be able to set the
-- purchase default, so this DEFINER function grants exactly that and nothing
-- else: one key, admin or manager, validated value, audited.
CREATE OR REPLACE FUNCTION public.set_default_purchase_assignee(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _uid  uuid := auth.uid();
  _prev text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.'
      USING ERRCODE = '42501', HINT = 'AUTH_REQUIRED';
  END IF;

  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'شما اجازه تعیین مسئول خرید را ندارید.'
      USING ERRCODE = '42501', HINT = 'ASSIGN_PERMISSION_DENIED';
  END IF;

  IF p_user_id IS NOT NULL AND NOT public.is_valid_purchase_assignee(p_user_id) THEN
    RAISE EXCEPTION 'کاربر انتخاب‌شده نمی‌تواند مسئول خرید باشد.'
      USING ERRCODE = '22023', HINT = 'ASSIGNEE_ROLE_INVALID';
  END IF;

  SELECT value INTO _prev FROM public.shop_settings
   WHERE key = 'default_purchase_assignee_id' FOR UPDATE;

  UPDATE public.shop_settings
     SET value = COALESCE(p_user_id::text, ''), updated_at = now(), updated_by = _uid
   WHERE key = 'default_purchase_assignee_id';

  IF NOT FOUND THEN
    INSERT INTO public.shop_settings (key, value, updated_by)
    VALUES ('default_purchase_assignee_id', COALESCE(p_user_id::text, ''), _uid);
  END IF;

  -- Only a real change is worth an audit row.
  IF COALESCE(_prev,'') IS DISTINCT FROM COALESCE(p_user_id::text,'') THEN
    INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
    VALUES ('shop_settings', 'default_purchase_assignee_id',
            'default_purchase_assignee_changed', _uid,
            jsonb_build_object('from', NULLIF(_prev,''), 'to', p_user_id));
  END IF;

  -- Changing the default deliberately does NOT touch existing requests. Their
  -- assignee was decided when they were created; rewriting history here would
  -- silently move work between people.
  RETURN jsonb_build_object(
    'default_assignee_id', p_user_id,
    'changed', COALESCE(_prev,'') IS DISTINCT FROM COALESCE(p_user_id::text,'')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_default_purchase_assignee(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_default_purchase_assignee(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. create_purchase_request — the fallback is gone
-- -----------------------------------------------------------------------------
-- The old 6-argument signature is dropped rather than left in place. Adding a
-- defaulted parameter would OVERLOAD it, every existing call would become
-- ambiguous, and the feature would break at runtime.
DROP FUNCTION IF EXISTS public.create_purchase_request(uuid, numeric, text, uuid, text, numeric);

CREATE OR REPLACE FUNCTION public.create_purchase_request(
  p_product_id     uuid,
  p_quantity       numeric,
  p_unit           text,
  p_inquiry_id     uuid    DEFAULT NULL,
  p_notes          text    DEFAULT NULL,
  p_expected_price numeric DEFAULT NULL,
  p_assigned_to    uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _caller      uuid := auth.uid();
  _is_priv     boolean;
  _assignee    uuid;
  _source      text;
  _request_id  uuid;
  _default_raw text;
  _mgr         record;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.'
      USING ERRCODE = '42501', HINT = 'AUTH_REQUIRED';
  END IF;

  IF NOT public.has_any_role(_caller, ARRAY['sales','manager','admin']::text[]) THEN
    RAISE EXCEPTION 'دسترسی برای ثبت درخواست خرید ندارید.'
      USING ERRCODE = '42501', HINT = 'REQUEST_PERMISSION_DENIED';
  END IF;

  _is_priv := public.has_any_role(_caller, ARRAY['admin','manager']::text[]);

  -- ---- step 1: explicit -----------------------------------------------------
  IF p_assigned_to IS NOT NULL THEN
    -- Refused rather than ignored. A salesperson who tries to choose the buyer
    -- should be told no; silently overriding their input would leave them
    -- believing they had chosen.
    IF NOT _is_priv THEN
      RAISE EXCEPTION 'شما اجازه تعیین مسئول خرید را ندارید.'
        USING ERRCODE = '42501', HINT = 'ASSIGN_PERMISSION_DENIED';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_assigned_to) THEN
      RAISE EXCEPTION 'کاربر انتخاب‌شده پیدا نشد.'
        USING ERRCODE = 'P0002', HINT = 'ASSIGNEE_NOT_FOUND';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles
                    WHERE id = p_assigned_to AND is_active AND status = 'active') THEN
      RAISE EXCEPTION 'کاربر انتخاب‌شده غیرفعال است.'
        USING ERRCODE = '22023', HINT = 'ASSIGNEE_INACTIVE';
    END IF;

    IF NOT public.is_valid_purchase_assignee(p_assigned_to) THEN
      RAISE EXCEPTION 'کاربر انتخاب‌شده نقش مناسب مسئول خرید را ندارد.'
        USING ERRCODE = '22023', HINT = 'ASSIGNEE_ROLE_INVALID';
    END IF;

    _assignee := p_assigned_to;
    _source   := 'explicit';
  END IF;

  -- ---- step 2: configured default -------------------------------------------
  IF _assignee IS NULL THEN
    _assignee := public.get_default_purchase_assignee();
    IF _assignee IS NOT NULL THEN
      _source := 'default_setting';
    ELSE
      -- A default that is set but unusable is a configuration problem someone
      -- needs to see. It must not block the request, so it is recorded and the
      -- chain continues.
      SELECT NULLIF(btrim(value),'') INTO _default_raw
        FROM public.shop_settings WHERE key = 'default_purchase_assignee_id';
      IF _default_raw IS NOT NULL THEN
        INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
        VALUES ('shop_settings', 'default_purchase_assignee_id',
                'default_purchase_assignee_invalid', _caller,
                jsonb_build_object('configured_value', _default_raw,
                                   'reason', 'DEFAULT_ASSIGNEE_INVALID'));
      END IF;
    END IF;
  END IF;

  -- ---- step 3: an active purchase specialist --------------------------------
  IF _assignee IS NULL THEN
    -- ORDER BY created_at alone is not deterministic — two profiles created in
    -- the same statement share a timestamp, and the winner would then depend on
    -- physical row order. id breaks the tie.
    SELECT p.id INTO _assignee
      FROM public.profiles p
     WHERE p.is_active
       AND p.status = 'active'
       AND public.has_any_role(p.id, ARRAY['purchase_specialist']::text[])
     ORDER BY p.created_at, p.id
     LIMIT 1;

    IF _assignee IS NOT NULL THEN
      _source := 'purchase_specialist_fallback';
    END IF;
  END IF;

  -- ---- step 4: nobody --------------------------------------------------------
  IF _assignee IS NULL THEN
    _source := 'unassigned';
  END IF;

  INSERT INTO public.purchase_requests (
    product_id, quantity, unit, inquiry_id,
    requested_by, assigned_to, notes, expected_price
  ) VALUES (
    p_product_id, p_quantity, COALESCE(p_unit,'عدد'), p_inquiry_id,
    _caller, _assignee, p_notes, p_expected_price
  )
  RETURNING id INTO _request_id;

  INSERT INTO public.purchase_request_status_history
    (request_id, from_status, to_status, changed_by, note)
  VALUES (_request_id, NULL, 'pending', _caller, 'درخواست ایجاد شد');

  IF _assignee IS NOT NULL THEN
    INSERT INTO public.notification_events
      (event_type, user_id, channel, payload, status)
    VALUES (
      'purchase_request_new', _assignee, 'in_app',
      jsonb_build_object(
        'title','درخواست خرید جدید',
        'body','یک درخواست خرید جدید برای بررسی ثبت شده است.',
        'reference_type','purchase_request',
        'reference_id', _request_id
      ),
      'pending'
    );
  ELSE
    -- Nobody owns this request. Every active admin and manager is told, once,
    -- so it does not sit unnoticed.
    FOR _mgr IN
      SELECT DISTINCT p.id
        FROM public.profiles p
       WHERE p.is_active AND p.status = 'active'
         AND public.has_any_role(p.id, ARRAY['admin','manager']::text[])
    LOOP
      INSERT INTO public.notification_events
        (event_type, user_id, channel, payload, status)
      VALUES (
        'purchase_request_unassigned', _mgr.id, 'in_app',
        jsonb_build_object(
          'title','درخواست خرید بدون مسئول',
          'body','درخواست خرید بدون مسئول ثبت شد.',
          'reference_type','purchase_request',
          'reference_id', _request_id
        ),
        'pending'
      );
    END LOOP;
  END IF;

  -- assignment_source is recorded here and returned to the caller, but is NOT
  -- stored on purchase_requests. A column would be a second source of truth
  -- that nothing keeps in step with assigned_to once a request is reassigned.
  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
  VALUES (
    'purchase_request', _request_id::text, 'created', _caller,
    jsonb_build_object('product_id', p_product_id, 'quantity', p_quantity,
                       'assigned_to', _assignee, 'assignment_source', _source)
  );

  RETURN jsonb_build_object(
    'request_id',        _request_id,
    'assigned_to',       _assignee,
    'assignment_source', _source,
    'is_unassigned',     _assignee IS NULL
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION
  public.create_purchase_request(uuid, numeric, text, uuid, text, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.create_purchase_request(uuid, numeric, text, uuid, text, numeric, uuid)
  TO authenticated;

COMMENT ON FUNCTION
  public.create_purchase_request(uuid, numeric, text, uuid, text, numeric, uuid) IS
  'Issue 219 C4: creates a purchase request and resolves its owner through '
  'explicit -> default setting -> active purchase_specialist -> unassigned. '
  'The pre-C4 "first active manager" fallback is gone.';
