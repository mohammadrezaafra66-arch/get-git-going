/**
 * 455 / D-9 — the score reader takes the current month first, and falls back to the most
 * recent month that has data, dated.
 *
 * WHY THIS EXISTS. On 2026-09-05 one page — /sales/customers/<id>/credit — asked the same
 * question three ways: the score-entry section read `currentPeriodMonth()` (September, empty),
 * the realtime credit card read the capital snapshot's month (August), and the newest scores
 * for five of the eleven scored customers were in July. So the entry screen showed nothing,
 * the card showed 0.000000, and the real number was a month further back. Measured then:
 *
 *     dynamic_entity_scores, customer:  2026-08-01 -> 53 rows / 6 entities
 *                                       2026-07-01 -> 38 rows / 5 entities
 *                                       2026-09-01 ->  0 rows
 *     مشتری آزمایشی 11 at August: 0.000000     at July: 1.000000
 *
 * THE OWNER'S DECISION, carried: current month first; else the most recent month with data;
 * and the UI names that month. `resolve_score_period` is the one definition of that rule and
 * these assertions pin it as such — a second implementation in the client is exactly what
 * this replaced, and is what would drift.
 *
 * WHY THE FALLBACK IS PER ENTITY. A global "newest month overall" would resolve to August for
 * everyone and would still show 0.000000 for the five customers last scored in July — i.e. it
 * would not fix the bug it exists to fix. The first assertion below would pass under that
 * wrong rule if it only checked "some month with data", so it checks the exact month.
 */
import { expect, test } from "@playwright/test";
import { dbRows } from "../helpers/db";
import { ADMIN_USER_ID, mintJwt, rest } from "../helpers/pgrest";

function q(sql: string): string[] {
  return dbRows(sql);
}

test("⛔ omitting p_period_month over PostgREST reaches the fallback", async () => {
  // This is the exact call the client now makes. `useCalculatedScore` OMITS the argument
  // rather than sending null, because the generated type declares it `string | undefined`;
  // omitting it is what lets the SQL default `DEFAULT NULL` hand the decision to
  // `resolve_score_period`. If PostgREST ever stopped applying that default, the client
  // would silently read the current month again and every July-scored customer would go
  // back to 0.000000 — with no type error and no failing SQL test, because the SQL is fine.
  const scored = q(`
    select c.id::text
      from public.customers c
     where exists (select 1 from public.dynamic_entity_scores d
                    where d.entity_type='customer' and d.entity_id=c.id
                      and d.raw_score is not null
                      and d.period_month < date_trunc('month', current_date)::date)
       and not exists (select 1 from public.dynamic_entity_scores d
                        where d.entity_type='customer' and d.entity_id=c.id
                          and d.raw_score is not null
                          and d.period_month = date_trunc('month', current_date)::date)
     order by 1 limit 1
  `);
  expect(scored.length, "no customer is scored only in an earlier month").toBe(1);

  const jwt = mintJwt(ADMIN_USER_ID);
  const res = await rest<{ period_month: string; period_is_fallback: boolean }>(
    jwt,
    "/rpc/calculate_dynamic_score",
    {
      method: "POST",
      // p_period_month deliberately absent — that is the behaviour under test.
      body: JSON.stringify({ p_entity_type: "customer", p_entity_id: scored[0] }),
    },
  );

  expect(res.status, `unexpected status: ${res.text}`).toBe(200);
  expect(res.body.period_is_fallback, `omitted arg did not fall back: ${res.text}`).toBe(true);
  expect(res.body.period_month, `fallback did not land on an earlier month: ${res.text}`).not.toBe(
    new Date().toISOString().slice(0, 8) + "01",
  );
});

test("⛔ resolve_score_period returns the current month only when that month has a score", () => {
  // Two-sided by construction: for every scored entity, compare the function's answer with
  // the rule stated independently. A function that always returned MAX(period_month), or
  // always the current month, fails this.
  const wrong = q(`
    select c.name || ' -> ' || public.resolve_score_period('customer', c.id)::text
      from public.customers c
     where exists (select 1 from public.dynamic_entity_scores d
                    where d.entity_type='customer' and d.entity_id=c.id and d.raw_score is not null)
       and public.resolve_score_period('customer', c.id) is distinct from coalesce(
             (select date_trunc('month', current_date)::date
               where exists (select 1 from public.dynamic_entity_scores d
                              where d.entity_type='customer' and d.entity_id=c.id
                                and d.period_month = date_trunc('month', current_date)::date
                                and d.raw_score is not null)),
             (select max(d.period_month) from public.dynamic_entity_scores d
               where d.entity_type='customer' and d.entity_id=c.id and d.raw_score is not null))
     order by 1
  `);

  expect(wrong, "resolve_score_period disagrees with D-9 for these entities").toEqual([]);
});

