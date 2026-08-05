import { expect, test } from "@playwright/test";
import { E2E_PREFIX } from "../helpers/app";
import { dbExecE2e } from "../helpers/db-write";
import { dbScalar } from "../helpers/db";
import { ADMIN_USER_ID } from "../helpers/pgrest";

/**
 * Phase 5 browser — expanded person dossier at /persons/$personId.
 */

const TAG = `${E2E_PREFIX}P5UI_`;
const PERSON = "a3050002-0000-4000-8000-00000000a001";
const PEER = "a3050002-0000-4000-8000-00000000a002";
const C_CUST = "a3050002-0000-4000-8000-00000000c001";
const S_SUPP = "a3050002-0000-4000-8000-00000000d001";
const E_ACCT = "a3050002-0000-4000-8000-00000000e001";
const COLLISION = "a3050002-0000-4000-8000-00000000f001";
const PHONE = "09129993066";
const NAME = `${TAG}DossierHost`;

function cleanup(): void {
  dbExecE2e(`
    -- ${E2E_PREFIX} P5UI cleanup
    DELETE FROM public.audit_logs
     WHERE entity_id IN ('${PERSON}','${PEER}')
        OR (diff->>'person_id') IN ('${PERSON}','${PEER}');
    DELETE FROM public.phone_collisions WHERE id = '${COLLISION}' OR normalized_phone = '${PHONE}';
    DELETE FROM public.person_merge_candidates
     WHERE person_id_a IN ('${PERSON}','${PEER}') OR person_id_b IN ('${PERSON}','${PEER}');
    DELETE FROM public.person_context_links WHERE person_id IN ('${PERSON}','${PEER}');
    DELETE FROM public.customers WHERE id = '${C_CUST}';
    DELETE FROM public.suppliers WHERE id = '${S_SUPP}';
    DELETE FROM public.external_parties WHERE id = '${E_ACCT}';
    DELETE FROM public.person_identifiers WHERE person_id IN ('${PERSON}','${PEER}');
    DELETE FROM public.person_aliases WHERE person_id IN ('${PERSON}','${PEER}');
    DELETE FROM public.persons WHERE id IN ('${PERSON}','${PEER}');
  `);
}

test.beforeAll(() => {
  cleanup();
  const salesId =
    dbScalar(
      `select ur.user_id::text from public.user_roles ur where ur.role='sales' limit 1`,
    ) || ADMIN_USER_ID;

  dbExecE2e(`
    -- ${E2E_PREFIX} P5UI seed
    INSERT INTO public.persons (id, kind, display_name, legal_name, visibility_scope, is_active, created_by)
    VALUES
      ('${PERSON}', 'individual', '${NAME}', '${TAG}Legal', 'internal_general', true, '${ADMIN_USER_ID}'),
      ('${PEER}', 'individual', '${TAG}Peer', NULL, 'internal_general', true, '${ADMIN_USER_ID}');

    INSERT INTO public.customers (id, name, person_id, responsible_id)
    VALUES ('${C_CUST}', '${TAG}CustName', '${PERSON}', '${salesId}');

    INSERT INTO public.suppliers (id, name, person_id)
    VALUES ('${S_SUPP}', '${TAG}SuppName', '${PERSON}');

    INSERT INTO public.external_parties (id, full_name, person_id)
    VALUES ('${E_ACCT}', '${TAG}ExtName', '${PERSON}');

    INSERT INTO public.person_identifiers (person_id, kind, value_raw, status, is_primary)
    VALUES ('${PERSON}', 'mobile_e164', '${PHONE}', 'confirmed', true);

    INSERT INTO public.person_context_links
      (person_id, context_kind, ref_table, ref_id, note, started_at, ended_at)
    VALUES
      ('${PERSON}', 'customer', 'customers', '${C_CUST}', '${TAG}', now(), NULL),
      ('${PERSON}', 'supplier', 'suppliers', '${S_SUPP}', '${TAG}', now(), NULL),
      ('${PERSON}', 'staff_link', 'profiles', '${ADMIN_USER_ID}', '${TAG}', now(), NULL),
      ('${PERSON}', 'accounting_party', 'external_parties', '${E_ACCT}', '${TAG}', now(), NULL),
      ('${PERSON}', 'customer', 'customers', 'a3050002-0000-4000-8000-00000000dead', '${TAG}broken', now(), NULL),
      ('${PERSON}', 'driver', NULL, NULL, '${TAG}ended', now() - interval '10 days', now() - interval '1 day');

    INSERT INTO public.person_merge_candidates (person_id_a, person_id_b, reason, detail, status)
    VALUES ('${PERSON}', '${PEER}', 'shared_identifier', '${TAG}evidence', 'pending');

    INSERT INTO public.phone_collisions (id, normalized_phone, entity_refs, status)
    VALUES (
      '${COLLISION}',
      '${PHONE}',
      '[{"table":"customers","id":"${C_CUST}","label":"${TAG}CustName"},{"table":"customers","id":"a3050002-0000-4000-8000-00000000zzzz","label":null}]'::jsonb,
      'pending'
    );

    INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, diff)
    VALUES
      ('${ADMIN_USER_ID}', 'person.identifier.add', 'person_identifier', '${PERSON}',
       '{"person_id":"${PERSON}","value":"${PHONE}","tag":"${TAG}"}'::jsonb);
  `);
});

