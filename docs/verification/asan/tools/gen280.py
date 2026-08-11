import os, sys
sys.stdout.reconfigure(encoding="utf-8")
ROOT = r"D:\AfraKalaTest\app"
PRE = os.path.join(ROOT, "docs/verification/pre-280")


def read(n):
    return open(os.path.join(PRE, n), encoding="utf-8-sig").read().replace("\r\n", "\n").rstrip("\n")


# --- person_merge: drop exactly the one legacy registry entry -------------------
pm_live = read("person_merge.sql")
LEG = "    'customer_capital_allocations.customer_person_id',        'generic',\n"
assert pm_live.count(LEG) == 1
pm_new = pm_live.replace(LEG, "")
assert "customer_capital_allocations." not in pm_new.replace("customer_capital_allocations_dynamic.", "")

# --- person_fk_drift_report: drop exactly the one legacy branch ------------------
fd_live = read("person_fk_drift_report.sql")
lines = fd_live.split("\n")
assert lines[70].strip().startswith("SELECT 'customer_capital_allocations'::text"), lines[70]
assert lines[74].strip() == "UNION ALL", lines[74]
fd_new = "\n".join(lines[:70] + lines[75:])
assert "'customer_capital_allocations'::text" not in fd_new

body = f"""-- 280: remove the legacy capital allocation path.
--
-- Two implementations of the same idea coexisted. The dynamic one
-- (`*_capital_allocations_dynamic`, driven by `daily_capital_settings`) holds 182 + 4 rows
-- and is the only one the application reads. The legacy one
-- (`salesperson_capital_allocations`, `customer_capital_allocations`, driven by
-- `daily_capital_snapshots`) has never held a row -- `save_salesperson_capital_allocations`
-- says so in its own body -- and nothing outside the pair references it.
--
-- Blast radius, taken from live catalogue state before any change:
--   docs/asan/legacy-capital-removal-plan.md
-- Data backup taken before the drop (both tables empty):
--   docs/asan/legacy-capital-data-backup.sql
-- Rollback (rebuilds tables, indexes, policies, triggers and functions):
--   docs/verification/280-down.sql
--
-- `daily_capital_snapshots` and `daily_capital_inputs` are deliberately KEPT: they hold live
-- rows, so rule 3 forbids dropping them, and they are the input/snapshot chain rather than
-- the allocation path.
SET client_encoding='UTF8';

-- 1. a trigger on a surviving table whose whole body writes to the tables being dropped
DROP TRIGGER IF EXISTS trg_archive_prior_allocations ON public.daily_capital_snapshots;

-- 2. capital_allocation_ledger belongs to the DYNAMIC path -- _capital_alloc_used() and the
--    hold/consume/release/refund functions all read it, and v_dynamic_*_capital_balances
--    depend on those. Only its `cal_select_sales` policy still pointed at the legacy tables,
--    which is what blocked the drop. Repointed at the dynamic tables, same shape, same intent:
--    a salesperson may read ledger rows for their own allocations.
DROP POLICY IF EXISTS cal_select_sales ON public.capital_allocation_ledger;
CREATE POLICY cal_select_sales ON public.capital_allocation_ledger
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'sales'::text)
    AND (
      (allocation_kind = 'salesperson'
       AND allocation_id IN (SELECT d.id FROM public.salesperson_capital_allocations_dynamic d
                              WHERE d.salesperson_id = auth.uid()))
      OR
      (allocation_kind = 'customer'
       AND allocation_id IN (SELECT d.id FROM public.customer_capital_allocations_dynamic d
                              WHERE d.salesperson_id = auth.uid()))
    )
  );

-- 3. the tables, child first. Their indexes, policies and triggers go with them.
DROP TABLE IF EXISTS public.customer_capital_allocations;
DROP TABLE IF EXISTS public.salesperson_capital_allocations;

-- 4. the functions that existed only to serve those tables. Verified before dropping:
--    no surviving function calls them and no surviving trigger uses them.
DROP FUNCTION IF EXISTS public.compute_salesperson_capital_allocations(uuid);
DROP FUNCTION IF EXISTS public.compute_customer_capital_allocations(uuid);
DROP FUNCTION IF EXISTS public.save_salesperson_capital_allocations(uuid, jsonb);
DROP FUNCTION IF EXISTS public.save_customer_capital_allocations(uuid, jsonb);
DROP FUNCTION IF EXISTS public._archive_prior_allocations_on_active();
DROP FUNCTION IF EXISTS public._validate_allocation_amounts();
DROP FUNCTION IF EXISTS public.enforce_allocation_not_overridable();
DROP FUNCTION IF EXISTS public.validate_customer_capital_alloc_override();

-- 5. two shared functions keep working, minus their legacy entry. Both are rebuilt from the
--    live pg_get_functiondef output snapshotted in docs/verification/pre-280/, with one
--    registry line and one UNION branch removed and nothing else touched (rule 2.3).
{pm_new};

{fd_new};

DO $chk$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('salesperson_capital_allocations', 'customer_capital_allocations');
  IF n <> 0 THEN RAISE EXCEPTION 'legacy capital tables still present: %', n; END IF;

  SELECT count(*) INTO n FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name IN ('salesperson_capital_allocations_dynamic', 'customer_capital_allocations_dynamic');
  IF n <> 2 THEN RAISE EXCEPTION 'dynamic capital tables missing: %', n; END IF;

  SELECT count(*) INTO n FROM public.salesperson_capital_allocations_dynamic;
  IF n = 0 THEN RAISE EXCEPTION 'dynamic salesperson allocations lost their rows'; END IF;

  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public'
     AND p.proname IN ('compute_salesperson_capital_allocations','compute_customer_capital_allocations',
                       'save_salesperson_capital_allocations','save_customer_capital_allocations',
                       '_archive_prior_allocations_on_active','_validate_allocation_amounts',
                       'enforce_allocation_not_overridable','validate_customer_capital_alloc_override');
  IF n <> 0 THEN RAISE EXCEPTION 'legacy capital functions still present: %', n; END IF;
END
$chk$;
"""

