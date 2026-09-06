SET client_encoding='UTF8';

-- ============================================================================
-- 496-down: restore the per-row call_logs score recompute exactly as it was.
--
-- Run only if migration 496 must be reversed. This restores the OLD behaviour,
-- including its two known defects (one full score recompute per row, and
-- `EXCEPTION WHEN OTHERS THEN NULL` discarding every error). It is written to be
-- byte-faithful to the live definition read with pg_get_functiondef on 2026-09-06
-- BEFORE 496 was applied -- not to be an improvement.
--
-- Apply the same way as a migration:
--   docker exec -i -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala \
--     -v ON_ERROR_STOP=1 --single-transaction -f - < docs/verification/496-down.sql
--
-- Then remove the ledger row:
--   DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260906200000';
-- (Deleting a ledger row is correct ONLY here, where the schema change is genuinely
-- being undone in the same breath. It is never correct as a way to make
-- og81-migration-ledger-matches-disk pass -- see CLAUDE.md rule 2b.)
-- ============================================================================

SET lock_timeout = '60s';

CREATE OR REPLACE FUNCTION public.recompute_employee_scores_on_call_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _emp uuid;
BEGIN
  IF TG_OP='DELETE' THEN _emp := OLD.employee_id; ELSE _emp := NEW.employee_id; END IF;
  IF _emp IS NOT NULL THEN
    BEGIN
      PERFORM public.calculate_employee_score(_emp);
      INSERT INTO public.employee_score_events(employee_id, event_type, source_table, source_id, payload)
      VALUES (_emp, 'call_'||lower(TG_OP), 'call_logs',
              COALESCE(NEW.id::text, OLD.id::text),
              jsonb_build_object('op', TG_OP));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_call_logs_recompute_employee_score ON public.call_logs;
CREATE TRIGGER trg_call_logs_recompute_employee_score
  AFTER INSERT OR DELETE OR UPDATE ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION public.recompute_employee_scores_on_call_log();

DROP FUNCTION IF EXISTS public.recompute_employee_scores_from_calls(timestamptz);

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.call_logs'::regclass
                    AND tgname = 'trg_call_logs_recompute_employee_score') THEN
    RAISE EXCEPTION '496-down: the per-row trigger was not restored';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public'
                AND p.proname = 'recompute_employee_scores_from_calls') THEN
    RAISE EXCEPTION '496-down: the batch function was not removed';
  END IF;
  RAISE NOTICE '496-down OK: per-row trigger restored, batch function removed';
END
$do$;