test.afterAll(() => {
  cleanup();
  expect(dbScalar("select count(*) from public.person_fk_drift_report()")).toBe("0");
});

test.describe("admin dossier", () => {
  test("admin sees all sections, deep links, merge, collision, redacted audit", async ({
    page,
  }) => {
    await page.goto(`/persons/${PERSON}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("خلاصه هویت").first()).toBeVisible();
    await expect(page.getByText("نام نمایشی").first()).toBeVisible();
    await expect(page.getByText("نام حقوقی").first()).toBeVisible();
    await expect(page.getByText(`${TAG}Legal`).first()).toBeVisible();
    await expect(page.getByText("نقش‌ها و پرونده‌های مرتبط").first()).toBeVisible();
    await expect(page.getByText("وضعیت ادغام").first()).toBeVisible();
    await expect(page.getByText("تداخل شماره تلفن").first()).toBeVisible();
    await expect(page.getByText("فعالیت اخیر").first()).toBeVisible();
    await expect(page.getByText("فراداده").first()).toBeVisible();

    await expect(page.getByRole("link", { name: "باز کردن پرونده" })).toHaveCount(4, {
      timeout: 15_000,
    });
    await expect(page.getByText("پرونده مرتبط قابل نمایش نیست").first()).toBeVisible();
    await expect(page.getByText("نقش‌های پایان‌یافته").first()).toBeVisible();
    await expect(page.getByText("پایان‌یافته").first()).toBeVisible();

    await expect(page.getByText("در انتظار بررسی").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "بررسی اشخاص تکراری" })).toBeVisible();
    await expect(page.getByRole("link", { name: "مشاهدهٔ صف تداخل" })).toBeVisible();

    await expect(page.getByText("افزودن شناسه").first()).toBeVisible();
    // Audit rows must not dump raw identifier values (phone still OK in identifiers/collision).
    const auditEvent = page.locator("li").filter({ hasText: "افزودن شناسه" }).first();
    await expect(auditEvent).toBeVisible();
    await expect(auditEvent.getByText(PHONE)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "مشاهدهٔ کامل حسابرسی" })).toBeVisible();

    // Deep-link navigation — customer edit
    const customerLink = page
      .locator(`a[href="/sales/customers/${C_CUST}/edit"]`)
      .filter({ hasText: "باز کردن پرونده" });
    await expect(customerLink).toBeVisible();
    await customerLink.click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(new RegExp(`/sales/customers/${C_CUST}/edit`));
    await expect(page).not.toHaveURL(/\/unauthorized/);

    await page.goto(`/persons/${PERSON}`);
    await page.waitForLoadState("networkidle");
    const supplierLink = page
      .locator(`a[href="/suppliers/${S_SUPP}"]`)
      .filter({ hasText: "باز کردن پرونده" });
    await supplierLink.click();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(new RegExp(`/suppliers/${S_SUPP}`));

    await page.goto(`/persons/${PERSON}`);
    await page.waitForLoadState("networkidle");
    const staffLink = page
      .locator(`a[href="/users/${ADMIN_USER_ID}"]`)
      .filter({ hasText: "باز کردن پرونده" });
    await expect(staffLink).toBeVisible();
    await staffLink.click();
    await page.waitForLoadState("networkidle");
    // Detail route exists; some profiles redirect to the users list if row is sparse.
    await expect(page).toHaveURL(/\/users/);
    await expect(page).not.toHaveURL(/\/unauthorized|\/login/);
  });
});

test.describe("accountant dossier", () => {
  test.use({ storageState: "e2e/auth/accountant.storage.json" });

  test("accountant sees profile; no edit; no merge review", async ({ page }) => {
    await page.goto(`/persons/${PERSON}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("پروندهٔ فقط‌خواندنی شخص")).toBeVisible();
    await expect(page.getByRole("link", { name: "ویرایش" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "بررسی اشخاص تکراری" })).toHaveCount(0);
    await expect(page.getByText("وضعیت ادغام برای این نقش قابل نمایش نیست")).toBeVisible();
    // Audit section follows role_permissions / audit-logs.view — may be present if granted.
  });
});

