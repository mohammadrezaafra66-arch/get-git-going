/**
 * OG-64 — the payables/receivables buckets and the staff-metric guard must answer with
 * TEHRAN's today, not the machine's.
 *
 * `CURRENT_DATE` is evaluated in the session timezone, which is UTC on this deployment. So
 * between 00:00 and 03:30 Tehran it is still YESTERDAY, and every `= CURRENT_DATE` bucket is
 * off by one. Unlike OG-63's purchase outage this produces **no error and no log** — just
 * plausible-looking money on a financial screen, which is harder to notice, not easier.
 *
 * WHAT THIS GATE COVERS AND WHERE IT STOPS.
 * `dbScalar` (behind `dbRows`) refuses anything that is not a read-only SELECT — deliberately,
 * so a test cannot repair the state it is checking. That rules out `SET TimeZone` and temp tables, so
 * this does NOT drive the functions under several session timezones. Instead it uses the fact
 * that `public.tehran_today()` is `(now() AT TIME ZONE 'Asia/Tehran')::date` and therefore
 * timezone-independent BY CONSTRUCTION, and asserts the answer the functions actually give.
 *
 * Two-sided (A2.10):
 *   OPEN half   — a CONTROL that reproduces the pre-fix expression over the same live rows
 *                 and proves it MOVES. Without it the closed half could pass on data that
 *                 simply has nothing near a boundary, and would prove nothing. When measured
 *                 on 2026-08-26 the swing was 349,800 against 13,000,000,024.95.
 *   CLOSED half — the function's `due_today` must equal the TEHRAN bucket, and must differ
 *                 from the shifted bucket whenever the control says the two disagree.
 *
 * Fixtures are COMPUTED from live data (A2.11), never pinned: the owner works in this
 * database, and a hardcoded total would turn their data entry into a red test. Every
 * assertion is skipped-with-a-reason rather than silently passing when the live data cannot
 * exercise it.
 */
import { expect, test } from "@playwright/test";
import { dbRows } from "../helpers/db";

/**
 * The admin claim the SECURITY DEFINER functions need. The views are RLS-filtered to EMPTY
 * without it, which is exactly how an earlier draft of this gate measured zero rows and
 * concluded — wrongly — that the bug could not be reproduced on this data.
 *
 * It is a SEPARATE STATEMENT on purpose. `psql -c` runs multiple statements in ONE
 * transaction, so a `set_config(..., true)` in the first is still in effect for the second.
 * Putting it in a scalar SUBQUERY of the same statement does NOT work — PostgreSQL is free to
 * evaluate that after the aggregate has already read the view, and the draft that did so
 * measured 0 against 0 and skipped itself as "no data".
 */
function asAdmin(sql: string): string {
  return (
    "select set_config('request.jwt.claims'," +
    " json_build_object('sub',(select (array_agg(user_id order by user_id))[1]" +
    " from public.user_roles where role='admin'),'role','authenticated')::text, true)" +
    " is not null; " +
    sql
  );
}

/** Run `sql` under the admin claim and return its final row (the claim's own row is first). */
function scalarAsAdmin(sql: string): string {
  const rows = dbRows(asAdmin(sql));
  return rows[rows.length - 1] ?? "";
}

/**
 * UTC-12 and UTC+14 are 26 hours apart, and 26 > 24, so their dates ALWAYS differ — at every
 * hour of every day. That is what makes this gate time-independent rather than one that
 * passes vacuously outside a narrow window. An earlier draft used a single fixed offset and
 * failed at 18:30 Tehran because the two dates happened to agree.
 */
const WEST = "(now() AT TIME ZONE 'Etc/GMT+12')::date";
const EAST = "(now() AT TIME ZONE 'Etc/GMT-14')::date";

interface Swing {
  west: number;
  east: number;
  tehran: number;
}

/**
 * Bucket `due_today` three ways over the same live rows: as the two shifted dates a
 * `CURRENT_DATE` would produce, and as Tehran's date.
 *
 * `unpaidFilter` mirrors what the function under test actually filters on, and the two are
 * NOT the same: `get_payables_summary` restricts to `is_paid = false`, while
 * `get_receivables_summary` has no such clause — `vw_customer_receivables` has no `is_paid`
 * column at all. Assuming they matched is what made the first draft of this gate throw.
 */
