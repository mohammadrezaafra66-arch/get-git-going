import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

import { BASE_URL, expectNoSevereConsoleErrors, saveEvidence } from "../helpers/app";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";

const SALESPERSON_STORAGE = "e2e/auth/salesperson-a.storage.json";
const AUTH_SETUP_COMMAND =
  "npx playwright test --config=playwright.auth.config.ts e2e/auth/save-role-sessions.spec.ts --headed";

type UserFingerprint = { id: string; email: string | null };
type FixtureCustomer = { id: string; name: string; phone: string };
type FixtureData = {
  productId: string;
  productName: string;
  productSku: string;
  warehouseId: string;
  warehouseName: string;
  salePriceTypeId: string;
  salePriceTypeTitle: string;
  settlementTypeId: string;
  settlementTypeTitle: string;
  sufficient: FixtureCustomer;
  overdue: FixtureCustomer;
  shortfall: FixtureCustomer;
  noCredit: FixtureCustomer;
};

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

function sqlText(value: string): string {
  return value.replace(/'/g, "''");
}

function searchableSuffix(value: string): string {
  return value.replace(/^E2E_AUDIT_212_\d+_/, "");
}

function readDotEnvValue(filePath: string, key: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    if (match[1].trim() !== key) continue;
    return match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return null;
}

function readLanSupabaseEnv(): { url: string; key: string } {
  const envFiles = [
    path.resolve(".env.e2e.local"),
    path.resolve("deploy/lan/.env.lan"),
    path.resolve(".env.local"),
    path.resolve(".env"),
  ];
  const read = (names: string[]) => {
    for (const file of envFiles) {
      for (const name of names) {
        const value = readDotEnvValue(file, name);
        if (value) return value;
      }
    }
    return "";
  };
  const url =
    process.env.SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    read(["VITE_SUPABASE_URL", "API_EXTERNAL_URL"]);
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    read(["VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_PUBLISHABLE_KEY", "ANON_KEY"]);
  expect(url, "Missing LAN Supabase URL for authenticated API anti-bypass check").toBeTruthy();
  expect(key, "Missing LAN Supabase publishable key for authenticated API anti-bypass check").toBeTruthy();
  return { url: url.replace(/\/$/, ""), key };
}

function readSessionFromStorage(storageFile: string): { accessToken: string; refreshToken: string } {
  const state = JSON.parse(fs.readFileSync(storageFile, "utf8")) as {
    origins?: Array<{ localStorage?: Array<{ name: string; value: string }> }>;
  };
  for (const origin of state.origins ?? []) {
    for (const item of origin.localStorage ?? []) {
      if (!item.name.includes("auth-token") && !item.name.includes("sb-")) continue;
      try {
        const parsed = JSON.parse(item.value) as {
          access_token?: string;
          refresh_token?: string;
          currentSession?: { access_token?: string; refresh_token?: string };
        };
        const accessToken = parsed.access_token ?? parsed.currentSession?.access_token;
        const refreshToken = parsed.refresh_token ?? parsed.currentSession?.refresh_token;
        if (accessToken && refreshToken) return { accessToken, refreshToken };
      } catch {
        // Ignore unrelated localStorage entries.
      }
    }
  }
  throw new Error(`${storageFile} does not contain a usable Supabase session`);
}

async function newSalesContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    baseURL: BASE_URL,
    storageState: SALESPERSON_STORAGE,
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
  });
}

async function readUserFingerprint(page: Page): Promise<UserFingerprint> {
  return page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (!key.includes("auth-token") && !key.includes("sb-")) continue;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw) as {
          user?: { id?: string; email?: string | null };
          currentSession?: { user?: { id?: string; email?: string | null } };
        };
        const user = parsed.user ?? parsed.currentSession?.user;
        if (typeof user?.id === "string" && user.id.length > 8) {
          return { id: user.id, email: user.email ?? null };
        }
      } catch {
        // Ignore malformed localStorage entries.
      }
    }
    return { id: "", email: null };
  });
}

async function verifySalespersonSession(browser: Browser): Promise<UserFingerprint> {
  expect(
    fs.existsSync(SALESPERSON_STORAGE),
    `Missing ${SALESPERSON_STORAGE}. Generate it with: ${AUTH_SETUP_COMMAND}`,
  ).toBe(true);

  const context = await newSalesContext(browser);
  const page = await context.newPage();
  try {
    await page.goto("/sales/quotes", { waitUntil: "domcontentloaded" });
    await expect(page, "salesperson session redirected to login").not.toHaveURL(/\/login(?:$|\?)/);
    await expect(page.getByText("بدون نقش", { exact: true })).toHaveCount(0);
    await expect(page.getByText("فروشنده", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/پیش‌فاکتور|پیش فاکتور/).first()).toBeVisible();
    const fp = await readUserFingerprint(page);
    expect(fp.id, "authenticated salesperson id not found").toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    return fp;
  } finally {
    await context.close();
  }
}

