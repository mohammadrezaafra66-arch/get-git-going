SET client_encoding='UTF8';

-- =============================================================================
-- 239 — Phase 8.1: person merge RPC + merge log
-- =============================================================================
--
-- WHY
--   Migration 234 built the person_merge_candidates queue but deliberately left
--   merging out of scope: "This table records suspicion, never acts on it."
--   Phase 8 Decision 4 closes that gap — a reviewer must be able to look at a
--   suspected duplicate pair and actually resolve it.
--
--   Merging is also a HARD PREREQUISITE for Phase 8.3 (one person = one
--   customer) and 8.4 (one mobile = one person): both add constraints that
--   existing duplicates would violate, and the only correct way to clear a
--   duplicate is to merge it, not to delete it.
--
-- THE WORK LIST IS READ FROM THE CATALOG, NOT HARDCODED
--   A merge must repoint EVERY column that references persons. A hardcoded list
--   goes stale the moment a future phase adds a person FK, and a missed table
--   is a silent data-loss bug: rows would keep pointing at a deactivated person.
--
--   So person_merge reads pg_constraint at RUNTIME to discover every FK column
--   referencing public.persons, and cross-checks that list against an explicit
--   POLICY REGISTRY (_registry below) that says how each column must be handled.
--   If the catalog contains a column the registry does not name, the function
--   RAISES instead of proceeding. Adding a person FK in a future migration is
--   therefore a deliberate act: the author must also register its merge policy.
--
-- WHY A POST-MERGE VERIFICATION SWEEP
--   This function is SECURITY INVOKER (as specified by the Phase 8 brief), so
--   every UPDATE runs under the caller's RLS. An RLS policy that filters a row
--   out does NOT raise — the UPDATE simply matches nothing. That would leave a
--   dangling reference silently. After all repoints, the function re-scans every
--   column it was responsible for and RAISES if any row still references the
--   loser. A merge either completes fully or aborts.
--
-- WHY THE DERIVED *_person_id COLUMNS CAN BE UPDATED DIRECTLY
--   Phases 5 and 7 made the *_person_id columns derived, maintained by BEFORE
--   triggers. Those triggers are all scoped `BEFORE INSERT OR UPDATE OF
--   <legacy_column>` (verified against pg_get_triggerdef for all 16), so writing
--   the person column alone does not re-fire them and the value sticks. The
--   result stays consistent with person_fk_drift_report() because the identity
--   root (customers/suppliers/external_parties.person_id) is repointed too.
--
-- CARDINALITY IS OUT OF SCOPE ON PURPOSE (guard #7)
--   If BOTH persons own a customer row (or both own a supplier row), merging
--   them would silently combine two sets of balances, credit lines and history.
--   That is a business reconciliation, not an identity fix. The function refuses.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- 1. Merge audit log
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.person_merge_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  winner_id         uuid NOT NULL REFERENCES public.persons(id) ON DELETE RESTRICT,
  loser_id          uuid NOT NULL REFERENCES public.persons(id) ON DELETE RESTRICT,
  reason            text,
  repointed         jsonb NOT NULL DEFAULT '{}'::jsonb,
  identifiers_moved integer NOT NULL DEFAULT 0,
  aliases_moved     integer NOT NULL DEFAULT 0,
  links_moved       integer NOT NULL DEFAULT 0,
  merged_by         uuid,
  merged_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT person_merge_log_distinct CHECK (winner_id <> loser_id)
);

COMMENT ON TABLE public.person_merge_log IS
  'Phase 8.1 (239). One row per executed person merge. The loser is never hard-deleted (its id may appear in audit_logs), so this table is the record of where its data went. ON DELETE RESTRICT on both FKs deliberately prevents a person that took part in a merge from being deleted.';
COMMENT ON COLUMN public.person_merge_log.repointed IS
  'jsonb map of "table.column" -> number of rows repointed from loser to winner.';

CREATE INDEX IF NOT EXISTS person_merge_log_winner_idx ON public.person_merge_log (winner_id);
CREATE INDEX IF NOT EXISTS person_merge_log_loser_idx  ON public.person_merge_log (loser_id);

ALTER TABLE public.person_merge_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS person_merge_log_select_privileged ON public.person_merge_log;
CREATE POLICY person_merge_log_select_privileged ON public.person_merge_log
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]));

DROP POLICY IF EXISTS person_merge_log_insert_privileged ON public.person_merge_log;
CREATE POLICY person_merge_log_insert_privileged ON public.person_merge_log
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]));

-- -----------------------------------------------------------------------------
-- 2. person_merge_candidates: allow the 'dismissed' status
--
--    Migration 234's CHECK allows pending | merged | rejected | not_duplicate.
--    The Phase 8 brief specifies person_merge_dismiss() sets 'dismissed', which
--    that CHECK would reject. Extend it rather than silently substituting a
--    different value — 'dismissed' is what the UI and the brief both name.
-- -----------------------------------------------------------------------------
ALTER TABLE public.person_merge_candidates
  DROP CONSTRAINT IF EXISTS person_merge_candidates_status_check;
