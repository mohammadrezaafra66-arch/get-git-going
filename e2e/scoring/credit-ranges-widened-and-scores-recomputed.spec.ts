/**
 * Migration 411 — the seven customer credit scoring ranges, and the recompute that must
 * follow any change to them.
 *
 * WHY THIS EXISTS. `dynamic_entity_scores.raw_score` is normalised and stored at write
 * time. Widening a parameter's range does NOT touch rows that already exist: the stored
 * value stays frozen on the old scale, so a customer keeps a score that no longer matches
 * the range it is supposed to be measured against. Before 411 one live customer read
 * raw_score = 1.000 on `customer_purchase_1y` because the ceiling was 5,000,000,000 — at
 * that point the score has stopped telling good customers apart, which is the whole
 * purpose of scoring them.
 *
 * The migration therefore does two things, and this gate checks both, because doing only
 * the first is the failure mode that looks like success: the ranges read correctly in the
 * admin screen while every stored score still carries the old normalisation.
 *
 * Both assertions were shown to FAIL against a broken state before being trusted:
 *   * ranges applied but the recompute skipped  -> "47 score rows are still frozen"
 *   * one max deliberately wrong                -> "found 6"
 *
 * The amounts are TOMAN. `input_type` is 'toman' for all six money parameters, verified
 * live before the migration was written; no rial conversion is involved.
 */
import { expect, test } from "@playwright/test";
import { dbRows, dbScalar } from "../helpers/db";

/** The intended range for each parameter, in toman (months for cooperation history). */
const INTENDED: ReadonlyArray<readonly [string, string, string]> = [
  ["customer_cooperation_months", "1", "360"],
  ["customer_profit_1y", "0", "5000000000"],
  ["customer_profit_3m", "0", "2500000000"],
  ["customer_profit_3y", "0", "15000000000"],
  ["customer_purchase_1y", "0", "25000000000"],
  ["customer_purchase_3m", "0", "10000000000"],
  ["customer_purchase_3y", "0", "50000000000"],
];

const CODES = INTENDED.map(([code]) => `'${code}'`).join(",");

test.describe("migration 411 — customer credit ranges and score recompute", () => {
  test("each of the seven parameters holds exactly its intended range", () => {
    const rows = dbRows(
      `select code || '|' || min_value || '|' || max_value
         from public.dynamic_scoring_parameters
        where entity_type = 'customer' and code in (${CODES})
        order by code`,
    );

    // Every parameter must exist. A missing row is its own failure: a renamed or
    // deactivated parameter would otherwise let the range assertion pass vacuously.
    expect(rows).toHaveLength(INTENDED.length);

    const expected = [...INTENDED]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, mn, mx]) => `${code}|${mn}|${mx}`);
    expect(rows).toEqual(expected);
  });

  test("no stored score is still frozen on the old range", () => {
    // Recompute the trigger's own formula and compare against what is stored. A row that
    // was never re-saved after the range changed reads on the old scale and shows up here.
    const stale = dbScalar(
      `select count(*)
         from public.dynamic_entity_scores s
         join public.dynamic_scoring_parameters p on p.id = s.parameter_id
        where s.entity_type = 'customer'
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
    // Guards the assertion above. If the seven parameters ever hold no scores, the stale
    // count is trivially 0 and the previous test would pass while checking nothing.
    const scored = Number(
      dbScalar(
        `select count(*)
           from public.dynamic_entity_scores s
           join public.dynamic_scoring_parameters p on p.id = s.parameter_id
          where s.entity_type = 'customer'
            and s.actual_value is not null
            and p.code in (${CODES})`,
      ),
    );
    expect(scored).toBeGreaterThan(0);
  });

  test("the widened ceiling actually freed the customer that was pinned at 1.000", () => {
    // The concrete case the migration existed for: 5,000,000,000 against a 25,000,000,000
    // ceiling must read 0.2, not 1.0. If someone narrows the range back, this fails.
    const pinned = dbScalar(
      `select count(*)
         from public.dynamic_entity_scores s
         join public.dynamic_scoring_parameters p on p.id = s.parameter_id
        where s.entity_type = 'customer'
          and p.code = 'customer_purchase_1y'
          and s.actual_value = 5000000000
          and s.raw_score = 0.200`,
    );
    expect(pinned).toBe("1");
  });

  test("the cooperation hint names the ceiling the range actually allows", () => {
    // 411 widened the range to 360 months but the hint still read "1 to 240", and
    // DynamicScoringSection prints input_hint verbatim when it is set -- so the screen
    // would have kept telling the accountant 240 was the cap. 412 corrected it.
    const hint = dbScalar(
      `select input_hint from public.dynamic_scoring_parameters
        where entity_type = 'customer' and code = 'customer_cooperation_months'`,
    );
    expect(hint).toContain("۳۶۰");
    expect(hint).not.toContain("۲۴۰");
  });
});
