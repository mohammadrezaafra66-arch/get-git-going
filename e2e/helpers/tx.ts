/**
 * OG-46 option (b) — per-spec isolated fixtures.
 *
 * THE PROBLEM THIS SOLVES. Mission 11 measured the cost of shared fixtures precisely: ONE
 * teardown that died left its whole fixture behind, and the residue moved the baseline of SEVEN
 * unrelated specs — two that assert `max+1` against a high-water mark got a number lower than
 * the mark they had just read. Isolation is what stops a single bad cleanup becoming a
 * suite-wide event.
 *
 * WHY A TRANSACTION AND NOT A SEED/TEARDOWN PAIR. `test-data/seed-full-scenario.sql` and its
 * teardown exist and work, but they COMMIT — so between them the rows are visible to anything
 * else touching the database, and if the teardown ever fails the residue is permanent. More
 * decisively: RULE 12 and the owner's Phase 8 condition (c) forbid a gate leaving a POSTED
 * document, and `create_receipt` / `create_payment` / `create_dual_document` all post and write
 * an immutable journal entry. Both the receipt DELETE and the journal DELETE are then refused
 * («سند ثبت‌شده فقط با سند برگشتی اصلاح می‌شود»), so a committed fixture that creates one can
 * never be cleaned up. That is how OG-56's pair and OG-76's receipt came to exist.
 *
 * **A transaction that never commits creates nothing.** The assertions run INSIDE it, where the
 * rows genuinely exist, and the rollback is not a cleanup step that can fail — it is the absence
 * of the step that would have made the rows real.
 *
 * WHAT IT CANNOT DO, stated rather than implied: it cannot drive the browser. A UI click runs in
 * its own connection and cannot join this transaction. So a spec using this asserts the
 * DATABASE-side loop — RPC in, rows and balances out — and says so. Checklist item 8.2 asks for
 * "through the UI"; the honest split is that the loop is verified here and the UI is verified by
 * the existing UI specs, neither pretending to be the other.
 */
import { execFileSync } from "node:child_process";

const CONTAINER = process.env.E2E_DB_CONTAINER ?? "afrakala-lan-db";
const DB_NAME = process.env.E2E_DB_NAME ?? "afrakala";
const DB_USER = process.env.E2E_DB_USER ?? "postgres";

/** Admin JWT claim, as a statement. Most privileged RPCs raise without one. */
export const AS_ADMIN_CLAIM = `
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', (SELECT (array_agg(user_id ORDER BY user_id))[1]
                                FROM public.user_roles WHERE role = 'admin'),
                      'role', 'authenticated')::text, true);`;

/**
 * Run `body` inside a transaction that is ALWAYS rolled back, and return the lines it printed.
 *
 * `body` should collect its findings into the temp table `probe(line text)`, which is created
 * for it, and they are SELECTed before the rollback. Results travel on STDOUT rather than
 * through `RAISE NOTICE`, because psql writes notices to STDERR and `execFileSync` returns only
 * STDOUT — a probe that reported through notices once handed back the string "BEGIN" and its
 * assertion failed for a reason unrelated to the code under test.
 */
export function inRolledBackTx(body: string, opts?: { asAdmin?: boolean }): string[] {
  const sql = `
BEGIN;
${opts?.asAdmin === false ? "" : AS_ADMIN_CLAIM}
CREATE TEMP TABLE probe(line text) ON COMMIT DROP;
${body}
SELECT line FROM probe;
ROLLBACK;
`;
  const out = execFileSync(
    "docker",
    [
      "exec",
      "-i",
      CONTAINER,
      "psql",
      "-U",
      DB_USER,
      "-d",
      DB_NAME,
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-f",
      "-",
    ],
    { input: sql, encoding: "utf8" },
  );
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 && l !== "BEGIN" && l !== "ROLLBACK" && l !== "SET" && l !== "t" && l !== "f",
    );
}

/**
 * The seeded scenario, as SQL to embed inside `inRolledBackTx`. It mirrors
 * `test-data/seed-full-scenario.sql` but is deliberately MINIMAL: one customer with an Asan
 * code, one without, one supplier, one bank account, one cash box.
 *
 * The ids carry the same fixed prefixes the seed file uses, so anything that leaks is instantly
 * attributable — but nothing can leak, because the caller never commits.
 *
 * `accounting_code` values are in the 9xxx range for the same reason the seed file's are: '8'
 * collides with a live bank account, and `ON CONFLICT (id)` does not forgive a conflict on a
 * different unique index.
 */
export const SCENARIO = `
INSERT INTO public.bank_accounts (id, title, bank_name, account_type, accounting_code, currency, is_active, opening_balance)
VALUES ('aaaaaaaa-0000-4000-8000-000000000001','P8 Bank','Mellat','bank','9101','IRR',true,0),
       ('aaaaaaaa-0000-4000-8000-000000000002','P8 Cash','Cash','cash','9102','IRR',true,0);

-- Only (id, display_name). kind, visibility_scope and is_active are NOT NULL but all carry
-- defaults, and there is no person_type column at all. The working seed file uses this shape.
-- NOTE: no backticks anywhere inside this template literal -- a backtick terminates it, which
-- is a TypeScript syntax error that stops the whole spec from loading.
INSERT INTO public.persons (id, display_name)
VALUES ('bbbbbbbb-0000-4000-8000-000000000001','P8 With Code'),
       ('bbbbbbbb-0000-4000-8000-000000000002','P8 Without Code'),
       ('bbbbbbbb-0000-4000-8000-000000000003','P8 Supplier');

INSERT INTO public.person_identifiers (person_id, kind, value_raw, status)
VALUES ('bbbbbbbb-0000-4000-8000-000000000001','asan_person_code','910001','provisional'),
       ('bbbbbbbb-0000-4000-8000-000000000003','asan_person_code','910003','provisional');

INSERT INTO public.customers (id, name, person_id)
VALUES ('cccccccc-0000-4000-8000-000000000001','P8 Customer With Code','bbbbbbbb-0000-4000-8000-000000000001'),
       ('cccccccc-0000-4000-8000-000000000002','P8 Customer No Code','bbbbbbbb-0000-4000-8000-000000000002');

INSERT INTO public.suppliers (id, name, person_id)
VALUES ('dddddddd-0000-4000-8000-000000000003','P8 Supplier','bbbbbbbb-0000-4000-8000-000000000003');
`;

export const IDS = {
  bank: "aaaaaaaa-0000-4000-8000-000000000001",
  cash: "aaaaaaaa-0000-4000-8000-000000000002",
  customerWithCode: "cccccccc-0000-4000-8000-000000000001",
  customerNoCode: "cccccccc-0000-4000-8000-000000000002",
  supplier: "dddddddd-0000-4000-8000-000000000003",
} as const;

/** Record one finding into the probe table from inside a DO block. */
export const say = (expr: string) => `INSERT INTO probe VALUES (${expr});`;
