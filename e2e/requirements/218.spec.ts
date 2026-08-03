import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { expectNoSevereConsoleErrors, gotoApp, saveEvidence } from "../helpers/app";

test.describe("Requirement 218 - mobile-bank screenshot receipt marker", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await expectNoSevereConsoleErrors(page, testInfo);
  });

  test("receipt creation form exposes mobile-bank screenshot option", async ({ page }, testInfo) => {
    await gotoApp(page, "/accounting/receipts/create");
    await expect(page.getByText("ثبت فیش واریزی", { exact: false }).first()).toBeVisible();
    await expect(
      page.getByText("رسید اسکرین‌شات از همراه بانک", { exact: false }).first(),
    ).toBeVisible();
    await saveEvidence(page, testInfo, "218-receipt-create-mobile-bank-option");
  });

  test("receipt table, detail and export mapping can persist the marker", async () => {
    const cols = dbScalar(
      "select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema='public' and table_name='payment_receipts' and column_name in ('is_mobile_bank_screenshot','receipt_image_url');",
    );
    expect(cols).toContain("is_mobile_bank_screenshot");
    expect(cols).toContain("receipt_image_url");
  });
});
