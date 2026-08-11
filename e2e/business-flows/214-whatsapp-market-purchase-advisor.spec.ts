import { expect, test, type Locator } from "@playwright/test";
import { expectNoSevereConsoleErrors, gotoApp, saveEvidence } from "../helpers/app";

interface WhatsappTopProduct {
  product_id: string | null;
  product_name: string;
  rank: number;
  mention_count: number;
  group_count: number;
  sender_count: number;
}

interface WhatsappSeller {
  sender_name?: string | null;
  sender_display_name?: string | null;
  sender_phone?: string | null;
  group_name?: string | null;
  all_contacts?: string[];
}

function faDigits(value: number | string): string {
  return String(value).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

async function expectContactText(locator: Locator, contact: string) {
  const text = await locator.innerText();
  expect(text.includes(contact) || text.includes(faDigits(contact))).toBe(true);
}

test.describe("Requirement 214 - WhatsApp market mirror and purchase advisor context", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await expectNoSevereConsoleErrors(page, testInfo);
  });

  test("mirrors WhatsApp top products and uses seller context in purchase advice", async ({
    page,
    request,
  }, testInfo) => {
    test.setTimeout(180_000);

    const topResponse = await request.get(
      "http://192.168.170.8:8002/api/v1/reporting/top-products?days=30&limit=5",
    );
    expect(topResponse.status()).toBe(200);
    const topJson = (await topResponse.json()) as { products?: WhatsappTopProduct[] };
    const products = topJson.products ?? [];
    expect(products.length).toBeGreaterThanOrEqual(3);

    const product = products.find((p) => p.product_id && p.product_name);
    expect(
      product,
      "At least one WhatsApp top product must be mapped to an AfraKala product",
    ).toBeTruthy();

    const sellersResponse = await request.get(
      `http://192.168.170.8:8002/api/v1/reporting/product-sellers?product_name=${encodeURIComponent(
        product!.product_name,
      )}&days=30&limit=5`,
    );
    expect(sellersResponse.status()).toBe(200);
    const sellersJson = (await sellersResponse.json()) as { sellers?: WhatsappSeller[] };
    const sellers = sellersJson.sellers ?? [];
    expect(sellers.length).toBeGreaterThan(0);
    const firstSeller = sellers[0];
    const firstSellerName = firstSeller.sender_display_name ?? firstSeller.sender_name ?? "";
    const firstSellerContact = firstSeller.all_contacts?.[0] ?? firstSeller.sender_phone ?? "";
    expect(firstSellerContact).not.toBe("");

    await page.goto("http://192.168.170.8:3002/reporting", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /جدول محصولات پر تکرار/ }).click();
    await expect(page.getByText("جدول محصولات پر تکرار", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(product!.product_name, { exact: false }).first()).toBeVisible();
    await saveEvidence(page, testInfo, "214-source-reporting-ui");

    await gotoApp(page, "/pricing/market-intelligence");
    const card = page.getByTestId("whatsapp-top-products-card");
    await expect(card).toBeVisible();

    for (const expected of products.slice(0, 3)) {
      const row = card.getByTestId("whatsapp-top-product-row").filter({
        hasText: expected.product_name,
      });
      await expect(row).toHaveCount(1);
      const rowText = await row.innerText();
      expect(rowText).toContain(expected.product_name);
      expect(rowText).toContain(faDigits(expected.rank));
      expect(rowText).toContain(faDigits(expected.mention_count));
      expect(rowText).toContain(faDigits(expected.group_count));
      expect(rowText).toContain(faDigits(expected.sender_count));
    }

    const selectedRow = card.getByTestId("whatsapp-top-product-row").filter({
      hasText: product!.product_name,
    });
    await selectedRow.getByTestId("whatsapp-product-sellers-button").click();
    const dialog = page.getByTestId("whatsapp-mentioners-dialog");
    await expect(dialog).toBeVisible();
    await expectContactText(dialog, firstSellerContact);
    if (firstSellerName) await expect(dialog).toContainText(firstSellerName);
    if (firstSeller.group_name) await expect(dialog).toContainText(firstSeller.group_name);
    await saveEvidence(page, testInfo, "214-destination-market-sellers");

    await gotoApp(page, "/operations/purchase-advisor");
    await page.getByRole("button", { name: /انتخاب محصول/ }).click();
    const productDialog = page.getByRole("dialog");
    await productDialog.getByRole("textbox").fill(product!.product_name);
    await productDialog
      .getByRole("button", { name: new RegExp(product!.product_name) })
      .first()
      .click();
    await page.getByRole("button", { name: /دریافت توصیه/ }).click();

    await expect(page.getByText("توصیه هوش مصنوعی", { exact: false })).toBeVisible({
      timeout: 150_000,
    });
    const advice = page.getByText("فروشندگان اخیر واتساپ برای این محصول", { exact: false });
    await expect(advice).toBeVisible();
    await expectContactText(page.locator("body"), firstSellerContact);
    if (firstSellerName) await expect(page.locator("body")).toContainText(firstSellerName);
    await saveEvidence(page, testInfo, "214-purchase-advisor-seller-context");
  });
});
