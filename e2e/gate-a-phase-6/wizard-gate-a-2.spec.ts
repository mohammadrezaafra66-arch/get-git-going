/**
 * Gate A — phase 6 wizard, evidence round 2.
 *
 * Same rule as round 1: no test here ever clicks `wizard-submit`.
 */
import { expect, test, type Page } from "@playwright/test";

import { gotoApp, saveEvidence } from "../helpers/app";

const CREATE = "/accounting/receipts/create";
const ASAN_CUSTOMER = "2";
const ASAN_SUPPLIER = "90019001";
const ASAN_NO_CODE_HINT = "zzzz-no-such-party";

async function lookupParty(page: Page, value: string): Promise<void> {
  await page.getByTestId("wizard-lookup-input").fill(value);
  await page.getByTestId("wizard-lookup-search").click();
}

/** Fill a labelled text input by the label's leading text. */
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

test("F1-airtight: cheque receipt with EVERY visible field filled, including the due date", async ({
  page,
}, testInfo) => {
  await gotoApp(page, CREATE);
  await page.getByTestId("wizard-branch-receipt").click();
  await page.getByTestId("wizard-channel-cheque").click();
  await page.getByTestId("wizard-next").click();
  await lookupParty(page, ASAN_CUSTOMER);
  await expect(page.getByTestId("wizard-party-hit")).toBeVisible();
  await page.getByTestId("wizard-next").click();

  await page.getByTestId("wizard-amount").fill("1500000");
  const okChequeNo = await fillByLabel(page, "شماره چک", "GATEA-CHQ-2");
  const okBank = await fillByLabel(page, "بانک صادرکننده", "بانک ملت");

  // Every date input on the step, filled with a valid Jalali date.
  const dateInputs = page.locator('input[placeholder*="انتخاب تاریخ"], input[inputmode="numeric"]');
  const dateCount = await dateInputs.count();
  for (let i = 0; i < dateCount; i++) {
    await dateInputs.nth(i).fill("1405/06/15").catch(() => undefined);
  }
  await page.waitForTimeout(700);

  const bodyText = await page.locator("body").innerText();
  const nextBtn = page.getByTestId("wizard-next");
  const report = {
    chequeNumberFilled: okChequeNo,
    issuingBankFilled: okBank,
    dateInputsFound: dateCount,
    dueDateLabelOnScreen: bodyText.includes("تاریخ سررسید"),
    accountControlRendered: (await page.getByTestId("wizard-account").count()) > 0,
    accountLabelOnScreen: /(^|\n)\s*حساب\s*\*/.test(bodyText),
    nextDisabled: await nextBtn.isDisabled(),
    everyInputValue: await page.locator("input").evaluateAll((els) =>
      (els as HTMLInputElement[]).map((e, i) => `#${i}:"${e.value}"`).join(" "),
    ),
  };
  console.log("=== F1-airtight cheque receipt ===\n" + JSON.stringify(report, null, 2));
  await saveEvidence(page, testInfo, "F1-airtight-cheque-receipt");

  // Try clicking anyway; record whether anything at all changes.
  await nextBtn.click({ force: true }).catch(() => undefined);
  await page.waitForTimeout(500);
  console.log(
    `after force-click: review visible = ${(await page.getByTestId("wizard-review").count()) > 0}`,
  );
});

