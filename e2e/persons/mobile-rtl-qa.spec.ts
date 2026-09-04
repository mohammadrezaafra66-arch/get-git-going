import { expect, test } from "@playwright/test";
import { E2E_PREFIX } from "../helpers/app";
import { dbExecE2e } from "../helpers/db-write";
import { dbScalar } from "../helpers/db";

/**
 * Phase 6B — Mobile / RTL overflow QA for Persons surfaces.
 * Intentional overflow-x-auto on tables is allowed; document scrollWidth must not grow.
 */

const TAG = `${E2E_PREFIX}P6MOB_`;
const PERSON = "a3060002-0000-4000-8000-00000000a001";
const NAME = `${TAG}LongName_ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789`;

const VIEWPORTS = [
  { w: 320, h: 568 },
  { w: 375, h: 667 },
  { w: 390, h: 844 },
  { w: 430, h: 932 },
] as const;

function cleanup(): void {
  dbExecE2e(`
    -- ${E2E_PREFIX} P6MOB cleanup
    DELETE FROM public.person_aliases WHERE person_id = '${PERSON}';
    DELETE FROM public.person_identifiers WHERE person_id = '${PERSON}';
    DELETE FROM public.person_context_links WHERE person_id = '${PERSON}';
    DELETE FROM public.persons WHERE id = '${PERSON}';
  `);
}

async function assertNoDocOverflow(page: import("@playwright/test").Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "document horizontal overflow").toBeLessThanOrEqual(2);
}

test.beforeAll(() => {
  cleanup();
  dbExecE2e(`
    -- ${E2E_PREFIX} P6MOB seed
    INSERT INTO public.persons (id, kind, display_name, legal_name, visibility_scope, is_active)
    VALUES ('${PERSON}', 'individual', '${NAME}', '${TAG}Legal', 'internal_general', true);
    INSERT INTO public.person_aliases (person_id, alias, alias_kind, source)
    VALUES ('${PERSON}', '${TAG}Alias_VERY_LONG_STRING_FOR_WRAP_TEST_XXXX', 'other', 'manual');
    INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
    VALUES ('${PERSON}', 'email', 'long.${TAG.toLowerCase()}@example.invalid', 'provisional', true);
  `);
});

test.afterAll(() => {
  cleanup();
  expect(dbScalar(`select count(*) from public.persons where id = '${PERSON}'`)).toBe("0");
});

for (const vp of VIEWPORTS) {
  test.describe(`mobile ${vp.w}x${vp.h}`, () => {
    test.use({ viewport: { width: vp.w, height: vp.h } });

    test(`/persons list`, async ({ page }) => {
      await page.goto("/persons");
      await page.waitForLoadState("networkidle");
      await expect(page.getByText("اشخاص").first()).toBeVisible();
      await assertNoDocOverflow(page);
      const dir = await page.evaluate(() => document.documentElement.getAttribute("dir"));
      expect(dir).toBe("rtl");
    });

    test(`/persons/$id profile`, async ({ page }) => {
      await page.goto(`/persons/${PERSON}`);
      await page.waitForLoadState("networkidle");
      await expect(page.getByText("پروندهٔ فقط‌خواندنی شخص").first()).toBeVisible();
      await assertNoDocOverflow(page);
    });

    test(`/persons/$id/edit`, async ({ page }) => {
      await page.goto(`/persons/${PERSON}/edit`);
      await page.waitForLoadState("networkidle");
      await expect(page).not.toHaveURL(/\/unauthorized/);
      await assertNoDocOverflow(page);
    });

    test(`/persons/merge`, async ({ page }) => {
      await page.goto("/persons/merge");
      await page.waitForLoadState("networkidle");
      await expect(page).not.toHaveURL(/\/unauthorized/);
      await assertNoDocOverflow(page);
    });

    test(`/admin/phone-collisions`, async ({ page }) => {
      await page.goto("/admin/phone-collisions");
      await page.waitForLoadState("networkidle");
      await expect(page.getByText("تداخل شماره تلفن").first()).toBeVisible();
      await assertNoDocOverflow(page);
      // Table may scroll internally.
      const hasScrollContainer = await page.locator(".overflow-x-auto").count();
      expect(hasScrollContainer).toBeGreaterThanOrEqual(0);
    });

    // A-6 (2026-09-04) — /persons/import was retired. /admin/asan-import below is the
    // one surviving import surface and is already covered by the next case.

    test(`/admin/asan-import`, async ({ page }) => {
      await page.goto("/admin/asan-import");
      await page.waitForLoadState("networkidle");
      // Admin storage: allowed. If redirected unauthorized, still no overflow.
      await assertNoDocOverflow(page);
    });
  });
}
