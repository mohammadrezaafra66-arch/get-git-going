SET client_encoding='UTF8';

-- ============================================================================
-- 552 - public.call_ring_events: live AMI ring-time events for caller popup.
-- ============================================================================
--
-- Gap: CDR import lands after hangup — too late for a ring-time popup.
-- This table holds ring events pushed by the host AMI listener via
-- POST /api/public/hooks/issabel-ami-ring (service_role insert).
--
-- UI polls call_ring_events every ~2s (LAN has no Supabase realtime).
-- CDR import (call_logs) remains the archive path.
--
-- CLAUDE.md rule 9 / migration 328: person_merge registry key FIRST, then
-- CREATE TABLE with persons FK. Live person_merge body read via
-- pg_get_functiondef before this file was written; only
-- call_ring_events.person_id is added to the registry.
--
-- Rollback: docs/verification/552-down.sql
-- ============================================================================

SET lock_timeout = '60s';

-- ----------------------------------------------------------------------------
-- 1. person_merge with call_ring_events.person_id registered
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

    -- Migration 481 (wave 5, allocation workbench). allocation_rows carries TWO columns
    -- referencing persons on ONE row: the debtor side and the creditor side of a single
    -- planned transfer. Registered here, in the same migration and BEFORE the CREATE
    -- TABLE, because the migration 328 event trigger re-checks the FK set against this
    -- registry after every CREATE TABLE / ALTER TABLE and aborts the whole migration on
    -- a mismatch in either direction. Fourth time the trap has been documented -- see
    -- 271, 287 and 324 above.
    --
    -- Both are 'generic', not 'identity_root'. An allocation row is a planning document:
    -- a person can appear on many of them, on many days, on either side. Neither column
    -- carries a unique constraint and neither mirrors a person file, so a plain repoint
    -- is correct and needs no both-sides guard. Repointing is also the behaviour the
    -- accountant needs -- a merged person's promises and obligations must follow the
    -- surviving person, or the day's allocation sheet silently loses rows.
    --
    -- ONE KNOWN, DELIBERATE INTERACTION, recorded rather than hidden. The table refuses
    -- payer = beneficiary, and PostgreSQL re-validates row CHECKs on UPDATE, so a merge
    -- that would bring both sides of the SAME row onto one person aborts with
    -- allocation_rows_parties_distinct_chk. That is narrow -- it needs the two people to
    -- sit on the two sides of one allocation row, and Guard 7 above already refuses the
    -- common case where both hold a customer file -- and it is the right outcome: the
    -- alternative is a surviving plan for a person to pay themself. An accountant must
    -- decide what that row meant. It is a per-pair refusal, not a system-wide halt.
    'allocation_rows.payer_person_id',                        'generic',
    'allocation_rows.beneficiary_person_id',                  'generic',

    -- Migration 545 (sales desk): sales_interactions.person_id. Registered BEFORE
    -- CREATE TABLE because trg_person_fk_registry_gate aborts on mismatch.
    -- 'generic': many interactions per person; plain repoint on merge.
    'sales_interactions.person_id',                          'generic',

    -- Migration 552 (AMI ring events): call_ring_events.person_id. Registered BEFORE
    -- CREATE TABLE because trg_person_fk_registry_gate aborts on mismatch.
    -- 'generic': many ring events per person; plain repoint on merge.
    'call_ring_events.person_id',                             'generic',

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
-- 2. Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.call_ring_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  linkedid        text,
  uniqueid        text,
  caller_number   text,
  extension       text,
  employee_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  person_id       uuid REFERENCES public.persons(id) ON DELETE SET NULL,
  event_at        timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.call_ring_events IS
  'Live AMI ring events for sales-desk caller popup. Written only by service_role '
  '(Issabel AMI listener hook). Authenticated users SELECT their own rows. '
  'CDR archive remains in call_logs.';

COMMENT ON COLUMN public.call_ring_events.linkedid IS
  'Asterisk Linkedid when present; used with extension for dedupe.';

COMMENT ON COLUMN public.call_ring_events.employee_id IS
  'Resolved from call_log_extensions.extension at ingest time (profiles.id = auth.uid()).';

COMMENT ON COLUMN public.call_ring_events.person_id IS
  'Matched via call_import_match_persons on caller_number; NULL if unknown.';

-- Prefer unique on (linkedid, extension) when both present (AMI dedupe).
CREATE UNIQUE INDEX IF NOT EXISTS uq_call_ring_events_linkedid_extension
  ON public.call_ring_events (linkedid, extension)
  WHERE linkedid IS NOT NULL AND extension IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_call_ring_events_created_at_desc
  ON public.call_ring_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_ring_events_employee_created
  ON public.call_ring_events (employee_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 3. RLS — SELECT for authenticated (own / admin-manager / mapped extension);
--    no authenticated write policies (service_role bypasses RLS).
-- ----------------------------------------------------------------------------
ALTER TABLE public.call_ring_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS call_ring_events_select_authenticated ON public.call_ring_events;
CREATE POLICY call_ring_events_select_authenticated ON public.call_ring_events
  FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR EXISTS (
      SELECT 1
        FROM public.call_log_extensions e
       WHERE e.extension = call_ring_events.extension
         AND e.employee_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Grants
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.call_ring_events FROM PUBLIC;
REVOKE ALL ON TABLE public.call_ring_events FROM anon;
GRANT SELECT ON TABLE public.call_ring_events TO authenticated;
GRANT ALL ON TABLE public.call_ring_events TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Assertions (brief, migration-498 style)
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  _anon text;
  _bad  int;
  _keys int;
  _fks  int;
BEGIN
  PERFORM public.assert_person_fk_registry();

  SELECT count(*) INTO _bad
    FROM public.person_fk_registry_report() WHERE verdict <> 'ok';
  IF _bad <> 0 THEN
    RAISE EXCEPTION '552: % person FK columns disagree with person_merge registry', _bad;
  END IF;

  SELECT count(*) INTO _keys FROM public.person_merge_registry_keys();
  SELECT count(*) INTO _fks FROM pg_constraint
   WHERE contype = 'f' AND confrelid = 'public.persons'::regclass;
  IF _keys <> _fks THEN
    RAISE EXCEPTION '552: registry has % keys against % FKs', _keys, _fks;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.person_merge_registry_keys()
     WHERE registry_key = 'call_ring_events.person_id'
  ) THEN
    RAISE EXCEPTION '552: call_ring_events.person_id missing from registry';
  END IF;

  SELECT string_agg(p, ', ') INTO _anon
    FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE',
                      'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
   WHERE has_table_privilege('anon', 'public.call_ring_events', p);
  IF _anon IS NOT NULL THEN
    RAISE EXCEPTION '552: anon still holds % on call_ring_events', _anon;
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.call_ring_events'::regclass) THEN
    RAISE EXCEPTION '552: RLS not enabled on call_ring_events';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polrelid = 'public.call_ring_events'::regclass
       AND polname = 'call_ring_events_select_authenticated'
  ) THEN
    RAISE EXCEPTION '552: select policy missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policy
     WHERE polrelid = 'public.call_ring_events'::regclass
       AND polcmd IN ('a', 'w', 'd')  -- INSERT/UPDATE/DELETE for authenticated roles
  ) THEN
    RAISE EXCEPTION '552: unexpected write policy on call_ring_events';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'uq_call_ring_events_linkedid_extension'
  ) THEN
    RAISE EXCEPTION '552: unique index uq_call_ring_events_linkedid_extension missing';
  END IF;

  RAISE NOTICE
    '552 OK: call_ring_events created; % person FKs registered; anon closed; SELECT-only for authenticated',
    _fks;
END
$do$;
