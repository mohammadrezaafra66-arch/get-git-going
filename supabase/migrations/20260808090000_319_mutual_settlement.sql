SET client_encoding='UTF8';

-- 319 - Mutual settlement: position function, settlement document, posting RPC.
--
-- ============================================================================
-- WHY
-- ============================================================================
-- A person can be both a customer (they owe us) and a supplier (we owe them).
-- Until now the two balances lived in different halves of the ledger with no
-- way to net them off, so an accountant had to move real cash in both
-- directions to settle a debt that largely cancels itself.
--
-- Migration 312 added supplier_payable, and 313 started writing it. With both
-- sides now in journal_lines, the offset is computable and postable.
--
-- ============================================================================
-- WHAT "UNSETTLED" MEANS - and why there is no settled flag
-- ============================================================================
-- The position is the running balance of posted ledger lines, not a separate
-- bucket of "open items":
--
--   receivable = SUM(debit - credit) over customer_credit lines of this
--                person's customers     (debit = they owe us more)
--   payable    = SUM(credit - debit) over supplier_payable lines of this
--                person's suppliers     (credit = we owe them more)
--   net        = receivable - payable
--
-- A settlement posted by this migration writes lines that move both sums
-- toward zero, so the next call to person_settlement_position reflects it
-- automatically. That is why no is_settled column exists: adding one would
-- create a second source of truth that can disagree with the ledger, and the
-- ledger is the one the accountant is audited against.
--
-- Direction naming, from the company's point of view:
--   net > 0  -> 'customer_pays'  they owe us more than we owe them
--   net < 0  -> 'we_pay'         we owe them more than they owe us
--   net = 0  -> 'balanced'
--
-- ============================================================================
-- ASSUMPTION - two amounts, not one (read this before changing the UI)
-- ============================================================================
-- The mission describes a single editable amount defaulting to |net|. Taken
-- literally that is not enough to express the worked example it also gives
-- (receivable 10, payable 8, "both balances should end at zero"): |net| is 2,
-- but zeroing both sides requires cancelling 8 AND moving 2 in cash. One
-- number cannot say both.
--
-- So the RPC takes two explicit amounts:
--   _offset_amount  how much mutual debt to cancel      (default LEAST(R, P))
--   _cash_amount    how much real money moves on top    (default |net|)
--
-- Set _cash_amount = 0 for a pure offset with no cash. Set _offset_amount
-- below LEAST(R, P) for a partial settlement. The worked example becomes
-- offset 8 + cash 2, four lines, debit 10 = credit 10, both balances zero -
-- which is exactly what the mission asks for, just stated unambiguously.
--
-- ============================================================================
-- THE ENTRY
-- ============================================================================
-- Offset part (always, when _offset_amount > 0):
--     DEBIT  supplier_payable  offset   ref = suppliers.id   (we owe less)
--     CREDIT customer_credit   offset   ref = customers.id   (they owe less)
--
-- Cash part (only when _cash_amount > 0), whichever side is still open:
--   customer_pays:
--     DEBIT  bank              cash     ref = bank_accounts.id
--     CREDIT customer_credit   cash     ref = customers.id
--   we_pay:
--     DEBIT  supplier_payable  cash     ref = suppliers.id
--     CREDIT bank              cash     ref = bank_accounts.id
--
-- Balanced by construction in both shapes, and asserted before returning.
--
-- mutual_settlement is a source_type, NOT an account_kind - the distinction
-- migration 312 was careful to preserve. The document row in
-- mutual_settlements is what journal_entries.source_id points at, exactly as
-- payment_vouchers backs a payment_voucher entry. Without it there would be
-- no idempotency key and nothing for the UI to list.
-- ============================================================================

