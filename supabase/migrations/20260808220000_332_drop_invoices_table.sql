SET client_encoding='UTF8';

-- ============================================================================
-- 332 — Condition 2, and the end of the invoice subsystem: drop the table.
-- ============================================================================
--
-- This finishes docs/execution/nav-invoices-cleanup-mission-STATUS.md phase 4. All three
-- blocking conditions are satisfied at this point:
--   1. post_receipt_accounting decoupled ................. migration 327
--   3. both FKs dropped, 17 dependent functions handled .. migrations 329, 330, 331
--   2. de-register invoices.customer_person_id ........... HERE, in the same migration
--      as the DROP, which is exactly what migration 328's event trigger requires.
--
-- ---------------------------------------------------------------------------
-- ORDER IS LOAD-BEARING. Do not reshuffle these statements.
-- ---------------------------------------------------------------------------
-- The 328 gate fires at ddl_command_end for CREATE/ALTER/DROP TABLE and demands that the
-- set of FKs to persons equals the set of person_merge registry keys.
--   • De-registering FIRST and dropping the table SECOND is legal: no table DDL runs in
--     between, so the gate never observes the intermediate state.
--   • Doing it the other way round trips the gate, by design: after the DROP the registry
--     would name a column that no longer exists, and person_merge's final loop iterates
--     the REGISTRY -- _person_merge_count_refs would cast 'public.invoices' to regclass
--     and raise 42P01 on EVERY merge, system-wide. That failure was reproduced live on
--     2026-08-08 before this work began.
--
-- ---------------------------------------------------------------------------
-- The view had to move first
-- ---------------------------------------------------------------------------
-- vw_customer_receivables was the last hard dependency: DROP TABLE would have failed, and
-- CASCADE would have silently taken the view that get_receivable_detail (the receivables
-- page) reads. It is a UNION of an invoice arm and a sales_quotes arm; only the invoice
-- arm and the paid_inv CTE that fed it are removed. The quote arm is untouched, and since
-- the table holds 0 rows the invoice arm contributed no rows -- so the view's output is
-- unchanged.
--
-- ---------------------------------------------------------------------------
-- What goes, and what deliberately stays
-- ---------------------------------------------------------------------------
-- Dropping the table takes its 11 triggers with it. Nine of their functions are
-- invoice-only and are dropped here too. TWO ARE SHARED AND MUST SURVIVE:
--   set_updated_at ................... used by 73 other tables
--   tg_credit_derive_customer_person . used by 7 other tables
-- Dropping either would break a large part of the schema. They are asserted below.
--
-- Data: the table has held 0 rows throughout this mission, re-asserted before the DROP.
-- Backup: D:\AfraKalaTest\backups\invoices-subsystem-20260808.sql (pg_dump, 7 tables).
--
-- Down-script: docs/verification/332-down.sql
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Refuse to run against an unexpected person_merge, and refuse to drop data.
-- ----------------------------------------------------------------------------
DO $guard$
DECLARE _def text; _rows bigint;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO _def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='person_merge';
  IF _def IS NULL THEN
    RAISE EXCEPTION '332: person_merge not found';
  END IF;
  IF _def !~ 'invoices\.customer_person_id' THEN
    RAISE EXCEPTION '332: person_merge does not contain the invoices registry key — either it was already removed or the function is not the one this patch was built from. Stopping.';
  END IF;

  EXECUTE 'SELECT count(*) FROM public.invoices' INTO _rows;
  IF _rows <> 0 THEN
    RAISE EXCEPTION '332: refusing to drop a table holding % row(s). Someone started using invoices; re-assess.', _rows;
  END IF;
END
$guard$;

