/**
 * Gate A — phase 6, evidence round 7: the Asan preview compared against the
 * documents the page has ALREADY selected. Eligible rows arrive pre-ticked, so
 * this round touches no checkbox. The download button is never pressed.
 */
import { test } from "@playwright/test";

import { gotoApp, saveEvidence } from "../helpers/app";

test("F6: preview rows vs the pre-selected eligible documents", async ({ page }, testInfo) => {
  await gotoApp(page, "/admin/asan-export");
  await page.waitForTimeout(1500);
  await page.locator("button[role='combobox']").first().click();
  await page.waitForTimeout(400);
  await page.getByRole("option", { name: /دریافت‌ها و واریزها/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /اعمال بازه/ }).first().click();
  await page.waitForTimeout(3500);

  const rows = page.locator("table tbody tr");
  const n = await rows.count();
  const listed: string[] = [];
  for (let i = 0; i < n; i++) listed.push((await rows.nth(i).innerText()).replace(/\n/g, " | "));
  console.log(`=== F6 listed (${n}) — untouched, as the page selected them ===\n${listed.join("\n")}`);

  const pv = page.getByRole("button", { name: /پیش‌نمایش انتخاب‌شده‌ها/ }).first();
  console.log(`preview enabled: ${await pv.isEnabled().catch(() => false)}`);
  await pv.click();
  await page.waitForTimeout(2500);
  const panel = page.getByTestId("asan-export-preview");
  if ((await panel.count()) === 0) {
    console.log("=== preview panel did not render ===");
    return;
  }
  console.log(`=== F6 PREVIEW PANEL verbatim ===\n${await panel.innerText()}`);
  await saveEvidence(page, testInfo, "F6-preview-untouched");
});
