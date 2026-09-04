import { test, expect } from "@playwright/test";

/**
 * Phase 6.6 — the quote detail page is reachable by clicking, not just by
 * typing a URL. Before this, /sales/quotes rendered no link to
 * /sales/quotes/{id} at all.
 */

test("clicking a quote number in the list opens its detail page", async ({ page }) => {
  await page.goto("/sales/quotes");
  await page.waitForLoadState("networkidle");

  const firstQuoteLink = page.locator('a[href^="/sales/quotes/"]').filter({
    hasNotText: "پیش‌فاکتور جدید",
  });
  // Exclude the "new quote" action link, which is also under /sales/quotes/.
  const detailLink = page.locator('a[href^="/sales/quotes/"]:not([href$="/new"])').first();
  await expect(detailLink).toBeVisible({ timeout: 15_000 });
  expect(await firstQuoteLink.count()).toBeGreaterThan(0);

  const href = await detailLink.getAttribute("href");
  const quoteNumber = (await detailLink.innerText()).trim();
  await detailLink.click();
  await page.waitForLoadState("networkidle");

  // Navigated to the detail route for that quote.
  expect(page.url()).toContain(href!);
  expect(page.url()).toMatch(/\/sales\/quotes\/[0-9a-f-]{36}/);
  await expect(page.getByText("جزئیات پیش‌فاکتور").first()).toBeVisible();
  await expect(page.getByText(quoteNumber).first()).toBeVisible();
});

test("the customer on that detail page links to their person record", async ({ page }) => {
  await page.goto("/sales/quotes");
  await page.waitForLoadState("networkidle");
  await page.locator('a[href^="/sales/quotes/"]:not([href$="/new"])').first().click();
  await page.waitForLoadState("networkidle");

  // Scoped to <main>: unscoped, .first() picked up a sidebar /persons/* link (the
  // importer's, before A-6 retired it on 2026-09-04; /persons/merge is still there)
  // instead of the customer's person link.
  const personLink = page.getByRole("main").locator('a[href*="/persons/"]').first();
  await expect(personLink).toBeVisible({ timeout: 15_000 });
  const href = await personLink.getAttribute("href");
  expect(href).toMatch(/\/persons\/[0-9a-f-]{36}/);

  await personLink.click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("ویرایش شخص").first()).toBeVisible();
});