-- ----------------------------------------------------------------------------
-- 1. Rewrite the view so the table has no dependants left.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_customer_receivables AS
 SELECT src.customer_id,
    src.customer_name,
    src.invoice_id,
    src.invoice_number,
    src.invoice_type,
    src.invoice_status,
    src.due_date,
    src.total_amount,
    src.deposit_amount,
    src.confirmed_paid_amount,
    src.outstanding_amount,
    src.commitment_confirmed,
    src.days_until_due,
    src.is_overdue,
    src.created_at,
    src.aging_bucket
   FROM ( WITH paid_quote AS (
                 SELECT prl.quote_id AS doc_id,
                    COALESCE(sum(prl.amount), 0::numeric) AS confirmed_paid_amount
                   FROM payment_receipt_links prl
                     JOIN payment_receipts pr ON pr.id = prl.receipt_id
                  WHERE prl.quote_id IS NOT NULL AND (pr.status = ANY (ARRAY['approved'::text, 'verified'::text, 'confirmed'::text, 'posted'::text]))
                  GROUP BY prl.quote_id
                )
         SELECT q.customer_id,
            COALESCE(c.name, q.customer_name) AS customer_name,
            q.id AS invoice_id,
            q.quote_number AS invoice_number,
            'sales_quote'::text AS invoice_type,
            q.status::text AS invoice_status,
            q.expires_at::date AS due_date,
            q.final_amount::numeric(18,2) AS total_amount,
            0::numeric AS deposit_amount,
            COALESCE(p.confirmed_paid_amount, 0::numeric) AS confirmed_paid_amount,
            GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) AS outstanding_amount,
            true AS commitment_confirmed,
                CASE
                    WHEN q.expires_at IS NOT NULL THEN q.expires_at::date - CURRENT_DATE
                    ELSE NULL::integer
                END AS days_until_due,
            q.expires_at IS NOT NULL AND q.expires_at::date < CURRENT_DATE AND (q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric)) > 0::numeric AS is_overdue,
            q.created_at,
                CASE
                    WHEN q.expires_at IS NULL THEN 'current'::text
                    WHEN (CURRENT_DATE - q.expires_at::date) <= 0 THEN 'current'::text
                    WHEN (CURRENT_DATE - q.expires_at::date) <= 30 THEN 'd1_30'::text
                    WHEN (CURRENT_DATE - q.expires_at::date) <= 60 THEN 'd31_60'::text
                    WHEN (CURRENT_DATE - q.expires_at::date) <= 90 THEN 'd61_90'::text
                    ELSE 'd90_plus'::text
                END AS aging_bucket
           FROM sales_quotes q
             LEFT JOIN customers c ON c.id = q.customer_id
             LEFT JOIN paid_quote p ON p.doc_id = q.id
          WHERE q.status = 'accepted'::sales_quote_status AND GREATEST(q.final_amount - COALESCE(p.confirmed_paid_amount, 0::numeric), 0::numeric) > 0::numeric) src
  WHERE NOT is_viewer_only(uid());

