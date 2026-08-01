import { test, expect } from "@playwright/test";

/**
 * Phase 1-2 — the person record page: core fields, the visibility-scope guard
 * (blocker B1) and the identifiers section that migration 228 normalizes.
 */

test("person edit page shows core fields and the identifier section", async ({ page }) => {
  // 1-2. open the first person from the list
  await page.goto("/persons");
  await page.waitForLoadState("networkidle");
  const firstEdit = page.locator('a[href*="/edit"]').first();
  await expect(firstEdit).toBeVisible();
  const href = await firstEdit.getAttribute("href");
  await firstEdit.click();
  await page.waitForLoadState("networkidle");

  // 3. the edit page loaded
  expect(page.url()).toContain(href!);
  await expect(page.getByText("ویرایش شخص").first()).toBeVisible();

  // 4. core fields. getByLabel (not getByText) so this asserts the Phase 6.5
  //    label-to-control wiring, not merely that the words appear on screen.
  await expect(page.getByLabel("نوع شخص")).toBeVisible();
  await expect(page.getByLabel("سطح دسترسی")).toBeVisible();
  await expect(page.getByLabel("نام نمایشی *")).toBeVisible();
  await expect(page.getByLabel("نام رسمی / قانونی")).toBeVisible();
  await expect(page.getByRole("button", { name: "ذخیره تغییرات" })).toBeVisible();

  // 5. identifiers section
  await expect(page.getByText("شناسه‌ها").first()).toBeVisible();
  await expect(page.getByText("نوع شناسه").first()).toBeVisible();

  // 6. the identifier-kind combobox offers موبایل
  const kindCombo = page.getByRole("combobox").nth(2);
  await expect(kindCombo).toBeVisible();
  await kindCombo.click();
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  await expect(listbox.getByText("موبایل", { exact: false }).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // 7. the add button.
  // exact:true — without it, 11 sidebar buttons ("افزودن محصول", ...) also match.
  await expect(
    page.getByRole("button", { name: "افزودن", exact: true }).first(),
  ).toBeVisible();

  // Phase 2 evidence: the identifiers table exposes the DB-normalized value.
  await expect(page.getByText("مقدار نرمال‌شده").first()).toBeVisible();
});

test("existing identifiers are stored in normalized form", async ({ page }) => {
  await page.goto("/persons");
  await page.waitForLoadState("networkidle");

  // Walk the first few persons until one has an identifier row to inspect.
  const links = page.locator('a[href*="/edit"]');
  const count = Math.min(6, await links.count());
  let sawNormalized = false;

  for (let i = 0; i < count; i++) {
    const href = await links.nth(i).getAttribute("href");
    await page.goto(href!);
    await page.waitForLoadState("networkidle");
    const body = await page.locator("body").innerText();
    if (/\+98\d{10}/.test(body)) {
      sawNormalized = true;
      break;
    }
    await page.goto("/persons");
    await page.waitForLoadState("networkidle");
  }

  expect(sawNormalized, "no person showed a +98-normalized mobile identifier").toBeTruthy();
});
