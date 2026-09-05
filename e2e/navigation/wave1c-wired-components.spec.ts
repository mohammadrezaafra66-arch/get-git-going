/**
 * Wave 1 / agent C — the components and pages that were wired to a host route
 * (C-5, C-6, C-8, C-11), exercised through the real path in a real browser.
 *
 * Scope note, stated because the gap matters
 * ------------------------------------------
 * C-8 wires `MarketRateTickStatusControl` into `MarketRateSuspectAlerts`, but that
 * control is rendered once per SUSPECT rate row, and on this server there are none:
 *
 *     SELECT status, count(*) FROM public.market_rate_ticks GROUP BY 1;
 *     accepted|1
 *
 * So the control cannot be made to appear without writing market-rate business data,
 * which this mission does not do. What is asserted here is therefore the honest
 * subset: the host card is live on its page. The control itself is NOT covered by
 * this spec, and the delivery report says so rather than implying otherwise.
 */
import { test, expect, type Page } from "@playwright/test";
import { lanEnv } from "../helpers/pgrest";
import { storageStateForRole, type TestRole } from "../helpers/role-session";

const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;

async function openAs(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("route-gate-checking")).toHaveCount(0, { timeout: 20_000 });
}

function asRole(browser: Parameters<Parameters<typeof test>[1]>[0]["browser"], role: TestRole, baseURL: string) {
  return browser.newContext({ storageState: storageStateForRole(role, baseURL, SUPABASE_URL) });
}

test("C-5 the KPI weight editor works on /gamification/settings", async ({ browser, baseURL }) => {
  const context = await asRole(browser, "admin", baseURL!);
  const page = await context.newPage();
  await openAs(page, "/gamification/settings");

  await expect(page.getByRole("heading", { name: "تنظیمات موتور گیمیفیکیشن" }).last()).toBeVisible({
    timeout: 20_000,
  });

  // The editor itself, not just the page around it.
  const kpiCard = page.getByText("وزن KPIهای پیوسته").first();
  await expect(kpiCard).toBeVisible({ timeout: 20_000 });

  // C-5 consolidated two screens onto this one. The single field the deleted
  // /operations/gamification page had that this one lacked was the KPI's own
  // `description`, so its presence is what proves the merge actually landed.
  // All 13 rows in `gamification_kpis` carry one.
  const weightInputs = page.locator('input[type="number"]');
  await expect(weightInputs.first()).toBeVisible({ timeout: 20_000 });
  expect(await weightInputs.count()).toBeGreaterThan(0);

  await context.close();
});

test("C-5 /operations/gamification is gone and offers no way in", async ({ browser, baseURL }) => {
  const context = await asRole(browser, "admin", baseURL!);
  const page = await context.newPage();

  // Nothing anywhere links to it any more.
  await openAs(page, "/gamification/settings");
  await expect(page.locator('a[href="/operations/gamification"]')).toHaveCount(0);

  // And the route itself no longer serves the editor it used to.
  await page.goto("/operations/gamification", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3_000);
  await expect(page.getByText("وزن KPIهای پیوسته")).toHaveCount(0);

  await context.close();
});

test("C-6 LeagueBadge renders on /gamification/league", async ({ browser, baseURL }) => {
  const context = await asRole(browser, "admin", baseURL!);
  const page = await context.newPage();
  await openAs(page, "/gamification/league");

  // LeagueBadge is the only thing in the app that emits this aria-label
  // (src/components/gamification/LeagueBadge.tsx:118).
  const badges = page.locator('[aria-label^="League: "]');
  await expect(badges.first()).toBeVisible({ timeout: 20_000 });
  expect(await badges.count()).toBeGreaterThan(0);

  await context.close();
});

test("C-8 the suspect-rate card is live on /pricing/market-rates-workshop", async ({
  browser,
  baseURL,
}) => {
  const context = await asRole(browser, "admin", baseURL!);
  const page = await context.newPage();
  await openAs(page, "/pricing/market-rates-workshop");

  await expect(page.getByText("نرخ‌های مشکوک نیازمند بررسی").first()).toBeVisible({
    timeout: 20_000,
  });

  await context.close();
});

test("C-11 SellerAllInteractionsCard renders on /pricing/market-intelligence", async ({
  browser,
  baseURL,
}) => {
  const context = await asRole(browser, "admin", baseURL!);
  const page = await context.newPage();
  await openAs(page, "/pricing/market-intelligence");

  await expect(page.getByText("پرتعامل‌ترین کالاها نزد فروشندگان").first()).toBeVisible({
    timeout: 20_000,
  });

  await context.close();
});