function cleanupFixture(prefix: string): void {
  dbExecE2e(`
BEGIN;
DELETE FROM public.notification_queue
 WHERE title LIKE '%${sqlText(prefix)}%'
    OR body LIKE '%${sqlText(prefix)}%'
    OR reference_id IN (SELECT id FROM public.sales_quotes WHERE customer_name LIKE '${sqlText(prefix)}%');

DELETE FROM public.stock_movements
 WHERE ref_id IN (SELECT id FROM public.sales_quotes WHERE customer_name LIKE '${sqlText(prefix)}%')
    OR product_id IN (SELECT id FROM public.products WHERE sku LIKE '${sqlText(prefix)}%');

DELETE FROM public.sales_quote_send_queue
 WHERE quote_id IN (SELECT id FROM public.sales_quotes WHERE customer_name LIKE '${sqlText(prefix)}%');

DELETE FROM public.sales_quotes
 WHERE customer_name LIKE '${sqlText(prefix)}%';

DELETE FROM public.audit_logs
 WHERE COALESCE(diff::text, '') LIKE '%${sqlText(prefix)}%'
    OR COALESCE(entity_id, '') IN (
      SELECT id::text FROM public.products WHERE sku LIKE '${sqlText(prefix)}%'
      UNION
      SELECT id::text FROM public.customers WHERE name LIKE '${sqlText(prefix)}%'
    );

DELETE FROM public.product_sale_price_history
 WHERE product_id IN (SELECT id FROM public.products WHERE sku LIKE '${sqlText(prefix)}%');

DELETE FROM public.product_computed_prices
 WHERE product_id IN (SELECT id FROM public.products WHERE sku LIKE '${sqlText(prefix)}%');

DELETE FROM public.warehouse_stock
 WHERE product_id IN (SELECT id FROM public.products WHERE sku LIKE '${sqlText(prefix)}%')
    OR warehouse_id IN (SELECT id FROM public.warehouses WHERE code LIKE '${sqlText(prefix)}%');

DELETE FROM public.customer_capital_allocations_dynamic
 WHERE customer_id IN (SELECT id FROM public.customers WHERE name LIKE '${sqlText(prefix)}%')
    OR capital_setting_id IN (SELECT id FROM public.daily_capital_settings WHERE notes LIKE '%${sqlText(prefix)}%');

DELETE FROM public.salesperson_capital_allocations_dynamic
 WHERE capital_setting_id IN (SELECT id FROM public.daily_capital_settings WHERE notes LIKE '%${sqlText(prefix)}%');

DELETE FROM public.daily_capital_settings
 WHERE notes LIKE '%${sqlText(prefix)}%';

DELETE FROM public.customer_credit_balance
 WHERE customer_id IN (SELECT id FROM public.customers WHERE name LIKE '${sqlText(prefix)}%');

DELETE FROM public.customer_credit_profile
 WHERE customer_id IN (SELECT id FROM public.customers WHERE name LIKE '${sqlText(prefix)}%');

DELETE FROM public.customers
 WHERE name LIKE '${sqlText(prefix)}%';

DELETE FROM public.persons
 WHERE display_name LIKE '${sqlText(prefix)}%';

DELETE FROM public.products
 WHERE sku LIKE '${sqlText(prefix)}%';

DELETE FROM public.warehouses
 WHERE code LIKE '${sqlText(prefix)}%';

DELETE FROM public.sale_price_types
 WHERE code LIKE '${sqlText(prefix)}%';

DELETE FROM public.settlement_types
 WHERE code LIKE '${sqlText(prefix)}%';
COMMIT;
`);
}