-- ------------------------------------------------------------ document ------
CREATE TABLE IF NOT EXISTS public.mutual_settlements (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id        uuid NOT NULL REFERENCES public.persons(id) ON DELETE RESTRICT,
  customer_id      uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  supplier_id      uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  entry_date       date NOT NULL DEFAULT CURRENT_DATE,
  offset_amount    numeric NOT NULL DEFAULT 0 CHECK (offset_amount >= 0),
  cash_amount      numeric NOT NULL DEFAULT 0 CHECK (cash_amount   >= 0),
  direction        text NOT NULL CHECK (direction IN ('customer_pays','we_pay','balanced')),
  bank_account_id  uuid REFERENCES public.bank_accounts(id) ON DELETE RESTRICT,
  note             text,
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- A settlement that moves nothing is not a document, it is a mistake.
  CONSTRAINT mutual_settlements_nonzero_chk
    CHECK (offset_amount > 0 OR cash_amount > 0),
  -- Cash cannot move without an account for it to move through.
  CONSTRAINT mutual_settlements_cash_needs_account_chk
    CHECK (cash_amount = 0 OR bank_account_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_mutual_settlements_person
  ON public.mutual_settlements(person_id, entry_date DESC);

COMMENT ON TABLE public.mutual_settlements IS
  'سند تسویهٔ متقابل: تهاتر بدهی/طلب یک شخص که هم مشتری است و هم تأمین‌کننده. '
  'هر ردیف پشتوانهٔ یک journal_entries با source_type=''mutual_settlement'' است. مهاجرت ۳۱۹.';

ALTER TABLE public.mutual_settlements ENABLE ROW LEVEL SECURITY;

-- Read for the finance roles, write only through the RPC below (which is
-- SECURITY DEFINER). No INSERT/UPDATE/DELETE policy exists on purpose: a
-- settlement must not be forgeable by a direct PostgREST call that skips the
-- balance and limit checks.
DROP POLICY IF EXISTS mutual_settlements_select_finance ON public.mutual_settlements;
CREATE POLICY mutual_settlements_select_finance
  ON public.mutual_settlements FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]));

REVOKE ALL ON public.mutual_settlements FROM anon;
GRANT SELECT ON public.mutual_settlements TO authenticated;

-- ------------------------------------------------------------ position ------
CREATE OR REPLACE FUNCTION public.person_settlement_position(_person_id uuid)
 RETURNS TABLE(
   person_id    uuid,
   display_name text,
   customer_id  uuid,
   supplier_id  uuid,
   receivable   numeric,
   payable      numeric,
   net          numeric,
   direction    text
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _r numeric;
  _p numeric;
  _c uuid;
  _s uuid;
  _n int;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]) THEN
    RAISE EXCEPTION 'دسترسی لازم برای دیدن وضعیت تسویه را ندارید.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = _person_id) THEN
    RAISE EXCEPTION 'شخص یافت نشد.' USING ERRCODE = '22023';
  END IF;

  -- A posting must never guess which customer or supplier row it means.
  SELECT count(*) INTO _n FROM public.customers WHERE customers.person_id = _person_id;
  IF _n > 1 THEN
    RAISE EXCEPTION 'این شخص % پروندهٔ مشتری دارد؛ تا وقتی یکی نشده‌اند تسویهٔ متقابل ممکن نیست.', _n
      USING ERRCODE = '22023';
  END IF;
  SELECT id INTO _c FROM public.customers WHERE customers.person_id = _person_id LIMIT 1;

  SELECT count(*) INTO _n FROM public.suppliers WHERE suppliers.person_id = _person_id;
  IF _n > 1 THEN
    RAISE EXCEPTION 'این شخص % پروندهٔ تأمین‌کننده دارد؛ تا وقتی یکی نشده‌اند تسویهٔ متقابل ممکن نیست.', _n
      USING ERRCODE = '22023';
  END IF;
  SELECT id INTO _s FROM public.suppliers WHERE suppliers.person_id = _person_id LIMIT 1;

  SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO _r
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
   WHERE je.status = 'posted'
     AND jl.account_kind = 'customer_credit'
     AND jl.account_ref_id = _c;

  SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO _p
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
   WHERE je.status = 'posted'
     AND jl.account_kind = 'supplier_payable'
     AND jl.account_ref_id = _s;

  RETURN QUERY
  SELECT _person_id,
         (SELECT pp.display_name FROM public.persons pp WHERE pp.id = _person_id),
         _c,
         _s,
         _r,
         _p,
         _r - _p,
         CASE WHEN _r - _p > 0 THEN 'customer_pays'
              WHEN _r - _p < 0 THEN 'we_pay'
              ELSE 'balanced' END;
