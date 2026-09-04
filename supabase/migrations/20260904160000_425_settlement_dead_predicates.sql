SET client_encoding='UTF8';

-- 425 — the mutual-settlement readers stop testing a condition that cannot occur.
--
-- D-4. Migration 319 wrote both of these functions to defend against a person
-- holding MORE THAN ONE customer file, or more than one supplier file:
--
--   list_mutual_settlement_candidates
--     WHERE (SELECT count(*) FROM customers c WHERE c.person_id = p.id) = 1
--       AND (SELECT count(*) FROM suppliers s WHERE s.person_id = p.id) = 1
--
--   person_settlement_position
--     IF _n > 1 THEN RAISE EXCEPTION 'این شخص % پروندهٔ مشتری دارد؛ …'
--     IF _n > 1 THEN RAISE EXCEPTION 'این شخص % پروندهٔ تأمین‌کننده دارد؛ …'
--
-- That defence is unreachable. Measured on the test database on 2026-09-04:
--
--   customers | uq_customers_person_id | UNIQUE (person_id)
--   suppliers | uq_suppliers_person_id | UNIQUE (person_id)
--
-- With those constraints in place `count(*) > 1` is impossible, so `= 1`
-- degenerates to "has one" and the two RAISEs can never fire. Nothing about the
-- SELECTED SET changes here — this migration is behaviour-preserving by
-- construction, and the accompanying spec asserts the two predicates pick the
-- same persons on live data.
--
-- Why remove it rather than leave it: the dead `= 1` is read as the exclusion
-- rule of the candidate list, and it is not. The rule that actually excludes
-- people is "must hold BOTH a customer file and a supplier file" — 15 of 91
-- persons qualify today, and 73 customer-only persons are filtered out by the
-- AND, not by any duplicate check. Two prior readers took the `= 1` for the
-- real constraint. The comment now says what the code does.
--
-- Signatures are unchanged, so there is no overload to drop (AGENTS rule 5) and
-- no caller to migrate. Both bodies below start from the LIVE
-- `pg_get_functiondef` output, diffed against migration 319 first: the only
-- differences were whitespace and the COMMENT statements, so the file and the
-- database agreed before this change.
--
-- RLS/RBAC: unchanged. Both functions keep SECURITY DEFINER, keep
-- `SET search_path TO 'public'`, and keep the admin/accountant gate as their
-- first statement.
-- Audit: none — both functions are read-only (STABLE) and write nothing.

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
    -- Holds a customer file AND a supplier file. There is no count here because
    -- uq_customers_person_id and uq_suppliers_person_id already make a second
    -- file of either kind impossible; the `= 1` this replaces could not fail.
    -- Mutual settlement needs both sides, so a customer-only or supplier-only
    -- person is genuinely not a candidate — that, and not any duplicate check,
    -- is what this WHERE excludes.
    SELECT p.id, p.display_name,
           (SELECT c.id FROM public.customers c WHERE c.person_id = p.id) AS cid,
           (SELECT s.id FROM public.suppliers s WHERE s.person_id = p.id) AS sid
      FROM public.persons p
     WHERE EXISTS (SELECT 1 FROM public.customers c WHERE c.person_id = p.id)
       AND EXISTS (SELECT 1 FROM public.suppliers s WHERE s.person_id = p.id)
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
  'فهرست اشخاصی که هم پروندهٔ مشتری دارند و هم تأمین‌کننده، با طلب، بدهی، خالص و جهت. فقط admin/accountant. مهاجرت ۳۱۹، بازنویسی در ۴۲۵.';

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
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','accountant']::text[]) THEN
    RAISE EXCEPTION 'دسترسی لازم برای دیدن وضعیت تسویه را ندارید.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = _person_id) THEN
    RAISE EXCEPTION 'شخص یافت نشد.' USING ERRCODE = '22023';
  END IF;

  -- A posting must never guess which customer or supplier row it means, and it
  -- never has to: uq_customers_person_id and uq_suppliers_person_id allow at
  -- most one of each per person. The two «این شخص % پروندهٔ … دارد» exceptions
  -- that stood here could not fire under those constraints and are gone; if a
  -- future migration ever drops either UNIQUE, this SELECT would silently pick
  -- one row, so the constraint is the thing to keep, not the dead check.
  -- The `_n int` counter they used is removed with them.
  SELECT id INTO _c FROM public.customers WHERE customers.person_id = _person_id;

  SELECT id INTO _s FROM public.suppliers WHERE suppliers.person_id = _person_id;

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
  'وضعیت تسویهٔ متقابل یک شخص: طلب ما، بدهی ما، خالص و جهت. فقط admin/accountant. مهاجرت ۳۱۹، بازنویسی در ۴۲۵.';

REVOKE ALL ON FUNCTION public.person_settlement_position(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.list_mutual_settlement_candidates() FROM anon;
