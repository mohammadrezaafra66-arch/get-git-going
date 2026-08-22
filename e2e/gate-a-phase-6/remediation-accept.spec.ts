/**
 * Phase 6 remediation — acceptance tests.
 *
 * Same rule as the Gate A evidence scripts: **no test here ever clicks
 * `wizard-submit`**. Each walks to the review screen and stops.
 *
 * Run:
 *   npx playwright test --config e2e/gate-a-phase-6/playwright.gate-a.config.ts remediation-accept
 */
import { expect, test, type Page } from "@playwright/test";

import { gotoApp, saveEvidence } from "../helpers/app";

const CREATE = "/accounting/receipts/create";
const ASAN_CUSTOMER = "2";
const ASAN_SUPPLIER = "90019001";

async function lookupParty(page: Page, value: string): Promise<void> {
  await page.getByTestId("wizard-lookup-input").fill(value);
  await page.getByTestId("wizard-lookup-search").click();
  await expect(page.getByTestId("wizard-party-hit").first()).toBeVisible();
}

async function fillByLabel(page: Page, label: string, value: string): Promise<boolean> {
  const box = page
    .locator("div")
    .filter({ hasText: new RegExp(`^${label}`) })
    .locator("input")
    .first();
  if ((await box.count()) === 0) return false;
  await box.fill(value);
  return true;
}

async function fillDatePickers(page: Page, jalali: string): Promise<void> {
  const pickers = page.locator('input[placeholder*="انتخاب تاریخ"]');
  for (let i = 0; i < (await pickers.count()); i++) {
    await pickers.nth(i).fill(jalali).catch(() => undefined);
  }
  await page.waitForTimeout(400);
}

test.describe("P1 — a cheque receipt can be recorded", () => {
  test("receipt + cheque reaches the review screen", async ({ page }, testInfo) => {
    await gotoApp(page, CREATE);
    await page.getByTestId("wizard-branch-receipt").click();
    await page.getByTestId("wizard-channel-cheque").click();
    await page.getByTestId("wizard-next").click();
    await lookupParty(page, ASAN_CUSTOMER);
    await page.getByTestId("wizard-next").click();

    await page.getByTestId("wizard-amount").fill("1500000");
    await fillByLabel(page, "شماره چک", "ACC-CHQ-1");
    await fillDatePickers(page, "1405/07/10");

    // The RPC refuses a destination account for a cheque, so no control should exist.
    expect(await page.getByTestId("wizard-account").count()).toBe(0);
    await expect(page.getByTestId("wizard-next")).toBeEnabled();
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("wizard-review")).toBeVisible();
    console.log("P1 receipt+cheque review:\n" + (await page.getByTestId("wizard-review").innerText()));
    await saveEvidence(page, testInfo, "P1-receipt-cheque-review");
  });

  test("payment + own cheque still requires its source account and reaches review", async ({
    page,
  }, testInfo) => {
    await gotoApp(page, CREATE);
    await page.getByTestId("wizard-branch-payment").click();
    await page.getByTestId("wizard-channel-cheque").click();
    await page.getByTestId("wizard-cheque-own").click();
    await page.getByTestId("wizard-next").click();
    await lookupParty(page, ASAN_SUPPLIER);
    await page.getByTestId("wizard-next").click();

    await page.getByTestId("wizard-amount").fill("1200000");
    await fillByLabel(page, "شماره چک", "ACC-CHQ-2");
    await fillDatePickers(page, "1405/07/10");

    // create_payment requires a source account on EVERY channel — still enforced.
    await expect(page.getByTestId("wizard-account")).toBeVisible();
    await expect(page.getByTestId("wizard-next")).toBeDisabled();
    await page.getByTestId("wizard-account").selectOption({ index: 1 });
    await expect(page.getByTestId("wizard-next")).toBeEnabled();
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("wizard-review")).toBeVisible();
    await saveEvidence(page, testInfo, "P1-payment-cheque-review");
  });

  test("regression: receipt + bank unchanged", async ({ page }) => {
    await gotoApp(page, CREATE);
    await page.getByTestId("wizard-branch-receipt").click();
    await page.getByTestId("wizard-channel-bank").click();
    await page.getByTestId("wizard-next").click();
    await lookupParty(page, ASAN_CUSTOMER);
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("wizard-amount").fill("900000");
    await page.getByTestId("wizard-tracking").fill("ACC-TRK-1");
    await expect(page.getByTestId("wizard-next")).toBeDisabled();
    await page.getByTestId("wizard-account").selectOption({ index: 1 });
    await expect(page.getByTestId("wizard-next")).toBeEnabled();
    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("wizard-review")).toBeVisible();
  });

  test("regression: receipt + cash still explains the missing cash box", async ({ page }) => {
    await gotoApp(page, CREATE);
    await page.getByTestId("wizard-branch-receipt").click();
    await page.getByTestId("wizard-channel-cash").click();
    await page.getByTestId("wizard-next").click();
    await lookupParty(page, ASAN_CUSTOMER);
    await page.getByTestId("wizard-next").click();
    await expect(page.getByText("صندوقی با نوع نقدی ثبت نشده است")).toBeVisible();
    await expect(page.getByTestId("wizard-next")).toBeDisabled();
  });
});
