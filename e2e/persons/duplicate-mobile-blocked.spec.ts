import { test, expect } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";

/**
 * Phase 8.4 (Decision 2) — one mobile = one person, globally.
 *
 * This is the REVERSAL of migration 228's B3 split, which made contact
 * identifiers unique only once confirmed so a provisional typo could not block
 * its real owner. Both identifiers here are provisional, so under the old rule
 * the second one was accepted; it must now be refused, with a Persian sentence
 * rather than a constraint name.
 */

const OWNER_NAME = `صاحب شماره ${E2E_PREFIX}`;
const OWNER_ID = "8e2e0003-0000-4000-8000-00000000c001";
const SECOND_NAME = `مدعی شماره ${E2E_PREFIX}${Date.now()}`;
// Unique per run so the fixture can never collide with real data.
const MOBILE = `0913${String(Date.now()).slice(-7)}`;

function cleanup(): void {
  dbExecE2e(`
    -- ${E2E_PREFIX} scoped cleanup
    DELETE FROM public.person_context_links
     WHERE person_id IN (SELECT id FROM public.persons
                          WHERE id = '${OWNER_ID}' OR display_name LIKE '%${E2E_PREFIX}%');
    DELETE FROM public.person_identifiers
     WHERE person_id IN (SELECT id FROM public.persons
                          WHERE id = '${OWNER_ID}' OR display_name LIKE '%${E2E_PREFIX}%');
    DELETE FROM public.person_aliases
     WHERE person_id IN (SELECT id FROM public.persons
                          WHERE id = '${OWNER_ID}' OR display_name LIKE '%${E2E_PREFIX}%');
    DELETE FROM public.persons
     WHERE id = '${OWNER_ID}' OR display_name LIKE '%${E2E_PREFIX}%';
  `);
}

test.beforeAll(() => {
  cleanup();
  dbExecE2e(`
    -- ${E2E_PREFIX} seed the person who already owns the number
    INSERT INTO public.persons (id, kind, display_name, visibility_scope, is_active)
    VALUES ('${OWNER_ID}','individual','${OWNER_NAME}','internal_general',true);
    INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
    VALUES ('${OWNER_ID}','mobile_e164','${MOBILE}','provisional',true);
  `);
});

test.afterAll(() => {
  cleanup();
  const left = dbScalar(
    `select count(*) from public.persons
      where id = '${OWNER_ID}' or display_name like '%${E2E_PREFIX}%'`,
  );
  expect(Number(left), "cleanup left E2E persons behind").toBe(0);
});

test("a second person cannot take a mobile that already belongs to someone", async ({ page }) => {
  const personsBefore = dbScalar("select count(*) from public.persons");

  // Create a second person through the real UI flow.
  await page.goto("/persons/create");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("نام نمایشی *").fill(SECOND_NAME);
  await page.getByRole("button", { name: "ایجاد شخص" }).click();
  await page.waitForURL(/\/persons\/[0-9a-f-]{36}\/edit/, { timeout: 20_000 });

  const secondId = page.url().match(/\/persons\/([0-9a-f-]{36})\/edit/)![1];

  // Now try to give them the number that is already taken.
  const kindCombo = page.getByRole("combobox").nth(2);
  await expect(kindCombo).toContainText("موبایل");
  await page.getByPlaceholder("مقدار شناسه").fill(MOBILE);
  await page.getByRole("button", { name: "افزودن", exact: true }).first().click();

  // A clear Persian sentence appears — not «uq_person_identifiers_...», not
  // «duplicate key value violates unique constraint».
  const alert = page.getByText(/این شماره قبلاً/).first();
  await expect(alert, "no Persian duplicate-number message was shown").toBeVisible({
    timeout: 15_000,
  });

  const shown = await page.locator("body").innerText();
  expect(shown, "a raw constraint name leaked into the UI").not.toContain("uq_person_identifiers");
  expect(shown, "a raw Postgres error leaked into the UI").not.toContain("duplicate key");

  // The identifier was NOT written to the second person.
  expect(
    dbScalar(`select count(*) from public.person_identifiers where person_id = '${secondId}'`),
    "the duplicate identifier was stored anyway",
  ).toBe("0");

  // The number still belongs to exactly one person — the original owner.
  expect(
    dbScalar(
      `select count(distinct person_id) from public.person_identifiers
        where kind = 'mobile_e164' and value_normalized = '+98913${MOBILE.slice(4)}'
          and status <> 'revoked'`,
    ),
    "the mobile is now held by more than one person",
  ).toBe("1");

  // Exactly one person was created (the second one), not two.
  expect(
    Number(dbScalar("select count(*) from public.persons")) - Number(personsBefore),
    "an unexpected number of persons was created",
  ).toBe(1);
});