ALTER TABLE public.person_merge_candidates
  ADD CONSTRAINT person_merge_candidates_status_check
  CHECK (status = ANY (ARRAY['pending','merged','rejected','not_duplicate','dismissed']));

COMMENT ON COLUMN public.person_merge_candidates.status IS
  'pending | merged | rejected | not_duplicate | dismissed. Only a reviewer moves it off pending. ''dismissed'' (added in Phase 8.1) means a human confirmed the pair is two different people.';

-- -----------------------------------------------------------------------------
-- 2b. DELETE policies on the person child tables
--
--     RLS is enabled on person_identifiers / person_aliases /
--     person_context_links / person_field_values, and each has SELECT, INSERT
--     and UPDATE policies — but NO DELETE policy. Under RLS a missing policy
--     denies silently: a DELETE simply matches zero rows.
--
--     person_merge must delete the loser's duplicate identifiers/aliases/links
--     before moving the rest, otherwise the move hits a unique violation. It
--     runs SECURITY INVOKER, so it needs a real DELETE policy rather than a
--     privilege escalation. Scoped to admin/manager, matching the existing
--     UPDATE policies on the same tables exactly.
--
--     This also closes a pre-existing gap: until now a mistyped identifier
--     could be revoked but never removed by anyone through PostgREST.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS person_identifiers_delete_admin_manager ON public.person_identifiers;
CREATE POLICY person_identifiers_delete_admin_manager ON public.person_identifiers
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]));

DROP POLICY IF EXISTS person_aliases_delete_admin_manager ON public.person_aliases;
CREATE POLICY person_aliases_delete_admin_manager ON public.person_aliases
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]));

DROP POLICY IF EXISTS person_context_links_delete_admin_manager ON public.person_context_links;
CREATE POLICY person_context_links_delete_admin_manager ON public.person_context_links
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]));

DROP POLICY IF EXISTS person_field_values_delete_admin_manager ON public.person_field_values;
CREATE POLICY person_field_values_delete_admin_manager ON public.person_field_values
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]));

-- -----------------------------------------------------------------------------
-- 2c. Column-scoped UPDATE grant on sales_quotes.customer_person_id
--
--     sales_quotes is the ONE person-referencing table where `authenticated`
--     holds no UPDATE grant at all (verified against has_table_privilege for
--     all 25 person-referencing tables — every other one already allows it).
--     That is deliberate: quote edits are supposed to go through SECURITY
--     DEFINER RPCs, not through direct PostgREST writes.
--
--     Its RLS is already correct — sales_quotes_update_privileged restricts
--     UPDATE to admin/manager. Only the table-level GRANT is missing, so a
--     SECURITY INVOKER person_merge fails with "permission denied for table
--     sales_quotes" before RLS is ever consulted.
--
--     The fix is a COLUMN-scoped grant on customer_person_id alone, not a table
--     grant. A reviewer merging two identities gains the ability to repoint a
--     quote's person column and nothing else — not price, not status, not
--     amounts. RLS still limits even that to admin/manager.
--
--     The alternative — making person_merge SECURITY DEFINER — would have let
--     the function bypass RLS on all 25 tables instead of being constrained by
--     it. This is the smaller blast radius.
-- -----------------------------------------------------------------------------
GRANT UPDATE (customer_person_id) ON public.sales_quotes TO authenticated;

