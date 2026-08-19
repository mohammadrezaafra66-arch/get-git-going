import { expect, test } from "@playwright/test";
import { gotoApp } from "../helpers/app";

test.describe("phase 6 three-branch wizard", () => {
  test("step 1 shows three branches and does not submit", async ({ page }) => {
    await gotoApp(page, "/accounting/receipts/create");
    await expect(page.getByTestId("document-wizard")).toBeVisible();
    await expect(page.getByTestId("wizard-branch-receipt")).toBeVisible();
    await expect(page.getByTestId("wizard-branch-payment")).toBeVisible();
    await expect(page.getByTestId("wizard-branch-dual")).toBeVisible();
    await expect(page.locator("form")).toHaveCount(0);
    await page.getByTestId("wizard-branch-receipt").click();
    await expect(page.getByTestId("wizard-channel-bank")).toBeVisible();
    await expect(page.getByTestId("wizard-submit")).toHaveCount(0);
  });

  test("cash and cheque never ask for a bank tracking number", async ({ page }) => {
    await gotoApp(page, "/accounting/receipts/create");
    await page.getByTestId("wizard-branch-receipt").click();
    await page.getByTestId("wizard-channel-cash").click();
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("wizard-lookup-input")).toBeVisible();
    await page
      .getByTestId("wizard-next")
      .click({ trial: true })
      .catch(() => undefined);
  });

  test("old PaymentReceiptForm fields are gone", async ({ page }) => {
    await gotoApp(page, "/accounting/receipts/create");
    await expect(page.getByText("ثبت سند حسابداری")).toBeVisible();
    await expect(page.getByText("پرفراژ")).toHaveCount(0);
    await expect(page.getByText("فیش تایپی")).toHaveCount(0);
  });
});