-- ----------------------------------------------------------------------------
-- 2. De-register the key (condition 2). No table DDL runs between here and the
--    DROP, so the 328 gate never sees the unbalanced intermediate state.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.person_merge(p_winner_id uuid, p_loser_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid        uuid := auth.uid();
  _winner     public.persons%ROWTYPE;
  _loser      public.persons%ROWTYPE;
  _repointed  jsonb := '{}'::jsonb;
  _ids_moved  integer := 0;
  _als_moved  integer := 0;
  _lnk_moved  integer := 0;
  _n          integer;
  _key        text;
  _mode       text;
  _r          record;
  _remaining  bigint;
  _log_id     uuid;

  -- POLICY REGISTRY -----------------------------------------------------------
  -- "table.column" -> handling mode.
  --   identity_root : the legacy mirror's own person_id. Repointed FIRST so the
  --                   derived *_person_id columns stay consistent with it.
  --   generic       : plain UPDATE ... SET col = winner WHERE col = loser.
  --   special_move  : person-owned child rows, moved with de-duplication below.
  --   special_keep  : deliberately keeps references to the loser.
  --   skip          : audit trail; must never be repointed.
  -- Anything in the catalog and NOT in this registry aborts the merge.
  _registry constant jsonb := jsonb_build_object(
    'customers.person_id',                                    'identity_root',
    'suppliers.person_id',                                    'identity_root',
    'external_parties.person_id',                             'identity_root',

    -- D8-3 (migration 271): profiles.person_id, added by 270. It is 'generic'
    -- and NOT 'identity_root': profiles.person_id has no unique constraint, so
    -- two user accounts may legitimately point at one person, and a profile
    -- carries no financial state -- unlike a customer or supplier file, merging
    -- two of them mixes nothing that needs an accounting decision first. A
    -- plain repoint is therefore correct and needs no both-sides guard.
    'asan_import_person_rows.matched_person_id',                'generic',
    'profiles.person_id',                                     'generic',

    -- Migration 324. mutual_settlements.person_id, added by 319 (mutual
    -- settlement). Registering it is not optional bookkeeping: Guard 3 above
    -- aborts EVERY merge in the system while any persons-referencing column is
    -- unregistered, so from 319 until this migration no merge could run at all.
    -- Third time this trap has been sprung -- see 271 (profiles.person_id) and
    -- 287 (asan_import_person_rows.matched_person_id).
    --
    -- 'generic', not 'identity_root': a person can have many settlement
    -- documents, so the column carries no unique constraint and is not an
    -- identity mirror. A plain repoint is correct and needs no extra guard.
    --
    -- Why a plain repoint leaves a COHERENT document. A mutual settlement only
    -- exists for a person who has BOTH a customer file and a supplier file. If
    -- the loser has settlements it therefore has both, and Guard 7 above
    -- already refuses the merge unless the winner has neither. So the loser's
    -- customers and suppliers rows are themselves repointed to the winner as
    -- identity_root in the same Step A, and the settlement's customer_id and
    -- supplier_id keep pointing at those same rows. person_id, customer_id and
    -- supplier_id therefore all end up describing the winner -- no half-moved
    -- document. Asserted live in docs/verification/324-merge-test.sql.
    'mutual_settlements.person_id',                           'generic',

    'credit_requests.customer_person_id',                     'generic',
    'credit_score_snapshots.customer_person_id',              'generic',
    'customer_capital_allocations_dynamic.customer_person_id','generic',
    'customer_credit_balance.customer_person_id',             'generic',
    'customer_credit_ledger.customer_person_id',              'generic',
    'customer_credit_profile.customer_person_id',             'generic',
    'delivery_receipts.customer_person_id',                   'generic',
    'didar_activities.customer_person_id',                    'generic',
    'payment_receipts.customer_person_id',                    'generic',
    'payment_receipts.receiver_party_person_id',              'generic',
    'payment_vouchers.payee_person_id',                       'generic',
    'product_suppliers.supplier_person_id',                   'generic',
    'purchase_prices.supplier_person_id',                     'generic',
    'purchases.supplier_person_id',                           'generic',
    'sales_quotes.customer_person_id',                        'generic',

    'person_identifiers.person_id',                           'special_move',
    'person_aliases.person_id',                               'special_move',
    'person_context_links.person_id',                         'special_move',
    'person_field_values.person_id',                          'special_move',

    'person_merge_candidates.person_id_a',                    'special_keep',
    'person_merge_candidates.person_id_b',                    'special_keep',

    'person_merge_log.winner_id',                             'skip',
    'person_merge_log.loser_id',                              'skip'
  );
BEGIN
  ---------------------------------------------------------------------------
  -- Guard 1 + 2: authentication, role, existence, distinctness, active state.
  ---------------------------------------------------------------------------
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'ادغام اشخاص فقط برای مدیر سیستم یا مدیر مجاز است.'
      USING ERRCODE = '42501';
  END IF;

  IF p_winner_id IS NULL OR p_loser_id IS NULL THEN
    RAISE EXCEPTION 'شناسهٔ شخص برنده و بازنده هر دو الزامی است.' USING ERRCODE = '22023';
  END IF;

  IF p_winner_id = p_loser_id THEN
    RAISE EXCEPTION 'نمی‌توان یک شخص را با خودش ادغام کرد.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _winner FROM public.persons WHERE id = p_winner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'شخص برندهٔ ادغام پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO _loser FROM public.persons WHERE id = p_loser_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'شخص بازندهٔ ادغام پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT _winner.is_active THEN
    RAISE EXCEPTION 'شخص برنده غیرفعال است و نمی‌تواند مقصد ادغام باشد.' USING ERRCODE = '22023';
  END IF;

  IF NOT _loser.is_active THEN
    RAISE EXCEPTION 'شخص بازنده از پیش غیرفعال است؛ احتمالاً قبلاً ادغام شده است.'
      USING ERRCODE = '22023';
  END IF;

  ---------------------------------------------------------------------------
  -- Guard 3: catalog completeness. Every FK column referencing persons must
  -- have a registered merge policy, or this merge does not run at all.
  ---------------------------------------------------------------------------
  FOR _r IN
    SELECT con.conrelid::regclass::text AS tbl, att.attname::text AS col
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid
                         AND att.attnum = ANY (con.conkey)
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.persons'::regclass
  LOOP
    _key := _r.tbl || '.' || _r.col;
    IF NOT (_registry ? _key) THEN
      RAISE EXCEPTION
        'ادغام متوقف شد: ستون «%» به جدول اشخاص ارجاع می‌دهد ولی سیاست ادغام برای آن تعریف نشده است. تا زمانی که این ستون در فهرست سیاست‌های تابع person_merge ثبت نشود، ادغام انجام نمی‌شود.',
        _key
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- Guard 7: cardinality. Two customer rows (or two supplier rows) is a
  -- business reconciliation, not an identity merge.
  ---------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.customers WHERE person_id = p_winner_id)
     AND EXISTS (SELECT 1 FROM public.customers WHERE person_id = p_loser_id) THEN
    RAISE EXCEPTION
      'هر دو شخص پروندهٔ مشتری دارند. ادغام هویت این دو، مانده‌ها و سابقهٔ اعتباری دو مشتری را در هم می‌آمیزد. ابتدا باید دو پروندهٔ مشتری به‌صورت حسابداری تعیین تکلیف شوند؛ این کار از عهدهٔ ادغام هویت خارج است.'
      USING ERRCODE = '23505';
  END IF;

  IF EXISTS (SELECT 1 FROM public.suppliers WHERE person_id = p_winner_id)
     AND EXISTS (SELECT 1 FROM public.suppliers WHERE person_id = p_loser_id) THEN
    RAISE EXCEPTION
      'هر دو شخص پروندهٔ تأمین‌کننده دارند. ادغام هویت این دو، سابقهٔ خرید و پرداخت دو تأمین‌کننده را در هم می‌آمیزد. ابتدا باید دو پروندهٔ تأمین‌کننده تعیین تکلیف شوند؛ این کار از عهدهٔ ادغام هویت خارج است.'
      USING ERRCODE = '23505';
  END IF;

  -- D8-2 (migration 269): the same guard for external parties. It matters now
  -- that uq_external_parties_person_active exists: without this, merging two
  -- people who each have an ACTIVE external party would fail deep inside Step A
  -- with a raw unique_violation on the index instead of this explanation.
  -- Mirrors the customers/suppliers guards above exactly.
  IF EXISTS (SELECT 1 FROM public.external_parties WHERE person_id = p_winner_id AND is_active)
     AND EXISTS (SELECT 1 FROM public.external_parties WHERE person_id = p_loser_id AND is_active) THEN
    RAISE EXCEPTION
      'هر دو شخص طرف حساب خارجیِ فعال دارند. طبق تصمیم «یک شخص = یک طرف حساب فعال»، ادغام هویت این دو تا وقتی هر دو طرف حساب فعال‌اند انجام نمی‌شود. ابتدا یکی از دو طرف حساب را غیرفعال کنید و سپس ادغام را تکرار کنید.'
      USING ERRCODE = '23505';
  END IF;

  ---------------------------------------------------------------------------
  -- Step A: identity roots first, then every generic reference.
  ---------------------------------------------------------------------------
  FOR _mode IN SELECT unnest(ARRAY['identity_root','generic']) LOOP
    FOR _key IN
      SELECT k.key FROM jsonb_each_text(_registry) k
      WHERE k.value = _mode ORDER BY k.key
    LOOP
      _n := public._person_merge_repoint(
        split_part(_key, '.', 1), split_part(_key, '.', 2), p_winner_id, p_loser_id);
      IF _n > 0 THEN
        _repointed := _repointed || jsonb_build_object(_key, _n);
      END IF;
    END LOOP;
  END LOOP;

  ---------------------------------------------------------------------------
  -- Step B: identifiers. Drop the loser's exact duplicates first, then demote
  -- its is_primary flags where the winner already holds a primary of that kind
  -- (uq_person_identifiers_primary_active is (person_id, kind) WHERE is_primary
  -- AND status <> 'revoked'), then move the rest.
  ---------------------------------------------------------------------------
  DELETE FROM public.person_identifiers li
  WHERE li.person_id = p_loser_id
    AND EXISTS (
      SELECT 1 FROM public.person_identifiers wi
      WHERE wi.person_id = p_winner_id
        AND wi.kind = li.kind
        AND wi.value_normalized = li.value_normalized
    );

  UPDATE public.person_identifiers li
  SET is_primary = false
  WHERE li.person_id = p_loser_id
    AND li.is_primary
    AND EXISTS (
      SELECT 1 FROM public.person_identifiers wi
      WHERE wi.person_id = p_winner_id
        AND wi.kind = li.kind
        AND wi.is_primary
        AND wi.status <> 'revoked'
    );

  UPDATE public.person_identifiers SET person_id = p_winner_id WHERE person_id = p_loser_id;
  GET DIAGNOSTICS _ids_moved = ROW_COUNT;

  ---------------------------------------------------------------------------
  -- Step C: aliases. Same de-duplication, plus the loser's display_name is
  -- preserved as an alias of the winner so search still finds the old name.
  -- alias_normalized is a GENERATED column, so it is never written directly.
  ---------------------------------------------------------------------------
  DELETE FROM public.person_aliases la
  WHERE la.person_id = p_loser_id
    AND EXISTS (
      SELECT 1 FROM public.person_aliases wa
      WHERE wa.person_id = p_winner_id
        AND wa.alias_normalized = la.alias_normalized
    );

  UPDATE public.person_aliases SET person_id = p_winner_id WHERE person_id = p_loser_id;
  GET DIAGNOSTICS _als_moved = ROW_COUNT;

  INSERT INTO public.person_aliases (person_id, alias, alias_kind, source, created_by)
  VALUES (p_winner_id, _loser.display_name, 'former', 'person_merge', _uid)
  ON CONFLICT DO NOTHING;

  ---------------------------------------------------------------------------
  -- Step D: context links, de-duplicated on the same key that
  -- uq_pcl_active_ref enforces.
  ---------------------------------------------------------------------------
  DELETE FROM public.person_context_links ll
  WHERE ll.person_id = p_loser_id
    AND EXISTS (
      SELECT 1 FROM public.person_context_links wl
      WHERE wl.person_id = p_winner_id
        AND wl.context_kind IS NOT DISTINCT FROM ll.context_kind
        AND wl.ref_table   IS NOT DISTINCT FROM ll.ref_table
        AND wl.ref_id      IS NOT DISTINCT FROM ll.ref_id
    );

  UPDATE public.person_context_links SET person_id = p_winner_id WHERE person_id = p_loser_id;
  GET DIAGNOSTICS _lnk_moved = ROW_COUNT;

  ---------------------------------------------------------------------------
  -- Step E: custom field values. The winner's own value wins on collision
  -- (person_field_values is UNIQUE on (person_id, field_definition_id)).
  ---------------------------------------------------------------------------
  DELETE FROM public.person_field_values lv
  WHERE lv.person_id = p_loser_id
    AND EXISTS (
      SELECT 1 FROM public.person_field_values wv
      WHERE wv.person_id = p_winner_id
        AND wv.field_definition_id = lv.field_definition_id
    );

  UPDATE public.person_field_values SET person_id = p_winner_id WHERE person_id = p_loser_id;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n > 0 THEN
    _repointed := _repointed || jsonb_build_object('person_field_values.person_id', _n);
  END IF;

  ---------------------------------------------------------------------------
  -- Step F: VERIFICATION SWEEP. SECURITY INVOKER means an RLS-filtered UPDATE
  -- matches nothing instead of raising. Prove no reference to the loser
  -- survived, or abort the whole merge.
  ---------------------------------------------------------------------------
  FOR _key, _mode IN SELECT k.key, k.value FROM jsonb_each_text(_registry) k ORDER BY k.key LOOP
    CONTINUE WHEN _mode IN ('special_keep', 'skip');
    _remaining := public._person_merge_count_refs(
      split_part(_key, '.', 1), split_part(_key, '.', 2), p_loser_id);

    IF _remaining > 0 THEN
      RAISE EXCEPTION
        'ادغام ناتمام ماند: % ردیف در ستون «%» هنوز به شخص بازنده ارجاع می‌دهد (احتمالاً به دلیل محدودیت سطح دسترسی). کل عملیات لغو شد.',
        _remaining, _key
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- Step G: deactivate the loser. Never hard-deleted — its id may appear in
  -- audit_logs and in person_merge_log itself.
  ---------------------------------------------------------------------------
  UPDATE public.persons
  SET is_active = false,
      notes = COALESCE(NULLIF(btrim(COALESCE(notes, '')), '') || E'\n', '')
              || 'ادغام‌شده در شخص ' || p_winner_id::text || ' در تاریخ ' || now()::date::text,
      updated_at = now()
  WHERE id = p_loser_id;

  ---------------------------------------------------------------------------
  -- Step H: audit + candidate queue.
  ---------------------------------------------------------------------------
  INSERT INTO public.person_merge_log (
    winner_id, loser_id, reason, repointed,
    identifiers_moved, aliases_moved, links_moved, merged_by
  )
  VALUES (
    p_winner_id, p_loser_id, NULLIF(btrim(COALESCE(p_reason, '')), ''), _repointed,
    _ids_moved, _als_moved, _lnk_moved, _uid
  )
  RETURNING id INTO _log_id;

  -- Only the exact pair is resolved. Other pending pairs that involve the loser
  -- are left untouched on purpose: marking them 'merged' would be false, and
  -- silently re-pointing them at the winner could collide with an existing pair.
  -- The merge UI filters those out by requiring both persons to be active.
  UPDATE public.person_merge_candidates
  SET status = 'merged', reviewed_by = _uid, reviewed_at = now(), updated_at = now()
  WHERE status = 'pending'
    AND ((person_id_a = p_winner_id AND person_id_b = p_loser_id)
      OR (person_id_a = p_loser_id  AND person_id_b = p_winner_id));

  RETURN jsonb_build_object(
    'winner_id',         p_winner_id,
    'loser_id',          p_loser_id,
    'merge_log_id',      _log_id,
    'repointed',         _repointed,
    'identifiers_moved', _ids_moved,
    'aliases_moved',     _als_moved,
    'links_moved',       _lnk_moved
  );
