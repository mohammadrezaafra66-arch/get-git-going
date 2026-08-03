import { expect, test } from "@playwright/test";
import { expectNoSevereConsoleErrors, gotoApp, saveEvidence } from "../helpers/app";

test.describe("Requirement 211 - quote rejection reason visibility", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await expectNoSevereConsoleErrors(page, testInfo);
  });

  test("rejection-related pages are reachable and expose salesperson-facing surfaces", async ({
    page,
  }, testInfo) => {
    await gotoApp(page, "/sales/quotes");
    await expect(page.getByText("پیش‌فاکتورهای فروش", { exact: false }).first()).toBeVisible();
    await saveEvidence(page, testInfo, "211-sales-quotes-list");

    await gotoApp(page, "/notifications");
    await expect(page.getByText("اعلان‌ها", { exact: false }).first()).toBeVisible();
    await expect(
      page.getByText("علامت همه به‌عنوان خوانده‌شده", { exact: false }).first(),
    ).toBeVisible();
    await saveEvidence(page, testInfo, "211-notifications");

    await gotoApp(page, "/my-rejected-quotes");
    await expect(page.getByText("درخواست‌های رد شده", { exact: false }).first()).toBeVisible();
    await saveEvidence(page, testInfo, "211-my-rejected-quotes");
  });
});
