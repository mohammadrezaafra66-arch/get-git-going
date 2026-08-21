/**
 * Gate A — phase 6, evidence round 6: the Asan export preview, driven with the
 * page's real controls.
 *
 * The list button's visible label is «اعمال بازه»; «نمایش اسناد بازه» is a
 * separate sr-only span, which is why earlier rounds listed nothing.
 *
 * The download button is NEVER pressed: it assigns real Asan document numbers.
 */
import { test } from "@playwright/test";

import { gotoApp, saveEvidence } from "../helpers/app";

async function openExport(page: import("@playwright/test").Page, menuLabel: string) {
  await gotoApp(page, "/admin/asan-export");
  await page.waitForTimeout(1500);
  // shadcn Select: click the trigger, then the item
  await page.locator("button[role='combobox']").first().click();
  await page.waitForTimeout(400);
  await page.getByRole("option", { name: new RegExp(menuLabel) }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /اعمال بازه/ }).first().click();
  await page.waitForTimeout(3500);
}

for (const menu of ["دریافت‌ها و واریزها", "فاکتورهای فروش"]) {
  test(`F6: export «${menu}» — list, select two, preview, compare`, async ({ page }, testInfo) => {
    await openExport(page, menu);

    const rows = page.locator("table tbody tr");
    const n = await rows.count();
    console.log(`\n=== F6 [${menu}] listed rows = ${n} ===`);
    for (let i = 0; i < Math.min(n, 10); i++) {
      console.log(`  row${i}: ${(await rows.nth(i).innerText()).replace(/\n/g, " | ")}`);
    }
    await saveEvidence(page, testInfo, `F6-${menu}-listed`);
    if (n === 0) {
      console.log(`=== F6 [${menu}]: nothing listed, cannot preview ===`);
      return;
    }

    const boxes = page.locator('table tbody [role="checkbox"], table tbody input[type="checkbox"]');
    const bc = await boxes.count();
    const picked: string[] = [];
    for (let i = 0; i < bc && picked.length < 2; i++) {
      const b = boxes.nth(i);
      if (await b.isEnabled().catch(() => false)) {
        await b.click().catch(() => undefined);
        picked.push(`row${i}: ${(await rows.nth(i).innerText()).replace(/\n/g, " | ")}`);
        await page.waitForTimeout(250);
      }
    }
    console.log(`=== F6 [${menu}] SELECTED (${picked.length}) ===\n${picked.join("\n")}`);
    await saveEvidence(page, testInfo, `F6-${menu}-selected`);

    const pv = page.getByRole("button", { name: /پیش‌نمایش انتخاب‌شده‌ها/ }).first();
    const enabled = (await pv.count()) > 0 && (await pv.isEnabled().catch(() => false));
    console.log(`preview button enabled: ${enabled}`);
    if (!enabled) return;

    await pv.click();
    await page.waitForTimeout(2000);
    const panel = page.getByTestId("asan-export-preview");
    if ((await panel.count()) === 0) {
      console.log(`=== F6 [${menu}]: preview panel did not render ===`);
      return;
    }
    console.log(`=== F6 [${menu}] PREVIEW PANEL verbatim ===\n${await panel.innerText()}`);
    await saveEvidence(page, testInfo, `F6-${menu}-preview`);
  });
}