test.describe("sales dossier", () => {
  test.use({ storageState: "e2e/auth/salesperson-a.storage.json" });

  test("sales sees dossier without privileged merge/audit", async ({ page }) => {
    await page.goto(`/persons/${PERSON}`);
    await page.waitForLoadState("networkidle");

    const body = await page.locator("body").innerText();
    const ok =
      body.includes("پروندهٔ فقط‌خواندنی شخص") ||
      body.includes("شخصی با این شناسه یافت نشد یا به آن دسترسی ندارید");
    expect(ok).toBeTruthy();
    await expect(page.getByRole("link", { name: "ویرایش" })).toHaveCount(0);
    await expect(page.getByText("فعالیت اخیر")).toHaveCount(0);
  });
});

test.describe("viewer dossier", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("viewer: no write controls, identifier privacy copy", async ({ page }) => {
    const email = "test.viewer@afrakala.local";
    const password = "AfraTest!1404";

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.locator('input[name="email"][type="email"]').fill(email);
    await page.locator('input[name="password"][type="password"]').fill(password);
    await page.getByRole("button", { name: /^ورود$/ }).click();
    await expect(page).not.toHaveURL(/\/login(?:$|\?)/, { timeout: 30_000 });

    await page.goto(`/persons/${PERSON}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("پروندهٔ فقط‌خواندنی شخص")).toBeVisible();
    await expect(page.getByRole("link", { name: "ویرایش" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "افزودن نام دیگر" })).toHaveCount(0);
    await expect(page.getByText("اطلاعات شناسه برای این نقش قابل نمایش نیست")).toBeVisible();
    await expect(page.getByText("۳ شناسه مخفی")).toHaveCount(0);
    await expect(page.getByText("فعالیت اخیر")).toHaveCount(0);
  });
});

test.describe("mobile dossier", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("375px stacks without horizontal overflow", async ({ page }) => {
    await page.goto(`/persons/${PERSON}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("خلاصه هویت").first()).toBeVisible();
    const overflow = await page.evaluate(() => {
      const main = document.querySelector("main") ?? document.body;
      return main.scrollWidth > main.clientWidth + 2;
    });
    expect(overflow).toBeFalsy();
  });

  test("320px usable", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(`/persons/${PERSON}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("نقش‌ها و پرونده‌های مرتبط").first()).toBeVisible();
    const overflow = await page.evaluate(() => {
      const main = document.querySelector("main") ?? document.body;
      return main.scrollWidth > main.clientWidth + 2;
    });
    expect(overflow).toBeFalsy();
  });
});
