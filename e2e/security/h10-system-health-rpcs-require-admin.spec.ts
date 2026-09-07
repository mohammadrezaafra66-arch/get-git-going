/**
 * H-10 — the three system-health reports are SECURITY DEFINER and must refuse non-admins.
 *
 * WHY THIS EXISTS. `person_fk_drift_report`, `polymorphic_ref_orphan_report` and
 * `validate_journal_entry_balance` were SECURITY DEFINER with no guard at all — no `has_role`,
 * no `auth.uid()`, no `RAISE … 42501`. Because they are definer functions their reads pass
 * straight through `journal_lines` RLS, so any holder of an `authenticated` JWT could POST to
 * `/rest/v1/rpc/validate_journal_entry_balance` with an arbitrary uuid and read per-entry debit
 * and credit totals. The only caller is `_app.admin.system-health`, whose `requireAdmin()` is
 * client-side only (`route-guards.ts:16` returns null when `window` is undefined and
 * `requireAdmin` treats null as a pass), and this project's rules say a client-side guard is
 * never sufficient on its own.
 *
 * A GRANT COULD NOT HAVE FIXED THIS, which is why the check is in the body. PostgREST executes
 * every logged-in user as the `authenticated` Postgres role; `admin` is a row in `user_roles`,
 * not a Postgres role. No REVOKE/GRANT can separate an admin from a salesperson.
 *
 * WHY THE MESSAGE IS MATCHED, not just `42501`. That SQLSTATE is also what RLS and a missing
 * grant raise — a sibling probe once scored green on "permission denied for table probe" while
 * never reaching the guard. Only the message distinguishes them.
 *
 * WHY THE LAST TEST RESTORES THE OLD BODY. These functions are already guarded in the shared
 * test database, so "a non-admin is refused" would pass on any checkout and prove nothing. The
 * final test puts the PRE-FIX body back inside a transaction that is rolled back, and shows the
 * same caller then succeeds. That is the red half, made reproducible rather than asserted.
 *
 * Everything here is read-only and every statement runs inside `BEGIN … ROLLBACK`.
 */
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

const CONTAINER = process.env.E2E_DB_CONTAINER ?? "afrakala-lan-db";
const DB_NAME = process.env.E2E_DB_NAME ?? "afrakala";
const MESSAGE = "دسترسی به گزارش سلامت سامانه فقط برای مدیر سیستم مجاز است.";

const FNS = [
  "person_fk_drift_report",
  "polymorphic_ref_orphan_report",
  "validate_journal_entry_balance",
] as const;

/**
 * Run SQL as `supabase_admin`, which owns these functions — the last test has to replace one and
 * `postgres` (the usual e2e role) is neither owner nor superuser, so it cannot.
 *
 * The password is read from the container's own environment and never appears in the repository,
 * in a command line, or in output. This is the delivery pattern CLAUDE.md prescribes.
 */
function asOwner(sql: string): string[] {
  const out = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      CONTAINER,
      "sh",
      "-c",
      `PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d ${DB_NAME} -A -t -v ON_ERROR_STOP=1 -f -`,
    ],
    { input: sql, encoding: "utf8" },
  );
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !["BEGIN", "ROLLBACK", "SET", "CREATE FUNCTION"].includes(l));
}