function setupFixture(prefix: string, salespersonId: string, capitalDate: string): FixtureData {
  const productName = `${prefix}Credit Guard Product`;
  const productSku = `${prefix}SKU`;
  const warehouseName = `${prefix}Warehouse`;
  const salePriceTypeTitle = `${prefix}Sale Price`;
  const settlementTypeTitle = `${prefix}Settlement`;
  const sufficientName = `${prefix}Sufficient Customer`;
  const overdueName = `${prefix}Overdue Customer`;
  const shortfallName = `${prefix}Shortfall Customer`;
  const noCreditName = `${prefix}No Credit Customer`;

  dbExecE2e(`
BEGIN;
DO $$
DECLARE
  v_actor uuid;
  v_product uuid;
  v_wh uuid;
  v_sale_price_type uuid;
  v_settlement uuid;
  v_capital uuid;
  v_sufficient uuid;
  v_overdue uuid;
  v_shortfall uuid;
  v_no_credit uuid;
  v_person_sufficient uuid;
  v_person_overdue uuid;
  v_person_shortfall uuid;
  v_person_no_credit uuid;
BEGIN
  SELECT user_id INTO v_actor
    FROM public.user_roles
   WHERE role IN ('admin','manager')
   ORDER BY user_id
   LIMIT 1;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No admin or manager user exists for ${sqlText(prefix)} fixture setup';
  END IF;

  INSERT INTO public.warehouses (name, code, is_active, is_default, created_by)
  VALUES ('${sqlText(warehouseName)}', '${sqlText(prefix)}WH', true, false, v_actor)
  RETURNING id INTO v_wh;

  INSERT INTO public.sale_price_types (code, title, is_active, sort_order)
  VALUES ('${sqlText(prefix)}SPT', '${sqlText(salePriceTypeTitle)}', true, 99999)
  RETURNING id INTO v_sale_price_type;

  INSERT INTO public.settlement_types (code, title, is_active, sort_order)
  VALUES ('${sqlText(prefix)}SET', '${sqlText(settlementTypeTitle)}', true, 99999)
  RETURNING id INTO v_settlement;

  INSERT INTO public.products (
    sku, name, is_active, status, stock_status, product_type, base_currency, created_by
  )
  VALUES (
    '${sqlText(productSku)}', '${sqlText(productName)}', true, 'active', 'available', 'iranian', 'toman', v_actor
  )
  RETURNING id INTO v_product;

  INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
  VALUES (v_wh, v_product, 50);

  INSERT INTO public.product_computed_prices (
    product_id, sale_price_type_id, input_purchase_price, input_currency, currency_rate,
    purchase_price_toman, final_sale_price, rounded_sale_price, computed_by, source,
    settlement_type_id
  )
  VALUES (
    v_product, v_sale_price_type, 70000, 'toman', 1,
    70000, 100000, 100000, v_actor, '${sqlText(prefix)}fixture', NULL
  );

  INSERT INTO public.product_sale_price_history (
    product_id, sale_price_type_id, old_sale_price, new_sale_price, change_amount,
    change_percent, created_by, settlement_type_id
  )
  VALUES (
    v_product, v_sale_price_type, NULL, 100000, NULL,
    NULL, v_actor, NULL
  );

  INSERT INTO public.persons (kind, display_name, visibility_scope, is_active)
  VALUES ('individual', '${sqlText(sufficientName)}', 'internal_general', true)
  RETURNING id INTO v_person_sufficient;

  INSERT INTO public.customers (name, phone, person_id, responsible_id, is_active, notes)
  VALUES ('${sqlText(sufficientName)}', '091${Date.now().toString().slice(-8)}', v_person_sufficient, '${salespersonId}'::uuid, true, '${sqlText(prefix)}sufficient')
  RETURNING id INTO v_sufficient;

  INSERT INTO public.persons (kind, display_name, visibility_scope, is_active)
  VALUES ('individual', '${sqlText(overdueName)}', 'internal_general', true)
  RETURNING id INTO v_person_overdue;

  INSERT INTO public.customers (name, phone, person_id, responsible_id, is_active, notes)
  VALUES ('${sqlText(overdueName)}', '092${Date.now().toString().slice(-8)}', v_person_overdue, '${salespersonId}'::uuid, true, '${sqlText(prefix)}overdue')
  RETURNING id INTO v_overdue;

  INSERT INTO public.persons (kind, display_name, visibility_scope, is_active)
  VALUES ('individual', '${sqlText(shortfallName)}', 'internal_general', true)
  RETURNING id INTO v_person_shortfall;

  INSERT INTO public.customers (name, phone, person_id, responsible_id, is_active, notes)
  VALUES ('${sqlText(shortfallName)}', '093${Date.now().toString().slice(-8)}', v_person_shortfall, '${salespersonId}'::uuid, true, '${sqlText(prefix)}shortfall')
  RETURNING id INTO v_shortfall;

  INSERT INTO public.persons (kind, display_name, visibility_scope, is_active)
  VALUES ('individual', '${sqlText(noCreditName)}', 'internal_general', true)
  RETURNING id INTO v_person_no_credit;

  INSERT INTO public.customers (name, phone, person_id, responsible_id, is_active, notes)
  VALUES ('${sqlText(noCreditName)}', '094${Date.now().toString().slice(-8)}', v_person_no_credit, '${salespersonId}'::uuid, true, '${sqlText(prefix)}no_credit')
  RETURNING id INTO v_no_credit;

  INSERT INTO public.customer_credit_profile (
    customer_id, total_purchases, total_paid, outstanding_balance, credit_score,
    credit_limit, has_overdue, overdue_since, settlement_score
  )
  VALUES
    (v_sufficient, 1000000, 1000000, 0, 90, 500000, false, NULL, 90),
    (v_overdue, 1000000, 700000, 300000, 80, 500000, true, CURRENT_DATE - 1, 60),
    (v_shortfall, 1000000, 1000000, 0, 70, 100000, false, NULL, 70),
    (v_no_credit, 0, 0, 0, 0, 0, false, NULL, 0);

  INSERT INTO public.customer_credit_balance (customer_id, held_credit)
  VALUES
    (v_sufficient, 0),
    (v_overdue, 0),
    (v_shortfall, 0),
    (v_no_credit, 0);

  INSERT INTO public.daily_capital_settings (capital_date, total_capital, scoring_mode, notes, created_by)
  VALUES ('${capitalDate}'::date, 2000000, 'manual', '${sqlText(prefix)}capital', v_actor)
  RETURNING id INTO v_capital;

  INSERT INTO public.salesperson_capital_allocations_dynamic (
    capital_setting_id, salesperson_id, weighted_score, share_ratio, allocated_capital
  )
  VALUES (v_capital, '${salespersonId}'::uuid, 1, 1, 2000000);

  INSERT INTO public.customer_capital_allocations_dynamic (
    capital_setting_id, customer_id, salesperson_id, weighted_score, share_ratio,
    raw_allocation, final_limit, binding_constraint
  )
  VALUES
    (v_capital, v_sufficient, '${salespersonId}'::uuid, 1, 0.25, 500000, 500000, 'formula'),
    (v_capital, v_overdue, '${salespersonId}'::uuid, 1, 0.25, 500000, 500000, 'overdue'),
    (v_capital, v_shortfall, '${salespersonId}'::uuid, 1, 0.05, 100000, 100000, 'formula');
END $$;
COMMIT;
`);

  const row = dbScalar(`
SELECT concat_ws('|',
  p.id::text,
  wh.id::text,
  spt.id::text,
  st.id::text,
  cs.id::text,
  cs.phone,
  co.id::text,
  co.phone,
  csh.id::text,
  csh.phone,
  cn.id::text,
  cn.phone
)
FROM public.products p
CROSS JOIN public.warehouses wh
CROSS JOIN public.sale_price_types spt
CROSS JOIN public.settlement_types st
CROSS JOIN public.customers cs
CROSS JOIN public.customers co
CROSS JOIN public.customers csh
CROSS JOIN public.customers cn
WHERE p.sku = '${sqlText(productSku)}'
  AND wh.code = '${sqlText(prefix)}WH'
  AND spt.code = '${sqlText(prefix)}SPT'
  AND st.code = '${sqlText(prefix)}SET'
  AND cs.name = '${sqlText(sufficientName)}'
  AND co.name = '${sqlText(overdueName)}'
  AND csh.name = '${sqlText(shortfallName)}'
  AND cn.name = '${sqlText(noCreditName)}';
`);
  const [
    productId,
    warehouseId,
    salePriceTypeId,
    settlementTypeId,
    sufficientId,
    sufficientPhone,
    overdueId,
    overduePhone,
    shortfallId,
    shortfallPhone,
    noCreditId,
    noCreditPhone,
  ] = row.split("|");

  return {
    productId,
    productName,
    productSku,
    warehouseId,
    warehouseName,
    salePriceTypeId,
    salePriceTypeTitle,
    settlementTypeId,
    settlementTypeTitle,
    sufficient: { id: sufficientId, name: sufficientName, phone: sufficientPhone },
    overdue: { id: overdueId, name: overdueName, phone: overduePhone },
    shortfall: { id: shortfallId, name: shortfallName, phone: shortfallPhone },
    noCredit: { id: noCreditId, name: noCreditName, phone: noCreditPhone },
  };
}

