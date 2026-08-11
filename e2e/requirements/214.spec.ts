import { expect, test } from "@playwright/test";
import { expectNoSevereConsoleErrors, gotoApp, saveEvidence } from "../helpers/app";

test.describe("Requirement 214 - WhatsApp top products mirror", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await expectNoSevereConsoleErrors(page, testInfo);
  });

  test("source reporting page and destination market card both render", async ({ page }, testInfo) => {
    const sourceResponse = await page.goto("http://192.168.170.8:3002/reporting");
    expect(sourceResponse?.status()).toBeLessThan(400);
    await expect(page.getByText("گزارش‌ها", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("جدول محصولات پر تکرار", { exact: false }).first()).toBeVisible();
    await saveEvidence(page, testInfo, "214-source-reporting");

    await gotoApp(page, "/pricing/market-intelligence");
    await expect(
      page.getByText("محصولات پرتکرار در گفتگوهای واتساپ", { exact: false }).first(),
    ).toBeVisible();
    await expect(page.getByText("منبع: واتساپ", { exact: false }).first()).toBeVisible();
    await saveEvidence(page, testInfo, "214-destination-market-intelligence");
  });

  test("WhatsApp API returns real top-products data", async ({ request }) => {
    const response = await request.get(
      "http://192.168.170.8:8002/api/v1/reporting/top-products?range=30&limit=3",
    );
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json.products.length).toBeGreaterThan(0);
    expect(json.products[0]).toHaveProperty("product_name");
    expect(json.products[0]).toHaveProperty("mention_count");
  });
});
