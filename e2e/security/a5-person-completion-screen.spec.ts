/**
 * A-5a — the admin screen that completes a half-imported person, and what it must not become.
 *
 * WHY A SCREEN AND NOT ANOTHER IMPORT. `asan_commit_person_batch` matches a spreadsheet row
 * to an existing person by an identifier that row already carries, and its identifier inserts
 * are additive (`WHERE NOT EXISTS`). So re-importing genuinely does complete anybody holding
 * one of the two identifiers. It cannot help the people holding NEITHER: there is nothing to
 * match on, so a re-import creates a duplicate person rather than completing the existing one.
 * Those are the people this screen is for, and the first assertion below measures how many of
 * them there are rather than trusting the number in a brief.
 *
 * WHAT THESE ASSERTIONS ARE. Two kinds, and the split is deliberate.
 *
 *   SOURCE-LEVEL — that the page is guarded, registered consistently, and writes through the
 *   identifier path that already exists instead of a private one of its own. These are the
 *   properties a second developer would break by accident, and they are checkable without a
 *   browser. The app at 192.168.170.8:3100 runs `staging`; this branch is not deployed there
 *   and deploying it is not this agent's to do, so a browser test of the page itself would
 *   assert against code that is not the code under test. Saying so is more useful than a
 *   green test that proves nothing. The page's own rendering is a REMAINING MANUAL STEP.
 *
 *   DATABASE-LEVEL — that the write the page performs actually lands: the same INSERT shape
 *   `createPersonIdentifier` sends, normalised by the trigger, mirrored into
 *   `customers.accounting_code`, and refused for a role that must not have it. That half is
 *   the real behaviour and it is testable here, inside a transaction that never commits.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";

import { dbScalar, dbRows } from "../helpers/db";

const CONTAINER = process.env.E2E_DB_CONTAINER ?? "afrakala-lan-db";
const DB_NAME = process.env.E2E_DB_NAME ?? "afrakala";
const DB_USER = process.env.E2E_DB_USER ?? "postgres";

const ROUTE_FILE = path.join(process.cwd(), "src/routes/_app.admin.persons-cleanup.tsx");
const REGISTRY = path.join(process.cwd(), "src/lib/navigation/registry.ts");
const MODULES = path.join(process.cwd(), "src/components/layout/primary-modules.ts");
const ROUTE_TREE = path.join(process.cwd(), "src/routeTree.gen.ts");
const ROUTE_PATH = "/admin/persons-cleanup";

const read = (p: string) => readFileSync(p, "utf8");

const P_HALF = "a5000000-0000-4000-8000-000000000001";
const C_HALF = "a5000000-0000-4000-8000-0000000000c1";

/** A person with a customer mirror and no identifiers at all — one of the unmatchable ones. */
const FIXTURE = `
INSERT INTO public.persons (id, display_name) VALUES ('${P_HALF}', 'A5 Neither Code Nor Mobile');
INSERT INTO public.customers (id, name, person_id)
VALUES ('${C_HALF}', 'A5 Neither Code Nor Mobile', '${P_HALF}');`;

const uidHolding = (role: string) =>
  role === "admin"
    ? `(SELECT r.user_id FROM public.user_roles r WHERE r.role = 'admin' ORDER BY r.user_id LIMIT 1)`
    : `(SELECT r.user_id FROM public.user_roles r
         WHERE r.role = '${role}'
           AND NOT EXISTS (SELECT 1 FROM public.user_roles a
                            WHERE a.user_id = r.user_id AND a.role = 'admin')
         ORDER BY r.user_id LIMIT 1)`;

function becomes(role: string): string {
  return `
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', ${uidHolding(role)}, 'role', 'authenticated')::text, true) IS NOT NULL AS ok;
SET LOCAL ROLE authenticated;`;
}

