-- 318: remove one duplicate person left over from P0.2 — 271d7c44 only.
--
-- WHAT IS BEING REMOVED
--
--   person   271d7c44-c89f-44db-9b91-99474cdf0a2c  «محمدزین الدین»  (kind=individual, created 2026-08-05)
--   customer 5f7b335e-ac1f-4a7f-92ec-54fb776f1ab0  «محمدزین الدین»  (accounting_code empty)
--   person_context_links 50c74c77-1ddb-433f-96ba-a881be53e7eb (context_kind=customer -> that customer)
--
-- WHY IT IS SAFE, MEASURED RATHER THAN ASSUMED
--
-- Every foreign key that references `persons` was enumerated from pg_constraint
-- (29 columns across 24 tables) and counted for this id. Exactly two are
-- non-zero — `customers.person_id` and `person_context_links.person_id`, both
-- listed above. Every financial and operational table is zero: purchases,
-- sales_quotes, invoices, payment_receipts, payment_vouchers, delivery_receipts,
-- credit_requests, credit_score_snapshots, customer_credit_balance,
-- customer_credit_ledger, customer_credit_profile,
-- customer_capital_allocations_dynamic, didar_activities, product_suppliers,
-- purchase_prices, person_identifiers, person_aliases, person_field_values,
-- person_merge_log, person_merge_candidates, asan_import_person_rows.
--
-- The same sweep was run for the customer row against every FK referencing
-- `customers`: zero inbound references. So this person carries no money, no
-- history, and no identity data — it is a bare duplicate shell.
--
-- ⛔ WHAT IS DELIBERATELY *NOT* REMOVED
--
-- The P0.2 analysis named a second candidate, 135ac0e1-a2b4-4692-b736-dd6cc106972f
-- «مختارشاهمرادی». It is NOT touched here and must not be. It is the one real
-- dual-role specimen in this database — the same name existing as both an
-- organization and an individual — and a separate mission (p1-dual-role) needs
-- it to test identity matching. It is also not inert: it carries 2
-- person_identifiers, a customers row, a person_context_links row, and a
-- customer_capital_allocations_dynamic row. Verified present and attached
-- immediately before this migration was applied.
--
-- Deletion order is dependency order: the context link first (its `ref_id`
-- points at the customer but carries no FK, so removing the customer first
-- would leave it dangling mid-transaction), then the customer
-- (customers.person_id is ON DELETE NO ACTION, so it must go before the
-- person), then the person itself.
--
-- Rollback: docs/verification/318-down.sql restores all three rows with their
-- original ids and timestamps.
SET client_encoding='UTF8';

-- Refuse to run if the premise stopped being true. Between writing and applying
-- this file another agent could attach a document to this person, and deleting
-- it then would destroy real data.
DO $guard$
DECLARE
  _person   uuid := '271d7c44-c89f-44db-9b91-99474cdf0a2c';
  _customer uuid := '5f7b335e-ac1f-4a7f-92ec-54fb776f1ab0';
  _keep     uuid := '135ac0e1-a2b4-4692-b736-dd6cc106972f';
  _sql      text;
  _n        bigint;
  _total    bigint := 0;
  r         record;
BEGIN
  -- The person that must survive has to still be here, or the assumption this
  -- migration was reasoned under no longer holds.
  IF NOT EXISTS (SELECT 1 FROM public.persons WHERE id = _keep) THEN
    RAISE EXCEPTION 'the dual-role specimen % is gone — stop and re-check before deleting anything', _keep;
  END IF;

  -- Re-run the full FK sweep at apply time rather than trusting the comment above.
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.contype = 'f' AND c.confrelid = 'public.persons'::regclass
       AND c.conrelid::regclass::text NOT IN ('customers', 'person_context_links')
  LOOP
    _sql := format('SELECT count(*) FROM public.%I WHERE %I = $1', r.tbl, r.col);
    EXECUTE _sql INTO _n USING _person;
    _total := _total + _n;
    IF _n > 0 THEN
      RAISE WARNING 'unexpected reference: %.% holds % row(s)', r.tbl, r.col, _n;
    END IF;
  END LOOP;

  IF _total <> 0 THEN
    RAISE EXCEPTION
      'person % is no longer inert (% referencing rows appeared) — refusing to delete',
      _person, _total;
  END IF;

  -- And nothing may point at the customer row either.
  _total := 0;
  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.contype = 'f' AND c.confrelid = 'public.customers'::regclass
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', r.tbl, r.col)
      INTO _n USING _customer;
    _total := _total + _n;
    IF _n > 0 THEN
      RAISE WARNING 'unexpected reference: %.% holds % row(s)', r.tbl, r.col, _n;
    END IF;
  END LOOP;

  IF _total <> 0 THEN
    RAISE EXCEPTION
      'customer % is no longer inert (% referencing rows appeared) — refusing to delete',
      _customer, _total;
  END IF;
END
$guard$;

DELETE FROM public.person_context_links
 WHERE id = '50c74c77-1ddb-433f-96ba-a881be53e7eb'
   AND person_id = '271d7c44-c89f-44db-9b91-99474cdf0a2c';

DELETE FROM public.customers
 WHERE id = '5f7b335e-ac1f-4a7f-92ec-54fb776f1ab0'
   AND person_id = '271d7c44-c89f-44db-9b91-99474cdf0a2c';

DELETE FROM public.persons
 WHERE id = '271d7c44-c89f-44db-9b91-99474cdf0a2c';

-- --------------------------------------------------------------------- gate --
DO $chk$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM public.persons
   WHERE id = '271d7c44-c89f-44db-9b91-99474cdf0a2c';
  IF n <> 0 THEN RAISE EXCEPTION 'the duplicate person survived the delete'; END IF;

  SELECT count(*) INTO n FROM public.customers
   WHERE id = '5f7b335e-ac1f-4a7f-92ec-54fb776f1ab0';
  IF n <> 0 THEN RAISE EXCEPTION 'the duplicate customer survived the delete'; END IF;

  SELECT count(*) INTO n FROM public.person_context_links
   WHERE id = '50c74c77-1ddb-433f-96ba-a881be53e7eb';
  IF n <> 0 THEN RAISE EXCEPTION 'the duplicate context link survived the delete'; END IF;

  -- The whole point of the exception in the mission brief.
  SELECT count(*) INTO n FROM public.persons
   WHERE id = '135ac0e1-a2b4-4692-b736-dd6cc106972f';
  IF n <> 1 THEN
    RAISE EXCEPTION 'the dual-role specimen 135ac0e1 was destroyed — this migration must never do that';
  END IF;

  SELECT count(*) INTO n FROM public.customers
   WHERE person_id = '135ac0e1-a2b4-4692-b736-dd6cc106972f';
  IF n <> 1 THEN RAISE EXCEPTION 'the specimen lost its customer row'; END IF;

  SELECT count(*) INTO n FROM public.person_identifiers
   WHERE person_id = '135ac0e1-a2b4-4692-b736-dd6cc106972f';
  IF n <> 2 THEN RAISE EXCEPTION 'the specimen lost identifiers (% left, expected 2)', n; END IF;
END
$chk$;
