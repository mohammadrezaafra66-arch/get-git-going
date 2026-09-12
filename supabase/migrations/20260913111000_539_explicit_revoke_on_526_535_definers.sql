SET client_encoding='UTF8';

-- ============================================================================================
-- 539 - the seven SECURITY DEFINER objects created by 526 and 535 stop depending on a DEFAULT
--
-- ── WHAT WAS FOUND ───────────────────────────────────────────────────────────────────────────
-- Migrations 526 and 535 install seven SECURITY DEFINER objects between them and neither file
-- contains a single REVOKE or GRANT statement (grep -c -i for a leading REVOKE returns 0 in
-- both). Measured on prod_rehearsal_fix (prod13.dump, 681 ledger rows, top 20260912150000)
-- with all twelve release migrations applied:
--
--   obj                                     secdef  anon  authenticated  service_role
--   create_purchase(15 args)                  t      f         t              t
--   get_payables_list(8 args)                 t      f         t              t
--   upsert_staff_daily_performance_metric(8)  t      f         t              t
--   asan_list_bank_deposit_export(date,date)  t      f         t              t
--   delete_bot_api_key_secure(uuid,text)      t      f         t              t
--   admin_upsert_ai_provider(13 args)         t      f         t              t
--   admin_delete_ai_provider(uuid)            t      f         t              t
--
-- proacl on all seven has the shape
--   supabase_admin=X/supabase_admin | postgres=X/supabase_admin |
--   authenticated=X/supabase_admin | service_role=X/supabase_admin
-- with NO bare "=X/..." entry, i.e. PUBLIC holds nothing today.
--
-- anon and PUBLIC are therefore already closed -- but not by anything in 526 or 535. The
-- closure comes from migration 393's global FUNCTIONS default privilege for schema public.
-- That is the defect this migration repairs: a security property that lives in a DEFAULT rather
-- than in a statement is one ALTER DEFAULT PRIVILEGES away from silently reopening, and it is
-- re-derived from scratch every time an object is recreated.
--
-- asan_list_bank_deposit_export is the sharp case. 526 line 1026 is a DROP FUNCTION followed by
-- CREATE (the RETURNS TABLE column list gained an 11th column, so CREATE OR REPLACE is illegal).
-- DROP discards the ACL outright, so this object's entire closure is whatever the default
-- happened to be at apply time. 526's own comment at line 1011 says exactly that and treats it
-- as sufficient. It is not sufficient; it is merely true today.
--
-- ── WHAT THIS MIGRATION DELIBERATELY DOES *NOT* DO, AND WHY ──────────────────────────────────
-- It does NOT revoke EXECUTE from authenticated. That was asked for, and it is refused here with
-- evidence, because on this database it would take down seven working, guarded features.
--
-- 507's rule is narrower than "every SECURITY DEFINER object". 507's own header states the
-- scope: "Any future cron-only definer function must carry these REVOKEs in the same migration
-- that creates it", and it justified its revokes with "grep -rn over src/ and server/ finds ZERO
-- callers of either name, so no UI, hook or server route regresses."
--
-- e2e/security/og61-anon-cannot-reach-definer-writers.spec.ts encodes the same criterion as a
-- two-sided gate. Its CLOSED_TO_AUTHENTICATED map is introduced with: "Every name here has NO
-- direct caller in src/ or server/ -- only the generated src/integrations/supabase/types.ts --
-- and reaches its real callers (triggers, nested SECURITY DEFINER calls, or the service-role
-- client) as the function OWNER." Its OPEN half asserts that names outside that map MUST remain
-- reachable by authenticated.
--
-- All seven targets fail that criterion in the opposite direction -- they are browser RPCs with
-- real callers:
--   create_purchase                        src/hooks/purchase/useCreatePurchase.ts
--   get_payables_list                      src/routes/_app.accounting.payables.tsx
--   upsert_staff_daily_performance_metric  src/routes/_app.gamification.admin.manual-metrics.tsx
--   asan_list_bank_deposit_export          src/lib/asan/export-bank-deposit.ts
--   delete_bot_api_key_secure              src/routes/_app.bot-api-keys.index.tsx
--   admin_upsert_ai_provider               src/lib/ai/providers.functions.ts
--   admin_delete_ai_provider               src/lib/ai/providers.functions.ts
--
-- And all seven carry their own in-body authorization check, which is what og61 recognises as
-- authorization standing in place of a grant:
--   create_purchase                        has_any_role(_uid, ARRAY['admin','manager'])
--   get_payables_list                      has_any_role(auth.uid(), ARRAY['admin','manager','accountant'])
--   upsert_staff_daily_performance_metric  has_any_role(v_uid, ARRAY['admin','manager','accountant'])
--   asan_list_bank_deposit_export          has_any_role(auth.uid(), ARRAY['admin','accountant'])
--   admin_upsert_ai_provider / _delete_    admin-only check in body
--   delete_bot_api_key_secure              NOT EXISTS (SELECT 1 FROM public.user_roles
--                                            WHERE user_id = v_user_id
--                                              AND (role='admin' OR role=v_managed_role))
--                                          -> RAISE 'UNAUTHORIZED'. This is a user_roles
--                                          membership test rather than a has_any_role() call,
--                                          so a regex looking only for has_any_role misses it
--                                          and reports this function as unguarded. It is not.
--
-- Revoking authenticated here would be migration 395's mistake repeated seven times. 395 revoked
-- EXECUTE on 28 definer functions and took the internal products-pricing API offline through a
-- grant path its own gate did not enumerate; 405 had to repair it. The difference is that 395's
-- breakage stayed invisible until an API went dark, whereas this one would be immediate and
-- total: purchase creation, the payables list, the ASAN bank-deposit export, manual staff
-- metrics, bot-key deletion and both AI-provider admin screens would all return 42501.
--
-- So this migration makes the anon and PUBLIC closure explicit -- the part that is actually
-- load-bearing and is currently only inherited -- and re-asserts the positive grants, so that
-- the ACL of all seven is fully determined by statements in a migration rather than by a
-- default. Whether authenticated should additionally be revoked is a product decision (should a
-- viewer be able to attempt these calls and be refused in-body, or be refused by the grant?)
-- and it is escalated to the owner, not decided here.
--
-- ── SHAPE ────────────────────────────────────────────────────────────────────────────────────
-- Catalogue-driven throughout: every target is resolved with to_regprocedure and skipped if
-- absent, every role with a pg_roles lookup, and FUNCTION vs PROCEDURE is read from pg_proc
-- rather than assumed. Applying this to a database missing any of the seven is a documented
-- no-op, never an abort (the failure mode that broke migration 477).
--
-- This migration does NOT write supabase_migrations.schema_migrations -- the operator's ledger
-- step does, and expects INSERT 0 1.
-- ============================================================================================