test("F3-all4: all four dual evidence-only fields, then the review screen", async ({
  page,
}, testInfo) => {
  await gotoApp(page, CREATE);
  await page.getByTestId("wizard-branch-dual").click();
  await page.getByTestId("wizard-amount").fill("2500000");
  await page.getByTestId("wizard-tracking").fill("GATEA-DUAL-TRK2");
  const ta = page.locator("textarea");
  if ((await ta.count()) > 0) await ta.first().fill("GATEA-DUAL-DESC");

  const filled: Record<string, boolean> = {
    "نام انتقال‌دهنده": await fillByLabel(page, "نام انتقال‌دهنده", "GATEA-TRANSFERRER"),
    "شماره حساب انتقال‌دهنده": await fillByLabel(page, "شماره حساب انتقال‌دهنده", "GATEA-TR-ACCT"),
    "نام گیرندهٔ حساب": await fillByLabel(page, "نام گیرندهٔ حساب", "GATEA-RECIPIENT"),
    "شماره حساب گیرنده": await fillByLabel(page, "شماره حساب گیرنده", "GATEA-RC-ACCT"),
  };
  console.log("=== F3 fields filled ===\n" + JSON.stringify(filled, null, 2));

  await page.getByTestId("wizard-next").click();
  await lookupParty(page, ASAN_CUSTOMER);
  await expect(page.getByTestId("wizard-party-hit")).toBeVisible();
  await page.getByTestId("wizard-next").click();
  await lookupParty(page, ASAN_SUPPLIER);
  await expect(page.getByTestId("wizard-party-hit").first()).toBeVisible();
  await page.getByTestId("wizard-next").click();
  await expect(page.getByTestId("wizard-review")).toBeVisible();

  const whole = await page.locator("body").innerText();
  const present = {
    "GATEA-TRANSFERRER": whole.includes("GATEA-TRANSFERRER"),
    "GATEA-TR-ACCT": whole.includes("GATEA-TR-ACCT"),
    "GATEA-RECIPIENT": whole.includes("GATEA-RECIPIENT"),
    "GATEA-RC-ACCT": whole.includes("GATEA-RC-ACCT"),
    "GATEA-DUAL-TRK2 (tracking)": whole.includes("GATEA-DUAL-TRK2"),
    "GATEA-DUAL-DESC (description)": whole.includes("GATEA-DUAL-DESC"),
  };
  console.log("=== F3 on the review screen ===\n" + JSON.stringify(present, null, 2));
  console.log("=== review verbatim ===\n" + (await page.getByTestId("wizard-review").innerText()));
  await saveEvidence(page, testInfo, "F3-all4-dual-review");
});

test("cash branch + attachments + missing-Asan message", async ({ page }, testInfo) => {
  await gotoApp(page, CREATE);
  await page.getByTestId("wizard-branch-receipt").click();
  await page.getByTestId("wizard-channel-cash").click();
  await page.getByTestId("wizard-next").click();
  await lookupParty(page, ASAN_CUSTOMER);
  await expect(page.getByTestId("wizard-party-hit")).toBeVisible();
  await page.getByTestId("wizard-next").click();
  const cashBody = await page.locator("body").innerText();
  console.log(
    [
      "=== cash branch, step 4 ===",
      `cash-box picker rendered : ${(await page.getByTestId("wizard-account").count()) > 0}`,
      `no-cash-box message      : ${cashBody.includes("صندوقی با نوع نقدی ثبت نشده است")}`,
      `next disabled            : ${await page.getByTestId("wizard-next").isDisabled()}`,
      `file input anywhere      : ${await page.locator('input[type="file"]').count()}`,
      `word "پیوست" on screen   : ${cashBody.includes("پیوست")}`,
    ].join("\n"),
  );
  await saveEvidence(page, testInfo, "cash-branch-step4");

  // a lookup value that matches nobody
  await gotoApp(page, CREATE);
  await page.getByTestId("wizard-branch-receipt").click();
  await page.getByTestId("wizard-channel-bank").click();
  await page.getByTestId("wizard-next").click();
  await lookupParty(page, ASAN_NO_CODE_HINT);
  await page.waitForTimeout(1200);
  const notFound = await page.locator("body").innerText();
  const line = notFound
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.includes("پیدا نشد") || l.includes("کد آسان"));
  console.log(`=== unknown party lookup message ===\n${line ?? "<none>"}`);
  console.log(`missing-asan testid present: ${(await page.getByTestId("wizard-missing-asan").count()) > 0}`);
});

test("F6: Asan export preview vs the documents actually selected", async ({ page }, testInfo) => {
  await gotoApp(page, "/admin/asan-export");
  await page.waitForTimeout(2500);
  const body = await page.locator("body").innerText();
  console.log("=== asan export page, first 1200 chars ===\n" + body.slice(0, 1200));
  await saveEvidence(page, testInfo, "F6-asan-export-page");

  const boxes = page.locator('table input[type="checkbox"], table [role="checkbox"]');
  console.log(`row checkboxes found: ${await boxes.count()}`);
});
