import { test, expect } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";

/**
 * Phase 6.4 + 6.5 — add a name AND an identifier on /persons/create in one
 * flow, with no create-then-edit detour. Uses getByLabel throughout, so it also
 * asserts the 6.5 label wiring.
 */

const NAME = `تست یکجا ${E2E_PREFIX}${Date.now()}`;
const RAW = "09125556677";
const NORMALIZED = "+989125556677";

function cleanup(): void {
  dbExecE2e(`
    DELETE FROM public.person_context_links
     WHERE person_id IN (SELECT id FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%');
    DELETE FROM public.person_merge_candidates
     WHERE person_id_a IN (SELECT id FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%')
        OR person_id_b IN (SELECT id FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%');
    DELETE FROM public.person_identifiers
     WHERE person_id IN (SELECT id FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%');
    DELETE FROM public.persons WHERE display_name LIKE '%${E2E_PREFIX}%';
  `);
}

test.afterAll(() => {
  cleanup();
  expect(
    Number(dbScalar(`select count(*) from public.persons where display_name like '%${E2E_PREFIX}%'`)),
    "cleanup left E2E persons behind",
  ).toBe(0);
});

test("create a person and its identifier in a single submit", async ({ page }) => {
  await page.goto("/persons/create");
  await page.waitForLoadState("networkidle");

  // 6.5 — these resolve only because PersonForm labels are wired to controls.
  await page.getByLabel("نام نمایشی *").fill(NAME);

  // 6.4 — the identifiers section now exists on the CREATE page.
  await expect(page.getByText("شناسه‌ها").first()).toBeVisible();
  await page.getByPlaceholder("مقدار شناسه").fill(RAW);
  await page.getByRole("button", { name: "افزودن", exact: true }).first().click();

  // The draft row shows a client-side normalization preview before saving.
  await expect(page.getByText(NORMALIZED).first()).toBeVisible({ timeout: 10_000 });

  // Nothing is persisted yet — this is the whole point of draft mode.
  expect(
    Number(dbScalar(`select count(*) from public.persons where display_name = '${NAME}'`)),
    "person must not exist before submit",
  ).toBe(0);

  await page.getByRole("button", { name: "ایجاد شخص" }).click();
  await page.waitForURL(/\/persons\/[0-9a-f-]{36}\/edit/, { timeout: 20_000 });

  const personId = page.url().match(/\/persons\/([0-9a-f-]{36})\/edit/)![1];
  const stored = dbScalar(`
    select p.display_name || '|' || coalesce(i.value_raw,'NONE') || '|' || coalesce(i.value_normalized,'NONE')
      from public.persons p
      left join public.person_identifiers i on i.person_id = p.id and i.kind = 'mobile_e164'
     where p.id = '${personId}'
  `);
  const [displayName, raw, normalized] = stored.split("|");
  expect(displayName).toBe(NAME);
  expect(raw, "raw value kept as typed").toBe(RAW);
  expect(normalized, "server normalized it in the same transaction").toBe(NORMALIZED);
});