function swingFor(view: string, unpaidFilter: string): Swing {
  const row = scalarAsAdmin(
    `select coalesce(sum(outstanding_amount) filter (where due_date = ${WEST}),0)::text` +
      `, coalesce(sum(outstanding_amount) filter (where due_date = ${EAST}),0)::text` +
      `, coalesce(sum(outstanding_amount) filter (where due_date = public.tehran_today()),0)::text` +
      ` from public.${view}${unpaidFilter}`,
  );
  const [west, east, tehran] = row.split("|");
  return { west: Number(west), east: Number(east), tehran: Number(tehran) };
}

const PAYABLES = " where is_paid = false";
const RECEIVABLES = "";

test.describe("OG-64 — Tehran's today, not the machine's", () => {
  test("CONTROL: the pre-fix expression MOVES with the clock, so this gate is not vacuous", () => {
    const s = swingFor("vw_supplier_payables", PAYABLES);
    test.skip(
      s.west === s.east,
      "no unpaid payable falls on either boundary date today, so live data cannot exercise the bug right now",
    );
    // Measured 2026-08-26: 349,800 against 13,000,000,024.95 — the same screen, the same
    // rows, a five-order-of-magnitude difference in "due today" decided by nothing but the
    // clock.
    expect(
      s.west,
      "a CURRENT_DATE bucket must differ across a 26-hour swing, or the closed half proves nothing",
    ).not.toBe(s.east);
  });

  test("get_payables_summary answers with TEHRAN's today", () => {
    const s = swingFor("vw_supplier_payables", PAYABLES);
    const dueToday = Number(
      scalarAsAdmin(`select due_today::text from public.get_payables_summary(null,null,null)`),
    );
    expect(dueToday, "the summary's due_today must equal the Tehran bucket").toBe(s.tehran);
    if (s.tehran !== s.west || s.tehran !== s.east) {
      const shifted = s.tehran === s.west ? s.east : s.west;
      expect(dueToday, "and must NOT equal the shifted bucket a CURRENT_DATE would give").not.toBe(
        shifted,
      );
    }
  });

  test("get_receivables_summary answers with TEHRAN's today", () => {
    const s = swingFor("vw_customer_receivables", RECEIVABLES);
    const dueToday = Number(
      scalarAsAdmin(`select due_today::text from public.get_receivables_summary(null,null,null)`),
    );
    expect(dueToday).toBe(s.tehran);
  });

  test("no function, view or policy in the converted set still asks UTC", () => {
    // The catalogue half. It is the cheap one, and it is the one that catches a later
    // CREATE OR REPLACE quietly reintroducing CURRENT_DATE into a body this gate cannot call.
    const offenders = dbRows(`
      select s.kind || ' ' || s.name from (
        select 'function' as kind, p.proname as name, pg_get_functiondef(p.oid) as src
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in
           ('get_payables_list','get_receivables_list','get_payables_summary',
            'get_receivables_summary','upsert_staff_daily_performance_metric')
        union all
        select 'view', v.viewname, v.definition from pg_views v
         where v.schemaname = 'public'
           and v.viewname in ('vw_supplier_payables','vw_customer_receivables')
        union all
        select 'policy', pol.polname,
               coalesce(pg_get_expr(pol.polqual, pol.polrelid),'')
               || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid),'')
          from pg_policy pol
         where pol.polrelid = 'public.staff_daily_performance_metrics'::regclass
           and pol.polname in ('sdpm_insert_privileged','sdpm_update_privileged')
      ) s
      where s.src ~* 'CURRENT_DATE' or s.src !~* 'tehran_today'
      order by 1
    `);
    // Both directions: still-UTC, and lost-the-comparison-entirely. Asserting only the
    // absence of CURRENT_DATE would pass a body that dropped the date check altogether.
    expect(offenders, `still UTC-bound or missing the comparison: ${offenders.join(", ")}`).toEqual(
      [],
    );
  });

  test("the RLS policy moved WITH the function it guards, not after it", () => {
    // The point this gate exists to protect. `upsert_staff_daily_performance_metric` raises a
    // clean Persian message when a date is refused; the POLICY raises a row-level-security
    // violation. Converting the function alone would have swapped the good error for the bad
    // one and changed nothing else — a fix that reads as a fix and is worse than the bug.
    const both = dbRows(`
      select pol.polname from pg_policy pol
       where pol.polrelid = 'public.staff_daily_performance_metrics'::regclass
         and pol.polname in ('sdpm_insert_privileged','sdpm_update_privileged')
         and (coalesce(pg_get_expr(pol.polqual, pol.polrelid),'')
              || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid),'')) ~* 'tehran_today'
       order by 1
    `);
    expect(both).toEqual(["sdpm_insert_privileged", "sdpm_update_privileged"]);
  });
});
