SET client_encoding='UTF8';

-- ============================================================================
-- 482 - the allocation workbench RPCs: three writers that audit, and one reader.
-- ============================================================================
--
-- Depends on migration 481 (public.allocation_rows).
--
-- THE WRITE PATTERN IS hold_credit's, DELIBERATELY
-- -----------------------------------------------
-- Read from pg_get_functiondef('public.hold_credit'::regproc): authorization FIRST, before
-- any read and long before any write; the caller-supplied actor is evidence, never
-- identity; then the row change and the audit_logs row in the SAME transaction, so an
-- audit trail cannot drift from the thing it describes. Every writer below has that
-- shape.
--
--   entity_type = 'allocation' for all of them. NO MIGRATION IS NEEDED FOR THAT, and it
--   was checked rather than assumed: audit_logs has ZERO check constraints
--   (SELECT count(*) FROM pg_constraint WHERE conrelid='public.audit_logs'::regclass
--    AND contype='c'  ->  0), is_valid_audit_entity_type has zero function callers and
--   appears in zero policies, and audit_logs.entity_type already holds 80 distinct
--   values written by callers that never registered anything.
--
-- WHY FOUR FUNCTIONS AND NOT ONE
-- ------------------------------
-- The audit diff is the reason. "The amount changed" and "the debtor promised Saturday"
-- are different events to an accountant reading the trail later, and a single upsert
-- would flatten them into one shapeless diff. So: create, edit the plan, record the
-- follow-up. Deleting is the fourth path and it has no RPC -- admin deletes the row
-- directly under the RLS policy from 481 -- so an AFTER DELETE trigger writes that audit
-- row instead. That is the one place a trigger is used, and it is used because it is the
-- only path an RPC does not cover.
--
-- THE PARTIES ARE NOT EDITABLE. update_allocation_row changes the amount, the date, the
-- priority and the references; it cannot change who pays or who is paid. Swapping a party
-- turns the row into a different commitment while keeping its history, which is exactly
-- the thing an audit trail exists to prevent. Create a new row.
--
-- GRANTS: CREATE OR REPLACE FUNCTION SILENTLY RESTORES DEFAULT GRANTS.
-- Every function below is followed by REVOKE ALL FROM PUBLIC, REVOKE ALL FROM anon, and
-- GRANT EXECUTE TO authenticated. Migrations 476 and 477 exist because that was skipped
-- for years; this file does not add to that list. The role guard inside each body is the
-- real control -- the grants are the outer fence.
--
-- has_any_role IS CALLED WITH ::text[], NOT ::app_role[].
-- Both overloads exist and an unqualified array literal is ambiguous between them.
-- user_roles.role is TEXT, and the app_role[] overload is a one-line wrapper that casts
-- straight back to text[] (read live). person_merge and hold_credit both use ::text[];
-- compute_daily_capital uses ::app_role[]. text[] is the safer of the two identical
-- paths: it cannot raise 22P02 on a role string that is not an enum label.
--
-- THE UNFUNDED RULE (A-4), STATED ONCE AND IMPLEMENTED ONCE, IN list_allocation_rows:
--
--     is_unfunded  :=  status = 'nemikhad'
--                  OR  (promised_at IS NOT NULL
--                       AND promised_at < CURRENT_DATE
--                       AND status IS DISTINCT FROM 'variz shod')
--
-- (the two Persian literals are in the body; this comment stays ASCII on purpose.)
-- It is a FLAG AND NOTHING ELSE -- owner decision D-21. No reallocation, no substitute
-- source, no suggestion, no learning. This table IS the record a future learner would
-- need; it does not get to guess before that record exists.
--
-- It is not a generated column because it depends on CURRENT_DATE, which is not
-- immutable. It is computed on read, so "the promise came due overnight" needs no job.
--
-- Rollback: docs/verification/482-down.sql
-- ============================================================================

SET lock_timeout = '60s';


