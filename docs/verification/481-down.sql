-- 481-down.sql — reverse migration 481 (public.allocation_rows and its two person_merge
--                 registry keys).
--
-- STATEMENTS ONLY. No BEGIN, no COMMIT, no ROLLBACK — the caller owns the transaction,
-- matching 328-down.sql and 360-down.sql.
--
-- RUN 482-down.sql FIRST. It removes the four RPCs and the delete-audit trigger that sit
-- on top of this table. DROP TABLE would take the trigger with it, but it would leave four
-- functions referring to a table that no longer exists.
--
-- WHAT 481 ADDED, and therefore what this removes:
--   1. two registry keys inside public.person_merge
--   2. table public.allocation_rows, its five FKs, six CHECKs, four indexes, four policies
--   3. trigger  trg_allocation_rows_derive_payer_person
--   4. trigger  trg_allocation_rows_updated_at
--   5. function tg_allocation_rows_derive_payer_person()
--
-- ORDER IS LOAD BEARING, AND IT IS THE MIRROR OF THE MIGRATION'S ORDER.
-- Migration 328's event trigger checks after every CREATE TABLE / ALTER TABLE / DROP TABLE
-- that the FK set and the registry agree. Dropping a table that owns registered keys while
-- the keys are still declared leaves a STALE registry, and person_merge's verification
-- sweep then casts 'public.allocation_rows' to regclass and raises 42P01 on EVERY merge.
-- So: person_merge loses the keys FIRST (CREATE OR REPLACE is not a gated tag), and the
-- table is dropped SECOND, at which point 29 keys meet 29 FKs and the gate passes.
--
-- PRE-FLIGHT GATE — the important part of this file.
--
--   (a) It REFUSES while any allocation row exists. Those rows are an accountant's plan for
--       a day's money and the audit trail that describes them; dropping the table destroys
--       both and leaves orphaned audit_logs rows pointing at an entity_type nothing can
--       resolve. If you genuinely need to reverse 481 after rows exist, a human decides what
--       happens to them first.
--
--   (b) It REFUSES if person_merge's registry no longer matches what 481 left behind. The
--       body below is the definition as it stood BEFORE 481 — correct on 2026-09-06 and
--       nowhere else. If another migration has since added or removed a key, applying this
--       body would silently delete that migration's key and break merging for every person,
--       which is exactly the failure 328 exists to prevent. In that case do not run this
--       file: take pg_get_functiondef of the LIVE person_merge, delete only the two
--       allocation_rows lines, and use that.

SET client_encoding = 'UTF8';

DO $$
DECLARE
  _rows  bigint;
  _drift int;
BEGIN
  IF to_regclass('public.allocation_rows') IS NULL THEN
    RAISE NOTICE '481-down: allocation_rows does not exist; nothing to do.';
    RETURN;
  END IF;

  EXECUTE 'SELECT count(*) FROM public.allocation_rows' INTO _rows;
  IF _rows > 0 THEN
    RAISE EXCEPTION
      '481-down refuses: % allocation row(s) exist. Dropping the table destroys the plan and orphans its audit_logs rows. Decide what happens to them first.',
      _rows USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO _drift
    FROM public.person_merge_registry_keys()
   WHERE registry_key NOT IN (
      'allocation_rows.beneficiary_person_id', 'allocation_rows.payer_person_id', 
      'asan_import_person_rows.matched_person_id', 'credit_requests.customer_person_id', 
      'credit_score_snapshots.customer_person_id', 
      'customer_capital_allocations_dynamic.customer_person_id', 
      'customer_credit_balance.customer_person_id', 'customer_credit_ledger.customer_person_id', 
      'customer_credit_profile.customer_person_id', 'customers.person_id', 
      'delivery_receipts.customer_person_id', 'didar_activities.customer_person_id', 
      'external_parties.person_id', 'mutual_settlements.person_id', 
      'payment_receipts.customer_person_id', 'payment_receipts.receiver_party_person_id', 
      'payment_vouchers.payee_person_id', 'person_aliases.person_id', 
      'person_context_links.person_id', 'person_field_values.person_id', 
      'person_identifiers.person_id', 'person_merge_candidates.person_id_a', 
      'person_merge_candidates.person_id_b', 'person_merge_log.loser_id', 
      'person_merge_log.winner_id', 'product_suppliers.supplier_person_id', 'profiles.person_id', 
      'purchase_prices.supplier_person_id', 'purchases.supplier_person_id', 
      'sales_quotes.customer_person_id', 'suppliers.person_id'
    );
  IF _drift > 0 OR NOT EXISTS (SELECT 1 FROM public.person_merge_registry_keys()
                                WHERE registry_key = 'allocation_rows.payer_person_id') THEN
    RAISE EXCEPTION
      '481-down refuses: person_merge''s registry has moved since 481 (% unexpected key(s)). The body in this file is the pre-481 definition and would silently delete whatever changed it. Take pg_get_functiondef of the live person_merge, remove only the two allocation_rows lines, and use that instead.',
      _drift USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE '481-down: pre-flight passed — 0 rows, registry unchanged since 481.';
END
$$;

-- ----------------------------------------------------------------------------
-- 1. Triggers and the trigger function that only this table uses.
--    set_updated_at is shared and is NOT dropped.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_allocation_rows_derive_payer_person ON public.allocation_rows;
DROP TRIGGER IF EXISTS trg_allocation_rows_updated_at          ON public.allocation_rows;
DROP FUNCTION IF EXISTS public.tg_allocation_rows_derive_payer_person();

-- ----------------------------------------------------------------------------
-- 2. person_merge WITHOUT the two keys — BEFORE the DROP TABLE. See the header.
--    This is the definition as it stood immediately before 481 was applied,
--    read with pg_get_functiondef on 2026-09-06.
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


COMMENT ON FUNCTION public.person_merge(uuid, uuid, text) IS
  'Merges two person records. 481-down removed the allocation_rows registry keys again.';

-- ----------------------------------------------------------------------------
-- 3. The table. Policies and indexes go with it. The gate re-checks here and
--    finds the registry and the FK set balanced again.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.allocation_rows;

DO $$
DECLARE _bad int;
BEGIN
  SELECT count(*) INTO _bad FROM public.person_fk_registry_report() WHERE verdict <> 'ok';
  IF _bad > 0 THEN
    RAISE EXCEPTION '481-down: % person FK column(s) still disagree with the registry', _bad;
  END IF;
  RAISE NOTICE '481-down OK: allocation_rows gone, registry balanced.';
END
$$;
