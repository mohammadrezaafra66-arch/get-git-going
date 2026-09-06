SET client_encoding='UTF8';

-- ============================================================================
-- 481 - allocation_rows: one row = one PLANNED transfer from a debtor to a creditor.
--       The data spine of the allocation workbench ("pakhsh-e hesab").
-- ============================================================================
--
-- WHAT THIS IS, IN ONE SENTENCE
-- -----------------------------
-- "Debtor X should pay amount M to creditor Y on date D." Nothing in the database
-- expressed that before. Three independent searches found no table with two different
-- parties on one planning row -- column-name, structural (two FKs to persons), and
-- relation-name -- see docs/research/allocation-workbench-build-research-20260906.md.
--
-- WHY NOT AN EXISTING TABLE
-- -------------------------
--   * mutual_settlements is a ONE-PARTY netting table: person_id is singular and
--     customer_id/supplier_id are the two role rows OF THAT SAME PERSON. Migration 360
--     considered it for a two-party document and rejected it in writing
--     (20260819130000_360_dual_documents_table.sql:19-45). That reasoning still holds.
--   * dual_documents is the right SHAPE and the wrong TIME: it records a transfer that
--     already happened, with a tracking number and journal lines. An allocation row is a
--     plan for a transfer that has not happened and may never happen. Writing plans into
--     dual_documents would put unposted intentions in the accounting source table.
--   * The credit ledgers are a different AXIS, not a different table for the same thing.
--     hold_credit reserves ONE CUSTOMER's purchase ceiling against ONE sales quote
--     (reference_type is hard-coded 'sales_quote'). A promise here is a cash-flow
--     commitment BETWEEN TWO PEOPLE. Owner decision D-13: do not touch hold_credit,
--     customer_credit_ledger, capital_allocation_ledger or held_amount. This migration
--     touches none of them.
--
-- VOCABULARY IS BORROWED ON PURPOSE
-- ---------------------------------
-- payer_* / beneficiary_* carry exactly the meaning dual_documents gave them: payer is
-- the party who owed US, beneficiary is the party WE owed. Two tables that describe the
-- same two roles should read alike. priority reuses the four grades tasks already has
-- (tasks_priority_check :: low, normal, high, urgent) rather than inventing a fifth
-- vocabulary for the same idea.
--
-- THE PARTY LINKS ARE THE OWNER'S DECISIONS, NOT A MODELLING PREFERENCE
-- --------------------------------------------------------------------
--   Q-1 creditor -> PERSON level, with an OPTIONAL purchase reference. Owner, verbatim:
--        "The accountant works with people, not purchase numbers. When 2 billion goes to
--        a supplier with five open purchases, which one it settles is decided at payment
--        time, not on the allocation row."
--   Q-2 debtor   -> CUSTOMER level, with an OPTIONAL quote reference. Symmetric.
--   D-18 the creditor's account number is written on THE DAY'S ROW as plain text, with
--        no foreign key -- exactly like dual_documents.recipient_account_no, and for the
--        same reason. person_identifiers.kind='iban' is deliberately NOT used.
--
-- THE FIVE STATUS VALUES ARE A CLOSED LIST (owner decision D-20)
-- -------------------------------------------------------------
-- They are the accountant's own words and they are stored verbatim, including the
-- zero-width non-joiner inside three of them. status is NULLABLE and has no default:
-- a row that has just been planned has not been followed up yet, and inventing a sixth
-- state to say so would break the closed list. NULL means "not followed up yet".
--
-- promised_at is a SEPARATE nullable date because the owner was explicit that the
-- Saturday state is TWO things -- a status AND a date -- so that later the system can
-- say "this person promised and did not deliver". A status alone cannot carry that.
--
-- ============================================================================
-- CLAUDE.md RULE 9 / MIGRATION 328 -- THE ORDER OF THE STATEMENTS BELOW IS LOAD BEARING
-- ============================================================================
--
-- allocation_rows has TWO foreign keys to persons. Migration 328 installed an event
-- trigger on CREATE TABLE / ALTER TABLE / DROP TABLE that compares the FK set against
-- person_merge's internal _registry after EVERY such statement and aborts the DDL -- and
-- therefore this whole migration -- on any mismatch, in either direction. An unregistered
-- FK does not degrade one feature: it stops person merging for every person in the system.
-- That shipped three times already (271, 287, 319).
--
-- So person_merge is CREATE OR REPLACE'd with both new registry keys FIRST, and only then
-- is the table created. Both FKs are declared INLINE in the CREATE TABLE, never added by a
-- later ALTER TABLE: adding them separately would leave the intermediate state the gate
-- exists to forbid, and would abort at the CREATE TABLE.
--
-- The person_merge body below is the LIVE definition read with pg_get_functiondef
-- (CLAUDE.md rule 4), byte for byte, with exactly two registry lines and their comment
-- inserted. Nothing else in it is changed, and the signature is identical, so this
-- replaces the function rather than overloading it (rule 5).
--
-- Before:  SELECT count(*) FROM public.person_fk_registry_report()  -> 29, all 'ok'
-- After:   the same query                                           -> 31, all 'ok'
--
-- ============================================================================
-- NOTHING EXISTING IS ALTERED, DROPPED OR DELETED
-- ============================================================================
-- One new table, one function replaced in place, four indexes, four policies, two
-- triggers. No DROP TABLE, no TRUNCATE, no DELETE, no data touched. anon receives no
-- privilege of any kind -- asserted at the end of this file, and pinned by
-- e2e/security/og103-anon-table-grants-stay-closed.spec.ts.
--
-- Rollback: docs/verification/481-down.sql
-- ============================================================================

