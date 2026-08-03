import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { expectNoSevereConsoleErrors, gotoApp, saveEvidence } from "../helpers/app";

test.describe("Requirement 217.1 - visitor selection on quotes", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await expectNoSevereConsoleErrors(page, testInfo);
  });

  test("quote creation page can render the visitor picker when visitors exist", async ({
    page,
  }, testInfo) => {
    const active = Number(dbScalar("select count(*)::text from public.visitors where is_active;"));
    expect(active).toBeGreaterThan(0);

    await gotoApp(page, "/sales/quotes");
    await page.getByRole("link", { name: /پیش‌فاکتور جدید|پیش فاکتور جدید/ }).first().click();
    await expect(page).toHaveURL(/\/sales\/quotes\/new$/);
    await expect(page.getByText("ویزیتور", { exact: false }).first()).toBeVisible();
    await saveEvidence(page, testInfo, "217-1-quote-visitor-picker");
  });

  test("sales quote backend has independent salesperson and visitor fields", async () => {
    const cols = dbScalar(
      "select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema='public' and table_name='sales_quotes' and column_name in ('salesperson_id','visitor_id');",
    );
    expect(cols).toContain("salesperson_id");
    expect(cols).toContain("visitor_id");
  });
});
