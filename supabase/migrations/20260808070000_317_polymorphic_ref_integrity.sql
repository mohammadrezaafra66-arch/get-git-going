-- 317: referential integrity for the two polymorphic reference columns.
--
-- `stock_movements.ref_id` and `journal_lines.account_ref_id` both point at a
-- row in a different table depending on a sibling discriminator column, so
-- neither can carry a real FOREIGN KEY. Today nothing checks them at all: a
-- typo, a stale id, or a parent deleted out from under them all land silently
-- and are only discovered when a report comes out wrong. This is the same
-- shape that broke migration 304.
--
-- This adds the functional equivalent of a FK: a BEFORE INSERT OR UPDATE
-- trigger that resolves the discriminator to a target table and rejects the
-- write if the target row does not exist.
--
-- THE MAPPINGS ARE DISCOVERED, NOT ASSUMED
--
-- Each one was read out of the live writer and then confirmed against live
-- data (every existing row resolves, 0 orphans):
--
--   stock_movements.ref_type      writer                        -> target
--   ------------------------      ----------------------------     ---------------
--   purchase                      trg_purchase_item_stock_in    -> purchases        (57/57)
--   sale_quote_confirm            trg_sales_quote_stock_out     -> sales_quotes     (1/1)
--   transfer                      trg_stock_transfer_confirm    -> stock_transfers  (2/2)
--   manual                        adjust_warehouse_stock        -> none: always NULL
--
--   journal_lines.account_kind    writer                        -> target
--   --------------------------    ----------------------------     ---------------
--   customer_credit               post_receipt_accounting       -> customers        (1/1)
--   bank                          post_receipt_accounting,      -> bank_accounts    (1/1)
--                                 pay_purchase_with_voucher
--   external_party                post_receipt_accounting       -> external_parties
--   supplier_payable              pay_purchase_with_voucher     -> suppliers
--   invoice_ar / clearing / other  (no writer yet)              -> none
--
-- WHY THREE KINDS ARE LEFT UNVALIDATED
--
-- `invoice_ar`, `clearing` and `other` are not entity references at all. They
-- are general-ledger control accounts — migration 294 states it outright
-- ("invoice_ar / clearing / other resolve to nothing, on purpose") and 297
-- assigns `invoice_ar` the Asan account code 989, «جمع بدهکاران». There is no
-- table to check them against, so the trigger passes them through rather than
-- inventing a rule. Same for `manual` on stock movements, which means "no
-- source document". A kind with no mapping is reported by
-- `polymorphic_ref_orphan_report()` if it ever carries a reference, so the
-- gap stays visible instead of becoming a silent hole.
--
-- Deliberately NOT done here: nothing validates on DELETE of a parent row, so
-- a parent removed later still orphans its children. That is a separate
-- decision (cascade vs restrict vs tombstone) on tables holding financial
-- history, and is out of scope for a hygiene pass.
--
-- Orphans found at write time: 0 in both tables (see 317-dry-run.sql).
-- Rollback: docs/verification/317-down.sql
SET client_encoding='UTF8';

-- ------------------------------------------------------- stock_movements ----
CREATE OR REPLACE FUNCTION public.validate_stock_movement_ref()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  _target text;
  _ok     boolean;
BEGIN
  -- Nothing to resolve: no discriminator, or no reference given.
  IF NEW.ref_type IS NULL OR NEW.ref_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, skip when neither side moved. Keeps bulk updates cheap.
  IF TG_OP = 'UPDATE'
     AND NEW.ref_type IS NOT DISTINCT FROM OLD.ref_type
     AND NEW.ref_id   IS NOT DISTINCT FROM OLD.ref_id THEN
    RETURN NEW;
  END IF;

  _target := CASE NEW.ref_type
    WHEN 'purchase'           THEN 'purchases'
    WHEN 'sale_quote_confirm' THEN 'sales_quotes'
    WHEN 'transfer'           THEN 'stock_transfers'
    ELSE NULL          -- 'manual' and anything added later: no target table
  END;

  IF _target IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', _target)
    INTO _ok USING NEW.ref_id;

  IF NOT _ok THEN
    RAISE EXCEPTION
      'ارجاع حرکت کالا نامعتبر است: ردیفی با شناسهٔ % در «%» یافت نشد (نوع ارجاع: %).',
      NEW.ref_id, _target, NEW.ref_type
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.validate_stock_movement_ref() IS
  'Migration 317: functional foreign key for the polymorphic stock_movements.ref_id.';

DROP TRIGGER IF EXISTS trg_validate_stock_movement_ref ON public.stock_movements;
CREATE TRIGGER trg_validate_stock_movement_ref
  BEFORE INSERT OR UPDATE OF ref_type, ref_id ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.validate_stock_movement_ref();

-- --------------------------------------------------------- journal_lines ----
CREATE OR REPLACE FUNCTION public.validate_journal_line_ref()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  _target text;
  _ok     boolean;
BEGIN
  IF NEW.account_kind IS NULL OR NEW.account_ref_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.account_kind   IS NOT DISTINCT FROM OLD.account_kind
     AND NEW.account_ref_id IS NOT DISTINCT FROM OLD.account_ref_id THEN
    RETURN NEW;
  END IF;

  _target := CASE NEW.account_kind
    WHEN 'customer_credit'  THEN 'customers'
    WHEN 'bank'             THEN 'bank_accounts'
    WHEN 'external_party'   THEN 'external_parties'
    WHEN 'supplier_payable' THEN 'suppliers'
    ELSE NULL          -- invoice_ar / clearing / other: control accounts
  END;

  IF _target IS NULL THEN
    RETURN NEW;
  END IF;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', _target)
    INTO _ok USING NEW.account_ref_id;

  IF NOT _ok THEN
    RAISE EXCEPTION
      'ارجاع سطر سند نامعتبر است: ردیفی با شناسهٔ % در «%» یافت نشد (نوع حساب: %).',
      NEW.account_ref_id, _target, NEW.account_kind
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.validate_journal_line_ref() IS
  'Migration 317: functional foreign key for the polymorphic journal_lines.account_ref_id.';

