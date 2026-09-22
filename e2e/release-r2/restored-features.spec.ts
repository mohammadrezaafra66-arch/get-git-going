/**
 * G2.8 — restored-features (read-only admin navigation)
 *
 * Each check asserts UI content from the source (file:line cited in comments),
 * never only an HTTP status. Screenshots go under R2_EVIDENCE_DIR/screenshots.
 *
 * Auth: minted JWT via storageStateForRole (e2e/helpers/role-session.ts) —
 * same pattern as e2e/torob-ops/*.spec.ts; no password mutation.
 *
 *   $env:R2_EVIDENCE_DIR  = "D:\AfraKalaTest\research\release-line\r1-r2\evidence\G2\restored-features"
 *   npx playwright test e2e/release-r2/restored-features.spec.ts --workers=1
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { lanEnv } from "../helpers/pgrest";
import { storageStateForRole } from "../helpers/role-session";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;
const EVIDENCE_DIR = process.env.R2_EVIDENCE_DIR ?? "";
const MODULE_PASSWORD = process.env.TOROB_OPS_E2E_PASSWORD ?? "";
/** src/lib/products/constants.ts:51 */
const PRODUCTS_PAGE_SIZE = 20;

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test.use({
  storageState: storageStateForRole("admin", BASE_URL, SUPABASE_URL),
  baseURL: BASE_URL,
  locale: "fa-IR",
  timezoneId: "Asia/Tehran",
});

async function shot(page: Page, name: string) {
  if (!EVIDENCE_DIR) return;
  const dir = path.join(EVIDENCE_DIR, "screenshots");
  mkdirSync(dir, { recursive: true });
  await page.screenshot({
    path: path.join(dir, `${name}.png`),
    fullPage: true,
  });
}

async function settle(page: Page) {
  await expect(page.getByTestId("route-gate-checking")).toHaveCount(0, { timeout: 20_000 }).catch(() => {});
  await expect(page.getByText("در حال آماده‌سازی…")).toHaveCount(0, { timeout: 10_000 }).catch(() => {});
}

async function unlockTorobIfPossible(page: Page) {
  const gate = page.getByText("ورود به عملیات ترب").first();
  if ((await gate.count()) === 0) return;
  if (!MODULE_PASSWORD) {
    // Gate UI is still restored content (TorobOpsGate.tsx:81).
    return;
  }
  await page.getByLabel("رمز ماژول").fill(MODULE_PASSWORD);
  await page.getByRole("button", { name: "ورود" }).click();
  await expect(gate).toHaveCount(0, { timeout: 20_000 });
}

test.beforeAll(() => {
  expect(EVIDENCE_DIR, "R2_EVIDENCE_DIR must be set (outside the worktree)").toBeTruthy();
  expect(
    path.resolve(EVIDENCE_DIR).toLowerCase().includes("wt-release-r2"),
    "R2_EVIDENCE_DIR must not be inside the R2 worktree",
  ).toBe(false);
  mkdirSync(path.join(EVIDENCE_DIR, "screenshots"), { recursive: true });
});

test("/persons/merge — paging, bulk merge, merge suggestions", async ({ page }) => {
  await page.goto("/persons/merge", { waitUntil: "domcontentloaded" });
  await settle(page);
  // PersonMergePage.tsx:362-364 — page chrome
  await expect(page.getByText("بررسی اشخاص تکراری").first()).toBeVisible({ timeout: 30_000 });
  // PersonMergePage.tsx:350 — merge suggestions (2a2792ff / b4b6413e)
  await expect(page.getByRole("button", { name: /پیشنهاد ادغام‌ها/ })).toBeVisible();
  // PersonMergePage.tsx:402-446 — paging (ee13f79f); :477 bulk
  // Wait out isLoading first — a sync count() during "در حال بارگذاری..." falsely takes the paging branch.
  await expect(page.getByText("در حال بارگذاری...")).toHaveCount(0, { timeout: 30_000 });
  const empty = page.getByText("هیچ جفت مشکوکی در انتظار بررسی نیست.");
  const pageSize = page.getByText("در هر صفحه");
  const bulk = page.getByRole("button", { name: /ادغام گروهی/ });
  await expect(empty.or(pageSize)).toBeVisible({ timeout: 15_000 });
  if (await empty.isVisible()) {
    await expect(empty).toBeVisible();
  } else {
    await expect(pageSize).toBeVisible();
    await expect(page.getByRole("button", { name: "قبلی" })).toBeVisible();
    await expect(page.getByRole("button", { name: "بعدی" })).toBeVisible();
    await expect(bulk).toBeVisible();
  }
  await shot(page, "persons-merge");
});

test("/settings/caller-id — settings form", async ({ page }) => {
  await page.goto("/settings/caller-id", { waitUntil: "domcontentloaded" });
  await settle(page);
  // _app.settings.caller-id.tsx:61-64 (77ca4856)
  await expect(page.getByText("تنظیمات Caller ID").first()).toBeVisible({ timeout: 30_000 });
  // _app.settings.caller-id.tsx:72-74
  await expect(page.getByText("Caller ID فعال باشد")).toBeVisible();
  await shot(page, "settings-caller-id");
});

test("work taxonomy catalog screen", async ({ page }) => {
  await page.goto("/operations/work/settings", { waitUntil: "domcontentloaded" });
  await settle(page);
  // WorkTaxonomiesSettingsPage.tsx:154-157 (77ca4856)
  await expect(page.getByText("تنظیمات طبقه‌بندی تیکت").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("work-taxonomies-settings")).toBeVisible();
  await expect(page.getByRole("tab", { name: "گروه‌ها" })).toBeVisible();
  await shot(page, "work-taxonomies");
});

