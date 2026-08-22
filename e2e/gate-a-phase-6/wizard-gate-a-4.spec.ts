/**
 * Gate A — phase 6, evidence round 4: role gate proved properly, the A/B that
 * isolates F1, and the Asan journal export preview. No submit, ever.
 */
import { expect, test, type Page } from "@playwright/test";

import { gotoApp, saveEvidence } from "../helpers/app";

const CREATE = "/accounting/receipts/create";
const BASE = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
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

test("role gate, proved: is the session really sales-only, and does the guard hold?", async ({
  browser,
}, testInfo) => {
  const ctx = await browser.newContext({
    storageState: "e2e/auth/salesperson-a.storage.json",
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    baseURL: BASE,
  });
  const page = await ctx.newPage();

  // 1. land somewhere a salesperson is definitely allowed, and prove who we are
  await page.goto("/sales/quotes", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const shell = await page.locator("body").innerText();
  const identity =
    shell.split("\n").map((l) => l.trim()).find((l) => l.includes("@afrakala.local")) ?? "<none>";
  const roleLabel =
    shell.split("\n").map((l) => l.trim()).find((l) => /فروش|مدیر|حسابدار|بدون نقش/.test(l)) ??
    "<none>";
  console.log(
    [
      "=== who is this session? ===",
      `identity on screen : ${identity}`,
      `role label         : ${roleLabel}`,
      `"بدون نقش" present : ${shell.includes("بدون نقش")}`,
      `url                : ${page.url()}`,
    ].join("\n"),
  );

  // 2. now go to the create route the guard is supposed to protect
  await page.goto(CREATE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const body = await page.locator("body").innerText();
  console.log(
    [
      "=== sales at /accounting/receipts/create ===",
      `final url          : ${page.url()}`,
      `wizard rendered    : ${(await page.getByTestId("document-wizard").count()) > 0}`,
      `branch buttons     : ${(await page.getByTestId("wizard-branch-receipt").count()) > 0}`,
      `redirected away    : ${!page.url().includes("/accounting/receipts/create")}`,
      `denial wording     : ${/دسترسی ندارید|مجاز نیست|اجازه|unauthorized|۴۰۳|403/i.test(body)}`,
    ].join("\n"),
  );
  await saveEvidence(page, testInfo, "role-gate-sales-create");

  // 3. can this session actually step into the wizard?
  if ((await page.getByTestId("wizard-branch-receipt").count()) > 0) {
    await page.getByTestId("wizard-branch-receipt").click();
    await page.getByTestId("wizard-channel-bank").click();
    await page.getByTestId("wizard-next").click();
    await page.waitForTimeout(1500);
    console.log(
      `sales can reach step 3 (party lookup): ${
        (await page.getByTestId("wizard-lookup-input").count()) > 0
      }`,
    );
    await saveEvidence(page, testInfo, "role-gate-sales-step3");
  }
  await ctx.close();
});

test("F1-AB fixed: payment+cheque(own) vs receipt+cheque", async ({ page }, testInfo) => {
  // A: payment + cheque + own
  await gotoApp(page, CREATE);
  await page.getByTestId("wizard-branch-payment").click();
  await page.getByTestId("wizard-channel-cheque").click();
  await page.getByTestId("wizard-cheque-own").click();
  await page.getByTestId("wizard-next").click();
  await lookupParty(page, ASAN_SUPPLIER);
  await expect(page.getByTestId("wizard-party-hit")).toBeVisible();
  await page.getByTestId("wizard-next").click();

  await page.getByTestId("wizard-amount").fill("1200000");
  await fillByLabel(page, "شماره چک", "GATEA-AB-1");
  const dd = page.locator('input[placeholder*="انتخاب تاریخ"]');
  for (let i = 0; i < (await dd.count()); i++)
    await dd.nth(i).fill("1405/07/10").catch(() => undefined);
  const acct = page.getByTestId("wizard-account");
  const rendered = (await acct.count()) > 0;
  if (rendered) await acct.selectOption({ index: 1 });
  await page.waitForTimeout(500);
  console.log(
    [
      "=== A: PAYMENT + cheque(own) ===",
      `account picker rendered : ${rendered}`,
      `next disabled           : ${await page.getByTestId("wizard-next").isDisabled()}`,
    ].join("\n"),
  );
  if (!(await page.getByTestId("wizard-next").isDisabled())) {
    await page.getByTestId("wizard-next").click();
    console.log(
      `A reached review        : ${(await page.getByTestId("wizard-review").count()) > 0}`,
    );
    await saveEvidence(page, testInfo, "F1-AB-A-payment-cheque-review");
  }

  // B: receipt + cheque, identical effort
  await gotoApp(page, CREATE);
  await page.getByTestId("wizard-branch-receipt").click();
  await page.getByTestId("wizard-channel-cheque").click();
  await page.getByTestId("wizard-next").click();
  await lookupParty(page, ASAN_CUSTOMER);
  await expect(page.getByTestId("wizard-party-hit")).toBeVisible();
  await page.getByTestId("wizard-next").click();
  await page.getByTestId("wizard-amount").fill("1200000");
  await fillByLabel(page, "شماره چک", "GATEA-AB-2");
  const dd2 = page.locator('input[placeholder*="انتخاب تاریخ"]');
  for (let i = 0; i < (await dd2.count()); i++)
    await dd2.nth(i).fill("1405/07/10").catch(() => undefined);
  await page.waitForTimeout(500);
  console.log(
    [
      "=== B: RECEIPT + cheque, identical effort ===",
      `account picker rendered : ${(await page.getByTestId("wizard-account").count()) > 0}`,
      `next disabled           : ${await page.getByTestId("wizard-next").isDisabled()}`,
      `B reached review        : ${(await page.getByTestId("wizard-review").count()) > 0}`,
    ].join("\n"),
  );
  await saveEvidence(page, testInfo, "F1-AB-B-receipt-cheque-stuck");
});

test("F6: Asan JOURNAL export — select documents and compare the preview", async ({
  page,
}, testInfo) => {
  await gotoApp(page, "/admin/asan-export");
  await page.waitForTimeout(2000);

  // switch the export menu away from the default "sales" to the journal/document one
  const menu = page.locator("select, [role='combobox']").first();
  if ((await menu.count()) > 0) {
    const opts = await page.locator("select option").allInnerTexts().catch(() => []);
    console.log(`=== export menu options ===\n${opts.join(" | ") || "<not a native select>"}`);
  }
  const bodyTop = await page.locator("body").innerText();
  const menuWords = bodyTop
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /دریافت|پرداخت|واریز|سند|فروش|خرید|تسویه/.test(l) && l.length < 40)
    .slice(0, 25);
  console.log(`=== candidate menu labels on screen ===\n${menuWords.join(" | ")}`);
  await saveEvidence(page, testInfo, "F6-export-page-initial");

  await page.getByRole("button", { name: /نمایش/ }).first().click().catch(() => undefined);
  await page.waitForTimeout(3000);
  const rows = page.locator("table tbody tr");
  console.log(`rows after listing (default menu): ${await rows.count()}`);
  for (let i = 0; i < Math.min(await rows.count(), 6); i++) {
    console.log(`  row${i}: ${(await rows.nth(i).innerText()).replace(/\n/g, " | ")}`);
  }
  await saveEvidence(page, testInfo, "F6-listed");
});