-- A shared development database with other migrations in flight: fail cleanly on a lock
-- fight instead of blocking another agent's transaction indefinitely.
SET lock_timeout = '60s';

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
  'Merges two person records. Migration 481 added allocation_rows.payer_person_id and '
  'allocation_rows.beneficiary_person_id to the policy registry, as required by CLAUDE.md rule 9 '
  'and enforced by the migration 328 event trigger.';


-- ----------------------------------------------------------------------------
-- 2. The table. Both FKs to persons are INLINE -- see the header for why.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.allocation_rows (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The day the transfer is PLANNED for. Not the day it happened; nothing here happened.
  allocation_date           date NOT NULL DEFAULT CURRENT_DATE,

  -- Debtor side (owner Q-2: customer level, with an OPTIONAL quote reference).
  -- payer_person_id mirrors customers.person_id and is maintained by the trigger below,
  -- exactly as sales_quotes.customer_person_id is by tg_sales_quotes_derive_person.
  payer_customer_id         uuid NOT NULL REFERENCES public.customers(id)    ON DELETE RESTRICT,
  payer_person_id           uuid NOT NULL REFERENCES public.persons(id)      ON DELETE RESTRICT,
  payer_quote_id            uuid          REFERENCES public.sales_quotes(id) ON DELETE SET NULL,

  -- Creditor side (owner Q-1: person level, with an OPTIONAL purchase reference).
  beneficiary_person_id     uuid NOT NULL REFERENCES public.persons(id)      ON DELETE RESTRICT,
  beneficiary_purchase_id   uuid          REFERENCES public.purchases(id)    ON DELETE SET NULL,

  -- D-18: the creditor's account number for THIS DAY'S row, plain text, no foreign key.
  beneficiary_account_no    text,

  amount                    numeric NOT NULL,

  -- The four grades tasks already uses, verbatim.
  priority                  text NOT NULL DEFAULT 'normal',

  -- D-20, a closed list of five. NULL = planned but not followed up yet.
  status                    text,
  promised_at               date,
  promised_note             text,

  created_by                uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT allocation_rows_amount_chk
    CHECK (amount > 0 AND amount = trunc(amount)),

  CONSTRAINT allocation_rows_priority_chk
    CHECK (priority = ANY (ARRAY['low', 'normal', 'high', 'urgent'])),

  -- The owner's own five words, stored verbatim. Three of them carry a zero-width
  -- non-joiner; that is why this file may only ever be delivered as bytes.
  CONSTRAINT allocation_rows_status_chk
    CHECK (status IS NULL OR status = ANY (ARRAY[
      'واریز شد',
      'خبر می‌ده',
      'جواب نمی‌ده',
      'شنبه واریز می‌کنه',
      'نمی‌خواد'
    ])),

  -- "He will pay on Saturday" is a status AND a date. Without the date the refill alert
  -- is blind, so the pair is enforced rather than hoped for.
  CONSTRAINT allocation_rows_promise_needs_date_chk
    CHECK (status IS DISTINCT FROM 'شنبه واریز می‌کنه' OR promised_at IS NOT NULL),

  -- A plan for a person to pay themself moves no money and would sit in the sheet
  -- forever. Same idea as dual_documents_parties_distinct_chk.
  CONSTRAINT allocation_rows_parties_distinct_chk
    CHECK (payer_person_id <> beneficiary_person_id),

  -- An empty string is not an account number and not a note: it would look populated in
  -- the UI and carry nothing. Mirrors dual_documents_record_only_shape_chk.
  CONSTRAINT allocation_rows_text_shape_chk CHECK (
        (beneficiary_account_no IS NULL OR length(btrim(beneficiary_account_no)) > 0)
    AND (promised_note          IS NULL OR length(btrim(promised_note))          > 0))
);