async function creditSnapshot(
  client: ReturnType<typeof createClient>,
  customerId: string,
): Promise<Record<string, unknown>> {
  const result = await client.rpc("get_customer_dynamic_credit", { p_customer_id: customerId });
  expect(result.error, `get_customer_dynamic_credit failed for ${customerId}`).toBeNull();
  const data = Array.isArray(result.data) ? result.data[0] : result.data;
  expect(data, `get_customer_dynamic_credit returned no row for ${customerId}`).toBeTruthy();
  return data as Record<string, unknown>;
}

function quoteRows(prefix: string): string[] {
  const out = dbScalar(`
SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.customer_name)::text, '[]')
FROM (
  SELECT id, customer_name, customer_id, final_amount, quote_exception_type,
         quote_exception_minutes, quote_exception_amount, quote_exception_confirmed_by,
         quote_exception_text, credit_check_snapshot, quote_exception_snapshot
  FROM public.sales_quotes
  WHERE customer_name LIKE '${sqlText(prefix)}%'
) q;
`);
  return JSON.parse(out) as string[];
}

function quoteException(prefix: string, customerName: string): Record<string, unknown> {
  const raw = dbScalar(`
SELECT row_to_json(q)::text
FROM (
  SELECT id, customer_name, customer_id, final_amount, quote_exception_type,
         quote_exception_minutes, quote_exception_amount, quote_exception_confirmed_by,
         quote_exception_text, credit_check_snapshot, quote_exception_snapshot
  FROM public.sales_quotes
  WHERE customer_name = '${sqlText(customerName)}'
  ORDER BY created_at DESC
  LIMIT 1
) q;
`);
  expect(raw, `${customerName}: quote was not persisted for ${prefix}`).toBeTruthy();
  return JSON.parse(raw) as Record<string, unknown>;
}