/** The body of the probe: call all three as `who`, and report ALLOWED / REFUSED:<message>. */
function callAllThree(who: "sales" | "admin"): string {
  const pick =
    who === "sales"
      ? `SELECT ur.user_id INTO _actor FROM public.user_roles ur
          WHERE ur.role = 'sales'
            AND NOT public.has_any_role(ur.user_id, ARRAY['admin','manager','accountant']::text[])
          ORDER BY ur.user_id LIMIT 1;`
      : `SELECT ur.user_id INTO _actor FROM public.user_roles ur
          WHERE ur.role = 'admin' ORDER BY ur.user_id LIMIT 1;`;
  return `
DO $p$
DECLARE _actor uuid; _n int; _msg text; _res text; _entry uuid;
BEGIN
  ${pick}
  IF _actor IS NULL THEN
    INSERT INTO probe VALUES ('FATAL=no ${who} user exists to test with');
    RETURN;
  END IF;
  SELECT id INTO _entry FROM public.journal_entries LIMIT 1;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _actor, 'role', 'authenticated')::text, true);

  BEGIN
    SELECT count(*) INTO _n FROM public.person_fk_drift_report();
    _res := 'ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT; _res := 'REFUSED:' || _msg;
  END;
  INSERT INTO probe VALUES ('person_fk_drift_report=' || _res);

  BEGIN
    SELECT count(*) INTO _n FROM public.polymorphic_ref_orphan_report();
    _res := 'ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT; _res := 'REFUSED:' || _msg;
  END;
  INSERT INTO probe VALUES ('polymorphic_ref_orphan_report=' || _res);

  BEGIN
    SELECT count(*) INTO _n FROM public.validate_journal_entry_balance(_entry);
    _res := 'ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN
    GET STACKED DIAGNOSTICS _msg = MESSAGE_TEXT; _res := 'REFUSED:' || _msg;
  END;
  INSERT INTO probe VALUES ('validate_journal_entry_balance=' || _res);
END
$p$;`;
}

function outcomes(who: "sales" | "admin", preamble = ""): Record<string, string> {
  const lines = asOwner(`
BEGIN;
CREATE TEMP TABLE probe(line text) ON COMMIT DROP;
${preamble}
${callAllThree(who)}
SELECT line FROM probe;
ROLLBACK;
`);
  const out: Record<string, string> = {};
  for (const l of lines) {
    const i = l.indexOf("=");
    if (i > 0) out[l.slice(0, i)] = l.slice(i + 1);
  }
  return out;
}

test("a plain authenticated caller is refused by all three system-health reports", () => {
  const r = outcomes("sales");
  for (const fn of FNS) {
    expect(r[fn], `${fn} — probe returned ${JSON.stringify(r)}`).toBe(`REFUSED:${MESSAGE}`);
  }
});

test("an admin still gets all three, so the page keeps working", () => {
  const r = outcomes("admin");
  for (const fn of FNS) {
    expect(
      r[fn],
      `${fn} refused an admin — the system-health page is broken. Probe: ${JSON.stringify(r)}`,
    ).toBe("ALLOWED");
  }
});

test("all three carry the same guard, so one red-half demonstration covers the set", () => {
  const rows = asOwner(`
SELECT p.proname || '=' ||
       (pg_get_functiondef(p.oid) LIKE '%42501%'
        AND pg_get_functiondef(p.oid) LIKE '%has_role(auth.uid(), ''admin'')%')::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname IN (${FNS.map((f) => `'${f}'`).join(",")})
 ORDER BY p.proname;`);
  expect(rows.sort()).toEqual(FNS.map((f) => `${f}=true`).sort());
});

test("the refusal comes from the guard — with the pre-fix body restored, the caller succeeds", () => {
  // Restores the ORIGINAL LANGUAGE sql body (no guard) for the duration of a rolled-back
  // transaction. Without this the test above would pass on any checkout, because the shared
  // test database is already migrated.
  const preFix = `
CREATE OR REPLACE FUNCTION public.validate_journal_entry_balance(p_journal_entry_id uuid)
 RETURNS TABLE(total_debit numeric, total_credit numeric, is_balanced boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0),
         COALESCE(SUM(debit),0) = COALESCE(SUM(credit),0) AND COALESCE(SUM(debit),0) > 0
  FROM public.journal_lines WHERE journal_entry_id = p_journal_entry_id;
$f$;`;
  const r = outcomes("sales", preFix);
  expect(
    r["validate_journal_entry_balance"],
    "with the unguarded body restored a non-admin should read journal totals; if it is still " +
      `refused, the tests above are green for some other reason. Probe: ${JSON.stringify(r)}`,
  ).toBe("ALLOWED");
  // and the guarded siblings, untouched by the preamble, still refuse in the same transaction
  expect(r["person_fk_drift_report"]).toBe(`REFUSED:${MESSAGE}`);
});