COMMENT ON TABLE public.allocation_rows IS
  'One row = one PLANNED transfer: debtor pays creditor an amount on a date. The data spine of '
  'the allocation workbench. payer_* / beneficiary_* mean exactly what they mean in '
  'dual_documents -- payer is the party who owed US, beneficiary the party WE owed -- but this '
  'table records an intention, not a completed document, and writes no journal line. Migration '
  '481. Owner decisions Q-1, Q-2, D-13, D-18, D-20, D-21.';

COMMENT ON COLUMN public.allocation_rows.allocation_date IS
  'The day the transfer is planned for.';
COMMENT ON COLUMN public.allocation_rows.payer_quote_id IS
  'Optional. Owner Q-2: which quote the money settles is decided at payment time, not here.';
COMMENT ON COLUMN public.allocation_rows.beneficiary_purchase_id IS
  'Optional. Owner Q-1: "The accountant works with people, not purchase numbers."';
COMMENT ON COLUMN public.allocation_rows.beneficiary_account_no IS
  'The creditor''s account number as given for THIS row, plain text with no foreign key and no '
  'person_identifiers row -- owner decision D-18, the same shape and the same reason as '
  'dual_documents.recipient_account_no.';
COMMENT ON COLUMN public.allocation_rows.status IS
  'One of the owner''s five follow-up states (D-20, a closed list), or NULL for a row that has '
  'been planned but not yet followed up.';
COMMENT ON COLUMN public.allocation_rows.promised_at IS
  'The date the debtor promised. Its own column, not text inside the status, so the system can '
  'later say that someone promised and did not deliver.';

CREATE INDEX IF NOT EXISTS allocation_rows_date_idx
  ON public.allocation_rows (allocation_date DESC);
CREATE INDEX IF NOT EXISTS allocation_rows_payer_idx
  ON public.allocation_rows (payer_customer_id, allocation_date DESC);
CREATE INDEX IF NOT EXISTS allocation_rows_beneficiary_idx
  ON public.allocation_rows (beneficiary_person_id, allocation_date DESC);
-- The refill alert reads exactly this set: a promise that has a date.
CREATE INDEX IF NOT EXISTS allocation_rows_promised_at_idx
  ON public.allocation_rows (promised_at)
  WHERE promised_at IS NOT NULL;


-- ----------------------------------------------------------------------------
-- 3. RLS. admin + accountant write, manager reads, admin deletes.
--    The boundary matches dual_documents, which is the nearest existing table.
--    The text[] overload of has_any_role is used deliberately: user_roles.role is TEXT,
--    both overloads exist, and an unqualified array literal is ambiguous between them.
-- ----------------------------------------------------------------------------
ALTER TABLE public.allocation_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allocation_rows_select_finance ON public.allocation_rows;
CREATE POLICY allocation_rows_select_finance ON public.allocation_rows
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'accountant', 'manager']::text[]));

DROP POLICY IF EXISTS allocation_rows_insert_finance ON public.allocation_rows;
CREATE POLICY allocation_rows_insert_finance ON public.allocation_rows
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'accountant']::text[]));

DROP POLICY IF EXISTS allocation_rows_update_finance ON public.allocation_rows;
CREATE POLICY allocation_rows_update_finance ON public.allocation_rows
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin', 'accountant']::text[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin', 'accountant']::text[]));

