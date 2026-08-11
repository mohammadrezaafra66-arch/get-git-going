import { test, expect } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";

/**
 * Phase 8.1 (Decision 4) — the duplicate-person review page at /persons/merge.
 *
 * The pair is seeded in beforeAll so the test is deterministic: the live queue
 * is empty after checkpoint 8.2, and a test that only passes when real
 * duplicates happen to exist is not a test.
 *
 * Neither seeded person owns a customer or a supplier, so person_merge's
 * cardinality guard (#7) does not fire here — that path is covered separately
 * by merge-ui-guard.spec.ts.
 */

const WINNER = `برندهٔ ادغام ${E2E_PREFIX}`;
const LOSER = `بازندهٔ ادغام ${E2E_PREFIX}`;
const WINNER_ID = "8e2e0001-0000-4000-8000-00000000a001";
const LOSER_ID = "8e2e0001-0000-4000-8000-00000000a002";
// person_merge_candidates enforces person_id_a < person_id_b, and a001 < a002.

function cleanup(): void {
  dbExecE2e(`
    -- ${E2E_PREFIX} scoped cleanup
    DELETE FROM public.person_merge_log
     WHERE winner_id IN ('${WINNER_ID}','${LOSER_ID}') OR loser_id IN ('${WINNER_ID}','${LOSER_ID}');
    DELETE FROM public.person_merge_candidates
     WHERE person_id_a IN ('${WINNER_ID}','${LOSER_ID}') OR person_id_b IN ('${WINNER_ID}','${LOSER_ID}');
    DELETE FROM public.person_context_links WHERE person_id IN ('${WINNER_ID}','${LOSER_ID}');
    DELETE FROM public.person_identifiers  WHERE person_id IN ('${WINNER_ID}','${LOSER_ID}');
    DELETE FROM public.person_aliases      WHERE person_id IN ('${WINNER_ID}','${LOSER_ID}');
    DELETE FROM public.persons             WHERE id IN ('${WINNER_ID}','${LOSER_ID}');
  `);
}

test.beforeAll(() => {
  cleanup();
  dbExecE2e(`
    -- ${E2E_PREFIX} seed a deterministic duplicate pair
    INSERT INTO public.persons (id, kind, display_name, visibility_scope, is_active)
    VALUES ('${WINNER_ID}','individual','${WINNER}','internal_general',true),
           ('${LOSER_ID}','individual','${LOSER}','internal_general',true);

    INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
    VALUES ('${LOSER_ID}','email','loser.${E2E_PREFIX}@afrakala.local','provisional',true);

    INSERT INTO public.person_merge_candidates (person_id_a, person_id_b, reason, detail, status)
    VALUES ('${WINNER_ID}','${LOSER_ID}','shared_identifier','آزمون خودکار فاز ۸','pending');
  `);
});

test.afterAll(() => {
  cleanup();
  const left = dbScalar(
    `select count(*) from public.persons where id in ('${WINNER_ID}','${LOSER_ID}')`,
  );
  expect(Number(left), "cleanup left seeded merge persons behind").toBe(0);
});

test("the merge page reviews a pending pair and merges it", async ({ page }) => {
  await page.goto("/persons/merge");
  await page.waitForLoadState("networkidle");

  // The page rendered and is not an auth bounce.
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.getByText("بررسی اشخاص تکراری").first()).toBeVisible();

  // Both sides are shown side by side, with the evidence a reviewer needs.
  await expect(page.getByText(WINNER).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(LOSER).first()).toBeVisible();
  await expect(page.getByText(`loser.${E2E_PREFIX}@afrakala.local`).first()).toBeVisible();

  // Choose the winner explicitly rather than trusting the default.
  await page.getByRole("radio").first().check();

  await page.getByLabel("دلیل ادغام").fill(`آزمون خودکار ${E2E_PREFIX}`);
  await page.getByRole("button", { name: "ادغام", exact: true }).click();

  // The candidate leaves the pending queue.
  await expect
    .poll(
      () =>
        dbScalar(
          `select status from public.person_merge_candidates
            where person_id_a = '${WINNER_ID}' and person_id_b = '${LOSER_ID}'`,
        ),
      { timeout: 20_000, message: "candidate status never became 'merged'" },
    )
    .toBe("merged");

  // References repointed: the loser's identifier now belongs to the winner.
  expect(
    dbScalar(`select count(*) from public.person_identifiers where person_id = '${LOSER_ID}'`),
    "loser still owns identifiers after the merge",
  ).toBe("0");
  // Matched on value_raw, not value_normalized: the Phase 2 normalizer
  // lowercases emails and E2E_PREFIX contains uppercase, so the normalized form
  // is not the string this test seeded.
  expect(
    dbScalar(
      `select count(*) from public.person_identifiers
        where person_id = '${WINNER_ID}' and value_raw = 'loser.${E2E_PREFIX}@afrakala.local'`,
    ),
    "identifier did not move to the winner",
  ).toBe("1");

  // The loser's name survives as an alias so search still finds it.
  expect(
    dbScalar(
      `select count(*) from public.person_aliases
        where person_id = '${WINNER_ID}' and alias = '${LOSER}'`,
    ),
    "loser display_name was not preserved as an alias",
  ).toBe("1");

  // The loser is deactivated, NOT deleted — its id may appear in audit logs.
  expect(
    dbScalar(`select count(*) from public.persons where id = '${LOSER_ID}'`),
    "loser row was hard-deleted",
  ).toBe("1");
  expect(
    dbScalar(`select is_active::text from public.persons where id = '${LOSER_ID}'`),
    "loser is still active after the merge",
  ).toBe("false");

  // The merge was recorded.
  expect(
    dbScalar(
      `select count(*) from public.person_merge_log
        where winner_id = '${WINNER_ID}' and loser_id = '${LOSER_ID}'`,
    ),
    "no person_merge_log row was written",
  ).toBe("1");

  // And no drift was introduced anywhere.
  expect(dbScalar("select count(*) from public.person_fk_drift_report()")).toBe("0");
});
