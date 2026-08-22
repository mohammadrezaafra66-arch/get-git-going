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

/* ------------------------------------------------------------------ P2 role gate */

const BASE = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";

async function roleContext(browser: import("@playwright/test").Browser, file: string) {
  return browser.newContext({
    storageState: `e2e/auth/${file}`,
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    baseURL: BASE,
  });
}

test.describe("P2 — the role gate holds on a full page load", () => {
  test("sales is denied, with a readable Persian message, not a blank page", async ({
    browser,
  }, testInfo) => {
    const ctx = await roleContext(browser, "salesperson-a.storage.json");
    const page = await ctx.newPage();
    await page.goto("/sales/quotes", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    // full page load — the path that used to fail open
    await page.goto(CREATE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3500);
    const body = await page.locator("body").innerText();

    expect(await page.getByTestId("document-wizard").count()).toBe(0);
    expect(await page.getByTestId("wizard-branch-receipt").count()).toBe(0);
    await expect(page.getByTestId("create-denied")).toBeVisible();
    expect(body).toContain("دسترسی ندارید");
    console.log(
      "P2 sales sees: " +
        (await page.getByTestId("create-denied").innerText()).replace(/\n/g, " "),
    );
    await saveEvidence(page, testInfo, "P2-sales-denied");
    await ctx.close();
  });

  for (const [role, file] of [
    ["admin", "admin.storage.json"],
    ["accountant", "accountant.storage.json"],
  ] as const) {
    test(`${role} still reaches the wizard`, async ({ browser }) => {
      const ctx = await roleContext(browser, file);
      const page = await ctx.newPage();
      await page.goto(CREATE, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3500);
      await expect(page.getByTestId("document-wizard")).toBeVisible();
      await expect(page.getByTestId("wizard-branch-receipt")).toBeVisible();
      expect(await page.getByTestId("create-denied").count()).toBe(0);
      await ctx.close();
    });
  }
});

/* ------------------------------------------------------------------ P3 review screen */

test.describe("P3 — the review screen tells the truth", () => {
  test("receipt review: Jalali date, tracking, description, corrected disclaimer", async ({
    page,
  }, testInfo) => {
    await gotoApp(page, CREATE);
    await page.getByTestId("wizard-branch-receipt").click();
    await page.getByTestId("wizard-channel-bank").click();
    await page.getByTestId("wizard-next").click();
    await lookupParty(page, ASAN_CUSTOMER);
    await page.getByTestId("wizard-next").click();
    await page.getByTestId("wizard-amount").fill("4321000");
    await page.getByTestId("wizard-tracking").fill("P3-TRK-9");
    await page.getByTestId("wizard-account").selectOption({ index: 1 });
    const ta = page.locator("textarea");
    if ((await ta.count()) > 0) await ta.first().fill("P3-DESC-9");
    await page.getByTestId("wizard-next").click();

    const review = page.getByTestId("wizard-review");
    await expect(review).toBeVisible();
    const text = await review.innerText();
    console.log("P3 receipt review:\n" + text);
    await saveEvidence(page, testInfo, "P3-receipt-review");

    // 3.3 — no Gregorian ISO date anywhere on the review screen
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    // 3.1 — tracking and description are shown
    expect(text).toContain("P3-TRK-9");
    expect(text).toContain("P3-DESC-9");
    // 3.2 — the disclaimer no longer claims the screen came from the server
    expect(text).toContain("از سرور نمی‌آید");
    expect(text).not.toContain("از سرور می‌آید؛");
  });

  test("dual review: all four T11 evidence fields appear, labelled as carrying no accounting weight", async ({
    page,
  }, testInfo) => {
    await gotoApp(page, CREATE);
    await page.getByTestId("wizard-branch-dual").click();
    await page.getByTestId("wizard-amount").fill("2500000");
    await page.getByTestId("wizard-tracking").fill("P3-DUAL-TRK");
    const ta = page.locator("textarea");
    if ((await ta.count()) > 0) await ta.first().fill("P3-DUAL-DESC");
    await fillByLabel(page, "نام انتقال‌دهنده", "P3-TRANSFERRER");
    await fillByLabel(page, "شماره حساب انتقال‌دهنده", "P3-TR-ACCT");
    await fillByLabel(page, "نام گیرندهٔ حساب", "P3-RECIPIENT");
    await fillByLabel(page, "شماره حساب گیرنده", "P3-RC-ACCT");

    await page.getByTestId("wizard-next").click();
    await lookupParty(page, ASAN_CUSTOMER);
    await page.getByTestId("wizard-next").click();
    await lookupParty(page, ASAN_SUPPLIER);
    await page.getByTestId("wizard-next").click();

    const review = page.getByTestId("wizard-review");
    await expect(review).toBeVisible();
    const text = await review.innerText();
    console.log("P3 dual review:\n" + text);
    await saveEvidence(page, testInfo, "P3-dual-review");

    for (const v of [
      "P3-TRANSFERRER",
      "P3-TR-ACCT",
      "P3-RECIPIENT",
      "P3-RC-ACCT",
      "P3-DUAL-TRK",
      "P3-DUAL-DESC",
    ]) {
      expect(text).toContain(v);
    }
    await expect(page.getByTestId("wizard-review-evidence")).toBeVisible();
    expect(text).toContain("فقط روی سند — بدون اثر حسابداری");
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  test("the proforma empty state no longer promises a file attachment", async ({ page }) => {
    await gotoApp(page, CREATE);
    await page.getByTestId("wizard-branch-receipt").click();
    await page.getByTestId("wizard-channel-bank").click();
    await page.getByTestId("wizard-next").click();
    await lookupParty(page, ASAN_CUSTOMER);
    await page.getByTestId("wizard-next").click();
    const empty = page.getByTestId("wizard-proforma-empty");
    if ((await empty.count()) > 0) {
      const t = await empty.innerText();
      console.log("P3 proforma empty state: " + t);
      expect(t).not.toContain("پیوست اختیاری است");
      expect(t).toContain("تخصیص پیش‌فاکتور اختیاری است");
    } else {
      console.log("P3 proforma empty state: not shown (this customer has open proformas)");
    }
    expect(await page.locator('input[type="file"]').count()).toBe(0);
  });
});