END;
$function$;

COMMENT ON FUNCTION public.person_settlement_position(uuid) IS
  'وضعیت تسویهٔ متقابل یک شخص: طلب ما، بدهی ما، خالص و جهت. فقط admin/accountant. مهاجرت ۳۱۹.';

-- ------------------------------------------------------- candidate list -----
CREATE OR REPLACE FUNCTION public.list_mutual_settlement_candidates()
 RETURNS TABLE(
   person_id    uuid,
   display_name text,
   receivable   numeric,
   payable      numeric,
   net          numeric,
   direction    text
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]) THEN
    RAISE EXCEPTION 'دسترسی لازم برای دیدن فهرست تسویهٔ متقابل را ندارید.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH dual AS (
    -- Exactly one customer file and exactly one supplier file. A person with
    -- duplicates is excluded rather than guessed at; person_settlement_position
    -- raises for the same reason, and the p1-dual-role agent owns the merge.
    SELECT p.id, p.display_name,
           (SELECT c.id FROM public.customers c WHERE c.person_id = p.id LIMIT 1) AS cid,
           (SELECT s.id FROM public.suppliers s WHERE s.person_id = p.id LIMIT 1) AS sid
      FROM public.persons p
     WHERE (SELECT count(*) FROM public.customers c WHERE c.person_id = p.id) = 1
       AND (SELECT count(*) FROM public.suppliers s WHERE s.person_id = p.id) = 1
  ),
  pos AS (
    SELECT d.id, d.display_name,
           COALESCE((SELECT SUM(jl.debit - jl.credit)
                       FROM public.journal_lines jl
                       JOIN public.journal_entries je ON je.id = jl.journal_entry_id
                      WHERE je.status = 'posted'
                        AND jl.account_kind = 'customer_credit'
                        AND jl.account_ref_id = d.cid), 0) AS r,
           COALESCE((SELECT SUM(jl.credit - jl.debit)
                       FROM public.journal_lines jl
                       JOIN public.journal_entries je ON je.id = jl.journal_entry_id
                      WHERE je.status = 'posted'
                        AND jl.account_kind = 'supplier_payable'
                        AND jl.account_ref_id = d.sid), 0) AS p
      FROM dual d
  )
  SELECT pos.id, pos.display_name, pos.r, pos.p, pos.r - pos.p,
         CASE WHEN pos.r - pos.p > 0 THEN 'customer_pays'
              WHEN pos.r - pos.p < 0 THEN 'we_pay'
              ELSE 'balanced' END
    FROM pos
   ORDER BY abs(pos.r - pos.p) DESC, pos.display_name;
END;
$function$;

COMMENT ON FUNCTION public.list_mutual_settlement_candidates() IS
  'اشخاص دو‌نقشی (دقیقاً یک پروندهٔ مشتری و یک پروندهٔ تأمین‌کننده) به‌همراه وضعیت تسویه. مهاجرت ۳۱۹.';

