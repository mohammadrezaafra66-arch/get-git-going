import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX, expectNoSevereConsoleErrors, gotoApp, saveEvidence } from "../helpers/app";

test.describe("Requirement 215 - quote stock rule at creation vs finalization", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await expectNoSevereConsoleErrors(page, testInfo);
  });

  test("quote creation UI is reachable without forcing a stock decision up front", async ({
    page,
  }, testInfo) => {
    await gotoApp(page, "/sales/quotes");
    await page.getByRole("link", { name: /پیش‌فاکتور جدید|پیش فاکتور جدید/ }).first().click();
    await expect(page).toHaveURL(/\/sales\/quotes\/new$/);
    await expect(page.getByRole("heading", { name: "پیش‌فاکتور جدید" })).toBeVisible();
    await expect(page.getByRole("button", { name: "افزودن آیتم" })).toBeVisible();
    await expect(page.getByText("انبار", { exact: false }).first()).toBeVisible();
    await saveEvidence(page, testInfo, "215-quote-creation-ui");
  });

  test("backend does not block stock during create, but blocks insufficient stock on finalization", async () => {
    const createDef = dbScalar(
      "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_sales_quote_with_items' order by p.oid desc limit 1;",
    );
    const stockOutTrigger = dbScalar(
      "select pg_get_triggerdef(oid) from pg_trigger where tgname='trg_sales_quotes_stock_out' order by oid desc limit 1;",
    );
    const stockOutDef = dbScalar(
      "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='trg_sales_quote_stock_out' order by p.oid desc limit 1;",
    );
    const movementDef = dbScalar(
      "select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='apply_stock_movement' order by p.oid desc limit 1;",
    );

    expect(createDef, "Pre-invoice creation must not contain a hard stock block.").not.toContain(
      "موجودی کافی نیست",
    );
    expect(createDef, "Stock should be enforced on accepted/finalization, not on create.").not.toContain(
      "warehouse_stock",
    );

    expect(stockOutTrigger).toContain("AFTER UPDATE OF status");
    expect(stockOutTrigger).toContain("new.status = 'accepted'");
    expect(stockOutDef).toContain("apply_stock_movement");
    expect(movementDef).toContain("_current + _delta < 0");
    expect(movementDef).toContain("موجودی کافی نیست");
    expect(
      movementDef,
      "Sufficient stock path is the absence of the negative-stock exception before stock update.",
    ).toContain("UPDATE public.warehouse_stock");
  });

  test("quote detail source defines finalization stock preview messages", async () => {
    const detailSource = readFileSync("src/routes/_app.sales.quotes.$quoteId.tsx", "utf8");
    expect(detailSource).toContain("checkQuoteStockAvailability");
    // Updated by phase 7 (D8-8, migrations 274/275). Warehouses are now chosen
    // PER LINE, so «در انبار انتخاب‌شده» (one selected warehouse) became
    // «در انبارهای مربوطه» (the relevant warehouses). The copy change is the
    // intended consequence of the feature; this assertion was simply stale.
    expect(detailSource).toContain("موجودی همهٔ کالاهای این پیش‌فاکتور در انبارهای مربوطه کافی است");
    expect(detailSource).toContain("موجودی کافی نیست — قطعی‌کردن انجام نمی‌شود");
  });

  test("real UI allows above-stock quote creation and blocks finalization with exact shortage details", async ({
    page,
  }, testInfo) => {
    const suffix = `${Date.now()}`;
    const productSearchName = `UI Low Stock Product ${suffix}`;
    const productName = `${E2E_PREFIX}${productSearchName}`;
    const sku = `${E2E_PREFIX}SKU_${suffix}`;
    const customerSearchName = `UI Quote Customer ${suffix}`;
    const customerName = `${E2E_PREFIX}${customerSearchName}`;
    const customerPhone = `09${suffix.slice(-9).padStart(9, "0")}`;
    const warehouseName = `${E2E_PREFIX}UI Stock Warehouse ${suffix}`;
    const warehouseCode = `${E2E_PREFIX}WH_${suffix}`;
    const salePriceTypeCode = `${E2E_PREFIX}SPT_${suffix}`;
    const settlementCode = `${E2E_PREFIX}SET_${suffix}`;
    const available = 2;
    const requested = 5;
    const unitPrice = 100_000;

    const cleanup = () =>
      dbExecE2e(`
BEGIN;
DELETE FROM public.notification_queue
 WHERE reference_id IN (SELECT id FROM public.sales_quotes WHERE customer_name = '${customerName}')
    OR title LIKE '%${E2E_PREFIX}%'
    OR body LIKE '%${E2E_PREFIX}%';
DELETE FROM public.stock_movements
 WHERE ref_id IN (SELECT id FROM public.sales_quotes WHERE customer_name = '${customerName}')
    OR product_id IN (SELECT id FROM public.products WHERE sku = '${sku}');
DELETE FROM public.sales_quote_send_queue
 WHERE quote_id IN (SELECT id FROM public.sales_quotes WHERE customer_name = '${customerName}');
DELETE FROM public.sales_quotes
 WHERE customer_name = '${customerName}';
DELETE FROM public.product_sale_price_history
 WHERE product_id IN (SELECT id FROM public.products WHERE sku = '${sku}');
DELETE FROM public.product_computed_prices
 WHERE product_id IN (SELECT id FROM public.products WHERE sku = '${sku}');
DELETE FROM public.warehouse_stock
 WHERE product_id IN (SELECT id FROM public.products WHERE sku = '${sku}')
    OR warehouse_id IN (SELECT id FROM public.warehouses WHERE code = '${warehouseCode}');
DELETE FROM public.products
 WHERE sku = '${sku}';
DELETE FROM public.warehouses
 WHERE code = '${warehouseCode}';
DELETE FROM public.sale_price_types
 WHERE code = '${salePriceTypeCode}';
DELETE FROM public.settlement_types
 WHERE code = '${settlementCode}';
DELETE FROM public.audit_logs
 WHERE COALESCE(diff::text, '') LIKE '%${suffix}%'
    OR COALESCE(entity_id, '') IN (
      SELECT id::text FROM public.sales_quotes WHERE customer_name = '${customerName}'
      UNION
      SELECT id::text FROM public.products WHERE sku = '${sku}'
    );
COMMIT;
`);

    cleanup();
    dbExecE2e(`
BEGIN;
DO $$
DECLARE
  v_actor uuid;
  v_wh uuid;
  v_sale_price_type uuid;
  v_settlement_type uuid;
  v_product uuid;
BEGIN
  SELECT user_id INTO v_actor
    FROM public.user_roles
   WHERE role IN ('admin','manager')
   ORDER BY user_id
   LIMIT 1;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No admin or manager testable user exists for ${E2E_PREFIX} setup';
  END IF;

  SELECT id INTO v_wh
    FROM public.warehouses
   WHERE is_active AND is_default
   ORDER BY created_at
   LIMIT 1;

  IF v_wh IS NULL THEN
    INSERT INTO public.warehouses (name, code, is_active, is_default, created_by)
    VALUES ('${warehouseName}', '${warehouseCode}', true, true, v_actor)
    RETURNING id INTO v_wh;
  END IF;

  SELECT id INTO v_sale_price_type
    FROM public.sale_price_types
   WHERE is_active
   ORDER BY sort_order, created_at
   LIMIT 1;

  IF v_sale_price_type IS NULL THEN
    INSERT INTO public.sale_price_types (code, title, is_active, sort_order)
    VALUES ('${salePriceTypeCode}', '${E2E_PREFIX}UI sale price type', true, 1)
    RETURNING id INTO v_sale_price_type;
  END IF;

  SELECT id INTO v_settlement_type
    FROM public.settlement_types
   WHERE is_active
   ORDER BY sort_order, created_at
   LIMIT 1;

  IF v_settlement_type IS NULL THEN
    INSERT INTO public.settlement_types (code, title, is_active, sort_order, days)
    VALUES ('${settlementCode}', '${E2E_PREFIX}UI settlement type', true, 1, 0)
    RETURNING id INTO v_settlement_type;
  END IF;

  INSERT INTO public.products (
    sku, name, is_active, status, stock_status, product_type, base_currency, created_by
  )
  VALUES (
    '${sku}', '${productName}', true, 'active', 'unavailable', 'iranian', 'toman', v_actor
  )
  RETURNING id INTO v_product;

  INSERT INTO public.warehouse_stock (warehouse_id, product_id, quantity)
  VALUES (v_wh, v_product, ${available});

  INSERT INTO public.product_computed_prices (
    product_id, sale_price_type_id, input_purchase_price, input_currency, currency_rate,
    purchase_price_toman, final_sale_price, rounded_sale_price, computed_by, source,
    settlement_type_id
  )
  VALUES (
    v_product, v_sale_price_type, 70000, 'toman', 1,
    70000, ${unitPrice}, ${unitPrice}, v_actor, '${E2E_PREFIX}ui_test', NULL
  );

  INSERT INTO public.product_sale_price_history (
    product_id, sale_price_type_id, old_sale_price, new_sale_price, change_amount,
    change_percent, created_by, settlement_type_id
  )
  VALUES (
    v_product, v_sale_price_type, NULL, ${unitPrice}, NULL,
    NULL, v_actor, NULL
  );
END $$;
COMMIT;
`);

    try {
      const initialStock = dbScalar(
        `select quantity::text from public.warehouse_stock ws join public.products p on p.id = ws.product_id where p.sku = '${sku}' limit 1;`,
      );
      expect(Number(initialStock)).toBe(available);

      await gotoApp(page, "/sales/quotes");
      await page.getByRole("link", { name: /پیش‌فاکتور جدید|پیش فاکتور جدید/ }).first().click();
      await expect(page).toHaveURL(/\/sales\/quotes\/new$/);

      await page.getByLabel(/نام مشتری/).fill(customerName);
      await page.getByLabel(/شماره تماس/).fill(customerPhone);
      await page.getByText("نوع تسویه", { exact: false }).locator("..").getByRole("combobox").click();
      await page.getByRole("option").first().click();

      await page.getByRole("button", { name: /افزودن آیتم/ }).click();
      await expect(page.getByRole("heading", { name: "افزودن آیتم به پیش‌فاکتور" })).toBeVisible();
      await page.getByPlaceholder(/جستجوی نام محصول/).fill(productSearchName);
      await expect(page.getByText(productName)).toBeVisible();
      await page.getByText(productName).click();
      await page.getByText("نوع قیمت فروش", { exact: true }).locator("..").getByRole("combobox").click();
      await page.getByRole("option").first().click();
      await page.getByText("تعداد", { exact: true }).locator("..").getByRole("spinbutton").fill(String(requested));
      await expect(
        page.getByText(/قیمت واحد/).locator("..").getByRole("spinbutton"),
      ).toHaveValue(String(unitPrice));
      await page.getByRole("button", { name: "افزودن به پیش‌فاکتور" }).click();

      await expect(page.getByText(productName).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /ذخیره پیش‌نویس/ })).toBeEnabled();
      await saveEvidence(page, testInfo, "215-ui-before-create-above-stock");
      await page.getByRole("button", { name: /ذخیره پیش‌نویس/ }).click();

      await expect(page.getByRole("heading", { name: "مشتری اعتبار قابل استفاده ندارد" })).toBeVisible();
      await page.getByRole("button", { name: /ثبت با تأیید حسابداری/ }).click();
      await expect(page).toHaveURL(/\/sales\/quotes\/?$/);
      await expect
        .poll(() =>
          dbScalar(
            `select count(*)::text from public.sales_quotes where customer_name = '${customerName}';`,
          ),
        )
        .toBe("1");

      const quoteId = dbScalar(
        `select id::text from public.sales_quotes where customer_name = '${customerName}' order by created_at desc limit 1;`,
      );
      expect(quoteId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      const persistedQuantity = dbScalar(
        `select quantity::text from public.sales_quote_items where quote_id = '${quoteId}' limit 1;`,
      );
      expect(Number(persistedQuantity)).toBe(requested);
      const persistedProductId = dbScalar(
        `select product_id::text from public.sales_quote_items where quote_id = '${quoteId}' limit 1;`,
      );
      expect(persistedProductId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      const stockCheckRows = dbScalar(
        `select count(*)::text from public.check_quote_stock_availability('${quoteId}'::uuid, null);`,
      );
      expect(stockCheckRows).toBe("1");
      const stockCheckSummary = dbScalar(
        `select concat(product_name, '|', required::text, '|', available::text, '|', is_sufficient::text) from public.check_quote_stock_availability('${quoteId}'::uuid, null) limit 1;`,
      );
      expect(stockCheckSummary).toContain(productName);
      expect(stockCheckSummary).toContain(`|${requested}|`);
      expect(stockCheckSummary).toContain(`|${available}|false`);

      await page.getByPlaceholder(/شماره پیش‌فاکتور|نام مشتری|شماره تماس/).fill(customerSearchName);
      const quoteRow = page.getByRole("row").filter({ hasText: customerName });
      await expect(quoteRow).toBeVisible();
      await quoteRow.getByRole("button", { name: /ارسال پیش‌فاکتور/ }).click();
      await page.getByRole("menuitem", { name: /مشاهده پیش‌فاکتور/ }).click();
      await expect(page).toHaveURL(new RegExp(`/sales/quotes/${quoteId}$`));
      await expect(page.getByRole("cell", { name: new RegExp(productName) })).toBeVisible();

      await page.getByRole("button", { name: /ارسال پیش‌فاکتور/ }).first().click();
      await expect(page.getByRole("heading", { name: "ارسال پیش‌فاکتور" })).toBeVisible();
      await page.getByRole("button", { name: "تایید" }).click();
      await expect(page.getByText("ارسال‌شده")).toBeVisible();

      await page.getByRole("button", { name: /^پذیرش$/ }).click();
      const acceptDialog = page.getByRole("alertdialog", { name: "پذیرش پیش‌فاکتور" });
      await expect(acceptDialog).toBeVisible();
      await expect(acceptDialog.getByRole("button", { name: "تایید" })).toBeEnabled();
      await acceptDialog.getByRole("button", { name: "تایید" }).click();
      const finalizationError = page.getByText(/موجودی کافی نیست/).first();
      await expect(finalizationError).toBeVisible();
      await expect(finalizationError).toContainText(productName);
      await expect(finalizationError).toContainText(/فقط\s+(2|۲)\s+عدد موجود دارد/);
      await expect(finalizationError).toContainText(/درخواست\s+(5|۵)\s+عدد است/);
      await expect(page.getByText("ارسال‌شده")).toBeVisible();
      await saveEvidence(page, testInfo, "215-ui-finalization-blocked-shortage");

      const finalStock = dbScalar(
        `select quantity::text from public.warehouse_stock ws join public.products p on p.id = ws.product_id where p.sku = '${sku}' limit 1;`,
      );
      expect(Number(finalStock)).toBe(available);
    } finally {
      cleanup();
    }
  });
});