open(os.path.join(ROOT, "supabase/migrations/20260805003000_280_remove_legacy_capital_path.sql"),
     "w", encoding="utf-8", newline="\n").write(body)

# ---- down script ---------------------------------------------------------------
schema = read("legacy-capital-schema.sql")
# strip pg_dump session settings, keep the object DDL
keep = [l for l in schema.split("\n")
        if l.strip() and not l.startswith("--")
        and not l.startswith("SET ")
        and not l.startswith("SELECT pg_catalog.set_config")]
fns = read("legacy-capital-functions.sql")
trg = read("trg_archive_prior_allocations.sql")
# CREATE TRIGGER must come after the functions it calls, and the functions use %ROWTYPE of
# the tables, so the order has to be tables -> functions -> triggers.
tbl_triggers = [l for l in keep if l.startswith("CREATE TRIGGER")]
keep = [l for l in keep if not l.startswith("CREATE TRIGGER")]

down = f"""-- Down script for migration 280. No BEGIN/COMMIT: the caller owns the transaction.
-- Order matters: the tables come first because four of the legacy functions declare
-- %ROWTYPE variables over them, and the triggers come last because they call those
-- functions. Both tables were empty, so there is no data to restore
-- (docs/asan/legacy-capital-data-backup.sql).
SET client_encoding='UTF8';

{chr(10).join(keep)}

{fns}

{chr(10).join(tbl_triggers)}

{trg}

DROP POLICY IF EXISTS cal_select_sales ON public.capital_allocation_ledger;
CREATE POLICY cal_select_sales ON public.capital_allocation_ledger
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'sales'::text)
    AND (
      (allocation_kind = 'salesperson'
       AND allocation_id IN (SELECT s.id FROM public.salesperson_capital_allocations s
                              WHERE s.salesperson_id = auth.uid()))
      OR
      (allocation_kind = 'customer'
       AND allocation_id IN (SELECT c.id FROM public.customer_capital_allocations c
                              WHERE c.salesperson_id = auth.uid()))
    )
  );

{pm_live};

{fd_live};
"""
open(os.path.join(ROOT, "docs/verification/280-down.sql"), "w", encoding="utf-8", newline="\n").write(down)
print("written")
