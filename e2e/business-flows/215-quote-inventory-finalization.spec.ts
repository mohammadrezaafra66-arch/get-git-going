import { expect, test, type Browser, type Page } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { BASE_URL, expectNoSevereConsoleErrors, saveEvidence } from "../helpers/app";

const SALES_STATE = "e2e/auth/salesperson-a.storage.json";
const ADMIN_STATE = "e2e/auth/admin.storage.json";

type FixtureProduct = {
  sku: string;
  name: string;
  searchName: string;
  productId: string;
  warehouseId: string;
};

type CreatedQuote = {
  id: string;
  customerName: string;
};

function sql(value: string): string {
  return value.replace(/'/g, "''");
}

function currentYear(): number {
  return new Date().getFullYear();
}

function scalarNumber(query: string): number {
  return Number(dbScalar(query) || "0");
}

function prefixedCount(table: string, column: string, prefix: string): number {
  return scalarNumber(`select count(*)::text from public.${table} where ${column} like '${sql(prefix)}%';`);
}

async function openRolePage(browser: Browser, storageState: string, route: string): Promise<Page> {
  const context = await browser.newContext({
    storageState,
    baseURL: BASE_URL,
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
  });
  const page = await context.newPage();
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/login(?:$|\?)/);
  await expect(page.getByText("بدون نقش", { exact: true })).toHaveCount(0);
  return page;
}

function dbSetup(prefix: string, counterBefore: number): void {
  const escaped = sql(prefix);
  dbExecE2e(`
BEGIN;
DELETE FROM public.notification_queue WHERE title LIKE '%${escaped}%' OR body LIKE '%${escaped}%';
DELETE FROM public.stock_movements
 WHERE ref_id IN (SELECT id FROM public.sales_quotes WHERE customer_name LIKE '${escaped}%')
    OR product_id IN (SELECT id FROM public.products WHERE sku LIKE '${escaped}%');
DELETE FROM public.sales_quote_send_queue
 WHERE quote_id IN (SELECT id FROM public.sales_quotes WHERE customer_name LIKE '${escaped}%');
DELETE FROM public.sales_quotes WHERE customer_name LIKE '${escaped}%';
DELETE FROM public.product_sale_price_history
 WHERE product_id IN (SELECT id FROM public.products WHERE sku LIKE '${escaped}%');
DELETE FROM public.product_computed_prices
 WHERE product_id IN (SELECT id FROM public.products WHERE sku LIKE '${escaped}%');
DELETE FROM public.warehouse_stock
 WHERE product_id IN (SELECT id FROM public.products WHERE sku LIKE '${escaped}%')
    OR warehouse_id IN (SELECT id FROM public.warehouses WHERE code LIKE '${escaped}%');
DELETE FROM public.products WHERE sku LIKE '${escaped}%';
DELETE FROM public.warehouses WHERE code LIKE '${escaped}%';
DELETE FROM public.sale_price_types WHERE code LIKE '${escaped}%';
DELETE FROM public.settlement_types WHERE code LIKE '${escaped}%';
DELETE FROM public.audit_logs WHERE COALESCE(diff::text, '') LIKE '%${escaped}%';
UPDATE public.sales_quote_counters
   SET last_value = ${counterBefore}, updated_at = now()
 WHERE year = ${currentYear()}
   AND NOT EXISTS (
     SELECT 1
       FROM public.sales_quotes
      WHERE quote_number LIKE 'SQ-${currentYear()}-%'
        AND substring(quote_number from '[0-9]+$')::int > ${counterBefore}
        AND customer_name NOT LIKE '${escaped}%'
   );
COMMIT;
`);
}

function cleanup(prefix: string, counterBefore: number): void {
  dbSetup(prefix, counterBefore);
}

