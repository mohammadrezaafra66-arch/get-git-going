/**
 * 454 — the overdue credit gate must read live receivables, not the empty profile table.
 *
 * WHY THIS EXISTS. Two RPCs decided whether a customer was overdue, and both asked
 * `customer_credit_profile.has_overdue`. That table holds **0 rows**, so the answer was
 * always `false` and the gate had never fired once. Measured on 2026-09-05, before 454:
 *
 *     customers: 91          customer_credit_profile: 0 rows
 *     vw_customer_receivables: 7 overdue rows across 3 customers, 978,500,000 rial
 *     mismatches (this spec's first assertion): 3
 *
 * `create_sales_quote_with_items` already raised 'مشتری مانده معوق دارد...' and already
 * demanded an `overdue_salesperson_commitment` exception with a settlement deadline. It was
 * reading a dead sensor. Nothing about the gate was missing except its input.
 *
 * WHY THIS IS ASSERTED AS AN INVARIANT rather than against named customers. Business data on
 * the test server moves under the suite — other missions clear an `accounting_code`, accept a
 * quote, register a receipt. Pinning three customer UUIDs would make this spec a tripwire for
 * unrelated work. The property that 454 actually establishes is an equivalence, and it holds
 * for any data: a customer is refused **exactly when** they hold an overdue receivable.
 *
 * BOTH DIRECTIONS OF THAT EQUIVALENCE ARE LOAD-BEARING, and they fail for opposite reasons:
 *   * refused without an overdue receivable → the gate has become a blanket denial, and every
 *     open-account sale in the company stops;
 *   * an overdue receivable without refusal  → the 2026-09-05 bug is back, and the company
 *     extends credit to customers who already owe it money.
 * `IS DISTINCT FROM` between the two booleans catches both in one count, and a spec that
 * asserted only the second would pass if the first were broken.
 *
 * The structural assertions exist because the behavioural one degenerates: on a day when no
 * customer happens to be overdue, the equivalence holds trivially for a function that always
 * answers "no". They pin the wiring itself, and they cannot degenerate.
 */
import { expect, test } from "@playwright/test";
import { dbRows } from "../helpers/db";
import { ADMIN_USER_ID } from "../helpers/pgrest";

/**
 * `calculate_customer_realtime_credit` requires admin/manager/accountant and reads
 * `auth.uid()`; `vw_customer_receivables` additionally ends in
 * `WHERE auth.uid() IS NOT NULL AND NOT is_viewer_only(auth.uid())`. The db helper connects
 * as `postgres` over the container socket with no JWT, so both would be unreachable. The
 * claim GUC is set in a leading statement of the same session; psql prints one line per
 * statement, so the value under test is the last line.
 */
function asAdmin(sql: string): string {
  const claims = JSON.stringify({ sub: ADMIN_USER_ID, role: "authenticated" });
  const rows = dbRows(
    `select set_config('request.jwt.claims','${claims}',false) is not null as jwt_set; ${sql}`,
  );
  return rows[rows.length - 1] ?? "";
}

test("⛔ a customer is refused for overdue EXACTLY when they hold an overdue receivable", () => {
  const mismatches = asAdmin(`
    select count(*)
      from public.customers c
      cross join lateral (
        select public.calculate_customer_realtime_credit(c.id) as j
      ) x
     where ((x.j->>'binding_constraint') = 'overdue')
           is distinct from
           exists (
             select 1
               from public.vw_customer_receivables r
              where r.customer_id = c.id
                and r.is_overdue
                and r.outstanding_amount > 0
           )
  `);

  expect(
    Number(mismatches),
    "customers whose overdue refusal disagrees with their live receivables — " +
      "before migration 454 this was 3, because the gate read an empty table",
  ).toBe(0);
});

test("⛔ both credit RPCs take overdue from can_issue_customer_invoice", () => {
  const wired = dbRows(`
    select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('calculate_customer_realtime_credit','get_customer_dynamic_credit')
       and pg_get_functiondef(p.oid) like '%can_issue_customer_invoice%'
     order by 1
  `);

  expect(
    wired,
    "both RPCs must reuse the one shared check — a second copy of the same predicate is how " +
      "the two halves of this system drift apart",
  ).toEqual(["calculate_customer_realtime_credit", "get_customer_dynamic_credit"]);
});

test("⛔ neither credit RPC still reads has_overdue off customer_credit_profile", () => {
  // The table is still read for credit_limit / outstanding_balance / total_purchases /
  // settlement_score, which is correct and deliberate. Only the *overdue* read moved, so the
  // pattern here is the qualified column reference, not the bare word.
  //
  // `--` comments are stripped before matching, and that is a correctness fix rather than a
  // relaxation: the first version of this assertion matched migration 454's own explanatory
  // comment, `-- 454: `cp.has_overdue` was read here ...`, and failed against code that was
  // already correct. Stripping comments narrows the corpus to executable text, which is the
  // only thing that can actually reintroduce the bug. Verified both ways on 2026-09-05 —
  // raw match: true for both functions; comment-stripped match: false for both.
  const stillReading = dbRows(`
    select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('calculate_customer_realtime_credit','get_customer_dynamic_credit')
       and regexp_replace(pg_get_functiondef(p.oid), '--[^\\n]*', '', 'g') ~ '(cp|p)\\.has_overdue'
     order by 1
  `);

  expect(
    stillReading,
    "these functions still read has_overdue from customer_credit_profile, which holds 0 rows " +
      "and whose writers were gutted by migration 331 — the answer is always false",
  ).toEqual([]);
});

test("⛔ anon cannot execute can_issue_customer_invoice", () => {
  const open = dbRows(`
    select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'can_issue_customer_invoice'
       and has_function_privilege('anon', p.oid, 'EXECUTE')
  `);

  expect(
    open,
    "can_issue_customer_invoice is SECURITY DEFINER over a view whose own guard returns zero " +
      "rows — i.e. 'not overdue' — for a caller it rejects. Reachable by anon, it answers " +
      "'may issue' for every customer. Revoking from anon alone is NOT enough: the bare " +
      "PUBLIC grant in acldefault() must be revoked too (see migration 393).",
  ).toEqual([]);
});

test("authenticated CAN still execute it — the revoke cut only the anonymous path", () => {
  const reachable = dbRows(`
    select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'can_issue_customer_invoice'
       and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  `);

  expect(
    reachable,
    "the revoke must not have stripped EXECUTE from every role — asserting the closed half " +
      "alone would also pass if the function had simply been dropped",
  ).toEqual(["can_issue_customer_invoice"]);
});
