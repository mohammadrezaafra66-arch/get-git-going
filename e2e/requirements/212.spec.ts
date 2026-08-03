import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { expectNoSevereConsoleErrors, gotoApp, saveEvidence } from "../helpers/app";

test.describe("Requirement 212 - quote credit, commitment, and stock guards", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await expectNoSevereConsoleErrors(page, testInfo);
  });

  test("quote creation page exposes guardable fields and backend RPC signature is deployed", async ({
    page,
  }, testInfo) => {
    await gotoApp(page, "/sales/quotes");
    await page.getByRole("link", { name: /پیش‌فاکتور جدید|پیش فاکتور جدید/ }).first().click();
    await expect(page).toHaveURL(/\/sales\/quotes\/new$/);
    await expect(page.getByText("پیش‌فاکتور", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("مشتری", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("انبار", { exact: false }).first()).toBeVisible();
    await saveEvidence(page, testInfo, "212-new-quote-guard-form");

    const args = dbScalar(
      "select pg_get_function_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_sales_quote_with_items' order by p.oid desc limit 1;",
    );
    expect(args).toContain("p_quote_exception_type");
    expect(args).toContain("p_quote_exception_minutes");
    expect(args).toContain("p_quote_exception_amount");
    expect(args).toContain("p_warehouse_id");
    expect(args).toContain("p_visitor_id");
  });

  test("stock and exception persistence columns exist", async () => {
    const cols = dbScalar(
      "select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema='public' and table_name='sales_quotes' and column_name in ('quote_exception_type','quote_exception_text','quote_exception_snapshot','quote_exception_minutes','quote_exception_amount','warehouse_id','visitor_id');",
    );
    expect(cols).toContain("quote_exception_type");
    expect(cols).toContain("quote_exception_text");
    expect(cols).toContain("quote_exception_snapshot");
    expect(cols).toContain("warehouse_id");
  });
});
