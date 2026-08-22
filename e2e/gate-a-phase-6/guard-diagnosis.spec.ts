/** Diagnosis only: which fail-open path in requireAnyRole is actually firing? Read-only. */
import { test } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";

test("SSR full-load vs client-side navigation, as a sales-only session", async ({ browser }) => {
  const ctx = await browser.newContext({
    storageState: "e2e/auth/salesperson-a.storage.json",
    locale: "fa-IR", timezoneId: "Asia/Tehran", baseURL: BASE,
  });
  const page = await ctx.newPage();

  // warm the session on a page sales is allowed to see
  await page.goto("/sales/quotes", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  // A) FULL PAGE LOAD (SSR pass runs beforeLoad with typeof window === "undefined")
  await page.goto("/accounting/payment-vouchers", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const ssrUrl = page.url();
  const ssrDenied = /unauthorized/.test(ssrUrl) || /دسترسی ندارید|مجاز نیست/.test(await page.locator("body").innerText());
  console.log(`A) full page load  -> url=${ssrUrl.replace(BASE,"")}  denied=${ssrDenied}`);

  // B) CLIENT-SIDE navigation: land on treasury (allowed to render), then click its in-app link
  await page.goto("/accounting/treasury", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const link = page.locator('a[href="/accounting/payment-vouchers"]').first();
  const haveLink = (await link.count()) > 0;
  console.log(`   in-app link present on treasury: ${haveLink}`);
  if (haveLink) {
    await link.click();
    await page.waitForTimeout(3000);
    const cliUrl = page.url();
    const cliDenied = /unauthorized/.test(cliUrl) || /دسترسی ندارید|مجاز نیست/.test(await page.locator("body").innerText());
    console.log(`B) client-side nav -> url=${cliUrl.replace(BASE,"")}  denied=${cliDenied}`);
  }
  await ctx.close();
});
