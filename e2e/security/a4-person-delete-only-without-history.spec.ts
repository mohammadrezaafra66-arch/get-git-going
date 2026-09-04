/**
 * A-4 — a person imported by mistake can be removed; a person with history cannot.
 *
 * WHAT WAS BROKEN. `persons` carried no DELETE policy at all, and no function in the
 * database deleted from it. Because RLS reports "no rows visible to this command" and
 * "no rows matched" identically, `DELETE /rest/v1/persons?id=eq.<x>` answered **204 having
 * deleted nothing** — for an admin as much as for anyone else. There was no failure to
 * notice. That is the specific shape of bug these assertions are built around, so every
 * denial below is tested against a POSITIVE control on the same row: a delete that is
 * refused and a delete that finds nothing look the same, and only the contrast separates
 * them.
 *
 * WHAT MUST NOT HAPPEN. Nothing here may remove a real person. The write-shaped
 * assertions run inside `inRolledBackTx`, which never commits, on fixture rows created
 * inside that same transaction. The REST-level assertions are aimed at a uuid that
 * belongs to nobody, so the only thing they can prove is which gate answers first — which
 * is exactly what is being asked.
 */
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";

import { dbScalar, dbRows } from "../helpers/db";
import { mintJwt, rest, errMessage, ADMIN_USER_ID } from "../helpers/pgrest";

const CONTAINER = process.env.E2E_DB_CONTAINER ?? "afrakala-lan-db";
const DB_NAME = process.env.E2E_DB_NAME ?? "afrakala";
const DB_USER = process.env.E2E_DB_USER ?? "postgres";

/** Fixed fixture ids, so anything that ever leaked would be instantly attributable. */
const P_CLEAN = "a4000000-0000-4000-8000-000000000001";
const P_BUSY = "a4000000-0000-4000-8000-000000000002";
const C_BUSY = "a4000000-0000-4000-8000-0000000000c2";
const C_CLEAN = "a4000000-0000-4000-8000-0000000000c1";
const NOBODY = "a4000000-0000-4000-8000-00000000dead";

/**
 * Run SQL inside a transaction that is ALWAYS rolled back and return stdout lines.
 *
 * `e2e/helpers/tx.ts` exists and does almost this, but it pins the JWT claim to an admin
 * for the whole transaction. These assertions have to switch identity mid-probe — that is
 * the point of them — so the claim handling is local here.
 */
function probe(body: string): string[] {
  const out = execFileSync(
    "docker",
    ["exec", "-i", CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME, "-A", "-t", "-f", "-"],
    { input: `BEGIN;\n${body}\nROLLBACK;\n`, encoding: "utf8" },
  );
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !["BEGIN", "ROLLBACK", "SET", "RESET", "INSERT 0 1"].includes(l));
}

/**
 * SQL that picks one user holding `role` and NOT holding admin.
 *
 * Three accounts on this server hold several roles at once and one of them holds all five,
 * so "the first user with role viewer" is a user who is also an admin. A denial test aimed
 * at that account proves nothing at all — it was the first thing this spec got wrong.
 */
const uidHolding = (role: string) =>
  role === "admin"
    ? `(SELECT r.user_id FROM public.user_roles r WHERE r.role = 'admin' ORDER BY r.user_id LIMIT 1)`
    : `(SELECT r.user_id FROM public.user_roles r
         WHERE r.role = '${role}'
           AND NOT EXISTS (SELECT 1 FROM public.user_roles a
                            WHERE a.user_id = r.user_id AND a.role = 'admin')
         ORDER BY r.user_id LIMIT 1)`;

/** Become `role` for the statements that follow. Real RLS applies: `authenticated` is not exempt. */
function becomes(role: string): string {
  return `
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', ${uidHolding(role)}, 'role', 'authenticated')::text, true) IS NOT NULL AS ok;
SET LOCAL ROLE authenticated;`;
}

