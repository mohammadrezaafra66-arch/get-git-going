SET client_encoding='UTF8';

-- ============================================================================================
-- 536 · Security-3 / S-5 — ai_providers gets an `updated_by` column (E-6 scope, mission
-- "AfraKala Convergence"). Source: docs/research/convergence/R-5-security-inventory.md,
-- section "S-5 · ai_providers columns".
--
-- Confirmed absent, live, on prod_rehearsal_e6 (information_schema.columns for
-- public.ai_providers): id, name, label, kind, base_url, is_active, priority, chat_model,
-- embed_model, vision_model, capabilities, secret_id, key_prefix, notes, created_at,
-- updated_at, created_by -- no updated_by, and no later ALTER TABLE anywhere on disk. Migration
-- 475 (20260906130000_475_audit_ai_routing_changes.sql:114-116) already says so explicitly:
-- "ai_providers has NO updated_by -- only created_by."
--
-- ── What this adds ─────────────────────────────────────────────────────────────────────────
-- A plain `updated_by uuid` column (no FK -- matching the sibling `created_by uuid` column on
-- this same table, which also carries no FK constraint; confirmed live via pg_constraint on
-- prod_rehearsal_e6 returning zero rows for ai_providers), set by a new BEFORE UPDATE trigger
-- from auth.uid(). Not backfilled: there is no reliable prior actor for existing rows, and a
-- fabricated one would be worse than NULL.
--
-- ── The decision the brief asked for: what auth.uid() being NULL means ────────────────────────
-- A cron job or a service-role write carries no JWT, so auth.uid() is NULL inside it (this is
-- the exact mechanism migration 507's header documents for a different pair of functions).
-- Writing NULL in that case is CORRECT, not a gap: NULL means "no authenticated human editor
-- for this write" and is checkable (`updated_by IS NULL`). The alternative -- attributing such a
-- write to some fixed placeholder actor, or to whichever admin happens to run a manual script --
-- would be actively misleading: it would put a specific person's id on a change they did not
-- make. No provider-editing cron job exists today (grep over src/server and supabase/functions
-- for "admin_upsert_ai_provider\|admin_delete_ai_provider\|ai_providers" outside the RPCs
-- themselves and the 475 trigger finds none), so in practice this trigger will almost always
-- see a real auth.uid(); NULL is the deliberate, documented answer for the day one doesn't.
--
-- ── Why a new trigger function, not touching admin_upsert_ai_provider/admin_delete_ai_provider ──
-- Both RPCs already run as the authenticated admin's own auth.uid() context (SECURITY DEFINER,
-- but auth.uid() still reads the caller's JWT claim, not the function owner) and neither UPDATEs
-- nor needs to change to populate this column -- a BEFORE UPDATE trigger on the table catches
-- every UPDATE regardless of path (RPC, future admin RPC, or a direct SQL edit), the same
-- reasoning migration 475 used for the audit trigger. This also means task 536 does not touch
-- migration 535's functions or 153's, keeping each migration's diff to exactly what it says it
-- does.
--
-- ── 507 rule: a new trigger function carries its own REVOKE in the same file ─────────────────
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default (confirmed live by migration 521's
-- measurement of an identical trigger function: proacl showed
-- {postgres=X,authenticated=X,service_role=X} with no explicit GRANT written anywhere -- the
-- source is ALTER DEFAULT PRIVILEGES on schema public). Not exploitable -- Postgres refuses a
-- direct call to a function returning `trigger` ("trigger functions can only be called as
-- triggers") -- but least-privilege means the row should not exist, so it is revoked below and
-- the ACL is MEASURED after, not just trusted (the same lesson 521 exists to teach).
-- ============================================================================================

-- No explicit BEGIN/COMMIT here: this file is always applied with --single-transaction
-- (rule 2), which already wraps everything below in one transaction. An explicit COMMIT
-- inside the file would commit that outer transaction early and leave the verification DO
-- block below running in autocommit mode -- exactly the partial-apply failure mode rule 2
-- exists to prevent. (Caught in rehearsal: the first apply attempt did exactly this.)

ALTER TABLE public.ai_providers
  ADD COLUMN IF NOT EXISTS updated_by uuid;

COMMENT ON COLUMN public.ai_providers.updated_by IS
  '535/536: auth.uid() of the last authenticated editor, set by trg_ai_providers_set_updated_by. '
  'NULL means no JWT was present for the write (service-role/cron), not "unknown" -- see 536 header.';

CREATE OR REPLACE FUNCTION public.set_ai_providers_updated_by()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- NULL when the write carries no JWT (service-role/cron) -- deliberate, see 536 header.
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_ai_providers_updated_by() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_ai_providers_updated_by() FROM anon;
REVOKE ALL ON FUNCTION public.set_ai_providers_updated_by() FROM authenticated;

CREATE OR REPLACE TRIGGER trg_ai_providers_set_updated_by
  BEFORE UPDATE ON public.ai_providers
  FOR EACH ROW EXECUTE FUNCTION public.set_ai_providers_updated_by();

-- ── Post-apply verification: measure, do not trust ────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_providers' AND column_name = 'updated_by'
  ) THEN
    RAISE EXCEPTION '536: ai_providers.updated_by was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.ai_providers'::regclass
      AND tgname = 'trg_ai_providers_set_updated_by'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION '536: trg_ai_providers_set_updated_by is missing';
  END IF;

  IF has_function_privilege('anon', 'public.set_ai_providers_updated_by()', 'EXECUTE')
   OR has_function_privilege('authenticated', 'public.set_ai_providers_updated_by()', 'EXECUTE')
  THEN
    RAISE EXCEPTION '536: set_ai_providers_updated_by is still directly callable by anon/authenticated';
  END IF;
END $$;

-- Ledger: this migration does NOT record its own row. The operator's `mig_apply` writes
-- supabase_migrations.schema_migrations and expects `INSERT 0 1` as the proof that the row
-- is new (CLAUDE.md rule 2b). A self-insert here made that step report a duplicate-key
-- ERROR on a clean gate restore, which on the owner-typed production run is a stop
-- condition. Removed 2026-09-12 by the Stage 2 gate; see docs/missions/convergence/
-- INTEGRATION-LOG.md, "Step 3 - gate finding G-1".
