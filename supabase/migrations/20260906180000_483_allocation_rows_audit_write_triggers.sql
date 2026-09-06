SET client_encoding='UTF8';

-- ============================================================================================
-- 483 · allocation_rows: audit the DIRECT write path (H-1)
--
-- WHY
-- Migration 481 granted `authenticated` direct INSERT/UPDATE/DELETE on public.allocation_rows,
-- and RLS lets admin/accountant write. Only DELETE carried an audit trigger
-- (trg_allocation_rows_audit_delete). INSERT and UPDATE were audited *inside the RPC bodies*
-- only, and nothing forces a caller through the RPCs -- a PostgREST PATCH with an accountant's
-- bearer token rewrote amount / status / priority / promised_at / beneficiary_account_no and
-- left NO trace. Measured before this migration, inside BEGIN..ROLLBACK as test.accountant:
--
--   step                            audit_n  rows_touched  new_audit_rows
--   0_baseline                        51952
--   1_direct_UPDATE                   51952             1               0   <-- 1000 -> 1000000
--   2_direct_INSERT                   51952             1               0
--   3_direct_DELETE_as_accountant     51952             0               0   (RLS: admin-only)
--   4_direct_DELETE_as_admin          51953             1               1   (control: harness works)
--
-- WHAT THIS DOES
-- Adds AFTER INSERT and AFTER UPDATE audit triggers shaped like the existing DELETE trigger,
-- and REMOVES the inline audit INSERT from the three RPCs. The trigger becomes the SINGLE
-- writer of allocation audit rows, so one write produces exactly ONE audit row no matter which
-- path it arrives by. This follows the project rule that business rules live in triggers, not
-- RPCs -- and it is the only arrangement that cannot be bypassed.
--
-- ACTION NAMING is preserved exactly, so existing consumers keep working:
--   INSERT                                        -> 'allocation_created'
--   UPDATE touching only (status,promised_at,promised_note) -> 'allocation_status_changed'
--   any other UPDATE                              -> 'allocation_updated'
--   DELETE (unchanged, migration 481)             -> 'allocation_deleted'
--
-- One deliberate difference: 'allocation_updated' now carries the FULL tracked column set in
-- before/after (13 keys) rather than the 6 that update_allocation_row used to record. That is
-- additive, and it is the point -- a direct PATCH can re-point payer_customer_id,
-- payer_person_id, beneficiary_person_id or created_by, which the old 6-key payload could not
-- have shown. updated_at / created_at / id are excluded from change detection on purpose:
-- updated_at is rewritten by trg_allocation_rows_updated_at on every UPDATE and would make
-- every row look changed.
--
-- Known, accepted edge: a no-op UPDATE (status set to the value it already holds) is now
-- logged as 'allocation_updated' rather than 'allocation_status_changed'. A row is still
-- written, so the audit COUNT is unchanged; only the label differs on a write that changed
-- nothing.
--
-- NOT fixed here, reported instead: `authenticated` also holds TRUNCATE on this table
-- (relacl = arwdDxt). TRUNCATE ignores RLS and fires no row trigger. 214 of 224 public tables
-- are the same -- pre-existing and systemic, out of scope for H-1.
--
-- Migration impact: no schema change, no data change. Functions only.
-- RLS/RBAC impact: none. No policy, grant or role is touched.
-- Audit impact: INSERT and UPDATE on allocation_rows become auditable on every path.
-- ============================================================================================

-- ── 1 · the INSERT auditor ───────────────────────────────────────────────────────────────────
-- Mirrors tg_allocation_rows_audit_delete's shape, and writes the same payload
-- create_allocation_row used to write inline (same 9 keys, same order).
-- NEW.payer_person_id is already populated here: trg_allocation_rows_derive_payer_person is
-- BEFORE INSERT, so by AFTER INSERT the derived value is visible.
CREATE OR REPLACE FUNCTION public.tg_allocation_rows_audit_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'allocation', NEW.id::text, 'allocation_created',
          jsonb_build_object(
            'allocation_date',         NEW.allocation_date,
            'payer_customer_id',       NEW.payer_customer_id,
            'payer_person_id',         NEW.payer_person_id,
            'payer_quote_id',          NEW.payer_quote_id,
            'beneficiary_person_id',   NEW.beneficiary_person_id,
            'beneficiary_purchase_id', NEW.beneficiary_purchase_id,
            'beneficiary_account_no',  NEW.beneficiary_account_no,
            'amount',                  NEW.amount,
            'priority',                NEW.priority));
  RETURN NULL;  -- AFTER trigger: return value is ignored
