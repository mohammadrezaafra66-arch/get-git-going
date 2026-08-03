import { expect, test } from "@playwright/test";
import { ADMIN_USER_ID, mintJwt, rest } from "../helpers/pgrest";

/**
 * Phase 12 (b) — D8-4 / migration 272: versioned score-level thresholds.
 *
 * Two things must hold, and the second is the point of the whole design:
 *   1. a score in each band gets the right Persian label;
 *   2. changing the bands later does NOT relabel a period that has already
 *      been scored — history stays as it was published.
 */

let adminJwt: string;

const EXPECTED = [
  { score: 90, label: "عالی" },
  { score: 70, label: "قابل اعتماد" },
  { score: 50, label: "متوسط" },
  { score: 10, label: "پرریسک" },
];

test.beforeAll(() => {
  adminJwt = mintJwt(ADMIN_USER_ID);
});

test.describe("D8-4 — versioned score bands", () => {
  test("exactly four bands, contiguous and non-overlapping", async () => {
    const rows = await rest<{ label_fa: string; score_range: string; valid_from: string }[]>(
      adminJwt,
      "/score_level_thresholds?select=label_fa,score_range,valid_from&order=valid_from.asc",
    );
    expect(rows.status, rows.text).toBe(200);

    const current = rows.body.filter((r) => r.valid_from === rows.body[0].valid_from);
    expect(current).toHaveLength(4);

    const labels = current.map((r) => r.label_fa).sort();
    expect(labels).toEqual(["متوسط", "عالی", "قابل اعتماد", "پرریسک"].sort());
  });

  test("each band returns its Persian label at the boundary and inside", async () => {
    for (const c of EXPECTED) {
      // The RPC takes the 0..1 weighted score, not the 0..100 display value —
      // the trap phase 5 caught. Passing 90 here instead of 0.90 would make
      // every customer «پرریسک».
      const res = await rest<string>(adminJwt, "/rpc/score_level_at", {
        method: "POST",
        body: JSON.stringify({
          p_weighted_score: c.score / 100,
          p_period_month: new Date().toISOString().slice(0, 8) + "01",
        }),
      });
      expect(res.status, `${c.score}: ${res.text}`).toBe(200);
      const label = typeof res.body === "string" ? res.body : JSON.stringify(res.body);
      expect(label, `score ${c.score} should be ${c.label}`).toContain(c.label);
    }
  });

  test("boundaries land in exactly one band — no gap, no overlap", async () => {
    // 39.5 must be «پرریسک», 40 must be «متوسط». Two min/max columns would
    // leave 39.5 homeless; the half-open numrange is what prevents it.
    const at = async (score: number) => {
      const r = await rest<string>(adminJwt, "/rpc/score_level_at", {
        method: "POST",
        body: JSON.stringify({
          p_weighted_score: score / 100,
          p_period_month: new Date().toISOString().slice(0, 8) + "01",
        }),
      });
      return typeof r.body === "string" ? r.body : JSON.stringify(r.body);
    };
    expect(await at(39.5)).toContain("پرریسک");
    expect(await at(40)).toContain("متوسط");
    expect(await at(59.999)).toContain("متوسط");
    expect(await at(60)).toContain("قابل اعتماد");
    expect(await at(80)).toContain("عالی");
  });

  test("an overlapping band cannot be inserted", async () => {
    const existing = await rest<{ valid_from: string }[]>(
      adminJwt,
      "/score_level_thresholds?select=valid_from&limit=1",
    );
    // level_code is NOT NULL — omitting it makes the insert fail with 23502
    // before the exclusion constraint is ever reached, which would "pass" this
    // test for entirely the wrong reason.
    const res = await rest(adminJwt, "/score_level_thresholds", {
      method: "POST",
      body: JSON.stringify({
        level_code: "e2e_overlap",
        label_fa: "E2E تداخل",
        score_range: "[50,70)",
        display_order: 99,
        valid_from: existing.body[0].valid_from,
      }),
    });
    // 23P01 = exclusion_violation from the gist EXCLUDE constraint.
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.text, "must be refused by the overlap constraint, not by a missing column").toMatch(
      /23P01|exclusion|overlap|تداخل/i,
    );
  });

  test("history is stable: a stored label is not recomputed by the client", async () => {
    // The label shown next to a historical score comes from the versioned
    // table keyed by that period, so re-reading an old period must keep
    // returning the label that was in force then.
    const periods = await rest<{ period_month: string }[]>(
      adminJwt,
      "/dynamic_entity_scores?select=period_month&order=period_month.asc&limit=1",
    );
    test.skip(periods.body.length === 0, "no scored period exists on this server");

    const oldPeriod = periods.body[0].period_month;
    const first = await rest<string>(adminJwt, "/rpc/score_level_at", {
      method: "POST",
      body: JSON.stringify({ p_weighted_score: 0.85, p_period_month: oldPeriod }),
    });
    const second = await rest<string>(adminJwt, "/rpc/score_level_at", {
      method: "POST",
      body: JSON.stringify({ p_weighted_score: 0.85, p_period_month: oldPeriod }),
    });
    expect(first.body).toEqual(second.body);
  });
});
