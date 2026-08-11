import { expect, test } from "@playwright/test";
import { expectNoSevereConsoleErrors, gotoApp, saveEvidence } from "../helpers/app";

test.describe("Requirement 214.1 - purchase advisor uses WhatsApp seller context", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await expectNoSevereConsoleErrors(page, testInfo);
  });

  test("purchase advisor page renders product, quantity, urgency and AI action", async ({
    page,
  }, testInfo) => {
    await gotoApp(page, "/operations/purchase-advisor");
    await expect(page.getByText("دستیار هوشمند خرید", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("محصول", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("تعداد مورد نیاز", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("دریافت توصیه AI", { exact: false }).first()).toBeVisible();
    await saveEvidence(page, testInfo, "214-1-purchase-advisor-form");
  });

  test("seller endpoint returns source sellers for the top WhatsApp product", async ({ request }) => {
    const top = await request.get(
      "http://192.168.170.8:8002/api/v1/reporting/top-products?range=30&limit=1",
    );
    expect(top.status()).toBe(200);
    const topJson = await top.json();
    expect(topJson.products.length).toBe(1);

    const productName = topJson.products[0].product_name;
    const sellers = await request.get(
      `http://192.168.170.8:8002/api/v1/reporting/product-sellers?product_name=${encodeURIComponent(
        productName,
      )}&days=30&limit=5`,
    );
    expect(sellers.status()).toBe(200);
    const sellerJson = await sellers.json();
    expect(sellerJson.sellers.length).toBeGreaterThan(0);
    expect(sellerJson.sellers[0]).toHaveProperty("sender_phone");
  });
});