-- The seven, by full signature, defined once and re-read by each block below. Enumerated rather
-- than derived: a migration that recomputed its own target set from "every SECURITY DEFINER
-- object in public" would silently widen to whatever else lands in the schema later, which is
-- precisely how 395 over-reached.
CREATE OR REPLACE FUNCTION pg_temp._m539_targets()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $fn$
  SELECT ARRAY[
    'public.create_purchase(uuid,uuid,numeric,text,integer,date,uuid,numeric,uuid,text,uuid,numeric,boolean,text,text)',
    'public.get_payables_list(date,date,uuid,text,text,integer,integer,boolean)',
    'public.upsert_staff_daily_performance_metric(uuid,date,numeric,numeric,integer,integer,integer,text)',
    'public.asan_list_bank_deposit_export(date,date)',
    'public.delete_bot_api_key_secure(uuid,text)',
    'public.admin_upsert_ai_provider(uuid,text,text,text,text,boolean,integer,text,text,text,text[],text,text)',
    'public.admin_delete_ai_provider(uuid)'
  ];
$fn$;

DO $$
DECLARE
  v_sig     text;
  v_oid     oid;
  v_kind    text;
  v_present int := 0;
  v_absent  text[] := '{}';
BEGIN
  FOREACH v_sig IN ARRAY pg_temp._m539_targets() LOOP
    v_oid := to_regprocedure(v_sig);

    IF v_oid IS NULL THEN
      v_absent := v_absent || v_sig;
      CONTINUE;
    END IF;

    v_present := v_present + 1;

    -- PROCEDURE and FUNCTION need different REVOKE/GRANT keywords; read it from the catalogue
    -- rather than assuming, so this keeps working if one of these is ever converted.
    SELECT CASE WHEN p.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END
      INTO v_kind
      FROM pg_proc p
     WHERE p.oid = v_oid;

    -- 1) PUBLIC: always safe, PUBLIC is not a role and always exists.
    EXECUTE format('REVOKE EXECUTE ON %s %s FROM PUBLIC', v_kind, v_oid::regprocedure);

    -- 2) anon: only if the role exists on this cluster.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE EXECUTE ON %s %s FROM anon', v_kind, v_oid::regprocedure);
    END IF;

    -- 3) Re-assert the positive grants these objects already hold, so the ACL no longer depends
    --    on whatever ALTER DEFAULT PRIVILEGES happens to be in force at apply time. This is
    --    effect-preserving: both roles were measured holding EXECUTE on all seven beforehand.
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('GRANT EXECUTE ON %s %s TO authenticated', v_kind, v_oid::regprocedure);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON %s %s TO service_role', v_kind, v_oid::regprocedure);
    END IF;
  END LOOP;

  RAISE NOTICE '539: % of % target(s) present; anon/PUBLIC closed by explicit statement.',
    v_present, array_length(pg_temp._m539_targets(), 1);

  IF array_length(v_absent, 1) IS NOT NULL THEN
    RAISE NOTICE '539: % target(s) absent on this database, skipped (documented no-op): %',
      array_length(v_absent, 1), array_to_string(v_absent, ', ');
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────────────────────
-- GATE A - no target may be reachable by anon or by PUBLIC afterwards.
-- The PUBLIC half is checked against the ACL directly (a bare "=X/grantor" entry) rather than
-- via has_function_privilege, because has_function_privilege('anon', ...) already folds PUBLIC
-- in and would not distinguish "anon holds it" from "PUBLIC holds it".
-- ────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_open text[];
BEGIN
  SELECT array_agg((t.oid::regprocedure)::text ORDER BY (t.oid::regprocedure)::text)
    INTO v_open
    FROM (SELECT to_regprocedure(s) AS oid
            FROM unnest(pg_temp._m539_targets()) AS s) t
   WHERE t.oid IS NOT NULL
     AND (
          (EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
           AND has_function_privilege('anon', t.oid, 'EXECUTE'))
       OR EXISTS (SELECT 1
                    FROM pg_proc p, unnest(COALESCE(p.proacl, '{}'::aclitem[])) AS a
                   WHERE p.oid = t.oid
                     AND a::text ~ '^=[a-zA-Z]*X')
     );

  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION '539 GATE A: still reachable by anon or PUBLIC after the revoke: %',
      array_to_string(v_open, ', ');
  END IF;

  RAISE NOTICE '539 GATE A OK: no target is reachable by anon or PUBLIC.';
