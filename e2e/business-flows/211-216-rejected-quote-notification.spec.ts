import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import fs from "node:fs";

import { BASE_URL, expectNoSevereConsoleErrors, saveEvidence } from "../helpers/app";
import { dbRows, dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";

const STORAGE = {
  accountant: "e2e/auth/accountant.storage.json",
  salespersonA: "e2e/auth/salesperson-a.storage.json",
  salespersonB: "e2e/auth/salesperson-b.storage.json",
} as const;

const ROLE_CHECKS = [
  {
    key: "accountant",
    storageFile: STORAGE.accountant,
    expectedRole: "حسابدار",
    route: "/accounting/receipts",
    routeText: /فیش|واریزی|رسید|حسابداری|دریافت|مالی/,
  },
  {
    key: "salesperson-a",
    storageFile: STORAGE.salespersonA,
    expectedRole: "فروشنده",
    route: "/sales/quotes",
    routeText: /پیش‌فاکتور|پیش فاکتور/,
  },
  {
    key: "salesperson-b",
    storageFile: STORAGE.salespersonB,
    expectedRole: "فروشنده",
    route: "/sales/quotes",
    routeText: /پیش‌فاکتور|پیش فاکتور/,
  },
] as const;

type RoleKey = (typeof ROLE_CHECKS)[number]["key"];
type UserFingerprint = { id: string; email: string | null };

const AUTH_SETUP_COMMAND =
  "npx playwright test --config=playwright.auth.config.ts e2e/auth/save-role-sessions.spec.ts --headed";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

async function newRoleContext(browser: Browser, storageFile: string): Promise<BrowserContext> {
  return browser.newContext({
    storageState: storageFile,
    baseURL: BASE_URL,
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
  });
}

async function expectHealthyPage(page: Page, label: string): Promise<void> {
  await expect(page, `${label}: session unexpectedly redirected to login`).not.toHaveURL(
    /\/login(?:$|\?)/,
  );
  await expect(page.getByText("بدون نقش"), `${label}: rendered as بدون نقش`).toHaveCount(0);
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

async function verifyStorageState(
  browser: Browser,
  check: (typeof ROLE_CHECKS)[number],
): Promise<UserFingerprint> {
  expect(
    fs.existsSync(check.storageFile),
    `${check.key}: missing ${check.storageFile}. Generate it interactively with: ${AUTH_SETUP_COMMAND}`,
  ).toBe(true);
  expect(
    fs.statSync(check.storageFile).size,
    `${check.key}: storageState file is empty`,
  ).toBeGreaterThan(50);

  const context = await newRoleContext(browser, check.storageFile);
  const page = await context.newPage();
  try {
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expectHealthyPage(page, check.key);
    await expect(page.getByText(check.expectedRole, { exact: false }).first()).toBeVisible();

    await page.goto(check.route, { waitUntil: "domcontentloaded" });
    await expectHealthyPage(page, check.key);
    await expect(page.getByText(check.routeText).first()).toBeVisible();

    const fp = await readUserFingerprint(page);
    expect(
      fp.id,
      `${check.key}: authenticated user id not found in storage-backed session`,
    ).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    return fp;
  } finally {
    await context.close();
  }
}

function sqlText(value: string): string {
  return value.replace(/'/g, "''");
}

function setupProductFixture(prefix: string): void {
  const sku = `${prefix}SKU`;
  const productName = `${prefix}Rejected Quote Product`;
  const warehouseCode = `${prefix}WH`;
  const salePriceTypeCode = `${prefix}SPT`;
  const settlementCode = `${prefix}SET`;

  dbExecE2e(`
BEGIN;
DO $$
DECLARE
  v_actor uuid;
  v_wh uuid;
  v_product uuid;
  v_sale_price_type uuid;
  v_settlement uuid;
BEGIN
  SELECT id INTO v_actor
    FROM public.profiles
    WHERE EXISTS (
      SELECT 1
        FROM public.user_roles
       WHERE user_roles.user_id = profiles.id
         AND user_roles.role IN ('admin','manager','accountant')
    )
    ORDER BY created_at
    LIMIT 1;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No privileged profile exists for ${prefix} fixture setup';
  END IF;

  INSERT INTO public.warehouses (name, code, is_active, is_default, created_by)
  VALUES ('${sqlText(prefix)}Warehouse', '${sqlText(warehouseCode)}', true, false, v_actor)
  RETURNING id INTO v_wh;

  INSERT INTO public.sale_price_types (title, code, is_active, sort_order)
  VALUES ('${sqlText(prefix)}Sale Price', '${sqlText(salePriceTypeCode)}', true, 99999)
  RETURNING id INTO v_sale_price_type;

  INSERT INTO public.settlement_types (title, code, is_active, sort_order)
  VALUES ('${sqlText(prefix)}Settlement', '${sqlText(settlementCode)}', true, 99999)
  RETURNING id INTO v_settlement;

  INSERT INTO public.products (
    sku, name, is_active, status, stock_status, product_type, base_currency, created_by
  )
  VALUES (
    '${sqlText(sku)}', '${sqlText(productName)}', true, 'active', 'available', 'iranian', 'toman', v_actor
  )
  RETURNING id INTO v_product;

  INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
  VALUES (v_wh, v_product, 20);

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
END $$;
COMMIT;
`);
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
    OR product_id IN (SELECT id FROM public.products WHERE sku = '${sqlText(prefix)}SKU');

DELETE FROM public.sales_quote_send_queue
 WHERE quote_id IN (SELECT id FROM public.sales_quotes WHERE customer_name LIKE '${sqlText(prefix)}%');

DELETE FROM public.sales_quotes
 WHERE customer_name LIKE '${sqlText(prefix)}%';

DELETE FROM public.product_sale_price_history
 WHERE product_id IN (SELECT id FROM public.products WHERE sku = '${sqlText(prefix)}SKU');

DELETE FROM public.product_computed_prices
 WHERE product_id IN (SELECT id FROM public.products WHERE sku = '${sqlText(prefix)}SKU');

DELETE FROM public.warehouse_stock
 WHERE product_id IN (SELECT id FROM public.products WHERE sku = '${sqlText(prefix)}SKU')
    OR warehouse_id IN (SELECT id FROM public.warehouses WHERE code = '${sqlText(prefix)}WH');

DELETE FROM public.products
 WHERE sku = '${sqlText(prefix)}SKU';

DELETE FROM public.warehouses
 WHERE code = '${sqlText(prefix)}WH';

DELETE FROM public.sale_price_types
 WHERE code = '${sqlText(prefix)}SPT';

DELETE FROM public.settlement_types
 WHERE code = '${sqlText(prefix)}SET';

DELETE FROM public.audit_logs
 WHERE COALESCE(diff::text, '') LIKE '%${sqlText(prefix)}%';
COMMIT;
`);
}

function prefixedRowCount(prefix: string): number {
  const count = dbScalar(`
SELECT (
  (SELECT count(*) FROM public.sales_quotes WHERE customer_name LIKE '${sqlText(prefix)}%') +
  (SELECT count(*) FROM public.notification_queue WHERE title LIKE '%${sqlText(prefix)}%' OR body LIKE '%${sqlText(prefix)}%') +
  (SELECT count(*) FROM public.products WHERE sku = '${sqlText(prefix)}SKU') +
  (SELECT count(*) FROM public.warehouses WHERE code = '${sqlText(prefix)}WH') +
  (SELECT count(*) FROM public.sale_price_types WHERE code = '${sqlText(prefix)}SPT') +
  (SELECT count(*) FROM public.settlement_types WHERE code = '${sqlText(prefix)}SET')
)::text;
`);
  return Number(count);
}

async function createQuoteThroughUi(
  page: Page,
  prefix: string,
  testInfo: TestInfo,
): Promise<string> {
  const customerName = `${prefix}Customer`;
  const customerPhone = `09${String(Date.now()).slice(-9)}`;
  const productName = `${prefix}Rejected Quote Product`;

  await page.goto("/sales/quotes", { waitUntil: "domcontentloaded" });
  await expectHealthyPage(page, "salesperson-a quotes");
  await page
    .getByRole("link", { name: /پیش‌فاکتور جدید|پیش فاکتور جدید/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/sales\/quotes\/new$/);

  await page.getByLabel(/نام مشتری/).fill(customerName);
  await page.getByLabel(/شماره تماس/).fill(customerPhone);
  await page.getByText("نوع تسویه", { exact: false }).locator("..").getByRole("combobox").click();
  await page
    .getByRole("option")
    .filter({ hasText: `${prefix}Settlement` })
    .click();
  await page.getByText("انبار", { exact: true }).locator("..").getByRole("combobox").click();
  await page
    .getByRole("option")
    .filter({ hasText: `${prefix}Warehouse` })
    .click();

  await page.getByRole("button", { name: /افزودن آیتم/ }).click();
  await expect(page.getByRole("heading", { name: "افزودن آیتم به پیش‌فاکتور" })).toBeVisible();
  await page.getByPlaceholder(/جستجوی نام محصول/).fill("Rejected Quote Product");
  await expect(page.getByText(productName).first()).toBeVisible();
  await page.getByText(productName).first().click();

  await page
    .getByText("نوع قیمت فروش", { exact: true })
    .locator("..")
    .getByRole("combobox")
    .click();
  await page
    .getByRole("option")
    .filter({ hasText: `${prefix}Sale Price` })
    .click();
  await page.getByText("تعداد", { exact: true }).locator("..").getByRole("spinbutton").fill("1");
  await page.getByRole("button", { name: "افزودن به پیش‌فاکتور" }).click();

  await expect(page.getByText(productName).first()).toBeVisible();
  await saveEvidence(page, testInfo, "211-216-before-salesperson-create");
  await page.getByRole("button", { name: /ذخیره پیش‌نویس/ }).click();

  const noCreditDialog = page.getByRole("heading", { name: "مشتری اعتبار قابل استفاده ندارد" });
  if (await noCreditDialog.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await page.getByRole("button", { name: /ثبت با تأیید حسابداری/ }).click();
  }

  await expect(page).toHaveURL(/\/sales\/quotes\/?$/);
  await expect
    .poll(() =>
      dbScalar(
        `select count(*)::text from public.sales_quotes where customer_name='${sqlText(customerName)}';`,
      ),
    )
    .toBe("1");

  const quoteId = dbScalar(
    `select id::text from public.sales_quotes where customer_name='${sqlText(customerName)}' order by created_at desc limit 1;`,
  );
  expect(quoteId).toMatch(/^[0-9a-f-]{36}$/i);
  return quoteId;
}

async function openQuoteFromList(page: Page, quoteId: string, prefix: string): Promise<void> {
  await page.goto("/sales/quotes", { waitUntil: "domcontentloaded" });
  await expectHealthyPage(page, "quotes list");
  await page.getByPlaceholder(/شماره پیش‌فاکتور|نام مشتری|شماره تماس/).fill(`${prefix}Customer`);
  const row = page.getByRole("row").filter({ hasText: `${prefix}Customer` });
  await expect(row).toBeVisible();
  await page.goto(`/sales/quotes/${quoteId}`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(new RegExp(`/sales/quotes/${quoteId}$`));
}

async function sendQuote(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /ارسال پیش‌فاکتور/ })
    .first()
    .click();
  const dialog = page.getByRole("alertdialog", { name: "ارسال پیش‌فاکتور" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "تایید" }).click();
  await expect(page.getByText("ارسال‌شده")).toBeVisible();
}

async function rejectQuoteAsAccountant(page: Page, quoteId: string, reason: string): Promise<void> {
  await page.getByRole("button", { name: /^رد$/ }).click();
  const dialog = page.getByRole("alertdialog", { name: "رد پیش‌فاکتور" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "تایید" })).toBeDisabled();
  await dialog.locator("textarea").fill(reason);
  await expect(dialog.getByRole("button", { name: "تایید" })).toBeEnabled();
  await dialog.getByRole("button", { name: "تایید" }).click();
  await expect
    .poll(() =>
      dbScalar(
        `select concat(status, '|', coalesce(reject_reason,'')) from public.sales_quotes where id='${quoteId}'::uuid;`,
      ),
    )
    .toBe(`rejected|${reason}`);
  await page.reload({ waitUntil: "domcontentloaded" });
  // Scoped to <main>: the regex also matches the sidebar link «درخواست‌های رد شدهٔ من»,
  // which has been on every page since /my-rejected-quotes was wired into the nav on
  // 2026-08-08. The badge this asserts on lives in the page body.
  await expect(page.getByRole("main").getByText(/ردشده|رد شده/)).toBeVisible();
}

async function expectNoUnexpectedFailedResponses(page: Page, testInfo: TestInfo, label: string) {
  const failures: string[] = [];
  page.on("response", (response) => {
    const status = response.status();
    if (![400, 403, 500].includes(status)) return;
    failures.push(`${status} ${response.url()}`);
  });
  await testInfo.attach(`${label}-400-403-500`, {
    body: failures.length ? failures.join("\n") : "none",
    contentType: "text/plain",
  });
  return failures;
}

test.describe("Business flow 211/216 - rejected quote notification lifecycle", () => {
  test("real UI rejection reason notification persists, is isolated by recipient, and can be acknowledged", async ({
    browser,
  }, testInfo) => {
    const verifiedUsers = new Map<RoleKey, UserFingerprint>();
    for (const check of ROLE_CHECKS) {
      verifiedUsers.set(check.key, await verifyStorageState(browser, check));
    }
    expect(verifiedUsers.get("salesperson-a")!.id).not.toBe(verifiedUsers.get("salesperson-b")!.id);

    const prefix = `E2E_AUDIT_211_${Date.now()}_`;
    const reason = `${prefix}Accountant rejection reason - missing valid business approval`;
    const customerName = `${prefix}Customer`;

    cleanupFixture(prefix);
    setupProductFixture(prefix);

    let quoteId = "";
    let notificationId = "";

    const salespersonContext = await newRoleContext(browser, STORAGE.salespersonA);
    const accountantContext = await newRoleContext(browser, STORAGE.accountant);
    const salespersonAContext = await newRoleContext(browser, STORAGE.salespersonA);
    const salespersonBContext = await newRoleContext(browser, STORAGE.salespersonB);

    const salespersonPage = await salespersonContext.newPage();
    const accountantPage = await accountantContext.newPage();
    const salespersonAPage = await salespersonAContext.newPage();
    const salespersonBPage = await salespersonBContext.newPage();

    await expectNoSevereConsoleErrors(salespersonPage, testInfo);
    await expectNoSevereConsoleErrors(accountantPage, testInfo);
    await expectNoSevereConsoleErrors(salespersonAPage, testInfo);
    await expectNoSevereConsoleErrors(salespersonBPage, testInfo);
    const salesFailures = await expectNoUnexpectedFailedResponses(
      salespersonPage,
      testInfo,
      "salesperson-a-create",
    );
    const accountantFailures = await expectNoUnexpectedFailedResponses(
      accountantPage,
      testInfo,
      "accountant-reject",
    );
    const salesAReadFailures = await expectNoUnexpectedFailedResponses(
      salespersonAPage,
      testInfo,
      "salesperson-a-read",
    );
    const salesBFailures = await expectNoUnexpectedFailedResponses(
      salespersonBPage,
      testInfo,
      "salesperson-b-isolation",
    );

    try {
      quoteId = await createQuoteThroughUi(salespersonPage, prefix, testInfo);
      await openQuoteFromList(salespersonPage, quoteId, prefix);
      await sendQuote(salespersonPage);

      const quoteOwner = dbScalar(
        `select concat(status, '|', salesperson_id::text) from public.sales_quotes where id='${quoteId}'::uuid;`,
      );
      expect(quoteOwner).toBe(`sent|${verifiedUsers.get("salesperson-a")!.id}`);

      await accountantPage.goto(`/sales/quotes/${quoteId}`, { waitUntil: "domcontentloaded" });
      await expectHealthyPage(accountantPage, "accountant quote detail");
      await rejectQuoteAsAccountant(accountantPage, quoteId, reason);
      await accountantPage.reload({ waitUntil: "domcontentloaded" });
      await expect(accountantPage.getByText(reason)).toBeVisible();
      await saveEvidence(accountantPage, testInfo, "211-216-accountant-reason-persists");

      const quoteDb = dbScalar(
        `select concat(status, '|', coalesce(reject_reason,'')) from public.sales_quotes where id='${quoteId}'::uuid;`,
      );
      expect(quoteDb).toBe(`rejected|${reason}`);

      const notificationRows = dbRows(
        `select concat(id::text, '|', user_id::text, '|', reference_id::text, '|', is_read::text, '|', title, '|', replace(body, E'\\n', ' / ')) from public.notification_queue where type='quote_rejected' and reference_type='sales_quote' and reference_id='${quoteId}'::uuid order by created_at;`,
      );
      expect(notificationRows).toHaveLength(1);
      const [rawNotificationId, recipientId, referenceId, isRead, title, body] =
        notificationRows[0].split("|");
      notificationId = rawNotificationId;
      expect(recipientId).toBe(verifiedUsers.get("salesperson-a")!.id);
      expect(referenceId).toBe(quoteId);
      expect(isRead).toBe("false");
      expect(`${title}\n${body}`).toContain(reason);

      await salespersonAPage.goto("/notifications", { waitUntil: "domcontentloaded" });
      await expectHealthyPage(salespersonAPage, "salesperson-a notifications");
      await expect(salespersonAPage.getByText(reason).first()).toBeVisible();
      await expect(salespersonAPage.getByText("جدید").first()).toBeVisible();
      await salespersonAPage.reload({ waitUntil: "domcontentloaded" });
      await expect(salespersonAPage.getByText(reason).first()).toBeVisible();
      expect(
        dbScalar(
          `select is_read::text from public.notification_queue where id='${notificationId}'::uuid;`,
        ),
      ).toBe("false");
      await saveEvidence(salespersonAPage, testInfo, "211-216-salesperson-a-unread-notification");

      await salespersonBPage.goto("/notifications", { waitUntil: "domcontentloaded" });
      await expectHealthyPage(salespersonBPage, "salesperson-b notifications");
      await expect(salespersonBPage.getByText(reason)).toHaveCount(0);
      await salespersonBPage.goto("/my-rejected-quotes", { waitUntil: "domcontentloaded" });
      await expectHealthyPage(salespersonBPage, "salesperson-b rejected quotes");
      await expect(salespersonBPage.getByText(reason)).toHaveCount(0);
      await expect(salespersonBPage.getByText(customerName)).toHaveCount(0);
      await saveEvidence(salespersonBPage, testInfo, "211-216-salesperson-b-isolation");

      await salespersonAPage.goto("/notifications", { waitUntil: "domcontentloaded" });
      await expect(salespersonAPage.getByText(reason).first()).toBeVisible();
      const rejectionDialog = salespersonAPage.getByRole("alertdialog", {
        name: "پیش‌فاکتور رد شد",
      });
      await expect(rejectionDialog).toBeVisible();
      await rejectionDialog.getByRole("button", { name: "دیدم" }).click();
      await expect
        .poll(() =>
          dbScalar(
            `select is_read::text from public.notification_queue where id='${notificationId}'::uuid;`,
          ),
        )
        .toBe("true");

      await salespersonAPage.goto("/my-rejected-quotes", { waitUntil: "domcontentloaded" });
      await expectHealthyPage(salespersonAPage, "salesperson-a rejected quotes after acknowledge");
      await expect(salespersonAPage.getByText(customerName, { exact: true })).toBeVisible();
      await expect(salespersonAPage.getByText(reason)).toBeVisible();

      await salespersonAPage.goto("/notifications", { waitUntil: "domcontentloaded" });
      await expect(salespersonAPage.getByText(reason)).toBeVisible();
      await expect(salespersonAPage.getByText(reason).locator("..").getByText("جدید")).toHaveCount(
        0,
      );
      await salespersonAPage.reload({ waitUntil: "domcontentloaded" });
      await expect(salespersonAPage.getByText(reason).locator("..").getByText("جدید")).toHaveCount(
        0,
      );

      expect(salesFailures, "unexpected 400/403/500 in salesperson A create path").toHaveLength(0);
      expect(accountantFailures, "unexpected 400/403/500 in accountant path").toHaveLength(0);
      expect(salesAReadFailures, "unexpected 400/403/500 in salesperson A read path").toHaveLength(
        0,
      );
      expect(salesBFailures, "unexpected 400/403/500 in salesperson B isolation path").toHaveLength(
        0,
      );
    } finally {
      await salespersonContext.close();
      await accountantContext.close();
      await salespersonAContext.close();
      await salespersonBContext.close();
      cleanupFixture(prefix);
      expect(prefixedRowCount(prefix), `${prefix}: cleanup left prefixed rows behind`).toBe(0);
    }
  });
});