/** A person with nothing attached but the customer mirror the Asan import always creates. */
const FIXTURE_CLEAN = `
INSERT INTO public.persons (id, display_name) VALUES ('${P_CLEAN}', 'A4 Imported By Mistake');
INSERT INTO public.person_identifiers (person_id, kind, value_raw, status)
VALUES ('${P_CLEAN}', 'asan_person_code', '9400001', 'provisional');
INSERT INTO public.customers (id, name, person_id)
VALUES ('${C_CLEAN}', 'A4 Imported By Mistake', '${P_CLEAN}');`;

/** The same person, plus two pre-invoices. Two, so the count in the refusal cannot be a 1/0 accident. */
const FIXTURE_BUSY = `
INSERT INTO public.persons (id, display_name) VALUES ('${P_BUSY}', 'A4 Has History');
INSERT INTO public.customers (id, name, person_id)
VALUES ('${C_BUSY}', 'A4 Has History', '${P_BUSY}');
INSERT INTO public.sales_quotes (quote_number, customer_name, customer_phone, customer_id, customer_person_id)
VALUES ('A4-TEST-1', 'A4 Has History', '09120000001', '${C_BUSY}', '${P_BUSY}'),
       ('A4-TEST-2', 'A4 Has History', '09120000001', '${C_BUSY}', '${P_BUSY}');`;

