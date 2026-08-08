-- 315: seed `role_permissions` for the three modules that had no row at all.
--
-- WHY THIS IS A SECURITY FIX, NOT A UX FIX
--
-- `has_dynamic_permission` (live definition read before writing this file) only
-- consults `role_permissions` when a row exists for the caller's role AND the
-- module. When the module has no row for any of the caller's roles it falls
-- through to a legacy fallback that is *wider* than anything the UI enforces:
--
--     view                      -> admin, manager, accountant, sales, viewer
--     create / update           -> admin, manager
--     delete                    -> admin
--     approve / export / sens.  -> admin, manager, accountant
--
-- So an unseeded module is an open door, not a closed one — the same rule
-- migration 291 records for `asan-export`. Three modules were still unseeded:
-- `accounting`, `hr` and `market-rates`.
--
-- WHAT THE ROWS SAY, AND WHY EXACTLY THAT
--
-- The rows below reproduce the client-side static matrix in
-- `src/lib/rbac/roles.ts` (PERMISSIONS) **exactly**, extended to all seven
-- roles with an explicit `false` for the roles that matrix omits. That is a
-- deliberate choice: the static matrix is what actually governs the menu and
-- the route guards today (`hasPermissionEx` prefers a DB row and only falls
-- back to the matrix when none exists), so mirroring it changes zero observed
-- behaviour while closing the wider SQL fallback above. It also makes these
-- three modules governable from `/admin/roles`, which is the point — until now
-- an administrator could not change them without a code change and a redeploy.
--
-- The four base actions come straight from PERMISSIONS. The three extended
-- actions have no entry in that matrix, so they come from the client fallback
-- constants in the same file (APPROVE_FALLBACK = admin/manager,
-- EXPORT_FALLBACK = SENSITIVE_FALLBACK = admin/manager/accountant),
-- intersected with the roles that can actually view the module. The
-- intersection is a narrowing only, never a widening, and it removes the
-- incoherent case of a role allowed to export a module it cannot open.
--
-- `hr.can_create` is granted to all five system roles, including `viewer`,
-- which cannot view the module. The system-wide audit flagged that as a
-- possible mistake. It is not: the module's one feature is the daily mood
-- entry, and the rule that actually enforces it is RLS on
-- `daily_mood_entries` — policy `user can insert own entry today`,
-- `(uid() = user_id AND mood_date = CURRENT_DATE)`, with no role test at
-- all. Every authenticated employee may file their own entry; only
-- `is_hr_manager` may read everyone's. So `PERMISSIONS.hr.create =
-- ALL_ROLES` is a faithful description of the live rule, and narrowing it to
-- admin/manager here would make this table contradict the policy that
-- actually governs — the exact drift this migration exists to remove.
-- Seeding it also makes it visible and switchable in `/admin/roles` instead
-- of frozen in a TypeScript literal.
--
-- NOT SEEDED, ON PURPOSE: `bank`, `customers`, `cheques`
--
-- These three were named alongside the others as having zero rows. That is
-- true, but they have zero rows because they are not module keys anywhere in
-- this system: they are absent from the `ModuleKey` union in
-- `src/lib/rbac/roles.ts`, from every `module:` entry in
-- `src/lib/navigation/registry.ts`, from the `MODULES` list that drives
-- `/admin/roles`, and from every RLS policy and function that calls
-- `has_dynamic_permission` (verified live against `pg_policies` and
-- `pg_proc`). Nothing can ever ask about them, so a row would be dead data
-- that misreports the system as governed. The bank pages resolve to module
-- `accounting`, which this migration does seed.
--
-- Idempotent: re-running inserts nothing (NOT EXISTS guard per role+module).
-- Rollback: docs/verification/315-down.sql
SET client_encoding='UTF8';

-- ---------------------------------------------------------------- accounting --
-- 11 navigation entries, all in the `finance` group. Every route guard is
-- requireAnyRole(["admin","manager","accountant"]) or the narrower
-- ["admin","accountant"], so no other role has any business here.
INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name, 'accounting',
       r.role_name IN ('admin','manager','accountant'),   -- view
       r.role_name IN ('admin','manager','accountant'),   -- create
       r.role_name IN ('admin','manager','accountant'),   -- update
       r.role_name = 'admin',                             -- delete
       r.role_name IN ('admin','manager'),                -- approve
       r.role_name IN ('admin','manager','accountant'),   -- export
       r.role_name IN ('admin','manager','accountant')    -- sensitive: money
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
 WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions rp
                    WHERE rp.role_name = r.role_name AND rp.module = 'accounting');

-- ------------------------------------------------------------------------ hr --
-- One consumer: /operations/daily-mood/admin, which checks
-- hasPermissionEx(roles,'hr','view') and is additionally `adminOnly` in the
-- registry (admin or manager). See the note above on can_create.
INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name, 'hr',
       r.role_name IN ('admin','manager'),                                    -- view
       r.role_name IN ('admin','manager','sales','accountant','viewer'),      -- create (ALL_ROLES, preserved)
       r.role_name IN ('admin','manager'),                                    -- update
       r.role_name = 'admin',                                                 -- delete
       r.role_name IN ('admin','manager'),                                    -- approve
       r.role_name IN ('admin','manager'),                                    -- export
       r.role_name IN ('admin','manager')                                     -- sensitive
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
 WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions rp
                    WHERE rp.role_name = r.role_name AND rp.module = 'hr');

-- -------------------------------------------------------------- market-rates --
-- One consumer: /pricing/market-rates-workshop, guarded by
-- requirePermission("market-rates","view"). Note the registry also marks that
-- entry `adminOnly`, so the menu shows it to admin/manager only while the
-- guard admits accountant and sales by direct URL. That drift is pre-existing
-- and is reported, not silently resolved here: narrowing `view` to match the
-- menu would remove access an accountant has today, which is a product
-- decision rather than a hygiene one.
INSERT INTO public.role_permissions
  (role_name, module, can_view, can_create, can_update, can_delete, can_approve, can_export, can_view_sensitive)
SELECT r.role_name, 'market-rates',
       r.role_name IN ('admin','manager','accountant','sales'),  -- view
       r.role_name IN ('admin','manager','accountant'),          -- create
       r.role_name IN ('admin','manager','accountant'),          -- update
       r.role_name = 'admin',                                    -- delete
       r.role_name IN ('admin','manager'),                       -- approve
       r.role_name IN ('admin','manager','accountant'),          -- export
       r.role_name IN ('admin','manager','accountant')           -- sensitive
  FROM (SELECT DISTINCT role_name FROM public.role_permissions) r
 WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions rp
                    WHERE rp.role_name = r.role_name AND rp.module = 'market-rates');

-- --------------------------------------------------------------------- gate ----
-- Bit-exact, not "roughly right": for every (module, action) the set of roles
-- holding true must equal the intended set. A count check would pass if two
-- roles were swapped, which is precisely how a permission seed goes wrong.
DO $chk$
DECLARE
  spec    record;
  actual  text[];
  n       integer;
  roles   integer;
BEGIN
  SELECT count(DISTINCT role_name) INTO roles FROM public.role_permissions;

  FOR spec IN
    SELECT * FROM (VALUES
      ('accounting',  'can_view',           ARRAY['accountant','admin','manager']),
      ('accounting',  'can_create',         ARRAY['accountant','admin','manager']),
      ('accounting',  'can_update',         ARRAY['accountant','admin','manager']),
      ('accounting',  'can_delete',         ARRAY['admin']),
      ('accounting',  'can_approve',        ARRAY['admin','manager']),
      ('accounting',  'can_export',         ARRAY['accountant','admin','manager']),
      ('accounting',  'can_view_sensitive', ARRAY['accountant','admin','manager']),
      ('hr',          'can_view',           ARRAY['admin','manager']),
      ('hr',          'can_create',         ARRAY['accountant','admin','manager','sales','viewer']),
      ('hr',          'can_update',         ARRAY['admin','manager']),
      ('hr',          'can_delete',         ARRAY['admin']),
      ('hr',          'can_approve',        ARRAY['admin','manager']),
      ('hr',          'can_export',         ARRAY['admin','manager']),
      ('hr',          'can_view_sensitive', ARRAY['admin','manager']),
      ('market-rates','can_view',           ARRAY['accountant','admin','manager','sales']),
      ('market-rates','can_create',         ARRAY['accountant','admin','manager']),
      ('market-rates','can_update',         ARRAY['accountant','admin','manager']),
      ('market-rates','can_delete',         ARRAY['admin']),
      ('market-rates','can_approve',        ARRAY['admin','manager']),
      ('market-rates','can_export',         ARRAY['accountant','admin','manager']),
      ('market-rates','can_view_sensitive', ARRAY['accountant','admin','manager'])
    ) AS t(module, col, expected)
  LOOP
    -- every role must have a row, or a missing row silently reopens the fallback
    SELECT count(*) INTO n
      FROM public.role_permissions WHERE module = spec.module;
    IF n <> roles THEN
      RAISE EXCEPTION 'module % must have a row for all % roles, found %',
        spec.module, roles, n;
    END IF;

    EXECUTE format(
      'SELECT coalesce(array_agg(role_name ORDER BY role_name), ARRAY[]::text[])
         FROM public.role_permissions WHERE module = $1 AND %I', spec.col)
      INTO actual USING spec.module;

    IF actual <> spec.expected THEN
      RAISE EXCEPTION '%.% granted to % but should be %',
        spec.module, spec.col, actual, spec.expected;
    END IF;
  END LOOP;

  -- The three names that are deliberately NOT seeded must stay unseeded, so a
  -- later re-read of this migration cannot quietly disagree with its own note.
  SELECT count(*) INTO n FROM public.role_permissions
   WHERE module IN ('bank','customers','cheques');
  IF n <> 0 THEN
    RAISE EXCEPTION '% rows exist for a module key this system does not define', n;
  END IF;

  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  IF n <> 0 THEN RAISE EXCEPTION '% tables in public have RLS disabled', n; END IF;
END
$chk$;