-- ------------------------------------------------------------- posting ------
CREATE OR REPLACE FUNCTION public.post_mutual_settlement(
  _person_id       uuid,
  _offset_amount   numeric,
  _cash_amount     numeric DEFAULT 0,
  _bank_account_id uuid    DEFAULT NULL,
  _note            text    DEFAULT NULL,
  _entry_date      date    DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _pos        record;
  _settle_id  uuid;
  _journal_id uuid;
  _date       date;
  _dir        text;
  _resid_r    numeric;
  _resid_p    numeric;
  _line       int := 0;
  _d          numeric;
  _c          numeric;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]) THEN
    RAISE EXCEPTION 'دسترسی لازم برای ثبت تسویهٔ متقابل را ندارید.' USING ERRCODE = '42501';
  END IF;

  _offset_amount := COALESCE(_offset_amount, 0);
  _cash_amount   := COALESCE(_cash_amount, 0);
  _date          := COALESCE(_entry_date, CURRENT_DATE);

  IF _offset_amount < 0 OR _cash_amount < 0 THEN
    RAISE EXCEPTION 'مبلغ تسویه نمی‌تواند منفی باشد.' USING ERRCODE = '22023';
  END IF;
  IF _offset_amount = 0 AND _cash_amount = 0 THEN
    RAISE EXCEPTION 'حداقل یکی از «مبلغ تهاتر» یا «مبلغ نقدی» باید بزرگ‌تر از صفر باشد.' USING ERRCODE = '22023';
  END IF;

  -- person_settlement_position also enforces the one-customer/one-supplier
  -- rule and the role check, so the two paths cannot drift apart.
  SELECT * INTO _pos FROM public.person_settlement_position(_person_id);

  IF _pos.customer_id IS NULL OR _pos.supplier_id IS NULL THEN
    RAISE EXCEPTION 'تسویهٔ متقابل فقط برای شخصی ممکن است که هم پروندهٔ مشتری دارد و هم تأمین‌کننده.'
      USING ERRCODE = '22023';
  END IF;

  IF _offset_amount > LEAST(GREATEST(_pos.receivable, 0), GREATEST(_pos.payable, 0)) THEN
    RAISE EXCEPTION
      'مبلغ تهاتر (%) از کمترینِ طلب (%) و بدهی (%) بیشتر است؛ نمی‌توان بیش از آنچه هست تهاتر کرد.',
      _offset_amount, _pos.receivable, _pos.payable
      USING ERRCODE = '22023';
  END IF;

  _resid_r := GREATEST(_pos.receivable, 0) - _offset_amount;
  _resid_p := GREATEST(_pos.payable,    0) - _offset_amount;

  IF _cash_amount > 0 THEN
    IF _bank_account_id IS NULL THEN
      RAISE EXCEPTION 'برای جابه‌جایی وجه نقد باید حساب بانکی انتخاب شود.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.bank_accounts WHERE id = _bank_account_id) THEN
      RAISE EXCEPTION 'حساب بانکی یافت نشد.' USING ERRCODE = '22023';
    END IF;

    IF _resid_r > 0 AND _resid_p > 0 THEN
      -- Both sides still open means the offset was left short on purpose;
      -- taking cash before finishing the offset would be moving money that
      -- the two balances could have cancelled for free.
      RAISE EXCEPTION
        'هر دو طرف هنوز باز است (طلب % و بدهی %)؛ اول تهاتر را کامل کنید، بعد تفاوت را نقدی تسویه کنید.',
        _resid_r, _resid_p USING ERRCODE = '22023';
    END IF;

    IF _resid_r > 0 THEN
      _dir := 'customer_pays';
      IF _cash_amount > _resid_r THEN
        RAISE EXCEPTION 'مبلغ نقدی (%) از باقیماندهٔ طلب ما (%) بیشتر است.', _cash_amount, _resid_r
          USING ERRCODE = '22023';
      END IF;
    ELSIF _resid_p > 0 THEN
      _dir := 'we_pay';
      IF _cash_amount > _resid_p THEN
        RAISE EXCEPTION 'مبلغ نقدی (%) از باقیماندهٔ بدهی ما (%) بیشتر است.', _cash_amount, _resid_p
          USING ERRCODE = '22023';
      END IF;
    ELSE
      RAISE EXCEPTION 'بعد از تهاتر چیزی برای تسویهٔ نقدی باقی نمانده است.' USING ERRCODE = '22023';
    END IF;
  ELSE
    _dir := 'balanced';
  END IF;

  INSERT INTO public.mutual_settlements(
    person_id, customer_id, supplier_id, entry_date,
    offset_amount, cash_amount, direction, bank_account_id, note, created_by)
  VALUES (
    _person_id, _pos.customer_id, _pos.supplier_id, _date,
    _offset_amount, _cash_amount, _dir,
    CASE WHEN _cash_amount > 0 THEN _bank_account_id ELSE NULL END,
    NULLIF(btrim(COALESCE(_note, '')), ''), auth.uid())
  RETURNING id INTO _settle_id;

  INSERT INTO public.journal_entries(
    source_type, source_id, entry_date, description, status, posted_by)
  VALUES (
    'mutual_settlement', _settle_id, _date,
    'سند تسویهٔ متقابل با «' || COALESCE(_pos.display_name, '؟') || '»',
    'posted', auth.uid())
  RETURNING id INTO _journal_id;

  IF _offset_amount > 0 THEN
    _line := _line + 1;
    INSERT INTO public.journal_lines(
      journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
    VALUES (_journal_id, _line, 'supplier_payable', _pos.supplier_id, _offset_amount, 0,
            'تهاتر — کاهش بدهی ما به این شخص');
    _line := _line + 1;
    INSERT INTO public.journal_lines(
      journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
    VALUES (_journal_id, _line, 'customer_credit', _pos.customer_id, 0, _offset_amount,
            'تهاتر — کاهش طلب ما از این شخص');
  END IF;

  IF _cash_amount > 0 AND _dir = 'customer_pays' THEN
    _line := _line + 1;
    INSERT INTO public.journal_lines(
      journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
    VALUES (_journal_id, _line, 'bank', _bank_account_id, _cash_amount, 0,
            'دریافت تفاوت تسویه از این شخص');
    _line := _line + 1;
    INSERT INTO public.journal_lines(
      journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
    VALUES (_journal_id, _line, 'customer_credit', _pos.customer_id, 0, _cash_amount,
            'کاهش طلب ما بابت تفاوت نقدی');
  ELSIF _cash_amount > 0 AND _dir = 'we_pay' THEN
    _line := _line + 1;
    INSERT INTO public.journal_lines(
      journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
    VALUES (_journal_id, _line, 'supplier_payable', _pos.supplier_id, _cash_amount, 0,
            'کاهش بدهی ما بابت تفاوت نقدی');
    _line := _line + 1;
    INSERT INTO public.journal_lines(
      journal_entry_id, line_no, account_kind, account_ref_id, debit, credit, description)
    VALUES (_journal_id, _line, 'bank', _bank_account_id, 0, _cash_amount,
            'پرداخت تفاوت تسویه به این شخص');
  END IF;

  SELECT SUM(debit), SUM(credit) INTO _d, _c
    FROM public.journal_lines WHERE journal_entry_id = _journal_id;
  IF _d IS DISTINCT FROM _c THEN
    RAISE EXCEPTION 'سند تسویهٔ متقابل تراز نشد (بدهکار % / بستانکار %)؛ ثبت لغو شد.', _d, _c
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.audit_logs(actor_id, entity_type, entity_id, action, diff)
  VALUES (auth.uid(), 'mutual_settlements', _settle_id::text, 'mutual_settlement_posted',
    jsonb_build_object(
      'person_id',        _person_id,
      'customer_id',      _pos.customer_id,
      'supplier_id',      _pos.supplier_id,
      'receivable_before', _pos.receivable,
      'payable_before',    _pos.payable,
      'offset_amount',    _offset_amount,
      'cash_amount',      _cash_amount,
      'direction',        _dir,
      'bank_account_id',  CASE WHEN _cash_amount > 0 THEN _bank_account_id ELSE NULL END,
      'journal_entry_id', _journal_id));

  RETURN _settle_id;
END;
$function$;

COMMENT ON FUNCTION public.post_mutual_settlement(uuid,numeric,numeric,uuid,text,date) IS
  'ثبت تسویهٔ متقابل: سند mutual_settlements + سند دفتر متوازن. '
  'تهاتر = بدهکار supplier_payable / بستانکار customer_credit؛ تفاوت نقدی با خط bank. مهاجرت ۳۱۹.';

REVOKE ALL ON FUNCTION public.post_mutual_settlement(uuid,numeric,numeric,uuid,text,date) FROM anon;
REVOKE ALL ON FUNCTION public.person_settlement_position(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.list_mutual_settlement_candidates() FROM anon;

DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'mutual_settlements' AND relrowsecurity) THEN
    RAISE EXCEPTION 'Post-condition failed: RLS is not enabled on mutual_settlements.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
              AND tablename='mutual_settlements' AND cmd <> 'SELECT') THEN
    RAISE EXCEPTION 'Post-condition failed: mutual_settlements must be writable only through the RPC.';
  END IF;
  RAISE NOTICE '319 OK: mutual settlement position, candidate list and posting RPC are in place.';
END
$verify$;