END;
$function$;

-- ----------------------------------------------------------------------------
-- 3. Functions with no trigger dependency can go before the table.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.complete_invoice_task(uuid);
DROP FUNCTION IF EXISTS public.create_preinvoice_workflow_tasks(uuid);

-- ----------------------------------------------------------------------------
-- 4. Drop the table. Its 11 triggers and 3 RLS policies go with it.
--    The 328 gate fires here and must pass.
-- ----------------------------------------------------------------------------
DROP TABLE public.invoices;

-- ----------------------------------------------------------------------------
-- 5. Now the invoice-only trigger functions are orphaned; drop them.
--    set_updated_at and tg_credit_derive_customer_person are NOT in this list.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.audit_invoice_insert();
DROP FUNCTION IF EXISTS public.enforce_no_overdue_on_commitment();
DROP FUNCTION IF EXISTS public.invoices_log_type_changes();
DROP FUNCTION IF EXISTS public.recompute_employee_scores_on_invoice();
DROP FUNCTION IF EXISTS public.set_invoice_settlement_due_date();
DROP FUNCTION IF EXISTS public.trg_block_overdue_invoice();
DROP FUNCTION IF EXISTS public.trg_create_preinvoice_workflow_tasks();
DROP FUNCTION IF EXISTS public.trg_invoice_settlement_update();
DROP FUNCTION IF EXISTS public.trg_ticker_invoice_approved();

