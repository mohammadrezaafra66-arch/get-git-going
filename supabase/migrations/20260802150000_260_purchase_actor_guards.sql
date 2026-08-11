SET client_encoding='UTF8';

-- =============================================================================
-- Issue 219 / C5.2 — two defects the permission suite found
-- =============================================================================
--
-- 1. A NULL comparison silently disabled a permission check
-- ---------------------------------------------------------
-- update_purchase_status has always guarded itself like this:
--
--     if not ( has_role(caller,'admin') or has_role(caller,'manager')
--              or v_assignee = v_caller ) then raise ... end if;
--
-- When the request has no assignee, `v_assignee = v_caller` is NULL, so the
-- expression is `false or false or NULL` = NULL, `not NULL` = NULL, and the IF
-- never fires. **Any authenticated user could change the status of an
-- unassigned request.** The bug predates C5 — it was in the original function
-- and was carried over verbatim into 258 — but C4 is what made it reachable in
-- practice, because C4 made "unassigned" a normal, common state instead of an
-- impossible one. Found by test D7.
--
-- Fixed with IS NOT DISTINCT FROM, which is NULL-safe.
--
-- 2. Deactivated accounts could still act
-- ---------------------------------------
-- Every purchase check asks `has_any_role(...)` and nothing asks whether the
-- account is still switched on. The test fixture that exposed this is a real
-- account with `is_active=false, status='rejected'` that still holds `admin`,
-- and it could create purchases. Found by test J3.
--
-- Enforced in two places rather than one, because there are two kinds of entry
-- point: functions I can add a line to, and inserts that must be caught wherever
-- they come from.
--
-- Blast radius, measured before writing this: of the accounts holding
-- admin / manager / purchase_specialist / sales, 22 are `is_active AND
-- status='active'` and 5 are deliberately disabled (2 inactive, 3 rejected).
-- There are no `pending` privileged accounts, so nobody working today is locked
-- out by this.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. One definition of "may this account still act"
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_active_actor(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = _user AND p.is_active AND p.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_actor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_actor(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.is_active_actor(uuid) IS
  'Issue 219 C5: is this account still switched on? Holding a role is not '
  'enough — a deactivated or rejected profile must not be able to transact.';

-- -----------------------------------------------------------------------------
-- 2. The insert paths, guarded at the table
-- -----------------------------------------------------------------------------
-- A trigger rather than an edit to create_purchase: it catches the actor
-- wherever the row comes from, and it does not require re-stating a
-- 500-line function that is already applied and proven.
CREATE OR REPLACE FUNCTION public.tg_purchase_actor_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _actor uuid;
BEGIN
  _actor := CASE TG_TABLE_NAME
              WHEN 'purchases'         THEN NEW.created_by
              WHEN 'purchase_requests' THEN NEW.requested_by
            END;

  -- A NULL actor is left to the column's own NOT NULL constraint to complain
  -- about; this trigger only judges accounts that exist.
  IF _actor IS NOT NULL AND NOT public.is_active_actor(_actor) THEN
    RAISE EXCEPTION 'حساب کاربری شما فعال نیست.'
      USING ERRCODE = '42501', HINT = 'ACTOR_INACTIVE';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_purchase_actor_active() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_purchases_actor_active ON public.purchases;
CREATE TRIGGER trg_purchases_actor_active
  BEFORE INSERT ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.tg_purchase_actor_active();

DROP TRIGGER IF EXISTS trg_purchase_requests_actor_active ON public.purchase_requests;
CREATE TRIGGER trg_purchase_requests_actor_active
  BEFORE INSERT ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_purchase_actor_active();

-- -----------------------------------------------------------------------------
-- 3. update_purchase_status — NULL-safe permission, and an active caller
-- -----------------------------------------------------------------------------
-- Identical to the definition installed by 258 apart from those two lines.
CREATE OR REPLACE FUNCTION public.update_purchase_status(
  p_request_id uuid,
  p_new_status text,
  p_note text DEFAULT NULL::text,
  p_final_price numeric DEFAULT NULL::numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_old_status text;
  v_requester uuid;
  v_assignee uuid;
  v_caller uuid := auth.uid();
  v_status_fa text;
  v_allowed text[];
begin
  if v_caller is null then
    raise exception 'احراز هویت لازم است.'
      using errcode = '42501', hint = 'AUTH_REQUIRED';
  end if;

  if not public.is_active_actor(v_caller) then
    raise exception 'حساب کاربری شما فعال نیست.'
      using errcode = '42501', hint = 'ACTOR_INACTIVE';
  end if;

  if p_new_status in ('purchased', 'partially_purchased') then
    raise exception 'وضعیت خرید فقط پس از ثبت سند خرید واقعی تغییر می‌کند.'
      using errcode = '42501', hint = 'PURCHASE_STATUS_DERIVED';
  end if;

  if p_new_status not in ('pending','approved','delivered','cancelled') then
    raise exception 'وضعیت نامعتبر است.'
      using errcode = '22023', hint = 'PURCHASE_STATUS_INVALID';
  end if;

  if p_final_price is not null then
    raise exception 'قیمت نهایی از روی اسناد خرید محاسبه می‌شود و دستی ثبت نمی‌شود.'
      using errcode = '42501', hint = 'PURCHASE_FINAL_PRICE_DERIVED';
  end if;

  select status, requested_by, assigned_to
    into v_old_status, v_requester, v_assignee
  from public.purchase_requests
  where id = p_request_id;

  if not found then
    raise exception 'درخواست خرید پیدا نشد.'
      using errcode = 'P0002', hint = 'REQUEST_NOT_FOUND';
  end if;

  -- IS NOT DISTINCT FROM, not `=`. With an unassigned request `v_assignee =
  -- v_caller` is NULL, the whole condition collapses to NULL, `not NULL` is
  -- NULL, and the guard is skipped entirely — which let any authenticated user
  -- move an ownerless request. See the header.
  if not (
    public.has_role(v_caller, 'admin') or
    public.has_role(v_caller, 'manager') or
    v_assignee is not distinct from v_caller
  ) then
    raise exception 'دسترسی ندارید.'
      using errcode = '42501', hint = 'PURCHASE_PERMISSION_DENIED';
  end if;

  -- An unassigned request has no assignee to inherit the right from, so only
  -- admin and manager may move it.
  if v_assignee is null and not (
       public.has_role(v_caller, 'admin') or public.has_role(v_caller, 'manager')) then
    raise exception 'دسترسی ندارید.'
      using errcode = '42501', hint = 'PURCHASE_PERMISSION_DENIED';
  end if;

  v_allowed := case v_old_status
    when 'pending'              then array['approved','cancelled']
    when 'approved'             then array['cancelled']
    when 'partially_purchased'  then array['cancelled']
    when 'purchased'            then array['delivered']
    else array[]::text[]
  end;

  if not (p_new_status = any(v_allowed)) then
    raise exception 'این تغییر وضعیت مجاز نیست.'
      using errcode = '42501', hint = 'PURCHASE_TRANSITION_INVALID';
  end if;

  update public.purchase_requests
  set status = p_new_status,
      updated_at = now()
  where id = p_request_id;

  insert into public.purchase_request_status_history
    (request_id, from_status, to_status, changed_by, note)
  values
    (p_request_id, v_old_status, p_new_status, v_caller, p_note);

  v_status_fa := case p_new_status
    when 'pending' then 'در انتظار تأیید'
    when 'approved' then 'تأیید شده'
    when 'delivered' then 'تحویل داده شد'
    when 'cancelled' then 'لغو شد'
    else p_new_status
  end;

  insert into public.notification_events
    (event_type, user_id, channel, payload, status)
  values (
    'purchase_status_changed', v_requester, 'in_app',
    jsonb_build_object(
      'title','وضعیت درخواست خرید تغییر کرد',
      'body','وضعیت درخواست خرید شما به «' || v_status_fa || '» تغییر یافت.',
      'reference_type','purchase_request',
      'reference_id', p_request_id,
      'from', v_old_status,
      'to', p_new_status
    ),
    'pending'
  );

  insert into public.audit_logs
    (entity_type, entity_id, action, actor_id, diff)
  values (
    'purchase_request', p_request_id::text, 'status_changed',
    v_caller,
    jsonb_build_object('from', v_old_status, 'to', p_new_status)
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.update_purchase_status(uuid, text, text, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_purchase_status(uuid, text, text, numeric)
  TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. assign_purchase_request — an active caller
-- -----------------------------------------------------------------------------
-- Copied verbatim from pg_get_functiondef and patched at exactly one point.
-- Re-typing a 150-line function to add four lines is how a clause quietly goes
-- missing; this way the only difference from what is already running is the
-- check itself.
CREATE OR REPLACE FUNCTION public.assign_purchase_request(p_request_id uuid, p_assignee_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_expected_current_assignee_id uuid DEFAULT NULL::uuid, p_expect_provided boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _uid        uuid := auth.uid();
  _req        public.purchase_requests%ROWTYPE;
  _prev       uuid;
  _prev_name  text;
  _new_name   text;
  _changed    boolean;
  _mgr        record;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.'
      USING ERRCODE = '42501', HINT = 'AUTH_REQUIRED';
  END IF;

  -- C5: holding admin/manager is not enough if the account itself has been
  -- switched off. See the header of migration 260.
  IF NOT public.is_active_actor(_uid) THEN
    RAISE EXCEPTION 'حساب کاربری شما فعال نیست.'
      USING ERRCODE = '42501', HINT = 'ACTOR_INACTIVE';
  END IF;

  -- Admin and manager only. A purchase_specialist deliberately cannot take a
  -- request from a colleague: self-assignment was not part of the approved
  -- design, and the safe default for "not decided" is "not allowed".
  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'شما اجازه تعیین مسئول خرید را ندارید.'
      USING ERRCODE = '42501', HINT = 'ASSIGN_PERMISSION_DENIED';
  END IF;

  -- The lock is taken before anything is validated, so two concurrent calls
  -- serialise here rather than racing between the check and the update.
  SELECT * INTO _req FROM public.purchase_requests
   WHERE id = p_request_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'درخواست خرید پیدا نشد.'
      USING ERRCODE = 'P0002', HINT = 'REQUEST_NOT_FOUND';
  END IF;

  _prev := _req.assigned_to;

  -- A cancelled request is finished. Moving its ownership would suggest there
  -- is still work to do on it. Legacy requests, by contrast, stay assignable:
  -- they are ordinary open work that merely lacks a document history.
  IF _req.status = 'cancelled' THEN
    RAISE EXCEPTION 'این درخواست لغو شده است و مسئول آن قابل تغییر نیست.'
      USING ERRCODE = '22023', HINT = 'REQUEST_CANCELLED';
  END IF;

  -- Optimistic concurrency. Only enforced when the caller actually told us what
  -- it expected — p_expect_provided distinguishes "I expect nobody" from
  -- "I did not check", which a bare NULL cannot express.
  IF p_expect_provided
     AND _prev IS DISTINCT FROM p_expected_current_assignee_id THEN
    RAISE EXCEPTION 'مسئول این درخواست هم‌زمان توسط کاربر دیگری تغییر کرده است.'
      USING ERRCODE = '40001', HINT = 'ASSIGNMENT_CONFLICT';
  END IF;

  IF p_assignee_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_assignee_id) THEN
      RAISE EXCEPTION 'کاربر انتخاب‌شده پیدا نشد.'
        USING ERRCODE = 'P0002', HINT = 'ASSIGNEE_NOT_FOUND';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles
                    WHERE id = p_assignee_id AND is_active AND status = 'active') THEN
      RAISE EXCEPTION 'کاربر انتخاب‌شده غیرفعال است.'
        USING ERRCODE = '22023', HINT = 'ASSIGNEE_INACTIVE';
    END IF;

    IF NOT public.is_valid_purchase_assignee(p_assignee_id) THEN
      RAISE EXCEPTION 'کاربر انتخاب‌شده نقش مناسب مسئول خرید را ندارد.'
        USING ERRCODE = '22023', HINT = 'ASSIGNEE_ROLE_INVALID';
    END IF;
  END IF;

  _changed := _prev IS DISTINCT FROM p_assignee_id;

  SELECT full_name INTO _prev_name FROM public.profiles WHERE id = _prev;
  SELECT full_name INTO _new_name  FROM public.profiles WHERE id = p_assignee_id;

  -- A no-op is a success, not an error: a retried request and a double-click
  -- both land here, and both should be told "this is already the case". What a
  -- no-op must NOT do is emit a second notification or a second audit row.
  IF NOT _changed THEN
    RETURN jsonb_build_object(
      'request_id', p_request_id,
      'previous_assignee', CASE WHEN _prev IS NULL THEN NULL
             ELSE jsonb_build_object('id', _prev, 'name', _prev_name) END,
      'new_assignee', CASE WHEN p_assignee_id IS NULL THEN NULL
             ELSE jsonb_build_object('id', p_assignee_id, 'name', _new_name) END,
      'is_unassigned', p_assignee_id IS NULL,
      'changed', false
    );
  END IF;

  UPDATE public.purchase_requests
     SET assigned_to = p_assignee_id, updated_at = now()
   WHERE id = p_request_id;

  -- ---- notifications --------------------------------------------------------
  IF p_assignee_id IS NOT NULL THEN
    INSERT INTO public.notification_events
      (event_type, user_id, channel, payload, status)
    VALUES (
      'purchase_request_assigned', p_assignee_id, 'in_app',
      jsonb_build_object(
        'title','مسئول خرید شما شدید',
        'body','یک درخواست خرید به شما تخصیص داده شد.',
        'reference_type','purchase_request',
        'reference_id', p_request_id
      ),
      'pending'
    );
  END IF;

  -- The person who loses the request is told too, so work does not disappear
  -- from under them without explanation.
  IF _prev IS NOT NULL THEN
    INSERT INTO public.notification_events
      (event_type, user_id, channel, payload, status)
    VALUES (
      'purchase_request_reassigned', _prev, 'in_app',
      jsonb_build_object(
        'title','درخواست خرید از شما گرفته شد',
        'body', CASE WHEN p_assignee_id IS NULL
                     THEN 'یک درخواست خرید دیگر به شما تخصیص ندارد.'
                     ELSE 'یک درخواست خرید به همکار دیگری تخصیص داده شد.' END,
        'reference_type','purchase_request',
        'reference_id', p_request_id,
        'note', p_note
      ),
      'pending'
    );
  END IF;

  -- Unassigning leaves the request ownerless, which is the same situation
  -- create_purchase_request warns about, so it warns the same audience.
  IF p_assignee_id IS NULL THEN
    FOR _mgr IN
      SELECT DISTINCT p.id FROM public.profiles p
       WHERE p.is_active AND p.status = 'active'
         AND public.has_any_role(p.id, ARRAY['admin','manager']::text[])
    LOOP
      INSERT INTO public.notification_events
        (event_type, user_id, channel, payload, status)
      VALUES (
        'purchase_request_unassigned', _mgr.id, 'in_app',
        jsonb_build_object(
          'title','درخواست خرید بدون مسئول',
          'body','مسئول یک درخواست خرید برداشته شد.',
          'reference_type','purchase_request',
          'reference_id', p_request_id,
          'note', p_note
        ),
        'pending'
      );
    END LOOP;
  END IF;

  -- ---- audit ----------------------------------------------------------------
  INSERT INTO public.audit_logs (entity_type, entity_id, action, actor_id, diff)
  VALUES (
    'purchase_request', p_request_id::text,
    CASE WHEN p_assignee_id IS NULL THEN 'purchase_request_unassigned'
         ELSE 'purchase_request_assigned' END,
    _uid,
    jsonb_build_object('from', _prev, 'to', p_assignee_id, 'note', p_note)
  );

  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'previous_assignee', CASE WHEN _prev IS NULL THEN NULL
           ELSE jsonb_build_object('id', _prev, 'name', _prev_name) END,
    'new_assignee', CASE WHEN p_assignee_id IS NULL THEN NULL
           ELSE jsonb_build_object('id', p_assignee_id, 'name', _new_name) END,
    'is_unassigned', p_assignee_id IS NULL,
    'changed', true
  );
END;
$function$;


REVOKE ALL ON FUNCTION
  public.assign_purchase_request(uuid, uuid, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.assign_purchase_request(uuid, uuid, text, uuid, boolean)
  TO authenticated, service_role;