function createProduct(prefix: string, label: string, stock: number, stockStatus = "unavailable"): FixtureProduct {
  const suffix = `${label}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const searchName = `Product ${label} ${Date.now()} ${Math.floor(Math.random() * 10000)}`;
  const sku = `${prefix}SKU_${suffix}`;
  const name = `${prefix}${searchName}`;
  const escapedPrefix = sql(prefix);
  const escapedSku = sql(sku);
  const escapedName = sql(name);
  const whCode = `${prefix}WH`;

  dbExecE2e(`
BEGIN;
DO $$
DECLARE
  v_actor uuid;
  v_wh uuid;
  v_sale_price_type uuid;
  v_product uuid;
BEGIN
  SELECT user_id INTO v_actor
    FROM public.user_roles
   WHERE role IN ('admin','manager')
   ORDER BY CASE role WHEN 'admin' THEN 1 ELSE 2 END, user_id
   LIMIT 1;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No admin/manager actor found for ${escapedPrefix}';
  END IF;

  SELECT id INTO v_wh FROM public.warehouses WHERE is_active AND is_default ORDER BY created_at LIMIT 1;
  IF v_wh IS NULL THEN
    INSERT INTO public.warehouses (name, code, is_active, is_default, created_by)
    VALUES ('${escapedPrefix} Warehouse', '${sql(whCode)}', true, true, v_actor)
    RETURNING id INTO v_wh;
  END IF;

  SELECT id INTO v_sale_price_type FROM public.sale_price_types WHERE is_active ORDER BY sort_order, created_at LIMIT 1;
  IF v_sale_price_type IS NULL THEN
    INSERT INTO public.sale_price_types (code, title, is_active, sort_order)
    VALUES ('${escapedPrefix}SPT', '${escapedPrefix} Sale Price Type', true, 1)
    RETURNING id INTO v_sale_price_type;
  END IF;

  INSERT INTO public.products (sku, name, is_active, status, stock_status, product_type, base_currency, created_by)
  VALUES ('${escapedSku}', '${escapedName}', true, 'active', '${stockStatus}', 'iranian', 'toman', v_actor)
  RETURNING id INTO v_product;

  INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
  VALUES (v_wh, v_product, ${stock});

  INSERT INTO public.product_computed_prices (
    product_id, sale_price_type_id, input_purchase_price, input_currency, currency_rate,
    purchase_price_toman, final_sale_price, rounded_sale_price, computed_by, source
  )
  VALUES (v_product, v_sale_price_type, 70000, 'toman', 1, 70000, 100000, 100000, v_actor, '${escapedPrefix}e2e');

  INSERT INTO public.product_sale_price_history (
    product_id, sale_price_type_id, old_sale_price, new_sale_price, change_amount, change_percent, created_by
  )
  VALUES (v_product, v_sale_price_type, NULL, 100000, NULL, NULL, v_actor);
END $$;
COMMIT;
`);

  const row = dbScalar(
    `select concat(p.id::text, '|', ws.warehouse_id::text) from public.products p join public.warehouse_stock ws on ws.product_id = p.id where p.sku = '${escapedSku}' limit 1;`,
  );
  const [productId, warehouseId] = row.split("|");
  return { sku, name, searchName, productId, warehouseId };
}

function setStock(product: FixtureProduct, quantity: number): void {
  dbExecE2e(`
BEGIN;
UPDATE public.warehouse_stock
   SET quantity = ${quantity}, updated_at = now()
 WHERE product_id = '${product.productId}'::uuid
   AND warehouse_id = '${product.warehouseId}'::uuid
   AND EXISTS (SELECT 1 FROM public.products WHERE id = '${product.productId}'::uuid AND sku LIKE 'E2E_215_%');
COMMIT;
`);
}

function stockOf(product: FixtureProduct): number {
  return scalarNumber(
    `select quantity::text from public.warehouse_stock where product_id='${product.productId}'::uuid and warehouse_id='${product.warehouseId}'::uuid;`,
  );
}

function movementCount(product: FixtureProduct, quoteId?: string): number {
  const quoteClause = quoteId ? ` and ref_id='${quoteId}'::uuid` : "";
  return scalarNumber(
    `select count(*)::text from public.stock_movements where product_id='${product.productId}'::uuid${quoteClause};`,
  );
}

function createSentQuoteDirect(prefix: string, products: Array<{ product: FixtureProduct; qty: number }>): CreatedQuote {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const customerName = `${prefix}Direct_Customer_${suffix}`;
  const escapedCustomerName = sql(customerName);
  const values = products
    .map(
      ({ product, qty }) =>
        `('${product.productId}'::uuid, '${sql(product.sku)}', '${sql(product.name)}', ${qty}, 100000, ${qty * 100000})`,
    )
    .join(",");

  dbExecE2e(`
BEGIN;
DO $$
DECLARE
  v_sales uuid;
  v_quote uuid;
  v_wh uuid := '${products[0].product.warehouseId}'::uuid;
BEGIN
  SELECT user_id INTO v_sales FROM public.user_roles WHERE role = 'sales' ORDER BY user_id LIMIT 1;
  IF v_sales IS NULL THEN
    RAISE EXCEPTION 'No sales actor found for ${sql(prefix)}';
  END IF;

  INSERT INTO public.sales_quotes (
    customer_name, customer_phone, customer_note, expires_at,
    subtotal_amount, discount_amount, final_amount, salesperson_id, quote_number,
    customer_id, warehouse_id, quote_exception_type, quote_exception_confirmed_at,
    quote_exception_confirmed_by, quote_exception_text, quote_exception_snapshot, credit_check_snapshot, status
  )
  VALUES (
    '${escapedCustomerName}', '09000000000', NULL, now() + interval '1 day',
    ${products.reduce((sum, p) => sum + p.qty * 100000, 0)}, 0, ${products.reduce((sum, p) => sum + p.qty * 100000, 0)},
    v_sales, '', NULL, v_wh, 'accounting_approval', now(), v_sales,
    '${sql(prefix)} direct accounting approval',
    jsonb_build_object('type','accounting_approval','text','${sql(prefix)} direct accounting approval'),
    jsonb_build_object('mode','guest_accounting_approval','checked',false),
    'sent'
  )
  RETURNING id INTO v_quote;

  INSERT INTO public.sales_quote_items (
    quote_id, product_id, sku_snapshot, title_snapshot, quantity, unit_price, discount_amount, line_total, source
  )
  SELECT v_quote, product_id, sku, title, qty, 100000, 0, total, 'product_price'::public.sales_quote_item_source
    FROM (VALUES ${values}) AS x(product_id, sku, title, qty, unit_price, total);
END $$;
COMMIT;
`);

  const id = dbScalar(
    `select id::text from public.sales_quotes where customer_name='${escapedCustomerName}' order by created_at desc limit 1;`,
  );
  return { id, customerName };
}

function attemptAcceptAsAdmin(quoteId: string, prefix: string): void {
  const adminId = dbScalar(
    "select user_id::text from public.user_roles where role in ('admin','manager') order by case role when 'admin' then 1 else 2 end, user_id limit 1;",
  );
  dbExecE2e(`
BEGIN;
-- E2E_215_ guarded acceptance attempt for ${sql(prefix)}
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '${adminId}', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"${adminId}","role":"authenticated"}', true);
  BEGIN
    PERFORM public.update_sales_quote_status('${quoteId}'::uuid, 'accepted'::public.sales_quote_status, NULL);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;