-- ----------------------------------------------------------------------------
-- 1. create_allocation_row -- plan one transfer.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_allocation_row(
  p_payer_customer_id       uuid,
  p_beneficiary_person_id   uuid,
  p_amount                  numeric,
  p_allocation_date         date DEFAULT CURRENT_DATE,
  p_priority                text DEFAULT 'normal',
  p_beneficiary_account_no  text DEFAULT NULL,
  p_payer_quote_id          uuid DEFAULT NULL,
  p_beneficiary_purchase_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor    uuid := auth.uid();
  _payer    uuid;
  _id       uuid;
  _acct     text := NULLIF(btrim(COALESCE(p_beneficiary_account_no, '')), '');
BEGIN
  IF NOT public.has_any_role(_actor, ARRAY['admin', 'accountant']::text[]) THEN
    RAISE EXCEPTION 'ثبت ردیف تخصیص فقط برای مدیر سیستم یا حسابدار مجاز است.'
      USING ERRCODE = '42501';
  END IF;

  IF p_payer_customer_id IS NULL OR p_beneficiary_person_id IS NULL THEN
    RAISE EXCEPTION 'بدهکار و بستانکار هر دو الزامی هستند.' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount <> trunc(p_amount) THEN
    RAISE EXCEPTION 'مبلغ تخصیص باید یک عدد صحیح بزرگ‌تر از صفر باشد.' USING ERRCODE = '22023';
  END IF;

  IF p_priority IS NULL OR NOT (p_priority = ANY (ARRAY['low', 'normal', 'high', 'urgent'])) THEN
    RAISE EXCEPTION 'اولویت نامعتبر است.' USING ERRCODE = '22023';
  END IF;

  SELECT c.person_id INTO _payer FROM public.customers c WHERE c.id = p_payer_customer_id;
  IF _payer IS NULL THEN
    RAISE EXCEPTION 'مشتری بدهکار پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = p_beneficiary_person_id AND is_active) THEN
    RAISE EXCEPTION 'شخص بستانکار پیدا نشد یا غیرفعال است.' USING ERRCODE = 'P0002';
  END IF;

  IF _payer = p_beneficiary_person_id THEN
    RAISE EXCEPTION 'بدهکار و بستانکار نمی‌توانند یک شخص باشند.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.allocation_rows (
    allocation_date, payer_customer_id, payer_quote_id,
    beneficiary_person_id, beneficiary_purchase_id, beneficiary_account_no,
    amount, priority, created_by)
  VALUES (
    COALESCE(p_allocation_date, CURRENT_DATE), p_payer_customer_id, p_payer_quote_id,
    p_beneficiary_person_id, p_beneficiary_purchase_id, _acct,
    p_amount, p_priority, _actor)
  RETURNING id INTO _id;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_actor, 'allocation', _id::text, 'allocation_created',
          jsonb_build_object(
            'allocation_date',         COALESCE(p_allocation_date, CURRENT_DATE),
            'payer_customer_id',       p_payer_customer_id,
            'payer_person_id',         _payer,
            'payer_quote_id',          p_payer_quote_id,
            'beneficiary_person_id',   p_beneficiary_person_id,
            'beneficiary_purchase_id', p_beneficiary_purchase_id,
            'beneficiary_account_no',  _acct,
            'amount',                  p_amount,
            'priority',                p_priority));

  RETURN _id;
END
$function$;

COMMENT ON FUNCTION public.create_allocation_row(uuid, uuid, numeric, date, text, text, uuid, uuid) IS
  'Plans one transfer from a debtor customer to a creditor person and writes the audit row in the '
  'same transaction. admin or accountant only. Migration 482.';