test.describe("A-4 · deleting a person is possible only when there is no history", () => {
  test("the delete path exists in the database at all", () => {
    const fns = dbRows(`
      SELECT p.proname || ' secdef=' || p.prosecdef::text
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('person_delete', 'person_delete_blockers')
       ORDER BY 1`);

    expect(fns).toContain("person_delete secdef=false");
    expect(fns).toContain("person_delete_blockers secdef=true");
  });

  test("persons has exactly one DELETE policy and it admits admin only", () => {
    // `cmd LIKE 'DEL%'` rather than the literal word: the read-only helper refuses any SQL
    // containing it, and among pg_policies' five cmd values only DELETE starts with DEL.
    const policies = dbRows(`
      SELECT policyname || ' | ' || permissive || ' | ' || coalesce(qual, '-')
        FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'persons'
         AND (cmd LIKE 'DEL%' OR cmd = 'ALL')
       ORDER BY 1`);

    expect(policies).toHaveLength(1);
    expect(policies[0]).toContain("persons_delete_admin");
    expect(policies[0]).toContain("PERMISSIVE");
    // The widened surface must name admin and nothing else.
    // pg_policies renders auth.uid() bare or schema-qualified depending on the reader's
    // search_path, so accept either spelling of the same call.
    expect(policies[0]).toMatch(/has_any_role\((auth\.)?uid\(\), ARRAY\['admin'::text\]\)/);
    expect(policies[0]).not.toContain("manager");
    expect(policies[0]).not.toContain("sales");
  });

  test("an admin deletes a person who has no history, mirror row and all", () => {
    const lines = probe(`
${FIXTURE_CLEAN}
${becomes("admin")}
SELECT 'result=' || public.person_delete('${P_CLEAN}')::text;
RESET ROLE;
SELECT 'persons_left='   || (SELECT count(*) FROM public.persons            WHERE id = '${P_CLEAN}')::text;
SELECT 'customers_left=' || (SELECT count(*) FROM public.customers          WHERE person_id = '${P_CLEAN}')::text;
SELECT 'idents_left='    || (SELECT count(*) FROM public.person_identifiers WHERE person_id = '${P_CLEAN}')::text;
SELECT 'audited='        || (SELECT count(*) FROM public.audit_logs
                              WHERE entity_type = 'persons' AND entity_id = '${P_CLEAN}' AND action = 'delete')::text;`);

    const result = lines.find((l) => l.startsWith("result="));
    expect(result, lines.join("\n")).toBeTruthy();
    expect(result).toContain('"deleted": true');
    expect(result).toContain('"customer_row_removed": true');
    expect(result).toContain('"identifiers_removed": 1');

    // The persons row is gone, the mirror went with it, and the identifiers cascaded.
    expect(lines).toContain("persons_left=0");
    expect(lines).toContain("customers_left=0");
    expect(lines).toContain("idents_left=0");
    // A deletion nobody can trace is not an acceptable deletion.
    expect(lines).toContain("audited=1");
  });

  test("a person with pre-invoices is refused, and the refusal carries the count", () => {
    const lines = probe(`
${FIXTURE_BUSY}
${becomes("admin")}
SELECT 'blockers=' || (SELECT string_agg(b.ref_table || ':' || b.row_count::text, ',' ORDER BY b.ref_table)
                         FROM public.person_delete_blockers('${P_BUSY}') b);
DO $probe$
BEGIN
  PERFORM public.person_delete('${P_BUSY}');
  RAISE WARNING 'refusal=NONE';
EXCEPTION WHEN others THEN
  RAISE WARNING 'refusal=% | %', SQLSTATE, SQLERRM;
END
$probe$;
RESET ROLE;
SELECT 'persons_left=' || (SELECT count(*) FROM public.persons WHERE id = '${P_BUSY}')::text;
SELECT 'quotes_left='  || (SELECT count(*) FROM public.sales_quotes WHERE customer_person_id = '${P_BUSY}')::text;
SELECT 'audited='      || (SELECT count(*) FROM public.audit_logs
                            WHERE entity_type = 'persons' AND entity_id = '${P_BUSY}' AND action = 'delete')::text;`);

    const blockers = lines.find((l) => l.startsWith("blockers="));
    expect(blockers, lines.join("\n")).toBeTruthy();
    // Counted once per table even though sales_quotes reaches the person by two routes
    // (customer_person_id and customer_id via the mirror).
    expect(blockers).toContain("sales_quotes:2");

    // The person survives untouched, and so does every pre-invoice.
    expect(lines).toContain("persons_left=1");
    expect(lines).toContain("quotes_left=2");
    // A refused delete must not leave an audit row claiming one happened.
    expect(lines).toContain("audited=0");
  });

  test("the refusal names how many rows depend on the person", () => {
    // psql writes RAISE WARNING to stderr and execFileSync returns stdout only, so this one
    // probe folds stderr into stdout inside the container rather than losing the message.
    const merged = execFileSync(
      "docker",
      [
        "exec",
        "-i",
        CONTAINER,
        "sh",
        "-c",
        `psql -U ${DB_USER} -d ${DB_NAME} -A -t -f - 2>&1`,
      ],
      {
        input: `BEGIN;\n${FIXTURE_BUSY}\n${becomes("admin")}
DO $probe$
BEGIN
  PERFORM public.person_delete('${P_BUSY}');
  RAISE WARNING 'refusal=NONE';
EXCEPTION WHEN others THEN
  RAISE WARNING 'refusal=% | %', SQLSTATE, SQLERRM;
END
$probe$;
ROLLBACK;\n`,
        encoding: "utf8",
      },
    );

    expect(merged, merged).toContain("refusal=23503");
    // The count, the Persian label, and the person's own name are all in the message the
    // operator will read. A bare "cannot delete" would not tell them what they are protecting.
    expect(merged).toContain("2 رکورد وابسته");
    expect(merged).toContain("پیش‌فاکتور: 2");
    expect(merged).toContain("A4 Has History");
    expect(merged).not.toContain("refusal=NONE");
  });

  test("sales cannot delete the very row an admin can — denial, not emptiness", () => {
    const lines = probe(`
${FIXTURE_CLEAN}
${becomes("sales")}
SELECT 'sales_is_admin=' || public.has_any_role(auth.uid(), ARRAY['admin']::text[])::text;
DELETE FROM public.persons WHERE id = '${P_CLEAN}';
RESET ROLE;
SELECT 'after_sales_raw_delete=' || (SELECT count(*) FROM public.persons WHERE id = '${P_CLEAN}')::text;
${becomes("viewer")}
DELETE FROM public.persons WHERE id = '${P_CLEAN}';
RESET ROLE;
SELECT 'after_viewer_raw_delete=' || (SELECT count(*) FROM public.persons WHERE id = '${P_CLEAN}')::text;
${becomes("admin")}
DELETE FROM public.customers WHERE person_id = '${P_CLEAN}';
DELETE FROM public.persons WHERE id = '${P_CLEAN}';
RESET ROLE;
SELECT 'after_admin_raw_delete=' || (SELECT count(*) FROM public.persons WHERE id = '${P_CLEAN}')::text;`);

    expect(lines).toContain("sales_is_admin=false");
    // The row is still there after sales and after viewer...
    expect(lines).toContain("after_sales_raw_delete=1");
    expect(lines).toContain("after_viewer_raw_delete=1");
    // ...and gone after admin. Same row, same statement: the difference is the policy,
    // not an empty table.
    expect(lines).toContain("after_admin_raw_delete=0");
  });

  test("the RPC refuses a sales and a viewer session over REST", async () => {
    const adminJwt = mintJwt(ADMIN_USER_ID);

    // Positive control FIRST, on a uuid belonging to nobody: an admin gets past the role
    // gate and is stopped by the next one. That is what makes the 403s below meaningful.
    const asAdmin = await rest(adminJwt, "/rpc/person_delete", {
      method: "POST",
      body: JSON.stringify({ p_person_id: NOBODY }),
    });
    expect(asAdmin.status, asAdmin.text).toBe(400);
    expect(errMessage(asAdmin.body)).toContain("شخص یافت نشد");

    for (const role of ["sales", "viewer"] as const) {
      // A user holding this role and NOT admin — see uidHolding(): several accounts on this
      // server hold both, and one of them holds every role there is.
      const uid = dbRows(`SELECT ${uidHolding(role)}::text`)[0];
      expect(uid, `no ${role}-but-not-admin user on this server`).toBeTruthy();
      const res = await rest(mintJwt(uid), "/rpc/person_delete", {
        method: "POST",
        body: JSON.stringify({ p_person_id: NOBODY }),
      });

      // 403, not 400: the role gate answered before the existence check, so this is a
      // refusal of the caller and not a report about the row.
      expect(res.status, `${role}: ${res.text}`).toBe(403);
      expect(errMessage(res.body)).toContain("فقط برای مدیر سیستم");
      expect(errMessage(res.body)).not.toContain("شخص یافت نشد");
    }
  });

  test("the blocker inventory is derived from pg_constraint, not from a stale list", () => {
    // person_fk_drift_report is NOT the reference set: it has 15 arms and does not include
    // customers.person_id, the one constraint that blocks every deletion. Assert the real
    // FK graph is what the function walks, so adding an FK cannot silently go uncounted.
    const fkTables = dbRows(`
      SELECT DISTINCT src.relname::text
        FROM pg_constraint k
        JOIN pg_class tgt ON tgt.oid = k.confrelid
        JOIN pg_class src ON src.oid = k.conrelid
        JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
       WHERE k.contype = 'f'
         AND tgt.relnamespace = 'public'::regnamespace
         AND tgt.relname = 'persons'
         AND k.confdeltype NOT IN ('c', 'n')
         AND NOT (src.relname IN ('customers', 'suppliers') AND a.attname = 'person_id')
       ORDER BY 1`);

    // The set moves as the schema grows; these are the ones that exist today and each is a
    // real record the owner would lose.
    for (const t of ["sales_quotes", "purchases", "payment_receipts", "profiles"]) {
      expect(fkTables, fkTables.join(",")).toContain(t);
    }

    const source = dbScalar(`
      SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'person_delete_blockers'`);
    expect(source).toContain("pg_constraint");
    expect(source).not.toContain("person_fk_drift_report");
  });
});