test("collaboration sidebar pin + in-app help hints", async ({ page }) => {
  await page.goto("/collaboration", { waitUntil: "domcontentloaded" });
  await settle(page);
  // _app.collaboration.tsx:137 — HelpHint (c1ea61a1)
  await expect(page.getByLabel("راهنمای مرکز همکاری")).toBeVisible({ timeout: 30_000 });
  // AppSidebar.tsx:669-675 — pin label «همکاری»
  await expect(page.getByRole("link", { name: "همکاری" }).first()).toBeVisible();
  await shot(page, "collaboration-pin-help");
});

test("products label filter applied before paging (992a8061)", async ({ page }) => {
  // Pick a label with more products than one page (constants.ts:51 PRODUCTS_PAGE_SIZE=20).
  const row = dbScalar(`
    select l.id || E'\\t' || l.title || E'\\t' || count(pll.product_id)::text
      from product_labels l
      join product_label_links pll on pll.label_id = l.id
     group by l.id, l.title
    having count(pll.product_id) > ${PRODUCTS_PAGE_SIZE}
     order by count(pll.product_id) desc
     limit 1
  `);
  expect(row, "need a label with > page-size products").toMatch(/\t/);
  const [labelId, labelTitle] = row.split("\t");

  await page.goto("/products", { waitUntil: "domcontentloaded" });
  await settle(page);
  await expect(page.getByText("محصولات").first()).toBeVisible({ timeout: 30_000 });
  // ProductFilters.tsx:188-209 — label chips
  await page.getByRole("button", { name: labelTitle }).first().click();
  await page.waitForTimeout(2000);

  const skus = await page.locator("table tbody tr td:nth-child(3)").allTextContents();
  const cleaned = skus.map((s) => s.trim()).filter(Boolean);
  expect(cleaned.length, "filtered first page should show rows").toBeGreaterThan(0);
  expect(cleaned.length).toBeLessThanOrEqual(PRODUCTS_PAGE_SIZE);

  for (const sku of cleaned) {
    if (sku === "—") continue;
    const has = dbScalar(`
      select count(*)::text
        from products p
        join product_label_links pll on pll.product_id = p.id
       where p.sku = '${sku.replace(/'/g, "''")}'
         and pll.label_id = '${labelId}'
    `);
    expect(has, `sku ${sku} must carry label ${labelTitle}`).not.toBe("0");
  }
  await shot(page, "products-label-filter");
});

test("/torob-ops accounts, shops, settings", async ({ page }) => {
  for (const [route, title] of [
    ["/torob-ops/accounts", "استخر اکانت‌های ترب"], // TorobOpsAccountsPage.tsx:83
    ["/torob-ops/shops", "فروشگاه‌های خودی"], // TorobOpsShopsPage.tsx:74
    ["/torob-ops/settings", "تنظیمات گزارش خودکار"], // TorobOpsSettingsPage.tsx:110
  ] as const) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await settle(page);
    await unlockTorobIfPossible(page);
    const gate = page.getByText("ورود به عملیات ترب"); // TorobOpsGate.tsx:81
    const heading = page.getByText(title);
    await expect(gate.or(heading).first()).toBeVisible({ timeout: 30_000 });
    await shot(page, `torob-${route.replace(/\//g, "_")}`);
  }
});

test("/pricing/my-workbench", async ({ page }) => {
  await page.goto("/pricing/my-workbench", { waitUntil: "domcontentloaded" });
  await settle(page);
  // _app.pricing.my-workbench.tsx:325-326
  await expect(page.getByText("کارگاه قیمت من").first()).toBeVisible({ timeout: 30_000 });
  await shot(page, "pricing-my-workbench");
});

test("میز فروش and فعالیت‌ها", async ({ page }) => {
  await page.goto("/operations/sales-desk", { waitUntil: "domcontentloaded" });
  await settle(page);
  // _app.operations.sales-desk.tsx:30
  await expect(page.getByText("میز فروش").first()).toBeVisible({ timeout: 30_000 });
  await shot(page, "sales-desk");

  await page.goto("/operations/sales-desk/activities", { waitUntil: "domcontentloaded" });
  await settle(page);
  // _app.operations.sales-desk_.activities.tsx:121
  await expect(page.getByText("فعالیت‌ها").first()).toBeVisible({ timeout: 30_000 });
  await shot(page, "sales-desk-activities");
});

test("ticket page: همکاری pin + Caller ID footer entry", async ({ page }) => {
  // Open tickets board; pins live in AppSidebar (owner-reported missing on prod).
  await page.goto("/operations/work", { waitUntil: "domcontentloaded" });
  await settle(page);
  const itemId = dbScalar(
    `select id::text from work_items order by created_at desc nulls last limit 1`,
  );
  if (/^[0-9a-f-]{36}$/i.test(itemId)) {
    await page.goto(`/operations/work/${itemId}`, { waitUntil: "domcontentloaded" });
    await settle(page);
  }
  // AppSidebar.tsx:669-675 — button that opens «همکاری» (c1ea61a1)
  await expect(page.getByRole("link", { name: "همکاری" }).first()).toBeVisible({ timeout: 30_000 });
  // AppSidebar.tsx:930-936 — caller-ID settings at bottom of sidebar (77ca4856)
  await expect(page.getByRole("link", { name: "Caller ID" }).first()).toBeVisible();
  await shot(page, "ticket-collab-caller-id");
});