DROP POLICY IF EXISTS allocation_rows_delete_admin ON public.allocation_rows;
CREATE POLICY allocation_rows_delete_admin ON public.allocation_rows
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::text));


-- ----------------------------------------------------------------------------
-- 4. Triggers. updated_at, and the person mirror.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_allocation_rows_updated_at ON public.allocation_rows;
CREATE TRIGGER trg_allocation_rows_updated_at
  BEFORE UPDATE ON public.allocation_rows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.tg_allocation_rows_derive_payer_person()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  SELECT c.person_id INTO NEW.payer_person_id
    FROM public.customers c WHERE c.id = NEW.payer_customer_id;
  RETURN NEW;
END
$function$;

COMMENT ON FUNCTION public.tg_allocation_rows_derive_payer_person() IS
  'Keeps allocation_rows.payer_person_id equal to customers.person_id for the row''s customer. '
  'The exact mirror of tg_sales_quotes_derive_person. Migration 481.';

DROP TRIGGER IF EXISTS trg_allocation_rows_derive_payer_person ON public.allocation_rows;
CREATE TRIGGER trg_allocation_rows_derive_payer_person
  BEFORE INSERT OR UPDATE OF payer_customer_id ON public.allocation_rows
  FOR EACH ROW EXECUTE FUNCTION public.tg_allocation_rows_derive_payer_person();


-- ----------------------------------------------------------------------------
-- 5. Grants. anon gets nothing, explicitly, and it is asserted below.
--    ALTER DEFAULT PRIVILEGES in this database already grants only postgres,
--    authenticated and service_role on a new table in public, so these REVOKEs are
--    belt and braces rather than a repair -- which is the point: migration 477 closed
--    202 tables' worth of grants nobody ever revoked, and the way that does not happen
--    again is that every new table says so out loud.
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.allocation_rows FROM PUBLIC;
REVOKE ALL ON TABLE public.allocation_rows FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.allocation_rows TO authenticated;


-- ----------------------------------------------------------------------------
-- 6. Assertions. A migration that cannot prove its own postcondition is a claim.
-- ----------------------------------------------------------------------------
DO $do$
DECLARE
  _bad      int;
  _keys     int;
  _fks      int;
  _anon     text;
BEGIN
  -- 6a. The person FK registry is balanced in both directions, including the two new keys.
  PERFORM public.assert_person_fk_registry();

  SELECT count(*) INTO _bad
    FROM public.person_fk_registry_report() WHERE verdict <> 'ok';
  IF _bad <> 0 THEN
    RAISE EXCEPTION '481: % person FK columns disagree with the person_merge registry', _bad;
  END IF;

  SELECT count(*) INTO _keys FROM public.person_merge_registry_keys();
  SELECT count(*) INTO _fks FROM pg_constraint
   WHERE contype = 'f' AND confrelid = 'public.persons'::regclass;
  IF _keys <> _fks OR _keys < 31 THEN
    RAISE EXCEPTION '481: registry has % keys against % FKs (expected at least 31 of each)',
      _keys, _fks;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.person_merge_registry_keys()
                  WHERE registry_key = 'allocation_rows.payer_person_id')
     OR NOT EXISTS (SELECT 1 FROM public.person_merge_registry_keys()
                     WHERE registry_key = 'allocation_rows.beneficiary_person_id') THEN
    RAISE EXCEPTION '481: the two new registry keys are not readable by the 328 extractor';
  END IF;

  -- 6b. anon holds nothing at all on this table.
  SELECT string_agg(p, ', ') INTO _anon
    FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE',
                      'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
   WHERE has_table_privilege('anon', 'public.allocation_rows', p);
  IF _anon IS NOT NULL THEN
    RAISE EXCEPTION '481: anon still holds % on allocation_rows', _anon;
  END IF;

  -- 6c. RLS is on and the four policies exist.
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.allocation_rows'::regclass) THEN
    RAISE EXCEPTION '481: row level security is not enabled on allocation_rows';
  END IF;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.allocation_rows'::regclass) <> 4 THEN
    RAISE EXCEPTION '481: expected exactly 4 policies on allocation_rows';
  END IF;

  RAISE NOTICE '481 OK: allocation_rows created; % person FKs, all registered; anon has nothing',
    _fks;
END
$do$;