test("⛔ a customer scored only in an older month reports that month, not zero", () => {
  // The failure this replaces was silent: a real score existed and the page showed 0.000000
  // under a header that said «ماه جاری». So both halves are asserted together — a non-zero
  // score AND the month it came from AND the fallback flag that makes the UI label it.
  const stale = q(`
    select c.name
             || ' | period=' || (s.j->>'period_month')
             || ' | fallback=' || (s.j->>'period_is_fallback')
             || ' | score=' || (s.j->>'weighted_score')
      from public.customers c
      cross join lateral (
        select public.calculate_dynamic_score('customer', c.id, null) as j
      ) s
     where (s.j->>'period_is_fallback')::boolean
       and (s.j->>'weighted_score')::numeric > 0
     order by 1
  `);

  expect(
    stale.length,
    "no customer is currently being read from an older month, so this spec cannot see the " +
      "behaviour it exists to protect. If the business genuinely scored everyone this month " +
      "that is fine, but confirm it rather than assuming — before 455 this list was empty " +
      "for the opposite reason: the fallback did not exist.",
  ).toBeGreaterThan(0);

  for (const row of stale) {
    // Parsed rather than pattern-matched: the first version of this used a regex anchored on
    // `score=0.` and failed against a legitimate perfect score of 1.000000 — the assertion
    // was wrong, not the code. A numeric comparison cannot make that mistake.
    const m = /^(.*) \| period=(\d{4}-\d{2}-\d{2}) \| fallback=(\w+) \| score=([\d.]+)$/.exec(row);
    expect(m, `unparseable fallback row: ${row}`).not.toBeNull();
    const [, , periodMonth, fallback, score] = m!;
    expect(fallback, `${row}: must be flagged as a fallback read`).toBe("true");
    expect(periodMonth.endsWith("-01"), `${row}: period must be a month start`).toBe(true);
    expect(Number(score), `${row}: a fallback read must carry a real score`).toBeGreaterThan(0);
  }
});

test("⛔ an explicit period is still honoured exactly — the allocation writers depend on it", () => {
  // `run_daily_capital_allocation` and `recompute_dynamic_capital_setting` both pass an
  // explicit capital date. If the fallback ever leaked into the explicit path, those writers
  // would silently start scoring a different month and would rewrite real credit ceilings.
  const leaked = q(`
    select c.name || ' -> ' || (public.calculate_dynamic_score('customer', c.id, date '2026-07-01') ->> 'period_month')
      from public.customers c
     where (public.calculate_dynamic_score('customer', c.id, date '2026-07-01') ->> 'period_month') <> '2026-07-01'
     order by 1
    limit 20
  `);

  expect(leaked, "an explicit p_period_month was not honoured verbatim").toEqual([]);
});

test("⛔ the realtime credit card resolves the same period as the scoring section", () => {
  // The whole point of D-9: one page, one answer. The card's `score_period_month` must equal
  // what `resolve_score_period` says, for every customer, or the two halves have drifted again.
  const drift = q(`
    select set_config('request.jwt.claims','{"sub":"4084224a-cd34-4632-9cbc-3b5f3581cf6e","role":"authenticated"}',false) is not null;
    select c.name
      from public.customers c
      cross join lateral (
        select public.calculate_customer_realtime_credit(c.id) as j
      ) x
     where (x.j->>'score_period_month')::date
           is distinct from public.resolve_score_period('customer', c.id)
     order by 1
  `).slice(1);

  expect(drift, "the credit card and the scoring section resolved different months").toEqual([]);
});

test("⛔ anon cannot execute resolve_score_period", () => {
  const open = q(`
    select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname='public' and p.proname='resolve_score_period'
       and has_function_privilege('anon', p.oid, 'EXECUTE')
  `);
  expect(open, "a new function is born with a PUBLIC grant; both revokes are required").toEqual([]);
});
