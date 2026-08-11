import { test, expect } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";

/**
 * Phase 8.1 guard #7 — when BOTH persons own a customer row, merging them would
 * silently blend two sets of balances, credit lines and history. That is an
 * accounting reconciliation, not an identity fix, and person_merge refuses it.
 *
 * This asserts BOTH halves of the refusal: the page warns and offers no merge
 * button, and the RPC raises even if something calls it directly. A UI-only
 * guard would be worthless — the RPC is reachable over PostgREST.
 */

const A_NAME = `مشتری الف ${E2E_PREFIX}`;
const B_NAME = `مشتری ب ${E2E_PREFIX}`;
const A_ID = "8e2e0002-0000-4000-8000-00000000b001";
const B_ID = "8e2e0002-0000-4000-8000-00000000b002";

function cleanup(): void {
  dbExecE2e(`
    -- ${E2E_PREFIX} scoped cleanup
    DELETE FROM public.person_merge_candidates
     WHERE person_id_a IN ('${A_ID}','${B_ID}') OR person_id_b IN ('${A_ID}','${B_ID}');
    DELETE FROM public.person_context_links WHERE person_id IN ('${A_ID}','${B_ID}');
    DELETE FROM public.person_identifiers  WHERE person_id IN ('${A_ID}','${B_ID}');
    DELETE FROM public.person_aliases      WHERE person_id IN ('${A_ID}','${B_ID}');
    DELETE FROM public.customers           WHERE person_id IN ('${A_ID}','${B_ID}');
    DELETE FROM public.persons             WHERE id IN ('${A_ID}','${B_ID}');
  `);
}

test.beforeAll(() => {
  cleanup();
  dbExecE2e(`
    -- ${E2E_PREFIX} seed a pair where BOTH sides own a customer
    INSERT INTO public.persons (id, kind, display_name, visibility_scope, is_active)
    VALUES ('${A_ID}','individual','${A_NAME}','internal_general',true),
           ('${B_ID}','individual','${B_NAME}','internal_general',true);

    INSERT INTO public.customers (name, person_id)
    VALUES ('${A_NAME}','${A_ID}'), ('${B_NAME}','${B_ID}');

    INSERT INTO public.person_merge_candidates (person_id_a, person_id_b, reason, detail, status)
    VALUES ('${A_ID}','${B_ID}','shared_identifier','آزمون گارد کاردینالیتی','pending');
  `);
});

test.afterAll(() => {
  cleanup();
  const left = dbScalar(`select count(*) from public.persons where id in ('${A_ID}','${B_ID}')`);
  expect(Number(left), "cleanup left seeded guard persons behind").toBe(0);
});

test("a both-have-customer pair is warned about and cannot be merged from the UI", async ({
  page,
}) => {
  await page.goto("/persons/merge");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText(A_NAME).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(B_NAME).first()).toBeVisible();

  // The warning is shown, in Persian, explaining why.
  await expect(page.getByText("ادغام این جفت مجاز نیست").first()).toBeVisible();
  await expect(page.getByText(/هر دو شخص پروندهٔ مشتری دارند/).first()).toBeVisible();

  // And the merge action is not offered at all for this pair.
  const card = page.locator("div").filter({ hasText: "ادغام این جفت مجاز نیست" }).last();
  await expect(card.getByRole("button", { name: "ادغام", exact: true })).toHaveCount(0);

  // The dismiss escape hatch IS still offered.
  await expect(page.getByRole("button", { name: "این‌ها یک نفر نیستند" }).first()).toBeVisible();
});

test("calling person_merge directly for that pair still raises", () => {
  // The UI guard is worthless on its own — person_merge is reachable over
  // PostgREST — so the refusal has to live in the database, and this asserts it
  // there. The call runs under a simulated admin JWT, so it passes the role
  // check and reaches guard #7 rather than being turned away at the door.
  //
  // The outcome is recorded as an alias row because that is the only channel
  // that survives back to the test runner: psql sends RAISE NOTICE to stderr,
  // which the db helper does not capture. The row is scoped to the seeded
  // person and removed by cleanup().
  dbExecE2e(`
    -- ${E2E_PREFIX} guard probe
    DO $probe$
    BEGIN
      PERFORM set_config('request.jwt.claims',
        '{"sub":"05098088-2849-43f4-8eb5-7c473c3832ec","role":"authenticated"}', true);
      BEGIN
        PERFORM public.person_merge('${A_ID}'::uuid, '${B_ID}'::uuid, 'e2e guard probe');
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.person_aliases (person_id, alias, alias_kind, source)
        VALUES ('${A_ID}', 'RAISED ${E2E_PREFIX} ' || SQLSTATE || ' ' || left(SQLERRM, 40),
                'other', 'e2e-probe');
        RETURN;
      END;
      INSERT INTO public.person_aliases (person_id, alias, alias_kind, source)
      VALUES ('${A_ID}', 'DID_NOT_RAISE ${E2E_PREFIX}', 'other', 'e2e-probe');
    END $probe$;
  `);

  const outcome = dbScalar(
    `select alias from public.person_aliases
      where person_id = '${A_ID}' and source = 'e2e-probe' limit 1`,
  );
  expect(outcome, "the guard probe did not record an outcome").toBeTruthy();
  expect(outcome, "person_merge did NOT raise for a both-have-customer pair").toContain("RAISED");
  expect(outcome, "guard raised, but not with the cardinality error").toContain("23505");
  expect(outcome, "the refusal message is not the Persian cardinality one").toContain(
    "هر دو شخص پروندهٔ مشتری دارند",
  );

  // And the database state is untouched: nothing was merged.
  expect(
    dbScalar(`select is_active::text from public.persons where id = '${B_ID}'`),
    "the loser was deactivated despite the guard",
  ).toBe("true");
  expect(
    dbScalar(
      `select status from public.person_merge_candidates
        where person_id_a = '${A_ID}' and person_id_b = '${B_ID}'`,
    ),
    "the candidate left the pending queue despite the guard",
  ).toBe("pending");
  expect(
    dbScalar(`select count(*) from public.customers where person_id in ('${A_ID}','${B_ID}')`),
    "a customer row moved despite the guard",
  ).toBe("2");
});