/** Rolled-back probe, stderr folded in so a RAISE is visible. */
function probe(body: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "sh", "-c", `psql -U ${DB_USER} -d ${DB_NAME} -A -t -f - 2>&1`],
    { input: `BEGIN;\n${body}\nROLLBACK;\n`, encoding: "utf8" },
  );
}

test.describe("A-5a · completing a person the Asan import left half-finished", () => {
  test("the people this screen exists for are the ones a re-import cannot reach", () => {
    // Four buckets. Only the first three can ever be completed by re-importing, because only
    // they carry something to match on.
    const buckets = dbRows(`
      WITH ident AS (
        SELECT p.id,
          EXISTS (SELECT 1 FROM public.person_identifiers i
                   WHERE i.person_id = p.id AND i.kind = 'asan_person_code'
                     AND i.status <> 'revoked') AS has_code,
          EXISTS (SELECT 1 FROM public.person_identifiers i
                   WHERE i.person_id = p.id AND i.kind = 'mobile_e164'
                     AND i.status <> 'revoked') AS has_mobile
          FROM public.persons p
      ),
      bucketed AS (
        SELECT CASE WHEN has_code AND has_mobile THEN 'both'
                    WHEN has_code               THEN 'code_only'
                    WHEN has_mobile             THEN 'mobile_only'
                    ELSE 'neither' END AS bucket
          FROM ident
      )
      SELECT bucket || '=' || count(*)::text
        FROM bucketed GROUP BY bucket ORDER BY bucket`);

    const n = (k: string) =>
      Number(buckets.find((b) => b.startsWith(`${k}=`))?.split("=")[1] ?? "0");

    // The number moves as people are completed; what must hold is that the unmatchable
    // bucket is real. If it ever reaches zero the screen has done its job and this
    // assertion is the thing that will say so.
    expect(n("neither"), buckets.join(" ")).toBeGreaterThan(0);
    // Sanity: the buckets partition the population.
    const total = Number(dbScalar("SELECT count(*)::text FROM public.persons"));
    expect(n("both") + n("code_only") + n("mobile_only") + n("neither")).toBe(total);
  });

  test("both missing identifiers are the ones the transaction gates actually demand", () => {
    // The screen collects exactly two things. This is why: one gate reads the Asan code,
    // the other reads the phone, and between them they block every money document.
    const requireAsan = dbScalar(`
      SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'require_asan_code'`);
    expect(requireAsan).toContain("asan_person_code");

    const quote = dbScalar(`
      SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'create_sales_quote_with_items'`);
    expect(quote).toContain("شماره تماس مشتری الزامی است");
  });

  test("the route exists and is guarded to admin, and the menu says the same thing", () => {
    const src = read(ROUTE_FILE);
    expect(src).toContain(`createFileRoute("/_app/admin/persons-cleanup")`);
    expect(src).toContain(`requireAnyRole(["admin"])`);

    const registry = read(REGISTRY);
    expect(registry).toContain(`to: "${ROUTE_PATH}"`);
    // A link wider than the guard sends people to /unauthorized; narrower hides a page they
    // are allowed to open. The two must be the same set, and here that set is exactly admin.
    expect(registry).toContain(`"${ROUTE_PATH}": ["admin"]`);
    // `adminOnly` reads "admin or manager" in this registry, which is not the guard above.
    const seed = registry.slice(registry.indexOf(`to: "${ROUTE_PATH}"`));
    expect(seed.slice(0, seed.indexOf("},"))).not.toContain("adminOnly");

    // Not listed here, the page never appears in the sidebar: itemsForModule matches paths
    // exactly, not by prefix.
    expect(read(MODULES)).toContain(`"${ROUTE_PATH}"`);
    // Generated, but tracked — a route missing from it has no route in a real build.
    expect(read(ROUTE_TREE)).toContain(ROUTE_PATH);
  });

  test("the screen reuses the identifier path instead of opening a second one", () => {
    const src = read(ROUTE_FILE);

    // Writes go through the server function the person edit page already uses, so
    // normalisation, the cross-person duplicate check and the Persian errors stay shared.
    expect(src).toContain("createPersonIdentifier");
    expect(src).toContain("@/lib/persons/identifiers.functions");
    // ...and NOT through a private insert of its own.
    expect(src).not.toMatch(/from\(\s*["']person_identifiers["']\s*\)[\s\S]{0,200}?\.insert\(/);
    // value_normalized belongs to the trigger, so the page may READ it but must never SEND
    // one: a client that computes its own will drift from normalize_identifier.
    expect(src).toContain("value_normalized"); // read back, to display the stored value
    expect(src).not.toMatch(/data:\s*\{[\s\S]{0,400}?value_normalized/);

    // Deletion goes through the RPC that counts first — never a raw delete on either table.
    expect(src).toContain("person_delete_blockers");
    expect(src).toContain('"person_delete"');
    expect(src).not.toMatch(/from\(\s*["'](persons|customers)["']\s*\)[\s\S]{0,200}?\.delete\(/);
  });

  test("filling in the two identifiers completes the person, normalised and mirrored", () => {
    // Exactly the insert createPersonIdentifier sends: no value_normalized, because the
    // trigger owns it. The raw values are deliberately awkward — Persian digits, a leading
    // zero, an 0912 prefix — so the assertions measure normalisation rather than echo.
    const out = probe(`
${FIXTURE}
${becomes("admin")}
INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
VALUES ('${P_HALF}', 'asan_person_code', '0950012', 'confirmed', true),
       ('${P_HALF}', 'mobile_e164', '۰۹۵۰۳۳۳۴۴۵۵', 'confirmed', true);
RESET ROLE;
SELECT 'code=' || (SELECT value_normalized FROM public.person_identifiers
                    WHERE person_id = '${P_HALF}' AND kind = 'asan_person_code');
SELECT 'mobile=' || (SELECT value_normalized FROM public.person_identifiers
                      WHERE person_id = '${P_HALF}' AND kind = 'mobile_e164');
SELECT 'accounting_code=' || coalesce((SELECT accounting_code FROM public.customers
                                        WHERE person_id = '${P_HALF}'), 'NULL');`);

    // Leading zeros stripped, so '0950012' and '950012' cannot become two codes for two people.
    expect(out, out).toContain("code=950012");
    // Persian digits folded, 0912 rewritten to +98.
    expect(out).toContain("mobile=+989503334455");
    // trg_person_identifiers_propagate_asan_code carried the code into the customer mirror,
    // which is what the Asan export reads. Completing the person here completes the export.
    expect(out).toContain("accounting_code=0950012");
  });

  test("a viewer cannot write an identifier where an admin can — denial, not emptiness", () => {
    const out = probe(`
${FIXTURE}
${becomes("viewer")}
DO $p$
BEGIN
  INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
  VALUES ('${P_HALF}', 'asan_person_code', '9500001', 'confirmed', true);
  RAISE WARNING 'viewer=WROTE';
EXCEPTION WHEN others THEN
  RAISE WARNING 'viewer=%', SQLSTATE;
END
$p$;
RESET ROLE;
SELECT 'after_viewer=' || (SELECT count(*) FROM public.person_identifiers
                            WHERE person_id = '${P_HALF}')::text;
${becomes("admin")}
INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
VALUES ('${P_HALF}', 'asan_person_code', '9500001', 'confirmed', true);
RESET ROLE;
SELECT 'after_admin=' || (SELECT count(*) FROM public.person_identifiers
                           WHERE person_id = '${P_HALF}')::text;`);

    // 42501 — refused by RLS, not silently dropped.
    expect(out, out).toContain("viewer=42501");
    expect(out).not.toContain("viewer=WROTE");
    expect(out).toContain("after_viewer=0");
    // The same statement, the same row, one role later: this is what makes the zero above
    // a refusal rather than an empty table.
    expect(out).toContain("after_admin=1");
  });
});
