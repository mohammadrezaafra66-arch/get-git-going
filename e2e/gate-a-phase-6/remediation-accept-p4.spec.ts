/**
 * Phase 4 acceptance — one document, one name on both screens.
 *
 * Owner answer (c) 2026-08-22: no stored name is rewritten; the readers agree, and
 * the agreed source is the person file, because the journal, the Asan export and
 * create_receipt's own payer_name already use it.
 *
 * No submit. No export download — that button assigns real Asan numbers.
 */
import { expect, test } from "@playwright/test";

import { gotoApp, saveEvidence } from "../helpers/app";

/** Two live receipts whose customers.name and persons.display_name diverge. */
const CASES = [
  { tracking: "12364", person: "شخص آزمایشی 23", legacy: "مشتری آزمایشی 20" },
  { tracking: "65656565", person: "شخص آزمایشی 2", legacy: "مشتری آزمایشی 8" },
];

test("receipts list shows the person-file name, the same one the Asan export shows", async ({
  page,
}, testInfo) => {
  await gotoApp(page, "/accounting/receipts");
  await page.waitForTimeout(3500);

  const table = page.locator("table");
  await expect(table).toBeVisible();
  const tableText = await table.innerText();
  console.log(["=== receipts list, table text ===", tableText.slice(0, 700)].join("\n"));
  await saveEvidence(page, testInfo, "P4-receipts-list");

  // The list renders Persian digits, so match on the party name rather than the
  // tracking number. Each case asserts the person-file name is present and the
  // legacy customers.name for that same row is absent from the whole table.
  for (const c of CASES) {
    expect(tableText).toContain(c.person);
    expect(tableText).not.toContain(c.legacy);
  }

  // An unresolved PostgREST embed would return no rows at all; prove rows rendered.
  expect(await page.locator("table tbody tr").count()).toBeGreaterThan(0);
});

test("the Asan export preview names the same parties", async ({ page }, testInfo) => {
  await gotoApp(page, "/admin/asan-export");
  await page.waitForTimeout(1500);
  await page.locator("button[role='combobox']").first().click();
  await page.waitForTimeout(400);
  await page.getByRole("option", { name: /دریافت‌ها و واریزها/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /اعمال بازه/ }).first().click();
  await page.waitForTimeout(3500);

  await page.getByRole("button", { name: /پیش‌نمایش انتخاب‌شده‌ها/ }).first().click();
  await page.waitForTimeout(2000);
  const panel = page.getByTestId("asan-export-preview");
  await expect(panel).toBeVisible();
  const text = await panel.innerText();
  console.log(["=== export preview ===", text].join("\n"));
  await saveEvidence(page, testInfo, "P4-export-preview");

  for (const c of CASES) expect(text).toContain(c.person);
});
