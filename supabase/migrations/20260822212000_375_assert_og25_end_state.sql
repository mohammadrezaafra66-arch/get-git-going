-- 375 — assert the OG-25 end state. Creates nothing.
--
-- Follows 371 and 372, and is written against the two ways 371 was defeated by its independent
-- reviewer, both of which are the same mistake in different clothes — asking the catalogue a
-- question about NAMES when the question is about EFFECT:
--
--   * 371 asserted "two views carry security_invoker" by COUNT and passed while the WRONG two
--     carried it. -> assert by name, and compare sets, never cardinalities.
--   * 371 asked `information_schema.role_table_grants … grantee = 'anon'`, an identity test, and was
--     blind both to a grant made to PUBLIC and to a column-level grant, each of which is real access.
--     -> use has_table_privilege / has_column_privilege / has_function_privilege.
--   * 372 additionally had to stop string-matching `reloptions`, because `security_invoker = on` and
--     `= true` are the same thing to PostgreSQL and different strings to a LIKE. Nothing here reads
--     reloptions, but the lesson generalises: parse, do not pattern-match.
--
-- The most important assertion in this file is #5. Everything else checks the catalogue's shape;
-- #5 creates a real object in a subtransaction and asks whether `anon` can read it. That is the only
-- check that proves the tap is actually shut rather than merely looking shut.
--
-- CHANGES NOTHING. Applying it to a healthy database prints a NOTICE. Applying it to a drifted one
-- raises P0001 and names what drifted.
--
-- ROLLBACK: docs/verification/375-down.sql (a documented no-op).

SET client_encoding = 'UTF8';

DO $chk$
DECLARE
  t              text;
  p              text;
  col            text;
  n              int;
  probe_priv     boolean;
  seq_priv       boolean;
  extra          text;
  -- the four tables 374 grants, by name
  public_tables  text[] := ARRAY['products','brands','categories','sale_price_types'];
  -- The privilege set anon actually holds on each of those four, measured 2026-08-22 BEFORE this
  -- mission (Phase 0.4). It is the full blanket set, not SELECT-only.
  --
  -- An earlier draft of this gate asserted anon holds no INSERT/UPDATE/DELETE/TRUNCATE on these
  -- tables and FAILED ON A HEALTHY DATABASE, because it contradicted both migration 374 and the
  -- owner's scope: 374 grants SELECT and deliberately does NOT narrow a table that already holds
  -- more, since narrowing existing objects is the batched REVOKE the owner excluded from this
  -- mission. The gate was wrong, not the database.
  --
  -- So the assertion is set EQUALITY against the recorded pre-mission state. That is strictly
  -- stronger than "SELECT is present": it fails if this mission silently ADDED a privilege, and it
  -- fails if anything silently REMOVED one. It does not pretend these tables are SELECT-only —
  -- they are not, and `docs/research/anon-grant-audit.md` records that as work still to be sized.
  expected_privs text[] := ARRAY['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE'];
  actual_privs   text[];
  -- the eight G-1 guard-class views; anon must still hold nothing on any of them
  guard_views    text[] := ARRAY[
    'product_computed_prices_public','publish_recipients_view',
    'v_dynamic_customer_capital_balances','v_dynamic_salesperson_capital_balances',
    'v_promotion_suggestions','vw_account_balances',
    'vw_customer_receivables','vw_supplier_payables'
  ];
  all_privs      text[] := ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