DROP TRIGGER IF EXISTS trg_validate_journal_line_ref ON public.journal_lines;
CREATE TRIGGER trg_validate_journal_line_ref
  BEFORE INSERT OR UPDATE OF account_kind, account_ref_id ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.validate_journal_line_ref();

-- ------------------------------------------------------------ diagnostic ----
-- Reports what is already broken. It never deletes or repairs anything:
-- existing orphans are out of scope for this migration, and deciding what to
-- do with a stock movement whose purchase is gone is a business call.
--
-- `unmapped_kind_with_ref` is not an error today — it means a discriminator
-- with no target table is nonetheless carrying a reference, which is how a new
-- kind silently escapes validation. Worth seeing, not worth blocking.
CREATE OR REPLACE FUNCTION public.polymorphic_ref_orphan_report()
RETURNS TABLE(source_table text, kind text, problem text, rows bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT 'stock_movements'::text, sm.ref_type, 'orphan'::text, count(*)
    FROM public.stock_movements sm
   WHERE sm.ref_id IS NOT NULL
     AND ((sm.ref_type = 'purchase'
           AND NOT EXISTS (SELECT 1 FROM public.purchases t WHERE t.id = sm.ref_id))
      OR  (sm.ref_type = 'sale_quote_confirm'
           AND NOT EXISTS (SELECT 1 FROM public.sales_quotes t WHERE t.id = sm.ref_id))
      OR  (sm.ref_type = 'transfer'
           AND NOT EXISTS (SELECT 1 FROM public.stock_transfers t WHERE t.id = sm.ref_id)))
   GROUP BY 2
  HAVING count(*) > 0

  UNION ALL
  SELECT 'stock_movements'::text, sm.ref_type, 'unmapped_kind_with_ref'::text, count(*)
    FROM public.stock_movements sm
   WHERE sm.ref_id IS NOT NULL
     AND sm.ref_type IS NOT NULL
     AND sm.ref_type NOT IN ('purchase', 'sale_quote_confirm', 'transfer')
   GROUP BY 2
  HAVING count(*) > 0

  UNION ALL
  SELECT 'journal_lines'::text, jl.account_kind, 'orphan'::text, count(*)
    FROM public.journal_lines jl
   WHERE jl.account_ref_id IS NOT NULL
     AND ((jl.account_kind = 'customer_credit'
           AND NOT EXISTS (SELECT 1 FROM public.customers t WHERE t.id = jl.account_ref_id))
      OR  (jl.account_kind = 'bank'
           AND NOT EXISTS (SELECT 1 FROM public.bank_accounts t WHERE t.id = jl.account_ref_id))
      OR  (jl.account_kind = 'external_party'
           AND NOT EXISTS (SELECT 1 FROM public.external_parties t WHERE t.id = jl.account_ref_id))
      OR  (jl.account_kind = 'supplier_payable'
           AND NOT EXISTS (SELECT 1 FROM public.suppliers t WHERE t.id = jl.account_ref_id)))
   GROUP BY 2
  HAVING count(*) > 0

  UNION ALL
  SELECT 'journal_lines'::text, jl.account_kind, 'unmapped_kind_with_ref'::text, count(*)
    FROM public.journal_lines jl
   WHERE jl.account_ref_id IS NOT NULL
     AND jl.account_kind NOT IN ('customer_credit', 'bank', 'external_party', 'supplier_payable')
   GROUP BY 2
  HAVING count(*) > 0
$fn$;

REVOKE ALL ON FUNCTION public.polymorphic_ref_orphan_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.polymorphic_ref_orphan_report() TO authenticated;

COMMENT ON FUNCTION public.polymorphic_ref_orphan_report() IS
  'Migration 317: reports dangling polymorphic references. Read-only; repairs nothing.';

-- --------------------------------------------------------------------- gate --
DO $chk$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_trigger
   WHERE tgname IN ('trg_validate_stock_movement_ref', 'trg_validate_journal_line_ref')
     AND NOT tgisinternal;
  IF n <> 2 THEN RAISE EXCEPTION 'expected 2 validation triggers, found %', n; END IF;

  -- The Persian messages must have survived transport. A pipe that mangles
  -- UTF-8 turns every non-ASCII byte into '?', which is exactly how 44
  -- functions lost their Persian text on 2026-07-11 — and it fails silently.
  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('validate_stock_movement_ref', 'validate_journal_line_ref')
     AND p.prosrc LIKE '%?%';
  IF n <> 0 THEN
    RAISE EXCEPTION 'Persian text was mangled in transport (% functions contain ?)', n;
  END IF;

  SELECT count(*) INTO n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('validate_stock_movement_ref', 'validate_journal_line_ref')
     AND p.prosrc LIKE '%یافت نشد%';
  IF n <> 2 THEN
    RAISE EXCEPTION 'Persian error message missing from % of 2 functions', 2 - n;
  END IF;

  -- Guard the premise: this migration claims every existing row resolves.
  SELECT coalesce(sum(r.rows), 0) INTO n
    FROM public.polymorphic_ref_orphan_report() r WHERE r.problem = 'orphan';
  IF n <> 0 THEN
    RAISE EXCEPTION '% pre-existing orphan references — investigate before enforcing', n;
  END IF;
END
$chk$;
