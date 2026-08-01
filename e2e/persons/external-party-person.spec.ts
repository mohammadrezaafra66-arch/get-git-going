import { test, expect } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";

/**
 * Phase 8.5 (Decision 3) — every external party has a person, and new ones
 * cannot be created without one.
 *
 * The party is created through its REAL form (/accounting/external-parties),
 * which migration 242 rewired onto person_create_inline with
 * context_kind='accounting_party'. That is the one and only creation path in
 * the codebase; the receipt state-2 «کد آسان» flow only ever SELECTs existing
 * parties, so it is exercised here read-only rather than through a fake write.
 */

const PARTY_NAME = `طرف حساب ${E2E_PREFIX}${Date.now()}`;
const PARTY_MOBILE = `0914${String(Date.now()).slice(-7)}`;

function cleanup(): void {
  dbExecE2e(`
    -- ${E2E_PREFIX} scoped cleanup
    DELETE FROM public.person_context_links
     WHERE ref_table = 'external_parties'
       AND ref_id IN (SELECT id FROM public.external_parties WHERE full_name LIKE '%${E2E_PREFIX}%');
    DELETE FROM public.external_parties WHERE full_name LIKE '%${E2E_PREFIX}%';
    DELETE FROM public.person_context_links
     WHERE person_id IN (SELECT id FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%');
    DELETE FROM public.person_identifiers
     WHERE person_id IN (SELECT id FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%');
    DELETE FROM public.person_aliases
     WHERE person_id IN (SELECT id FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%');
    DELETE FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%';
  `);
}

test.beforeAll(cleanup);

test.afterAll(() => {
  cleanup();
  expect(
    Number(
      dbScalar(
        `select count(*) from public.external_parties where full_name like '%${E2E_PREFIX}%'`,
      ),
    ),
    "cleanup left E2E external parties behind",
  ).toBe(0);
  expect(
    Number(
      dbScalar(`select count(*) from public.persons where display_name like '%${E2E_PREFIX}%'`),
    ),
    "cleanup left E2E persons behind",
  ).toBe(0);
});

test("creating an external party through its form also creates a person and a context link", async ({
  page,
}) => {
  await page.goto("/accounting/external-parties");
  await page.waitForLoadState("networkidle");
  await expect(page).not.toHaveURL(/\/login/);

  await page.getByRole("button", { name: "افزودن طرف حساب" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // getByLabel works because Phase 8.5 wired htmlFor/id on this form; using it
  // here means the test also asserts that label-control association.
  await dialog.getByLabel(/نام و نام‌خانوادگی/).fill(PARTY_NAME);
  await dialog.getByLabel("شماره موبایل").fill(PARTY_MOBILE);

  await dialog.getByRole("button", { name: "ذخیره", exact: true }).click();

  // The row lands with a person attached.
  await expect
    .poll(
      () =>
        dbScalar(`select count(*) from public.external_parties where full_name = '${PARTY_NAME}'`),
      { timeout: 20_000, message: "the external party was never created" },
    )
    .toBe("1");

  const partyId = dbScalar(
    `select id::text from public.external_parties where full_name = '${PARTY_NAME}'`,
  );
  const personId = dbScalar(
    `select person_id::text from public.external_parties where id = '${partyId}'`,
  );

  expect(personId, "external_parties.person_id is null after creation").toBeTruthy();

  // The person really exists and carries the party's name.
  expect(
    dbScalar(`select display_name from public.persons where id = '${personId}'`),
    "the created person does not carry the party name",
  ).toBe(PARTY_NAME);

  // And the provenance link was written, with the accounting_party kind.
  expect(
    dbScalar(
      `select count(*) from public.person_context_links
        where person_id = '${personId}'
          and context_kind = 'accounting_party'
          and ref_table = 'external_parties'
          and ref_id = '${partyId}'`,
    ),
    "no accounting_party context link was written",
  ).toBe("1");

  expect(dbScalar("select count(*) from public.person_fk_drift_report()")).toBe("0");
});

test("external_parties.person_id is NOT NULL and no row escapes it", () => {
  expect(
    dbScalar(
      `select is_nullable from information_schema.columns
        where table_schema='public' and table_name='external_parties' and column_name='person_id'`,
    ),
    "external_parties.person_id is still nullable",
  ).toBe("NO");

  expect(
    dbScalar("select count(*) from public.external_parties where person_id is null"),
    "an external party exists without a person",
  ).toBe("0");
});

test("the receipt flow can still read external parties", async ({ page }) => {
  // The «کد آسان» / state-2 receipt flow consumes external parties read-only.
  // Migration 242 did not touch that path; this confirms it still resolves.
  await page.goto("/accounting/receipts");
  await page.waitForLoadState("networkidle");
  await expect(page).not.toHaveURL(/\/login/);

  expect(
    Number(dbScalar("select count(*) from public.external_parties where is_active")),
    "no active external parties are selectable for the receipt flow",
  ).toBeGreaterThan(0);
});