REVOKE ALL ON FUNCTION public.create_allocation_row(uuid, uuid, numeric, date, text, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_allocation_row(uuid, uuid, numeric, date, text, text, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_allocation_row(uuid, uuid, numeric, date, text, text, uuid, uuid) TO authenticated;


-- ----------------------------------------------------------------------------
-- 2. update_allocation_row -- edit the plan, never the parties.
--    NULL means "leave this field alone". Clearing an optional field is therefore a
--    separate, explicit act: name it in p_clear. Without that split, NULL would mean
--    both "unchanged" and "erase", and the caller could never say which it meant.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_allocation_row(
  p_allocation_id           uuid,
  p_amount                  numeric DEFAULT NULL,
  p_allocation_date         date    DEFAULT NULL,
  p_priority                text    DEFAULT NULL,
  p_beneficiary_account_no  text    DEFAULT NULL,
  p_payer_quote_id          uuid    DEFAULT NULL,
  p_beneficiary_purchase_id uuid    DEFAULT NULL,
  p_clear                   text[]  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor   uuid := auth.uid();
  _row     public.allocation_rows%ROWTYPE;
  _before  jsonb;
  _after   jsonb;
  _bad     text;
BEGIN
  IF NOT public.has_any_role(_actor, ARRAY['admin', 'accountant']::text[]) THEN
    RAISE EXCEPTION 'ویرایش ردیف تخصیص فقط برای مدیر سیستم یا حسابدار مجاز است.'
      USING ERRCODE = '42501';
  END IF;

  IF p_priority IS NOT NULL
     AND NOT (p_priority = ANY (ARRAY['low', 'normal', 'high', 'urgent'])) THEN
    RAISE EXCEPTION 'اولویت نامعتبر است.' USING ERRCODE = '22023';
  END IF;

  IF p_amount IS NOT NULL AND (p_amount <= 0 OR p_amount <> trunc(p_amount)) THEN
    RAISE EXCEPTION 'مبلغ تخصیص باید یک عدد صحیح بزرگ‌تر از صفر باشد.' USING ERRCODE = '22023';
  END IF;

  SELECT t.c INTO _bad
    FROM unnest(COALESCE(p_clear, ARRAY[]::text[])) AS t(c)
   WHERE t.c <> ALL (ARRAY['beneficiary_account_no', 'payer_quote_id', 'beneficiary_purchase_id'])
   LIMIT 1;
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'ستون «%» قابل خالی کردن نیست.', _bad USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _row FROM public.allocation_rows WHERE id = p_allocation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ردیف تخصیص پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  _before := jsonb_build_object(
    'amount',                  _row.amount,
    'allocation_date',         _row.allocation_date,
    'priority',                _row.priority,
    'beneficiary_account_no',  _row.beneficiary_account_no,
    'payer_quote_id',          _row.payer_quote_id,
    'beneficiary_purchase_id', _row.beneficiary_purchase_id);

  UPDATE public.allocation_rows a
     SET amount           = COALESCE(p_amount, a.amount),
         allocation_date  = COALESCE(p_allocation_date, a.allocation_date),
         priority         = COALESCE(p_priority, a.priority),
         beneficiary_account_no =
           CASE WHEN 'beneficiary_account_no' = ANY (COALESCE(p_clear, ARRAY[]::text[]))
                THEN NULL
                ELSE COALESCE(NULLIF(btrim(COALESCE(p_beneficiary_account_no, '')), ''),
                              a.beneficiary_account_no) END,
         payer_quote_id =
           CASE WHEN 'payer_quote_id' = ANY (COALESCE(p_clear, ARRAY[]::text[]))
                THEN NULL ELSE COALESCE(p_payer_quote_id, a.payer_quote_id) END,
         beneficiary_purchase_id =
           CASE WHEN 'beneficiary_purchase_id' = ANY (COALESCE(p_clear, ARRAY[]::text[]))
                THEN NULL ELSE COALESCE(p_beneficiary_purchase_id, a.beneficiary_purchase_id) END
   WHERE a.id = p_allocation_id
  RETURNING a.* INTO _row;

  _after := jsonb_build_object(
    'amount',                  _row.amount,
    'allocation_date',         _row.allocation_date,
    'priority',                _row.priority,
    'beneficiary_account_no',  _row.beneficiary_account_no,
    'payer_quote_id',          _row.payer_quote_id,
    'beneficiary_purchase_id', _row.beneficiary_purchase_id);

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_actor, 'allocation', p_allocation_id::text, 'allocation_updated',
          jsonb_build_object('before', _before, 'after', _after));

  RETURN jsonb_build_object('id', p_allocation_id, 'before', _before, 'after', _after);
END
$function$;

COMMENT ON FUNCTION public.update_allocation_row(uuid, numeric, date, text, text, uuid, uuid, text[]) IS
  'Edits an allocation row''s plan -- amount, date, priority, account number, references. NULL '
  'leaves a field unchanged; name a field in p_clear to set it NULL. The two parties are '
  'deliberately not editable. Writes the before/after audit row in the same transaction. '
  'admin or accountant only. Migration 482.';

REVOKE ALL ON FUNCTION public.update_allocation_row(uuid, numeric, date, text, text, uuid, uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_allocation_row(uuid, numeric, date, text, text, uuid, uuid, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_allocation_row(uuid, numeric, date, text, text, uuid, uuid, text[]) TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. set_allocation_row_status -- record the follow-up. Status AND date together.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_allocation_row_status(
  p_allocation_id uuid,
  p_status        text,
  p_promised_at   date DEFAULT NULL,
  p_promised_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor  uuid := auth.uid();
  _row    public.allocation_rows%ROWTYPE;
  _before jsonb;
  _after  jsonb;
  _note   text := NULLIF(btrim(COALESCE(p_promised_note, '')), '');
BEGIN
  IF NOT public.has_any_role(_actor, ARRAY['admin', 'accountant']::text[]) THEN
    RAISE EXCEPTION 'ثبت وضعیت پیگیری فقط برای مدیر سیستم یا حسابدار مجاز است.'
      USING ERRCODE = '42501';
  END IF;

  -- The closed list of five (owner decision D-20). Checked here as well as by the table
  -- constraint so the caller gets a sentence instead of a constraint name.
  IF p_status IS NULL OR NOT (p_status = ANY (ARRAY[
       'واریز شد',
       'خبر می‌ده',
       'جواب نمی‌ده',
       'شنبه واریز می‌کنه',
       'نمی‌خواد'])) THEN
    RAISE EXCEPTION 'وضعیت پیگیری نامعتبر است؛ فقط پنج وضعیت تعریف‌شده مجاز است.'
      USING ERRCODE = '22023';
  END IF;

  IF p_status = 'شنبه واریز می‌کنه' AND p_promised_at IS NULL THEN
    RAISE EXCEPTION 'برای این وضعیت، تاریخ قول هم باید ثبت شود.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _row FROM public.allocation_rows WHERE id = p_allocation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ردیف تخصیص پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  _before := jsonb_build_object(
    'status', _row.status, 'promised_at', _row.promised_at, 'promised_note', _row.promised_note);

  -- promised_at is NOT cleared when the money finally arrives. Keeping it is the whole
  -- point of the separate column: later the system must be able to say that this person
  -- promised a date, and whether they kept it.
  UPDATE public.allocation_rows a
     SET status        = p_status,
         promised_at   = COALESCE(p_promised_at, a.promised_at),
         promised_note = COALESCE(_note, a.promised_note)
   WHERE a.id = p_allocation_id
  RETURNING a.* INTO _row;

  _after := jsonb_build_object(
    'status', _row.status, 'promised_at', _row.promised_at, 'promised_note', _row.promised_note);

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (_actor, 'allocation', p_allocation_id::text, 'allocation_status_changed',
          jsonb_build_object('before', _before, 'after', _after));

  RETURN jsonb_build_object('id', p_allocation_id, 'before', _before, 'after', _after);
END
$function$;

COMMENT ON FUNCTION public.set_allocation_row_status(uuid, text, date, text) IS
  'Records one of the owner''s five follow-up states on an allocation row, with the promise date '
  'as its own column, and writes the before/after audit row in the same transaction. The Saturday '
  'state requires a date. admin or accountant only. Migration 482.';

REVOKE ALL ON FUNCTION public.set_allocation_row_status(uuid, text, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_allocation_row_status(uuid, text, date, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_allocation_row_status(uuid, text, date, text) TO authenticated;


-- ----------------------------------------------------------------------------
-- 4. The delete audit trigger -- the one change path with no RPC.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_allocation_rows_audit_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'allocation', OLD.id::text, 'allocation_deleted',
          jsonb_build_object(
            'allocation_date',        OLD.allocation_date,
            'payer_customer_id',      OLD.payer_customer_id,
            'payer_person_id',        OLD.payer_person_id,
            'beneficiary_person_id',  OLD.beneficiary_person_id,
            'beneficiary_account_no', OLD.beneficiary_account_no,
            'amount',                 OLD.amount,
            'priority',               OLD.priority,
            'status',                 OLD.status,
            'promised_at',            OLD.promised_at));
  RETURN OLD;
END
$function$;

COMMENT ON FUNCTION public.tg_allocation_rows_audit_delete() IS
  'Writes the audit row for a deleted allocation row. A trigger rather than an RPC because '
  'deletion is the one change path that goes straight to the table under the RLS policy from '
  'migration 481. Migration 482.';

DROP TRIGGER IF EXISTS trg_allocation_rows_audit_delete ON public.allocation_rows;
CREATE TRIGGER trg_allocation_rows_audit_delete
  AFTER DELETE ON public.allocation_rows
  FOR EACH ROW EXECUTE FUNCTION public.tg_allocation_rows_audit_delete();


-- ----------------------------------------------------------------------------
-- 5. list_allocation_rows -- what the page reads. THE SIGNATURE IS A CONTRACT.
--    Role gate matches compute_daily_capital: admin, manager, accountant.
--    Persons' display column is display_name -- persons has no full_name.
--    Paging exists because CLAUDE.md rule 11 asks for it, not because the data needs it:
--    the real scale is about 50 debtors against 20 creditors, so the default limit of
--    500 will not page in practice. total_count is returned so the caller can tell.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_allocation_rows(
  p_allocation_date date DEFAULT CURRENT_DATE,
  p_limit           integer DEFAULT 500,
  p_offset          integer DEFAULT 0
)
RETURNS TABLE (
  id                      uuid,
  allocation_date         date,
  payer_customer_id       uuid,
  payer_person_id         uuid,
  payer_name              text,
  payer_quote_id          uuid,
  beneficiary_person_id   uuid,
  beneficiary_name        text,
  beneficiary_purchase_id uuid,
  beneficiary_account_no  text,
  amount                  numeric,
  priority                text,
  status                  text,
  promised_at             date,
  promised_note           text,
  is_unfunded             boolean,
  created_by              uuid,
  created_at              timestamptz,
  updated_at              timestamptz,
  total_count             bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _date  date := COALESCE(p_allocation_date, CURRENT_DATE);
  _lim   integer := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
  _off   integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF NOT public.has_any_role(auth.uid(),
        ARRAY['admin', 'manager', 'accountant']::text[]) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT a.id,
         a.allocation_date,
         a.payer_customer_id,
         a.payer_person_id,
         pp.display_name,
         a.payer_quote_id,
         a.beneficiary_person_id,
         bp.display_name,
         a.beneficiary_purchase_id,
         a.beneficiary_account_no,
         a.amount,
         a.priority,
         a.status,
         a.promised_at,
         a.promised_note,
         -- A-4, owner decision D-21: a FLAG. Nothing is reallocated, nothing is suggested.
         (COALESCE(a.status = 'نمی‌خواد', false)
          OR (a.promised_at IS NOT NULL
              AND a.promised_at < CURRENT_DATE
              AND a.status IS DISTINCT FROM 'واریز شد')),
         a.created_by,
         a.created_at,
         a.updated_at,
         count(*) OVER ()
    FROM public.allocation_rows a
    JOIN public.persons pp ON pp.id = a.payer_person_id
    JOIN public.persons bp ON bp.id = a.beneficiary_person_id
   WHERE a.allocation_date = _date
   ORDER BY CASE a.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1
                            WHEN 'normal' THEN 2 ELSE 3 END,
            a.amount DESC,
            a.created_at
   LIMIT _lim OFFSET _off;
END
$function$;

COMMENT ON FUNCTION public.list_allocation_rows(date, integer, integer) IS
  'Every allocation row planned for one date, with both parties'' display names and the unfunded '
  'flag. is_unfunded is true when the debtor refused, or when a promise date has passed and the '
  'money has not arrived -- a flag only, never a reallocation (owner decision D-21). '
  'admin, manager or accountant, matching compute_daily_capital. Migration 482.';

REVOKE ALL ON FUNCTION public.list_allocation_rows(date, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_allocation_rows(date, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_allocation_rows(date, integer, integer) TO authenticated;


-- ----------------------------------------------------------------------------
-- 6. Assertions.
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  _fn   text;
  _open text;
BEGIN
  SELECT string_agg(f, ', ') INTO _open
    FROM unnest(ARRAY[
      'public.create_allocation_row(uuid, uuid, numeric, date, text, text, uuid, uuid)',
      'public.update_allocation_row(uuid, numeric, date, text, text, uuid, uuid, text[])',
      'public.set_allocation_row_status(uuid, text, date, text)',
      'public.list_allocation_rows(date, integer, integer)']) f
   WHERE has_function_privilege('anon', f, 'EXECUTE');
  IF _open IS NOT NULL THEN
    RAISE EXCEPTION '482: anon can still execute %', _open;
  END IF;

  FOREACH _fn IN ARRAY ARRAY[
      'public.create_allocation_row(uuid, uuid, numeric, date, text, text, uuid, uuid)',
      'public.update_allocation_row(uuid, numeric, date, text, text, uuid, uuid, text[])',
      'public.set_allocation_row_status(uuid, text, date, text)',
      'public.list_allocation_rows(date, integer, integer)'] LOOP
    IF NOT has_function_privilege('authenticated', _fn, 'EXECUTE') THEN
      RAISE EXCEPTION '482: authenticated cannot execute %', _fn;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.allocation_rows'::regclass
                    AND tgname = 'trg_allocation_rows_audit_delete') THEN
    RAISE EXCEPTION '482: the delete audit trigger was not installed';
  END IF;

  RAISE NOTICE '482 OK: four RPCs installed, anon holds no EXECUTE, authenticated does';
END
$do$;
