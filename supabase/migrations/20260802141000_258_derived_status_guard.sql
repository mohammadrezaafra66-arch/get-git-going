SET client_encoding='UTF8';

-- =============================================================================
-- Issue 219 / C5.1 — `purchased` and `partially_purchased` become derived states
-- =============================================================================
-- This is the hole C3 opened and C3's own report flagged: the frontend stopped
-- offering the manual "final price" dialog, but `update_purchase_status` never
-- stopped accepting `purchased`. Any admin, manager or assignee could still set
-- a request to `purchased` with a hand-typed price and no purchase document
-- behind it — over the API, or by updating the row directly, since
-- `authenticated` holds UPDATE on purchase_requests and the RLS policy
-- "update by assignee or manager" permits it.
--
-- Two doors, so two locks:
--
--   1. update_purchase_status refuses those two targets outright.
--   2. A BEFORE UPDATE trigger refuses them however they are attempted —
--      through the RPC, through PostgREST, through psql.
--
-- The trigger does NOT work by trusting a session flag that create_purchase
-- sets, because anything the client can be told to set, a client can set. It
-- checks the data instead: a request may only enter `purchased` or
-- `partially_purchased` if its fulfillment rows actually support that status.
-- create_purchase inserts the fulfillment before it updates the status
-- (migration 252, lines 414 and 439), so the legitimate path satisfies the
-- check and a manual one cannot.
--
-- Legacy rows are untouched: the trigger only fires when status CHANGES, so the
-- one `legacy_no_fulfillment` request keeps whatever status it already has. It
-- simply cannot be moved into a derived status by hand — which is the point.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The lock that cannot be routed around
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_purchase_request_status_derived()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  _alloc numeric;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('purchased', 'partially_purchased') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(f.allocated_quantity), 0) INTO _alloc
    FROM public.purchase_request_fulfillments f
   WHERE f.purchase_request_id = NEW.id;

  IF _alloc <= 0 THEN
    RAISE EXCEPTION 'وضعیت خرید فقط پس از ثبت سند خرید واقعی تغییر می‌کند.'
      USING ERRCODE = '42501', HINT = 'PURCHASE_STATUS_DERIVED';
  END IF;

  -- The status must match what the documents say, not merely be accompanied by
  -- some document. Otherwise a single unit supplied against a request for ten
  -- could be recorded as fully purchased.
  IF NEW.status = 'purchased' AND _alloc < NEW.quantity THEN
    RAISE EXCEPTION 'مقدار تأمین‌شده هنوز کامل نیست؛ وضعیت «خرید انجام شد» ثبت نمی‌شود.'
      USING ERRCODE = '42501', HINT = 'PURCHASE_STATUS_DERIVED';
  END IF;

  IF NEW.status = 'partially_purchased' AND _alloc >= NEW.quantity THEN
    RAISE EXCEPTION 'مقدار تأمین‌شده کامل است؛ وضعیت «تأمین جزئی» ثبت نمی‌شود.'
      USING ERRCODE = '42501', HINT = 'PURCHASE_STATUS_DERIVED';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_purchase_request_status_derived() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.tg_purchase_request_status_derived() IS
  'Issue 219 C5: a purchase request may only enter purchased / '
  'partially_purchased when its fulfillment rows support it. Blocks every '
  'manual route, including a direct UPDATE.';

DROP TRIGGER IF EXISTS trg_purchase_request_status_derived ON public.purchase_requests;
CREATE TRIGGER trg_purchase_request_status_derived
  BEFORE UPDATE OF status ON public.purchase_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_purchase_request_status_derived();

-- -----------------------------------------------------------------------------
-- 2. update_purchase_status — refuse the derived targets, and validate the
--    transition it was never validating at all
-- -----------------------------------------------------------------------------
-- Everything outside the two new guards is the live definition, carried over
-- unchanged: the same permission rule, the same history row, the same
-- notification, the same audit row.
--
-- One deliberate removal: `final_price = coalesce(p_final_price, final_price)`.
-- final_price is recomputed from the purchase documents by create_purchase
-- (migration 252). Letting a status call overwrite it would put a hand-typed
-- number back in charge of a figure that is supposed to be derived. The
-- parameter is kept so existing callers do not break on an unknown argument,
-- but supplying it is now an error rather than something silently ignored.
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

  -- C5: these two are derived from purchase documents and cannot be set by hand
  -- by anyone, including an admin. Rejected before anything else so the caller
  -- gets the real reason rather than a generic "invalid status".
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

  if not (
    public.has_role(v_caller, 'admin') or
    public.has_role(v_caller, 'manager') or
    v_assignee = v_caller
  ) then
    raise exception 'دسترسی ندارید.'
      using errcode = '42501', hint = 'PURCHASE_PERMISSION_DENIED';
  end if;

  -- C5: the function had no from->to rule at all, so any target was reachable
  -- from any state. This mirrors nextStatuses() in src/lib/purchase/labels.ts,
  -- which the UI has always enforced — the backend simply never did.
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

-- Re-created above, so the grants must be re-stated: a CREATE OR REPLACE keeps
-- the old ACL, but Supabase's default privileges have bitten this project twice
-- already (migrations 250 and 256), and being explicit costs nothing.
REVOKE ALL ON FUNCTION public.update_purchase_status(uuid, text, text, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_purchase_status(uuid, text, text, numeric)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.update_purchase_status(uuid, text, text, numeric) IS
  'Issue 219 C5: manual status transitions only. purchased and '
  'partially_purchased are derived from purchase documents and are refused '
  'here; final_price is derived and may not be supplied.';