-- -----------------------------------------------------------------------------
-- 2d. Two narrow SECURITY DEFINER helpers for the repoint itself
--
-- WHY THESE EXIST (the alternative was worse, twice over)
--   person_merge is SECURITY INVOKER. Four of the person-referencing tables —
--   credit_score_snapshots, customer_capital_allocations_dynamic,
--   customer_credit_ledger and didar_activities — have RLS enabled and NO
--   UPDATE policy whatsoever. That is deliberate: a credit ledger and a score
--   snapshot are append-only, written only by SECURITY DEFINER functions, never
--   editable through PostgREST. The first test run proved the consequence — the
--   merge's verification sweep aborted with "1 row in
--   customer_capital_allocations_dynamic still references the loser".
--
--   Two bad options were rejected:
--     (a) Add UPDATE policies to those four tables. That would make an
--         append-only money ledger client-updatable to buy an identity fix.
--         Not acceptable.
--     (b) Make the whole 300-line person_merge SECURITY DEFINER, so it bypasses
--         RLS on all 25 tables at once.
--
--   Instead the privilege escalation is bounded to these two helpers, and it is
--   bounded by the DATABASE CATALOG, not by a comment: each verifies that
--   (p_table, p_column) is an actual FOREIGN KEY to public.persons before it
--   will touch anything. There is no argument that makes them write an amount,
--   a status or a date — only a column Postgres itself declares to be a person
--   reference. Identifiers are quoted with %I, so the text arguments cannot
--   escape into SQL.
--
--   The counting helper exists for the same reason in reverse: the sweep must
--   see rows that the caller's RLS SELECT policy might hide, or it would report
--   "0 remaining" for a row it simply cannot see.
--
--   Both re-check admin/manager, so they are not a back door when called
--   directly.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._person_merge_assert_person_fk(p_table text, p_column text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.has_any_role(auth.uid(), ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'دسترسی غیرمجاز.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid
                         AND att.attnum = ANY (con.conkey)
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.persons'::regclass
      AND con.conrelid  = ('public.' || quote_ident(p_table))::regclass
      AND att.attname   = p_column
  ) THEN
    RAISE EXCEPTION 'ستون «%.%» کلید خارجی به جدول اشخاص نیست.', p_table, p_column
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public._person_merge_assert_person_fk(text, text) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public._person_merge_repoint(
  p_table text, p_column text, p_winner uuid, p_loser uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _n integer;
BEGIN
  PERFORM public._person_merge_assert_person_fk(p_table, p_column);
  EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', p_table, p_column, p_column)
    USING p_winner, p_loser;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$function$;

COMMENT ON FUNCTION public._person_merge_repoint(text, text, uuid, uuid) IS
  'Phase 8.1 (239). Internal helper for person_merge. Repoints one FK column from the losing person to the winning person. SECURITY DEFINER so it can write append-only tables that have no UPDATE policy (credit ledger, score snapshots), but it refuses any (table, column) that pg_constraint does not report as a foreign key to public.persons, and re-checks admin/manager. Not part of the public API.';

REVOKE ALL ON FUNCTION public._person_merge_repoint(text, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._person_merge_repoint(text, text, uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._person_merge_count_refs(
  p_table text, p_column text, p_person uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _n bigint;
BEGIN
  PERFORM public._person_merge_assert_person_fk(p_table, p_column);
  EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE %I = $1', p_table, p_column)
    INTO _n USING p_person;
  RETURN _n;
END;
$function$;

COMMENT ON FUNCTION public._person_merge_count_refs(text, text, uuid) IS
  'Phase 8.1 (239). Internal helper for person_merge''s post-merge verification sweep. Counts rows still referencing a person, bypassing the caller''s RLS SELECT policies so a hidden row cannot be mistaken for a repointed one. Same catalog and role guards as _person_merge_repoint.';

REVOKE ALL ON FUNCTION public._person_merge_count_refs(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._person_merge_count_refs(text, text, uuid) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. person_merge
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.person_merge(
  p_winner_id uuid,
  p_loser_id  uuid,
  p_reason    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
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

    'credit_requests.customer_person_id',                     'generic',
    'credit_score_snapshots.customer_person_id',              'generic',
    'customer_capital_allocations.customer_person_id',        'generic',
    'customer_capital_allocations_dynamic.customer_person_id','generic',
    'customer_credit_balance.customer_person_id',             'generic',
    'customer_credit_ledger.customer_person_id',              'generic',
    'customer_credit_profile.customer_person_id',             'generic',
    'delivery_receipts.customer_person_id',                   'generic',
    'didar_activities.customer_person_id',                    'generic',
    'invoices.customer_person_id',                            'generic',
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
  'Phase 8.1 (239). Transactionally merges the loser person into the winner: repoints every FK column that references persons (work list read from pg_constraint at runtime and cross-checked against an explicit policy registry), moves identifiers/aliases/context links/field values with de-duplication, keeps the loser display_name as an alias, deactivates the loser and writes a person_merge_log row. Refuses when both sides own a customer or both own a supplier - that is an accounting reconciliation, not an identity merge. Admin/manager only.';

REVOKE ALL ON FUNCTION public.person_merge(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_merge(uuid, uuid, text) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. person_merge_dismiss — for pairs that are genuinely two different people.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.person_merge_dismiss(
  p_candidate_id uuid,
  p_reason       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.person_merge_candidates%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'احراز هویت لازم است.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_any_role(_uid, ARRAY['admin','manager']::text[]) THEN
    RAISE EXCEPTION 'رد کردن پیشنهاد ادغام فقط برای مدیر سیستم یا مدیر مجاز است.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row FROM public.person_merge_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'پیشنهاد ادغام پیدا نشد.' USING ERRCODE = 'P0002';
  END IF;

  IF _row.status <> 'pending' THEN
    RAISE EXCEPTION 'این پیشنهاد قبلاً بررسی شده است (وضعیت فعلی: %).', _row.status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.person_merge_candidates
  SET status      = 'dismissed',
      detail      = COALESCE(detail, '')
                    || CASE WHEN NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL
                            THEN '' ELSE E'\n' || 'دلیل رد: ' || btrim(p_reason) END,
      reviewed_by = _uid,
      reviewed_at = now(),
      updated_at  = now()
  WHERE id = p_candidate_id;

  RETURN jsonb_build_object(
    'candidate_id', p_candidate_id,
    'status',       'dismissed'
  );
END;
$function$;

COMMENT ON FUNCTION public.person_merge_dismiss(uuid, text) IS
  'Phase 8.1 (239). Marks a person_merge_candidates pair as dismissed - a human confirmed the two records are different people. Changes no person data. Admin/manager only.';

REVOKE ALL ON FUNCTION public.person_merge_dismiss(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_merge_dismiss(uuid, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