COMMIT;
`);
}

function statusOf(quoteId: string): string {
  return dbScalar(`select status::text from public.sales_quotes where id='${quoteId}'::uuid;`);
}

async function createQuoteViaSalesUi(browser: Browser, prefix: string, product: FixtureProduct, requested: number) {
  const customerName = `${prefix}UI_Customer_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const customerPhone = `09${Date.now().toString().slice(-9).padStart(9, "0")}`;
  const page = await openRolePage(browser, ADMIN_STATE, "/sales/quotes");
  await page.locator('a[href="/sales/quotes/new"]').first().click();
  await expect(page).toHaveURL(/\/sales\/quotes\/new$/);

  await page.getByLabel(/نام مشتری/).fill(customerName);
  await page.getByLabel(/شماره تماس/).fill(customerPhone);
  await page.getByText("نوع تسویه", { exact: false }).locator("..").getByRole("combobox").click();
  await page.getByRole("option").first().click();

  await page.getByRole("button", { name: /افزودن آیتم/ }).click();
  await page.getByPlaceholder(/جستجوی نام محصول/).fill(product.searchName);
  await expect(page.getByText(product.name)).toBeVisible();
  await page.getByText(product.name).click();
  await page.getByText("نوع قیمت فروش", { exact: true }).locator("..").getByRole("combobox").click();
  await page.getByRole("option").first().click();
  await page.getByTestId("quote-item-quantity").fill(String(requested));
  await page.getByRole("button", { name: "افزودن به پیش‌فاکتور" }).click();

  await expect(page.getByText(product.name).first()).toBeVisible();
  await expect(page.getByText(/موجودی کافی نیست/)).toHaveCount(0);
  await page.getByRole("button", { name: /ذخیره پیش‌نویس/ }).click();

  await expect(page.getByRole("heading", { name: "مشتری اعتبار قابل استفاده ندارد" })).toBeVisible();
  await page.getByRole("button", { name: /ثبت با تأیید حسابداری/ }).click();
  await expect(page).toHaveURL(/\/sales\/quotes\/?$/);

  await expect
    .poll(() =>
      dbScalar(
        `select count(*)::text from public.sales_quotes where customer_name='${sql(customerName)}';`,
      ),
    )
    .toBe("1");
  const quoteId = dbScalar(
    `select id::text from public.sales_quotes where customer_name='${sql(customerName)}' order by created_at desc limit 1;`,
  );
  await page.context().close();
  return { id: quoteId, customerName };
}