-- ----------------------------------------------------------------------------
-- 6. Assertions, in the same transaction.
-- ----------------------------------------------------------------------------
DO $do$
DECLARE _n int;
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    RAISE EXCEPTION '332: invoices still exists';
  END IF;

  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.prokind='f' AND pg_get_functiondef(p.oid) ~* 'public\.invoices';
  IF _n <> 0 THEN
    RAISE EXCEPTION '332: % function(s) still reference the dropped table', _n;
  END IF;

  -- The two shared trigger functions must be untouched.
  SELECT count(*) INTO _n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('set_updated_at','tg_credit_derive_customer_person');
  IF _n <> 2 THEN
    RAISE EXCEPTION '332: a SHARED trigger function was dropped — expected 2, found %', _n;
  END IF;
  SELECT count(*) INTO _n FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
   WHERE NOT t.tgisinternal AND p.proname = 'set_updated_at';
  IF _n < 70 THEN
    RAISE EXCEPTION '332: set_updated_at should still back ~73 triggers, found %', _n;
  END IF;

  -- The receivables view must still work and still serve the quote arm.
  PERFORM 1 FROM public.vw_customer_receivables LIMIT 1;

  -- And the registry must balance again -- this is condition 2 proven, not assumed.
  PERFORM public.assert_person_fk_registry();
  SELECT count(*) INTO _n FROM public.person_merge_registry_keys();
  IF _n <> 29 THEN
    RAISE EXCEPTION '332: expected 29 registry keys after removing one from 30, found %', _n;
  END IF;

  RAISE NOTICE '332 OK: invoices dropped, 0 dangling references, shared triggers intact, registry balanced at 29';
END
$do$;
