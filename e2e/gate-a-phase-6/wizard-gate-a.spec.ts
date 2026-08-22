/**
 * Gate A — phase 6 wizard, independent review evidence.
 *
 * READ-ONLY against the running app. No test in this file ever clicks
 * `wizard-submit`. Every test fills fields, steps forward, reads the screen and
 * captures a screenshot, then stops. That is deliberate: the reviewer is not
 * authorised to create a real financial document.
 *
 * These are evidence artefacts for docs/execution/phase-6-GATE-A.md, not part of
 * the regression suite's contract.
 */
import { expect, test, type Page } from "@playwright/test";

import { gotoApp, saveEvidence } from "../helpers/app";

const CREATE = "/accounting/receipts/create";

// Test-server fixtures, read from the live catalogue before this run.
const ASAN_CUSTOMER = "2"; // شخص آزمایشی 2 — customer, has an Asan code
const ASAN_SUPPLIER = "90019001"; // شخص آزمایشی 78 — supplier, has an Asan code
const ASAN_CUSTOMER_ONLY = "1125623"; // شخص آزمایشی 17 — customer, NOT supplier, NOT external party

async function lookupParty(page: Page, value: string): Promise<void> {
  await page.getByTestId("wizard-lookup-input").fill(value);
  await page.getByTestId("wizard-lookup-search").click();
}

/** The exact disabled-state of the "بعدی" button, for evidence. */
async function nextState(page: Page): Promise<string> {
  const btn = page.getByTestId("wizard-next");
  if ((await btn.count()) === 0) return "wizard-next: NOT RENDERED";
  return `wizard-next disabled=${await btn.isDisabled()}`;
}

/** Everything a user could possibly read as an error, anywhere on the page. */
async function visibleErrors(page: Page): Promise<string> {
  const text = await page.locator("body").innerText();
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /خطا|نامعتبر|الزامی|نمی‌توان|مجاز نیست|اجازه|یافت نشد|نیست/.test(l));
  return lines.length ? lines.join(" | ") : "<no error-like text anywhere on the page>";
}

test.describe("Gate A phase 6 — receipt branch", () => {
  test("F1: cheque receipt — can the user reach the review step at all?", async ({
    page,
  }, testInfo) => {
    await gotoApp(page, CREATE);
    await page.getByTestId("wizard-branch-receipt").click();
    await page.getByTestId("wizard-channel-cheque").click();
    await page.getByTestId("wizard-next").click();

    await lookupParty(page, ASAN_CUSTOMER);
    await expect(page.getByTestId("wizard-party-hit")).toBeVisible();
    await page.getByTestId("wizard-next").click();

    // Step 4: fill EVERY field the screen marks required for a cheque receipt.
    await page.getByTestId("wizard-amount").fill("1500000");
    const inputs = page.locator("input");
    // شماره چک
    await page.getByText("شماره چک", { exact: false }).first().scrollIntoViewIfNeeded();
    const chequeNo = page
      .locator("div")
      .filter({ hasText: /^شماره چک/ })
      .locator("input")
      .first();
    await chequeNo.fill("GATEA-CHQ-1");

    const before = await page.locator("body").innerText();
    // ساعت is prefilled; due date needs the picker. Record what is on screen either way.
    await saveEvidence(page, testInfo, "F1-cheque-receipt-step4");

    const state = await nextState(page);
    const errs = await visibleErrors(page);
    const hasAccountField = (await page.getByTestId("wizard-account").count()) > 0;
    const dueLabelPresent = before.includes("تاریخ سررسید");

    console.log(
      [
        "=== F1 cheque receipt, step 4 ===",
        `account field rendered : ${hasAccountField}`,
        `due-date label present : ${dueLabelPresent}`,
        state,
        `error-like text        : ${errs}`,
        `inputs on screen       : ${await inputs.count()}`,
      ].join("\n"),
    );
  });

  test("F1-control: bank receipt reaches the review step with the same effort", async ({
    page,
  }, testInfo) => {
    await gotoApp(page, CREATE);
    await page.getByTestId("wizard-branch-receipt").click();
    await page.getByTestId("wizard-channel-bank").click();
    await page.getByTestId("wizard-next").click();

    await lookupParty(page, ASAN_CUSTOMER);
    await expect(page.getByTestId("wizard-party-hit")).toBeVisible();
    await page.getByTestId("wizard-next").click();

    await page.getByTestId("wizard-amount").fill("1500000");
    await page.getByTestId("wizard-tracking").fill("GATEA-TRK-1");
    await page.getByTestId("wizard-account").selectOption({ index: 1 });

    console.log(`=== F1-control bank receipt, step 4 === ${await nextState(page)}`);
    await saveEvidence(page, testInfo, "F1-control-bank-receipt-step4");

    await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("wizard-review")).toBeVisible();
    const review = await page.getByTestId("wizard-review").innerText();
    console.log(`=== F4/F5 receipt review screen ===\n${review}`);
    await saveEvidence(page, testInfo, "F4-F5-receipt-review");
    // NO SUBMIT.
  });
});