END $$;

-- ────────────────────────────────────────────────────────────────────────────────────────────
-- GATE B - the revoke must not have over-reached. This is the 395 -> 405 assertion: a revoke
-- that strips a credentialed path is a worse outcome than the exposure it closed. service_role
-- (the server-side client), authenticated (all seven are browser RPCs, each guarded in-body),
-- and the two superuser/owner roles must all still hold EXECUTE on every present target.
-- ────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_role text;
  v_lost text[];
BEGIN
  FOREACH v_role IN ARRAY ARRAY['service_role','authenticated','postgres','supabase_admin'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role);

    SELECT array_agg((t.oid::regprocedure)::text ORDER BY (t.oid::regprocedure)::text)
      INTO v_lost
      FROM (SELECT to_regprocedure(s) AS oid
              FROM unnest(pg_temp._m539_targets()) AS s) t
     WHERE t.oid IS NOT NULL
       AND NOT has_function_privilege(v_role, t.oid, 'EXECUTE');

    IF v_lost IS NOT NULL THEN
      RAISE EXCEPTION '539 GATE B: role % LOST EXECUTE on: % -- this is the 395 over-reach. '
        'Every one of the seven is called from src/ and is guarded in-body, so removing a '
        'credentialed path here breaks a working feature rather than closing a hole.',
        v_role, array_to_string(v_lost, ', ');
    END IF;
  END LOOP;

  RAISE NOTICE '539 GATE B OK: service_role, authenticated, postgres and supabase_admin all '
    'retain EXECUTE on every present target.';
END $$;

DROP FUNCTION IF EXISTS pg_temp._m539_targets();