END
$function$;

-- ── 2 · the UPDATE auditor ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_allocation_rows_audit_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _status_changed boolean;
  _other_changed  boolean;
  _action         text;
  _before         jsonb;
  _after          jsonb;
BEGIN
  -- The three columns set_allocation_row_status owns.
  _status_changed := (OLD.status, OLD.promised_at, OLD.promised_note)
                     IS DISTINCT FROM
                     (NEW.status, NEW.promised_at, NEW.promised_note);

  -- Everything else worth auditing. updated_at/created_at/id are excluded deliberately:
  -- updated_at is rewritten on every UPDATE and would make every row look changed.
  _other_changed := (OLD.amount, OLD.allocation_date, OLD.priority,
                     OLD.beneficiary_account_no, OLD.payer_quote_id,
                     OLD.beneficiary_purchase_id, OLD.payer_customer_id,
                     OLD.payer_person_id, OLD.beneficiary_person_id, OLD.created_by)
                    IS DISTINCT FROM
                    (NEW.amount, NEW.allocation_date, NEW.priority,
                     NEW.beneficiary_account_no, NEW.payer_quote_id,
                     NEW.beneficiary_purchase_id, NEW.payer_customer_id,
                     NEW.payer_person_id, NEW.beneficiary_person_id, NEW.created_by);

  IF _status_changed AND NOT _other_changed THEN
    -- exactly the row set_allocation_row_status used to write inline
    _action := 'allocation_status_changed';
    _before := jsonb_build_object('status',        OLD.status,
                                  'promised_at',   OLD.promised_at,
                                  'promised_note', OLD.promised_note);
    _after  := jsonb_build_object('status',        NEW.status,
                                  'promised_at',   NEW.promised_at,
                                  'promised_note', NEW.promised_note);
  ELSE
    -- update_allocation_row's six keys, plus the identity and attribution columns that only a
    -- direct PATCH can move. A superset of what was recorded before.
    _action := 'allocation_updated';
    _before := jsonb_build_object(
      'amount',                  OLD.amount,
      'allocation_date',         OLD.allocation_date,
      'priority',                OLD.priority,
      'beneficiary_account_no',  OLD.beneficiary_account_no,
      'payer_quote_id',          OLD.payer_quote_id,
      'beneficiary_purchase_id', OLD.beneficiary_purchase_id,
      'payer_customer_id',       OLD.payer_customer_id,
      'payer_person_id',         OLD.payer_person_id,
      'beneficiary_person_id',   OLD.beneficiary_person_id,
      'created_by',              OLD.created_by,
      'status',                  OLD.status,
      'promised_at',             OLD.promised_at,
      'promised_note',           OLD.promised_note);
    _after  := jsonb_build_object(
      'amount',                  NEW.amount,
      'allocation_date',         NEW.allocation_date,
      'priority',                NEW.priority,
      'beneficiary_account_no',  NEW.beneficiary_account_no,
      'payer_quote_id',          NEW.payer_quote_id,
      'beneficiary_purchase_id', NEW.beneficiary_purchase_id,
      'payer_customer_id',       NEW.payer_customer_id,
      'payer_person_id',         NEW.payer_person_id,
      'beneficiary_person_id',   NEW.beneficiary_person_id,
      'created_by',              NEW.created_by,
      'status',                  NEW.status,
      'promised_at',             NEW.promised_at,
      'promised_note',           NEW.promised_note);
  END IF;

  INSERT INTO public.audit_logs (actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'allocation', NEW.id::text, _action,
          jsonb_build_object('before', _before, 'after', _after));

  RETURN NULL;
