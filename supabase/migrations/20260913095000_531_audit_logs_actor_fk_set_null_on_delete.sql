SET client_encoding='UTF8';

-- 531 — deleting a user no longer blocks on their own audit history.
--
-- WHAT WAS WRONG. `audit_logs_actor_id_fkey` (audit_logs.actor_id -> auth.users.id) had
-- no ON DELETE action, i.e. NO ACTION (confdeltype = 'a'): deleting a user who had ever
-- performed an audited action raised a foreign-key violation and the delete failed.
--
-- WHY ON DELETE SET NULL IS SAFE HERE. `audit_logs.actor_id` IS NULLABLE — verified
-- directly against `information_schema.columns` on the restored production snapshot
-- (prod_rehearsal_e2, ledger 681 / 20260912150000): `is_nullable = 'YES'`. This
-- contradicts an earlier assumption that the column was NOT NULL; it is not. An audit
-- row exists to record that an action happened; it does not need to keep the actor's
-- row alive to remain meaningful. Setting `actor_id` to NULL on delete preserves the
-- row (entity_type, entity_id, action, diff, created_at all survive untouched) while
-- letting user deletion proceed.
--
-- WHAT CHANGES. Only the FK's delete action. No column, no trigger, no RLS policy,
-- no other constraint touched.
--
-- CATALOGUE-DRIVEN, NOT A BARE DROP/ADD — added after the first version shipped in PR #441.
-- The original body was `DROP CONSTRAINT audit_logs_actor_id_fkey` with no `IF EXISTS`,
-- followed by `ADD CONSTRAINT ... ON DELETE SET NULL`. On the shape this was written
-- against (production, restored as prod_rehearsal_e2) that is safe: the constraint exists
-- there today. But a bare DROP CONSTRAINT aborts the whole migration on any shape where the
-- constraint is already absent — `ERROR: constraint "audit_logs_actor_id_fkey" of relation
-- "audit_logs" does not exist` — which is exactly the failure class that stopped migration
-- 477 on 2026-09-12 and cost ten hours, and exactly the situation E-4's `rehearse.ps1`
-- replays migrations into. So this now reads `pg_constraint` first (the same
-- `to_regclass`/check-before-acting pattern as 523/524/525) and picks the action that gets
-- to the same end state — `audit_logs_actor_id_fkey` present with `ON DELETE SET NULL` —
-- from whichever starting shape it finds:
--   * constraint absent           -> CREATE it fresh with ON DELETE SET NULL
--   * constraint present, wrong   -> DROP and re-ADD with ON DELETE SET NULL
--   * constraint present, already -> no-op (re-running this migration a second time lands
--     ON DELETE SET NULL              here, and did even before this rewrite — verified)
-- No case raises. A verification block re-reads the catalogue afterward and RAISEs only if
-- the end state was not reached, rather than trusting the DDL's own "ALTER TABLE" echo.

DO $fix531$
DECLARE
  v_deltype "char";
BEGIN
  IF to_regclass('public.audit_logs') IS NULL THEN
    RAISE NOTICE '531: public.audit_logs is absent — skipped (this is not an error)';
    RETURN;
  END IF;

  SELECT c.confdeltype INTO v_deltype
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = 'public'
     AND t.relname = 'audit_logs'
     AND c.conname = 'audit_logs_actor_id_fkey';

  IF v_deltype IS NULL THEN
    RAISE NOTICE '531: audit_logs_actor_id_fkey is absent — creating it fresh with ON DELETE SET NULL';
    ALTER TABLE public.audit_logs
      ADD CONSTRAINT audit_logs_actor_id_fkey
      FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  ELSIF v_deltype = 'n' THEN
    RAISE NOTICE '531: audit_logs_actor_id_fkey is already ON DELETE SET NULL — no change';
  ELSE
    RAISE NOTICE '531: audit_logs_actor_id_fkey delete action was % — replacing with ON DELETE SET NULL', v_deltype;
    ALTER TABLE public.audit_logs
      DROP CONSTRAINT audit_logs_actor_id_fkey;
    ALTER TABLE public.audit_logs
      ADD CONSTRAINT audit_logs_actor_id_fkey
      FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END
$fix531$;

-- Verification in the SAME transaction, re-read from the catalogue rather than trusting the
-- ALTER TABLE statements' own echo (PostgreSQL prints "ALTER TABLE" whether or not the delete
-- action actually changed).
DO $verify531$
DECLARE
  v_deltype "char";
BEGIN
  IF to_regclass('public.audit_logs') IS NULL THEN
    RAISE NOTICE '531 VERIFY: public.audit_logs is absent — nothing to verify';
    RETURN;
  END IF;

  SELECT c.confdeltype INTO v_deltype
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
   WHERE n.nspname = 'public'
     AND t.relname = 'audit_logs'
     AND c.conname = 'audit_logs_actor_id_fkey';

  IF v_deltype IS DISTINCT FROM 'n' THEN
    RAISE EXCEPTION '531 VERIFY: audit_logs_actor_id_fkey is not ON DELETE SET NULL (confdeltype=%)', v_deltype;
  END IF;

  RAISE NOTICE '531 VERIFY: audit_logs_actor_id_fkey is ON DELETE SET NULL';
END
$verify531$;