function prefixedRowCount(prefix: string): number {
  return Number(
    dbScalar(`
SELECT (
  (SELECT count(*) FROM public.sales_quotes WHERE customer_name LIKE '${sqlText(prefix)}%') +
  (SELECT count(*) FROM public.notification_queue WHERE title LIKE '%${sqlText(prefix)}%' OR body LIKE '%${sqlText(prefix)}%') +
  (SELECT count(*) FROM public.products WHERE sku LIKE '${sqlText(prefix)}%') +
  (SELECT count(*) FROM public.warehouses WHERE code LIKE '${sqlText(prefix)}%') +
  (SELECT count(*) FROM public.customers WHERE name LIKE '${sqlText(prefix)}%') +
  (SELECT count(*) FROM public.daily_capital_settings WHERE notes LIKE '%${sqlText(prefix)}%') +
  (SELECT count(*) FROM public.sale_price_types WHERE code LIKE '${sqlText(prefix)}%') +
  (SELECT count(*) FROM public.settlement_types WHERE code LIKE '${sqlText(prefix)}%')
)::text;
`),
  );
}

async function selectCustomerAndWaitForCredit(page: Page, customer: FixtureCustomer): Promise<void> {
  const responsePromise = page
    .waitForResponse(
      (response) =>
        response.url().includes("/rpc/get_customer_dynamic_credit") && response.status() < 500,
      { timeout: 15_000 },
    )
    .catch(() => null);
  await page
    .locator('[data-testid="quote-customer-search"], #existing_customer_search')
    .first()
    .fill(searchableSuffix(customer.name));
  const customerResult = page
    .locator(`[data-testid="quote-customer-result-${customer.id}"]`)
    .or(page.getByRole("button", { name: new RegExp(customer.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }));
  await customerResult.first().click();
  await expect(page.getByText("متصل به مشتری ثبت‌شده")).toBeVisible();
  await responsePromise;
}

async function addProductLine(
  page: Page,
  fixture: FixtureData,
  quantity: number,
): Promise<void> {
  const addItemButton = page
    .locator('[data-testid="quote-add-item"]')
    .or(page.getByRole("button", { name: /افزودن آیتم/ }));
  await addItemButton.first().click();
  await expect(page.getByRole("heading", { name: "افزودن آیتم به پیش‌فاکتور" })).toBeVisible();
  await page
    .locator('[data-testid="quote-product-search"], input[placeholder*="جستجوی نام محصول"]')
    .first()
    .fill(searchableSuffix(fixture.productName));
  const productResult = page
    .locator(`[data-testid="quote-product-result-${fixture.productId}"]`)
    .or(page.getByRole("button", { name: new RegExp(fixture.productName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }));
  await expect(productResult.first()).toBeVisible();
  await productResult.first().click();
  const priceTypeTrigger = page
    .locator('[data-testid="quote-item-price-type"]')
    .or(page.getByText("نوع قیمت فروش", { exact: true }).locator("..").getByRole("combobox"));
  await priceTypeTrigger.first().click();
  await page.getByRole("option", { name: fixture.salePriceTypeTitle }).click();
  await page
    .locator('[data-testid="quote-item-quantity"]')
    .or(page.getByText("تعداد", { exact: true }).locator("..").getByRole("spinbutton"))
    .first()
    .fill(String(quantity));
  const unitPriceInput = page
    .locator('[data-testid="quote-item-unit-price"]')
    .or(page.getByText("قیمت واحد (تومان)", { exact: true }).locator("..").getByRole("spinbutton"));
  await expect(unitPriceInput.first()).toHaveValue("100000");
  await page
    .locator('[data-testid="quote-item-add-confirm"]')
    .or(page.getByRole("button", { name: "افزودن به پیش‌فاکتور" }))
    .first()
    .click();
  await expect(page.getByText(fixture.productName).first()).toBeVisible();
}

async function startQuote(
  page: Page,
  fixture: FixtureData,
  customer: FixtureCustomer,
  quantity: number,
): Promise<void> {
  await page.goto("/sales/quotes", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name: /پیش‌فاکتور جدید|پیش فاکتور جدید/ }).first().click();
  await expect(page).toHaveURL(/\/sales\/quotes\/new$/);
  await selectCustomerAndWaitForCredit(page, customer);
  await page.locator('[data-testid="quote-settlement-select"], #settlement_type').first().click();
  await page.getByRole("option", { name: fixture.settlementTypeTitle }).click();
  const warehouseTrigger = page
    .locator('[data-testid="quote-warehouse-select"]')
    .or(page.getByText("انبار", { exact: true }).locator("..").getByRole("combobox"));
  await warehouseTrigger.first().click();
  await page.getByRole("option", { name: fixture.warehouseName }).click();
  await addProductLine(page, fixture, quantity);
}

async function saveNormally(page: Page): Promise<void> {
  await page
    .locator('[data-testid="quote-save"]')
    .or(page.getByRole("button", { name: /ذخیره پیش‌نویس/ }))
    .first()
    .click();
}

async function expectQuoteCount(customerName: string, count: number): Promise<void> {
  await expect
    .poll(() =>
      dbScalar(
        `SELECT count(*)::text FROM public.sales_quotes WHERE customer_name = '${sqlText(customerName)}';`,
      ),
    )
    .toBe(String(count));
}

async function expectPersistedWithException(
  customerName: string,
  expectedType: string | null,
  salespersonId: string,
): Promise<Record<string, unknown>> {
  await expectQuoteCount(customerName, 1);
  const row = quoteException(customerName.split(" ")[0], customerName);
  expect(row.quote_exception_type ?? null).toBe(expectedType);
  if (expectedType) {
    expect(row.quote_exception_confirmed_by).toBe(salespersonId);
    expect(String(row.quote_exception_text ?? "").length).toBeGreaterThan(20);
  } else {
    expect(row.quote_exception_confirmed_by ?? null).toBeNull();
  }
  return row;
}

test("Requirement 212 credit guard and permitted exceptions are enforced through UI and API", async ({
  browser,
}, testInfo) => {
  const prefix = `E2E_AUDIT_212_${Date.now()}_`;
  const capitalDate = new Date(Date.UTC(2099, 0, 1 + (Date.now() % 20000)))
    .toISOString()
    .slice(0, 10);
  let context: BrowserContext | null = null;

  await verifySalespersonSession(browser);
  context = await newSalesContext(browser);
  const page = await context.newPage();
  await expectNoSevereConsoleErrors(page, testInfo);
  const salesperson = await (async () => {
    await page.goto("/sales/quotes", { waitUntil: "domcontentloaded" });
    return readUserFingerprint(page);
  })();

  cleanupFixture(prefix);
  const fixture = setupFixture(prefix, salesperson.id, capitalDate);

  try {
    const { url, key } = readLanSupabaseEnv();
    const { accessToken, refreshToken } = readSessionFromStorage(SALESPERSON_STORAGE);
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const sessionResult = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    expect(sessionResult.error, "authenticated API session setup failed").toBeNull();

    const sufficientCredit = await creditSnapshot(supabase, fixture.sufficient.id);
    const overdueCredit = await creditSnapshot(supabase, fixture.overdue.id);
    const shortfallCredit = await creditSnapshot(supabase, fixture.shortfall.id);
    const noCredit = await creditSnapshot(supabase, fixture.noCredit.id);

    expect(Number(sufficientCredit.available_credit)).toBeGreaterThanOrEqual(200000);
    expect(overdueCredit.has_overdue).toBe(true);
    expect(shortfallCredit.has_allocation).toBe(true);
    expect(Number(shortfallCredit.available_credit)).toBe(100000);
    expect(noCredit.has_allocation).toBe(false);

    await startQuote(page, fixture, fixture.sufficient, 2);
    await saveNormally(page);
    await expect(page).toHaveURL(/\/sales\/quotes\/?$/);
    const sufficientQuote = await expectPersistedWithException(
      fixture.sufficient.name,
      null,
      salesperson.id,
    );
    expect(Number(sufficientQuote.final_amount)).toBe(200000);

    await startQuote(page, fixture, fixture.overdue, 1);
    await saveNormally(page);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "مشتری مانده معوق دارد" })).toBeVisible();
    await expect(page.getByText("ثبت عادی پیش‌فاکتور مجاز نیست")).toBeVisible();
    await expect(page.locator('[data-testid="quote-overdue-minutes"], #overdue_commitment_minutes').first()).toHaveAttribute("min", "1");
    await expect(page.locator('[data-testid="quote-overdue-minutes"], #overdue_commitment_minutes').first()).toHaveAttribute("max", "240");
    await page.locator('[data-testid="quote-overdue-minutes"], #overdue_commitment_minutes').first().fill("45");
    await expectQuoteCount(fixture.overdue.name, 0);
    await saveEvidence(page, testInfo, "212-overdue-block-dialog");
    await page
      .locator('[data-testid="quote-confirm-overdue"]')
      .or(page.getByRole("button", { name: /ثبت با تعهد کارشناس فروش/ }))
      .first()
      .click();
    await expect(page).toHaveURL(/\/sales\/quotes\/?$/);
    const overdueQuote = await expectPersistedWithException(
      fixture.overdue.name,
      "overdue_salesperson_commitment",
      salesperson.id,
    );
    expect(overdueQuote.quote_exception_minutes).toBe(45);
    expect(String(overdueQuote.quote_exception_text)).toContain("۴۵");

    await startQuote(page, fixture, fixture.shortfall, 2);
    await saveNormally(page);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "مبلغ پیش‌فاکتور بیشتر از اعتبار مشتری است" }),
    ).toBeVisible();
    await expect(page.getByText("کسری اعتبار", { exact: true }).first()).toBeVisible();
    await expectQuoteCount(fixture.shortfall.name, 0);
    await saveEvidence(page, testInfo, "212-credit-shortfall-block-dialog");
    await page
      .locator('[data-testid="quote-confirm-shortfall"]')
      .or(page.getByRole("button", { name: /تعهد واریز کسری تا پایان روز/ }))
      .first()
      .click();
    await expect(page).toHaveURL(/\/sales\/quotes\/?$/);
    const shortfallQuote = await expectPersistedWithException(
      fixture.shortfall.name,
      "credit_shortfall_salesperson_commitment",
      salesperson.id,
    );
    expect(Number(shortfallQuote.quote_exception_amount)).toBe(100000);
    expect(String(shortfallQuote.quote_exception_text)).toContain("کسری اعتبار");

    await startQuote(page, fixture, fixture.noCredit, 1);
    await saveNormally(page);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "مشتری اعتبار قابل استفاده ندارد" })).toBeVisible();
    await expect(page.getByRole("button", { name: /ثبت با تأیید حسابداری/ })).toBeVisible();
    await expectQuoteCount(fixture.noCredit.name, 0);
    await saveEvidence(page, testInfo, "212-no-credit-accounting-approval-dialog");
    await page
      .locator('[data-testid="quote-confirm-accounting-approval"]')
      .or(page.getByRole("button", { name: /ثبت با تأیید حسابداری/ }))
      .first()
      .click();
    await expect(page).toHaveURL(/\/sales\/quotes\/?$/);
    const noCreditQuote = await expectPersistedWithException(
      fixture.noCredit.name,
      "accounting_approval",
      salesperson.id,
    );
    expect(String(noCreditQuote.quote_exception_text)).toContain("خانم ماهرو");
    expect(noCreditQuote.quote_exception_confirmed_by).toBe(salesperson.id);

    const shortfallBeforeApi = await creditSnapshot(supabase, fixture.shortfall.id);
    expect(Number(shortfallBeforeApi.available_credit)).toBe(100000);
    expect(shortfallBeforeApi.has_allocation).toBe(true);

    const rpcPayload = (
      customer: FixtureCustomer,
      quantity: number,
      note: string,
      overrides: Record<string, unknown>,
    ) => {
      const total = quantity * 100000;
      return {
        p_customer_name: customer.name,
        p_customer_phone: customer.phone,
        p_customer_note: note,
        p_expires_at: null,
        p_subtotal_amount: total,
        p_discount_amount: 0,
        p_final_amount: total,
        p_items: [
          {
            key: `${note}-item`,
            source: "product_price",
            product_id: fixture.productId,
            free_item_name: null,
            sku_snapshot: fixture.productSku,
            title_snapshot: fixture.productName,
            sale_price_type_id: fixture.salePriceTypeId,
            quantity,
            unit_price: 100000,
            discount_amount: 0,
            line_total: total,
          },
        ],
        p_settlement_type_id: fixture.settlementTypeId,
        p_customer_id: customer.id,
        p_below_list_ack: false,
        p_deposit_amount: null,
        p_commitment_confirmed: false,
        p_visitor_id: null,
        p_warehouse_id: fixture.warehouseId,
        p_quote_exception_type: null,
        p_quote_exception_minutes: null,
        p_quote_exception_amount: null,
        p_quote_exception_text: null,
        ...overrides,
      };
    };

    const expectNoQuoteForNote = (note: string) => {
      expect(
        dbScalar(
          `SELECT count(*)::text FROM public.sales_quotes WHERE customer_note = '${sqlText(note)}';`,
        ),
      ).toBe("0");
      expect(
        dbScalar(`
SELECT count(*)::text
FROM public.sales_quote_items i
JOIN public.sales_quotes q ON q.id = i.quote_id
WHERE q.customer_note = '${sqlText(note)}';
`),
      ).toBe("0");
    };

    const expectRpcFail = async (
      label: string,
      customer: FixtureCustomer,
      quantity: number,
      overrides: Record<string, unknown>,
      expectedMessagePart: string,
    ) => {
      const note = `${prefix}api-invalid-${label}`;
      const result = await supabase.rpc(
        "create_sales_quote_with_items",
        rpcPayload(customer, quantity, note, overrides),
      );
      expect(result.error, `${label}: RPC should fail`).toBeTruthy();
      expect(result.error?.message ?? "").toContain(expectedMessagePart);
      expectNoQuoteForNote(note);
    };

    const expectRpcSucceed = async (
      label: string,
      customer: FixtureCustomer,
      quantity: number,
      overrides: Record<string, unknown>,
      expectedExceptionType: string,
    ) => {
      const note = `${prefix}api-valid-${label}`;
      const result = await supabase.rpc(
        "create_sales_quote_with_items",
        rpcPayload(customer, quantity, note, overrides),
      );
      expect(result.error, `${label}: RPC should succeed`).toBeNull();
      expect(
        dbScalar(
          `SELECT quote_exception_type FROM public.sales_quotes WHERE customer_note = '${sqlText(note)}' ORDER BY created_at DESC LIMIT 1;`,
        ),
      ).toBe(expectedExceptionType);
    };

    await expectRpcFail("overdue-null", fixture.overdue, 1, {}, "مشتری مانده معوق دارد");
    await expectRpcFail(
      "overdue-wrong-type",
      fixture.overdue,
      1,
      {
        p_quote_exception_type: "accounting_approval",
        p_quote_exception_text: `${prefix}wrong overdue type`,
      },
      "مشتری مانده معوق دارد",
    );
    await expectRpcFail(
      "overdue-missing-minutes",
      fixture.overdue,
      1,
      {
        p_quote_exception_type: "overdue_salesperson_commitment",
        p_quote_exception_text: `${prefix}missing overdue minutes`,
      },
      "مهلت تسویه معوقه",
    );
    await expectRpcFail("shortfall-null", fixture.shortfall, 2, {}, "مبلغ پیش‌فاکتور بیشتر از اعتبار مشتری");
    await expectRpcFail(
      "shortfall-wrong-type",
      fixture.shortfall,
      2,
      {
        p_quote_exception_type: "accounting_approval",
        p_quote_exception_text: `${prefix}wrong shortfall type`,
      },
      "مبلغ پیش‌فاکتور بیشتر از اعتبار مشتری",
    );
    await expectRpcFail(
      "shortfall-missing-amount",
      fixture.shortfall,
      2,
      {
        p_quote_exception_type: "credit_shortfall_salesperson_commitment",
        p_quote_exception_text: `${prefix}missing shortfall amount`,
      },
      "مبلغ کسری اعتبار",
    );
    await expectRpcFail("no-credit-null", fixture.noCredit, 1, {}, "اعتبار قابل استفاده");
    await expectRpcFail(
      "no-credit-wrong-type",
      fixture.noCredit,
      1,
      {
        p_quote_exception_type: "overdue_salesperson_commitment",
        p_quote_exception_minutes: 30,
        p_quote_exception_text: `${prefix}wrong no-credit type`,
      },
      "اعتبار قابل استفاده",
    );

    await expectRpcSucceed(
      "overdue",
      fixture.overdue,
      1,
      {
        p_quote_exception_type: "overdue_salesperson_commitment",
        p_quote_exception_minutes: 30,
        p_quote_exception_text: `${prefix}valid overdue commitment`,
      },
      "overdue_salesperson_commitment",
    );
    await expectRpcSucceed(
      "shortfall",
      fixture.shortfall,
      2,
      {
        p_quote_exception_type: "credit_shortfall_salesperson_commitment",
        p_quote_exception_amount: 100000,
        p_quote_exception_text: `${prefix}valid shortfall commitment`,
      },
      "credit_shortfall_salesperson_commitment",
    );
    await expectRpcSucceed(
      "no-credit",
      fixture.noCredit,
      1,
      {
        p_quote_exception_type: "accounting_approval",
        p_quote_exception_text: `${prefix}valid accounting approval attestation`,
      },
      "accounting_approval",
    );

    const rows = quoteRows(prefix) as unknown as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(7);
    await saveEvidence(page, testInfo, "212-final-quotes-list");
  } finally {
    await context?.close();
    cleanupFixture(prefix);
    expect(prefixedRowCount(prefix), `${prefix}: cleanup left prefixed rows behind`).toBe(0);
  }
});