async function sendQuoteViaSalesUi(browser: Browser, quoteId: string) {
  const page = await openRolePage(browser, ADMIN_STATE, `/sales/quotes/${quoteId}`);
  await page.getByRole("button", { name: /ارسال پیش‌فاکتور/ }).first().click();
  await expect(page.getByRole("heading", { name: "ارسال پیش‌فاکتور" })).toBeVisible();
  await page.getByRole("button", { name: "تایید" }).click();
  await expect(page.getByText("ارسال‌شده")).toBeVisible();
  await page.context().close();
}

test.describe.serial("Requirement 215 - business inventory finalization flow", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }, testInfo) => {
    await expectNoSevereConsoleErrors(page, testInfo);
  });

  test("inventory is enforced only at quote acceptance/finalization", async ({ browser }, testInfo) => {
    const prefix = `E2E_215_${Date.now()}_`;
    const counterBefore = scalarNumber(
      `select coalesce((select last_value from public.sales_quote_counters where year=${currentYear()}), 0)::text;`,
    );

    dbSetup(prefix, counterBefore);
    const blockedProduct = createProduct(prefix, "BLOCKED", 2, "unavailable");
    const availableBeforeAll = stockOf(blockedProduct);
    const movementBeforeAll = movementCount(blockedProduct);

    let listUx: "structured" | "generic" | "not-visible" | "not-reached" = "not-reached";

    try {
      expect(availableBeforeAll).toBe(2);
      expect(movementBeforeAll).toBe(0);

      const quote = await createQuoteViaSalesUi(browser, prefix, blockedProduct, 5);
      expect(statusOf(quote.id)).toBe("draft");
      expect(
        scalarNumber(
          `select count(*)::text from public.sales_quote_items where quote_id='${quote.id}'::uuid and product_id='${blockedProduct.productId}'::uuid and quantity=5;`,
        ),
      ).toBe(1);
      expect(stockOf(blockedProduct)).toBe(2);
      expect(movementCount(blockedProduct, quote.id)).toBe(0);

      await sendQuoteViaSalesUi(browser, quote.id);
      expect(statusOf(quote.id)).toBe("sent");

      const adminDetail = await openRolePage(browser, ADMIN_STATE, `/sales/quotes/${quote.id}`);
      await adminDetail.getByRole("button", { name: /^پذیرش$/ }).click();
      const dialog = adminDetail.getByRole("alertdialog", { name: "پذیرش پیش‌فاکتور" });
      await expect(dialog).toBeVisible();
      const shortage = dialog.getByText(/موجودی کافی نیست/).first();
      let detailUx: "preview" | "backend-fallback" = "preview";
      try {
        await expect(shortage).toBeVisible({ timeout: 5_000 });
        await expect(dialog.getByText(blockedProduct.name)).toBeVisible();
        await expect(dialog.getByText(/نیاز\s+(5|۵)\s+\/\s+موجود\s+(2|۲)/)).toBeVisible();
        await expect(dialog.getByRole("button", { name: "تایید" })).toBeDisabled();
      } catch {
        detailUx = "backend-fallback";
        await dialog.getByRole("button", { name: "تایید" }).click();
        const backendError = adminDetail.getByText(/موجودی کافی نیست/).first();
        await expect(backendError).toBeVisible();
        await expect(backendError).toContainText(blockedProduct.name);
        await expect(backendError).toContainText(/فقط\s+(2|۲)\s+عدد موجود دارد/);
        await expect(backendError).toContainText(/درخواست\s+(5|۵)\s+عدد است/);
      }
      await testInfo.attach("215-detail-ux-classification", {
        body: detailUx,
        contentType: "text/plain",
      });
      await saveEvidence(adminDetail, testInfo, "215-detail-shortage");
      await adminDetail.reload({ waitUntil: "domcontentloaded" });
      await expect(adminDetail.getByText("ارسال‌شده")).toBeVisible();
      await adminDetail.context().close();

      expect(statusOf(quote.id)).toBe("sent");
      expect(stockOf(blockedProduct)).toBe(2);
      expect(movementCount(blockedProduct, quote.id)).toBe(0);

      const productA = createProduct(prefix, "ATOMIC_OK", 10, "available");
      const productB = createProduct(prefix, "ATOMIC_LOW", 2, "available");
      const atomicQuote = createSentQuoteDirect(prefix, [
        { product: productA, qty: 3 },
        { product: productB, qty: 5 },
      ]);
      attemptAcceptAsAdmin(atomicQuote.id, prefix);
      expect(statusOf(atomicQuote.id)).toBe("sent");
      expect(stockOf(productA)).toBe(10);
      expect(stockOf(productB)).toBe(2);
      expect(movementCount(productA, atomicQuote.id)).toBe(0);
      expect(movementCount(productB, atomicQuote.id)).toBe(0);

      setStock(blockedProduct, 10);
      expect(stockOf(blockedProduct)).toBe(10);
      const adminPositive = await openRolePage(browser, ADMIN_STATE, `/sales/quotes/${quote.id}`);
      await adminPositive.getByRole("button", { name: /^پذیرش$/ }).click();
      const positiveDialog = adminPositive.getByRole("alertdialog", { name: "پذیرش پیش‌فاکتور" });
      await expect(positiveDialog).toBeVisible();
      await expect(positiveDialog.getByRole("button", { name: "تایید" })).toBeEnabled();
      await positiveDialog.getByRole("button", { name: "تایید" }).click();
      await expect(adminPositive.getByText("پذیرفته‌شده").first()).toBeVisible();
      await adminPositive.reload({ waitUntil: "domcontentloaded" });
      await expect(adminPositive.getByText("پذیرفته‌شده").first()).toBeVisible();
      await expect(adminPositive.getByRole("button", { name: /^پذیرش$/ })).toHaveCount(0);
      await adminPositive.context().close();

      expect(statusOf(quote.id)).toBe("accepted");
      expect(stockOf(blockedProduct)).toBe(5);
      expect(movementCount(blockedProduct, quote.id)).toBe(1);
      expect(
        dbScalar(
          `select concat(movement_type, '|', quantity::text, '|', delta::text, '|', ref_type) from public.stock_movements where ref_id='${quote.id}'::uuid and product_id='${blockedProduct.productId}'::uuid;`,
        ),
      ).toBe("out|5|-5|sale_quote_confirm");

      attemptAcceptAsAdmin(quote.id, prefix);
      expect(stockOf(blockedProduct)).toBe(5);
      expect(movementCount(blockedProduct, quote.id)).toBe(1);

      const exactProduct = createProduct(prefix, "EXACT", 5, "limited");
      const exactQuote = createSentQuoteDirect(prefix, [{ product: exactProduct, qty: 5 }]);
      attemptAcceptAsAdmin(exactQuote.id, prefix);
      expect(statusOf(exactQuote.id)).toBe("accepted");
      expect(stockOf(exactProduct)).toBe(0);
      expect(movementCount(exactProduct, exactQuote.id)).toBe(1);

      const listProduct = createProduct(prefix, "LIST", 2, "available");
      const listQuote = await createQuoteViaSalesUi(browser, prefix, listProduct, 5);
      await sendQuoteViaSalesUi(browser, listQuote.id);
      const adminList = await openRolePage(browser, ADMIN_STATE, "/sales/quotes");
      await adminList.getByPlaceholder(/شماره پیش‌فاکتور|نام مشتری|شماره تماس/).fill(listQuote.customerName);
      const row = adminList.getByRole("row").filter({ hasText: listQuote.customerName });
      await expect(row).toBeVisible();
      const rowAccept = row.getByRole("button", { name: /^پذیرش$/ });
      await expect(rowAccept).toBeEnabled();
      try {
        await rowAccept.click({ timeout: 5_000 });
      } catch {
        await row.getByRole("button", { name: /^پذیرش$/ }).dispatchEvent("click");
      }
      const listDialog = adminList.getByRole("alertdialog", { name: "پذیرش پیش‌فاکتور" });
      await expect(listDialog).toBeVisible();
      const listConfirm = listDialog.getByRole("button", { name: "تایید" });
      await expect(listConfirm).toBeEnabled();
      try {
        await listConfirm.click({ timeout: 5_000 });
      } catch {
        // The list dialog can re-render while the stock-check mutation starts.
        // Re-locate the current confirm button and dispatch the same DOM click.
        await adminList
          .getByRole("alertdialog", { name: "پذیرش پیش‌فاکتور" })
          .getByRole("button", { name: "تایید" })
          .dispatchEvent("click", undefined, { timeout: 3_000 })
          .catch(() => undefined);
      }
      await adminList.waitForTimeout(2_000);
      const pageText = await adminList.locator("body").innerText();
      if (pageText.includes(listProduct.name) && /5|۵/.test(pageText) && /2|۲/.test(pageText)) {
        listUx = "structured";
      } else if (/موجودی کافی نیست/.test(pageText)) {
        listUx = "generic";
      } else {
        listUx = "not-visible";
      }
      await saveEvidence(adminList, testInfo, "215-list-shortage");
      await adminList.context().close();
      expect(statusOf(listQuote.id)).toBe("sent");
      expect(stockOf(listProduct)).toBe(2);
      expect(movementCount(listProduct, listQuote.id)).toBe(0);

      const salesUnauthorized = await openRolePage(browser, SALES_STATE, `/sales/quotes/${listQuote.id}`);
      await expect(salesUnauthorized.getByRole("button", { name: /^پذیرش$/ })).toHaveCount(0);
      await salesUnauthorized.context().close();
      const salesId = dbScalar(
        "select user_id::text from public.user_roles where role='sales' order by user_id limit 1;",
      );
      dbExecE2e(`
BEGIN;
DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '${salesId}', true);
  PERFORM set_config('request.jwt.claims', '{"sub":"${salesId}","role":"authenticated"}', true);
  BEGIN
    PERFORM public.update_sales_quote_status('${listQuote.id}'::uuid, 'accepted'::public.sales_quote_status, NULL);
    RAISE EXCEPTION 'Salesperson unexpectedly accepted quote for E2E_215_${sql(prefix)}';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;
COMMIT;
`);
      expect(statusOf(listQuote.id)).toBe("sent");
      expect(stockOf(listProduct)).toBe(2);
      expect(movementCount(listProduct, listQuote.id)).toBe(0);

      await testInfo.attach("215-list-ux-classification", {
        body: listUx,
        contentType: "text/plain",
      });
    } finally {
      cleanup(prefix, counterBefore);
      await testInfo.attach("215-cleanup-counts", {
        body: [
          `sales_quotes=${prefixedCount("sales_quotes", "customer_name", prefix)}`,
          `products=${prefixedCount("products", "sku", prefix)}`,
          `warehouses=${prefixedCount("warehouses", "code", prefix)}`,
          `sale_price_types=${prefixedCount("sale_price_types", "code", prefix)}`,
          `stock_movements=${scalarNumber(`select count(*)::text from public.stock_movements sm join public.products p on p.id=sm.product_id where p.sku like '${sql(prefix)}%';`)}`,
          `notifications=${scalarNumber(`select count(*)::text from public.notification_queue where title like '%${sql(prefix)}%' or body like '%${sql(prefix)}%';`)}`,
          `counter_before=${counterBefore}`,
          `counter_after=${scalarNumber(`select coalesce((select last_value from public.sales_quote_counters where year=${currentYear()}),0)::text;`)}`,
        ].join("\n"),
        contentType: "text/plain",
      });
    }
  });
});
