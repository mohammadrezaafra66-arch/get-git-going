/**
 * Gate A — phase 6, evidence round 3: the A/B that isolates F1's cause, the Asan
 * export preview (F6), and the role gate. No submit, ever.
 */
import { expect, test, type Page } from "@playwright/test";

import { gotoApp, saveEvidence } from "../helpers/app";

const CREATE = "/accounting/receipts/create";
const ASAN_CUSTOMER = "2";
const ASAN_SUPPLIER = "90019001";

async function lookupParty(page: Page, value: string): Promise<void> {
  await page.getByTestId("wizard-lookup-input").fill(value);
  await page.getByTestId("wizard-lookup-search").click();
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

test("F1-AB: payment+cheque(own) renders an account picker and advances; receipt+cheque does neither", async ({
  page,
}, testInfo) => {
  // --- A: PAYMENT + cheque + own
  await gotoApp(page, CREATE);
  await page.getByTestId("wizard-branch-payment").click();
  await page.getByTestId("wizard-channel-cheque").click();
  await page.getByText("چک شرکت", { exact: false }).first().click().catch(() => undefined);
  await page.waitForTimeout(300);
  const ownEnabled = !(await page.getByTestId("wizard-next").isDisabled());
  await page.getByTestId("wizard-next").click();
  await lookupParty(page, ASAN_SUPPLIER);
  await expect(page.getByTestId("wizard-party-hit")).toBeVisible();
  await page.getByTestId("wizard-next").click();

  await page.getByTestId("wizard-amount").fill("1200000");
  await fillByLabel(page, "شماره چک", "GATEA-AB-1");
  const dueA = page.locator('input[placeholder*="انتخاب تاریخ"]');
  for (let i = 0; i < (await dueA.count()); i++)
    await dueA.nth(i).fill("1405/07/10").catch(() => undefined);
  const acctA = page.getByTestId("wizard-account");
  const acctARendered = (await acctA.count()) > 0;
  if (acctARendered) await acctA.selectOption({ index: 1 });
  await page.waitForTimeout(400);

  console.log(
    [
      "=== A: PAYMENT + cheque(own), step 4 ===",
      `cheque-kind step passed  : ${ownEnabled}`,
      `account picker rendered  : ${acctARendered}`,
      `next disabled            : ${await page.getByTestId("wizard-next").isDisabled()}`,
    ].join("\n"),
  );
  await saveEvidence(page, testInfo, "F1-AB-payment-cheque-own");

  // --- B: RECEIPT + cheque, same effort
  await gotoApp(page, CREATE);
  await page.getByTestId("wizard-branch-receipt").click();
  await page.getByTestId("wizard-channel-cheque").click();
  await page.getByTestId("wizard-next").click();
  await lookupParty(page, ASAN_CUSTOMER);
  await expect(page.getByTestId("wizard-party-hit")).toBeVisible();
  await page.getByTestId("wizard-next").click();
  await page.getByTestId("wizard-amount").fill("1200000");
  await fillByLabel(page, "شماره چک", "GATEA-AB-2");
  const dueB = page.locator('input[placeholder*="انتخاب تاریخ"]');
  for (let i = 0; i < (await dueB.count()); i++)
    await dueB.nth(i).fill("1405/07/10").catch(() => undefined);
  await page.waitForTimeout(400);

  console.log(
    [
      "=== B: RECEIPT + cheque, step 4, identical effort ===",
      `account picker rendered  : ${(await page.getByTestId("wizard-account").count()) > 0}`,
      `next disabled            : ${await page.getByTestId("wizard-next").isDisabled()}`,
      `any validation message   : ${
        (await page.locator("body").innerText())
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => /الزامی|نامعتبر|خطا|کامل کنید|انتخاب کنید/.test(l))
          .join(" | ") || "<none>"
      }`,
    ].join("\n"),
  );
  await saveEvidence(page, testInfo, "F1-AB-receipt-cheque");
});

test("F6: Asan export — list a range, select documents, preview, compare", async ({
  page,
}, testInfo) => {
  await gotoApp(page, "/admin/asan-export");
  await page.waitForTimeout(1500);

  // widen the range
  const dates = page.locator('input[placeholder*="انتخاب تاریخ"]');
  if ((await dates.count()) >= 2) {
    await dates.nth(0).fill("1405/01/01").catch(() => undefined);
    await dates.nth(1).fill("1405/12/29").catch(() => undefined);
  }
  await page.getByRole("button", { name: /نمایش اسناد بازه|نمایش/ }).first().click().catch(() => undefined);
  await page.waitForTimeout(3000);

  const rows = page.locator("table tbody tr");
  const rowCount = await rows.count();
  console.log(`=== F6: rows listed = ${rowCount} ===`);

  const rowTexts: string[] = [];
  for (let i = 0; i < Math.min(rowCount, 8); i++) {
    rowTexts.push(`row${i}: ${(await rows.nth(i).innerText()).replace(/\n/g, " | ")}`);
  }
  console.log(rowTexts.join("\n"));

  // tick the first two eligible rows
  const boxes = page.locator('table tbody [role="checkbox"], table tbody input[type="checkbox"]');
  const boxCount = await boxes.count();
  console.log(`checkboxes: ${boxCount}`);
  const ticked: number[] = [];
  for (let i = 0; i < boxCount && ticked.length < 2; i++) {
    const b = boxes.nth(i);
    if (await b.isEnabled().catch(() => false)) {
      await b.click().catch(() => undefined);
      ticked.push(i);
    }
  }
  await page.waitForTimeout(600);
  console.log(`ticked rows: ${ticked.join(",")}`);
  await saveEvidence(page, testInfo, "F6-selected-rows");

  const previewBtn = page.getByRole("button", { name: /پیش‌نمایش انتخاب‌شده‌ها/ });
  if ((await previewBtn.count()) > 0 && (await previewBtn.first().isEnabled())) {
    await previewBtn.first().click();
    await page.waitForTimeout(1500);
    const pv = page.getByTestId("asan-export-preview");
    if ((await pv.count()) > 0) {
      console.log("=== F6 PREVIEW verbatim ===\n" + (await pv.innerText()));
    } else {
      console.log("=== F6 preview panel did not render ===");
    }
    await saveEvidence(page, testInfo, "F6-preview");
  } else {
    console.log("=== F6 preview button not enabled (nothing eligible selected) ===");
  }
});

test("role gate: what does a salesperson see at the create entry point?", async ({ browser }) => {
  const ctx = await browser.newContext({
    storageState: "e2e/auth/salesperson-a.storage.json",
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    baseURL: process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100",
  });
  const page = await ctx.newPage();
  await page.goto(CREATE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const url = page.url();
  const body = await page.locator("body").innerText();
  console.log(
    [
      "=== sales role at /accounting/receipts/create ===",
      `final url            : ${url}`,
      `wizard rendered      : ${(await page.getByTestId("document-wizard").count()) > 0}`,
      `branch buttons       : ${(await page.getByTestId("wizard-branch-receipt").count()) > 0}`,
      `unauthorized wording : ${/دسترسی|مجاز نیست|اجازه|unauthorized/i.test(body)}`,
      `first 200 chars      : ${body.replace(/\n/g, " ").slice(0, 200)}`,
    ].join("\n"),
  );
  await ctx.close();
});