test.describe("Gate A phase 6 — payment branch", () => {
  test("F2: does the payee field refuse a customer who is not a supplier?", async ({
    page,
  }, testInfo) => {
    await gotoApp(page, CREATE);
    await page.getByTestId("wizard-branch-payment").click();
    await page.getByTestId("wizard-channel-bank").click();
    await page.getByTestId("wizard-next").click();

    await lookupParty(page, ASAN_CUSTOMER_ONLY);
    await page.waitForTimeout(1500);
    const hit = (await page.getByTestId("wizard-party-hit").count()) > 0;
    const hitText = hit ? await page.getByTestId("wizard-party-hit").innerText() : "<none>";
    console.log(
      [
        "=== F2 payment payee = a customer who is NOT a supplier ===",
        `party accepted        : ${hit}`,
        `party card            : ${hitText.replace(/\n/g, " / ")}`,
        `error-like text       : ${await visibleErrors(page)}`,
        await nextState(page),
      ].join("\n"),
    );
    await saveEvidence(page, testInfo, "F2-payment-payee-customer");

    // control: the receipt branch is reported to refuse a non-customer correctly
    await gotoApp(page, CREATE);
    await page.getByTestId("wizard-branch-receipt").click();
    await page.getByTestId("wizard-channel-bank").click();
    await page.getByTestId("wizard-next").click();
    await lookupParty(page, ASAN_SUPPLIER);
    await page.waitForTimeout(1500);
    console.log(
      [
        "=== F2-control receipt payer = a supplier (should be refused) ===",
        `party accepted : ${(await page.getByTestId("wizard-party-hit").count()) > 0}`,
        `on-screen text : ${await visibleErrors(page)}`,
      ].join("\n"),
    );
    await saveEvidence(page, testInfo, "F2-control-receipt-payer-supplier");
  });
});

test.describe("Gate A phase 6 — dual branch", () => {
  test("F3/F4/F5: do the evidence-only names reach the review screen?", async ({
    page,
  }, testInfo) => {
    await gotoApp(page, CREATE);
    await page.getByTestId("wizard-branch-dual").click();

    // step 2 for dual: amount, date, tracking, description
    await page.getByTestId("wizard-amount").fill("2500000");
    await page.getByTestId("wizard-tracking").fill("GATEA-DUAL-TRK");
    const textareas = page.locator("textarea");
    if ((await textareas.count()) > 0) await textareas.first().fill("GATEA dual description");

    // the four evidence-only fields T11 defines
    const marks: Record<string, string> = {
      "نام انتقال‌دهنده": "GATEA-TRANSFERRER",
      "شمارهٔ حساب انتقال‌دهنده": "GATEA-TR-ACCT",
      "نام گیرندهٔ حساب": "GATEA-RECIPIENT",
      "شمارهٔ حساب گیرنده": "GATEA-RC-ACCT",
    };
    const filled: string[] = [];
    for (const [label, value] of Object.entries(marks)) {
      const box = page
        .locator("div")
        .filter({ hasText: new RegExp(`^${label}`) })
        .locator("input")
        .first();
      if ((await box.count()) > 0) {
        await box.fill(value);
        filled.push(`${label}=${value}`);
      }
    }
    console.log(`=== F3 dual step 2, evidence-only fields filled ===\n${filled.join("\n")}`);
    await saveEvidence(page, testInfo, "F3-dual-step2-filled");

    await page.getByTestId("wizard-next").click();
    await lookupParty(page, ASAN_CUSTOMER);
    await expect(page.getByTestId("wizard-party-hit")).toBeVisible();
    await page.getByTestId("wizard-next").click();
    await lookupParty(page, ASAN_SUPPLIER);
    await expect(page.getByTestId("wizard-party-hit").first()).toBeVisible();
    await page.getByTestId("wizard-next").click();

    await expect(page.getByTestId("wizard-review")).toBeVisible();
    const review = await page.getByTestId("wizard-review").innerText();
    const whole = await page.locator("body").innerText();
    console.log(
      [
        "=== F3/F4/F5 dual review screen, verbatim ===",
        review,
        "--- do the evidence-only values appear ANYWHERE on the page? ---",
        ...Object.values(marks).map((v) => `${v}: ${whole.includes(v)}`),
      ].join("\n"),
    );
    await saveEvidence(page, testInfo, "F3-F4-F5-dual-review");
    // NO SUBMIT.
  });
});