END
$function$;

-- Mirror the ACL the existing audit trigger function carries. No `anon`, deliberately.
REVOKE ALL ON FUNCTION public.tg_allocation_rows_audit_insert() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_allocation_rows_audit_update() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tg_allocation_rows_audit_insert()
  TO postgres, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tg_allocation_rows_audit_update()
  TO postgres, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_allocation_rows_audit_insert ON public.allocation_rows;
CREATE TRIGGER trg_allocation_rows_audit_insert
  AFTER INSERT ON public.allocation_rows
  FOR EACH ROW EXECUTE FUNCTION public.tg_allocation_rows_audit_insert();

DROP TRIGGER IF EXISTS trg_allocation_rows_audit_update ON public.allocation_rows;
CREATE TRIGGER trg_allocation_rows_audit_update
  AFTER UPDATE ON public.allocation_rows
  FOR EACH ROW EXECUTE FUNCTION public.tg_allocation_rows_audit_update();

-- ── 3 · the RPCs stop writing audit rows ─────────────────────────────────────────────────────
-- Each body below is the LIVE definition read with pg_get_functiondef immediately before this
-- migration was written (CLAUDE.md rule 4), with the inline `INSERT INTO public.audit_logs`
-- removed and NOTHING else changed. Signatures are byte-identical to the live ones, so these
-- are true replacements and not overloads -- no DROP FUNCTION is needed (rule 5).

CREATE OR REPLACE FUNCTION public.create_allocation_row(
  p_payer_customer_id uuid,
  p_beneficiary_person_id uuid,
  p_amount numeric,
  p_allocation_date date DEFAULT CURRENT_DATE,
  p_priority text DEFAULT 'normal'::text,
  p_beneficiary_account_no text DEFAULT NULL::text,
  p_payer_quote_id uuid DEFAULT NULL::uuid,
  p_beneficiary_purchase_id uuid DEFAULT NULL::uuid)
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

  -- The audit row is written by trg_allocation_rows_audit_insert (migration 483), which fires
  -- on THIS insert as well as on a direct PostgREST insert. Writing it here too would double.

  RETURN _id;
END
$function$;

CREATE OR REPLACE FUNCTION public.update_allocation_row(
  p_allocation_id uuid,
  p_amount numeric DEFAULT NULL::numeric,
  p_allocation_date date DEFAULT NULL::date,
  p_priority text DEFAULT NULL::text,
  p_beneficiary_account_no text DEFAULT NULL::text,
  p_payer_quote_id uuid DEFAULT NULL::uuid,
  p_beneficiary_purchase_id uuid DEFAULT NULL::uuid,
  p_clear text[] DEFAULT NULL::text[])
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

  -- The audit row is written by trg_allocation_rows_audit_update (migration 483). The
  -- before/after below is still built, because it is this function's RETURN contract.

  RETURN jsonb_build_object('id', p_allocation_id, 'before', _before, 'after', _after);
END
$function$;

CREATE OR REPLACE FUNCTION public.set_allocation_row_status(
  p_allocation_id uuid,
  p_status text,
  p_promised_at date DEFAULT NULL::date,
  p_promised_note text DEFAULT NULL::text)
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

  -- The audit row is written by trg_allocation_rows_audit_update (migration 483). The
  -- before/after below is still built, because it is this function's RETURN contract.

  RETURN jsonb_build_object('id', p_allocation_id, 'before', _before, 'after', _after);
END
$function$;

COMMENT ON FUNCTION public.tg_allocation_rows_audit_insert() IS
  'H-1 (wave 6): audits every INSERT on allocation_rows, including a direct PostgREST insert '
  'that bypasses create_allocation_row. Single writer of the allocation_created audit row.';

COMMENT ON FUNCTION public.tg_allocation_rows_audit_update() IS
  'H-1 (wave 6): audits every UPDATE on allocation_rows, including a direct PostgREST PATCH '
  'that bypasses the RPCs. Single writer of allocation_status_changed / allocation_updated.';
