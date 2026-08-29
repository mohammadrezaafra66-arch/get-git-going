/**
 * Migration 413 — the four widened salesperson scoring ranges, and the recompute that must
 * follow any change to them.
 *
 * WHY THIS EXISTS. This is the salesperson half of what 411 fixed for customers, and it fails
 * the same way if only half the job is done. `dynamic_entity_scores.raw_score` is normalised and
 * frozen at write time, so widening a range alone leaves every stored score on the old scale:
 * the admin screen reads correctly while the numbers behind it are stale.
 *
 * Before 413 the ceilings had stopped discriminating. Nine score rows sat at `is_clipped = true`
 * — one salesperson on 13,000,000,000 and another on 3,000,000,000 both read raw_score = 1.000,
 * i.e. a 4x difference in real sales scored identically. After the recompute they read 0.867 and
 * 0.200.
 *
 * Both assertions were shown to FAIL against a broken state before being trusted:
 *   * ranges applied but the recompute skipped -> "39 score rows are still frozen"
 *   * one max deliberately wrong               -> "found 3"
 *
 * Amounts are TOMAN (`input_type='toman'`), verified live before the migration was written.
 */
import { expect, test } from "@playwright/test";
import { dbRows, dbScalar } from "../helpers/db";

/** The intended range per parameter: sales and profit in toman, calls as plain counts. */
const INTENDED: ReadonlyArray<readonly [string, string, string]> = [
  ["salesperson_inbound_calls", "0", "1000"],
  ["salesperson_outbound_calls", "0", "1000"],
  ["salesperson_profit_monthly", "0", "500000000"],
  ["salesperson_sales_amount_monthly", "0", "15000000000"],
];

const CODES = INTENDED.map(([c]) => `'${c}'`).join(",");

test.describe("migration 413 — salesperson ranges and score recompute", () => {
  test("each of the four parameters holds exactly its intended range", () => {
    const rows = dbRows(
      `select code || '|' || min_value || '|' || max_value
         from public.dynamic_scoring_parameters
        where entity_type = 'salesperson' and code in (${CODES})
        order by code`,
    );
    // A missing parameter is its own failure: a renamed or deactivated one would otherwise let
    // the range assertion pass vacuously.
    expect(rows).toHaveLength(INTENDED.length);
    expect(rows).toEqual(INTENDED.map(([c, mn, mx]) => `${c}|${mn}|${mx}`));
  });

  test("no stored salesperson score is still frozen on the old range", () => {
    const stale = dbScalar(
      `select count(*)
         from public.dynamic_entity_scores s
         join public.dynamic_scoring_parameters p on p.id = s.parameter_id
        where s.entity_type = 'salesperson'
          and s.actual_value is not null
          and p.code in (${CODES})
          and s.raw_score is distinct from round(
                case when p.direction = 'negative'
                     then 1 - least(1, greatest(0, (s.actual_value - p.min_value) / (p.max_value - p.min_value)))
                     else     least(1, greatest(0, (s.actual_value - p.min_value) / (p.max_value - p.min_value)))
                end::numeric, 3)`,
    );
    expect(stale).toBe("0");
  });

  test("the gate is measuring real rows, not an empty set", () => {
    // Guards the assertion above: with zero scored rows the stale count is trivially 0.
    const scored = Number(
      dbScalar(
        `select count(*)
           from public.dynamic_entity_scores s
           join public.dynamic_scoring_parameters p on p.id = s.parameter_id
          where s.entity_type = 'salesperson' and s.actual_value is not null
            and p.code in (${CODES})`,
      ),
    );
    expect(scored).toBeGreaterThan(0);
  });

  test("the widened ceilings actually un-pinned the clipped salespeople", () => {
    // The concrete reason 413 existed: nine rows were clipped at 1.000 and could not be told
    // apart. If someone narrows a range back, rows clip again and this fails.
    const clipped = dbScalar(
      `select count(*)
         from public.dynamic_entity_scores s
         join public.dynamic_scoring_parameters p on p.id = s.parameter_id
        where s.entity_type = 'salesperson' and p.code in (${CODES}) and s.is_clipped = true`,
    );
    expect(clipped).toBe("0");
  });

  test("13,000,000,000 in monthly sales no longer reads the same as 3,000,000,000", () => {
    // The sharpest case: a 4x difference in real sales that scored identically before.
    const rows = dbRows(
      `select s.actual_value || '=' || s.raw_score
         from public.dynamic_entity_scores s
         join public.dynamic_scoring_parameters p on p.id = s.parameter_id
        where s.entity_type = 'salesperson'
          and p.code = 'salesperson_sales_amount_monthly'
          and s.actual_value in (13000000000, 3000000000)
        order by s.actual_value desc`,
    );
    expect(rows).toEqual(["13000000000=0.867", "3000000000=0.200"]);
  });
});