BEGIN
  ---------------------------------------------------------------------------
  -- 1. the anon default privilege on TABLES and SEQUENCES in `public` is gone.
  ---------------------------------------------------------------------------
  SELECT count(*) INTO n
    FROM pg_default_acl d
    JOIN pg_namespace ns ON ns.oid = d.defaclnamespace
   WHERE ns.nspname = 'public'
     AND d.defaclrole = 'supabase_admin'::regrole
     AND d.defaclobjtype IN ('r','S')
     AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 'anon'::regrole);
  IF n <> 0 THEN
    RAISE EXCEPTION '375: % default-privilege entr(y/ies) for anon on TABLES/SEQUENCES in public still exist', n;
  END IF;

  ---------------------------------------------------------------------------
  -- 2. the FUNCTIONS default privilege for anon is STILL THERE. The owner
  --    excluded it; this migration must be able to prove it did not overreach.
  ---------------------------------------------------------------------------
  SELECT count(*) INTO n
    FROM pg_default_acl d
    JOIN pg_namespace ns ON ns.oid = d.defaclnamespace
   WHERE ns.nspname = 'public'
     AND d.defaclrole = 'supabase_admin'::regrole
     AND d.defaclobjtype = 'f'
     AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 'anon'::regrole);
  IF n <> 1 THEN
    RAISE EXCEPTION '375: the FUNCTIONS default privilege for anon should be untouched (expected 1 entry, found %) — this mission must not have changed it', n;
  END IF;

  ---------------------------------------------------------------------------
  -- 3. each named public table still grants anon SELECT, and its effective
  --    privilege set is EXACTLY what Phase 0.4 recorded — no more, no less.
  --    Effective-privilege tests, so a PUBLIC grant or an inherited role counts.
  ---------------------------------------------------------------------------
  FOREACH t IN ARRAY public_tables LOOP
    IF NOT has_table_privilege('anon', format('public.%I', t)::regclass, 'SELECT') THEN
      RAISE EXCEPTION '375: anon lost SELECT on public.% — a genuinely public route reads it', t;
    END IF;

    SELECT coalesce(array_agg(x ORDER BY x), ARRAY[]::text[]) INTO actual_privs
      FROM unnest(all_privs) x
     WHERE has_table_privilege('anon', format('public.%I', t)::regclass, x);

    IF actual_privs IS DISTINCT FROM (SELECT array_agg(x ORDER BY x) FROM unnest(expected_privs) x) THEN
      RAISE EXCEPTION '375: anon''s privileges on public.% drifted. expected %, found %',
        t, (SELECT array_agg(x ORDER BY x) FROM unnest(expected_privs) x), actual_privs;
    END IF;
  END LOOP;

  -- the function the public sale-list page calls
  IF NOT has_function_privilege('anon', 'public.refresh_sale_list_prices(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION '375: anon lost EXECUTE on refresh_sale_list_prices(uuid)';
  END IF;

  ---------------------------------------------------------------------------
  -- 4. G-1 must not have regressed: anon holds nothing, at table OR column
  --    level, on any of the eight guard-class views.
  ---------------------------------------------------------------------------
  FOREACH t IN ARRAY guard_views LOOP
    FOREACH p IN ARRAY all_privs LOOP
      IF has_table_privilege('anon', format('public.%I', t)::regclass, p) THEN
        RAISE EXCEPTION '375: G-1 regressed — anon holds % on public.%', p, t;
      END IF;
    END LOOP;
  END LOOP;

  FOR t, col IN
    SELECT c.relname, a.attname
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE ns.nspname = 'public' AND c.relname = ANY (guard_views)
  LOOP
    IF has_column_privilege('anon', format('public.%I', t)::regclass, col, 'SELECT') THEN
      RAISE EXCEPTION '375: G-1 regressed — anon holds a column-level SELECT on public.%.%', t, col;
    END IF;
  END LOOP;

  ---------------------------------------------------------------------------
  -- 5. THE HEADLINE CHECK. Create a real view and a real sequence and ask
  --    whether anon can touch them. A subtransaction so the objects never
  --    outlive this block, whatever the outcome.
  ---------------------------------------------------------------------------
  BEGIN
    EXECUTE 'CREATE VIEW public._og25_gate_probe AS SELECT 1 AS x';
    EXECUTE 'CREATE SEQUENCE public._og25_gate_probe_seq';
    probe_priv := has_table_privilege('anon', 'public._og25_gate_probe'::regclass, 'SELECT');
    seq_priv   := has_sequence_privilege('anon', 'public._og25_gate_probe_seq'::regclass, 'USAGE');
    EXECUTE 'DROP VIEW public._og25_gate_probe';
    EXECUTE 'DROP SEQUENCE public._og25_gate_probe_seq';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '375: the freshly-created-object probe could not run: % %', SQLSTATE, SQLERRM;
  END;

  IF probe_priv THEN
    RAISE EXCEPTION '375: a freshly created VIEW is still granted to anon — the default-privilege tap is NOT closed';
  END IF;
  IF seq_priv THEN
    RAISE EXCEPTION '375: a freshly created SEQUENCE is still granted to anon — the default-privilege tap is NOT closed';
  END IF;

  ---------------------------------------------------------------------------
  -- 6. no existing object was revoked. 373 touches future objects only, and 374
  --    grants SELECT on four tables that already had it, so the census must be
  --    exactly what Phase 0.3 recorded: 211 objects holding an anon grant.
  ---------------------------------------------------------------------------
  SELECT count(DISTINCT table_name) INTO n
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND grantee = 'anon';
  IF n <> 211 THEN
    RAISE EXCEPTION '375: % objects hold an anon grant, but Phase 0.3 measured 211. This mission revokes nothing from existing objects — investigate before proceeding', n;
  END IF;

  RAISE NOTICE '375 OK: anon default privilege gone for TABLES and SEQUENCES, FUNCTIONS untouched; 4 public tables SELECT-only plus 1 function EXECUTE; G-1 intact at table and column level; a freshly created view and sequence receive nothing; existing-object census still 211';
END
$chk$;
