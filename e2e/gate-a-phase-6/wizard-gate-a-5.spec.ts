/**
 * Gate A — phase 6, evidence round 5: how wide is the route-guard failure, and
 * the Asan journal export preview compared against what was selected.
 * No submit, and no download button is ever pressed.
 */
import { test } from "@playwright/test";

import { gotoApp, saveEvidence } from "../helpers/app";

const BASE = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";

test("guard breadth: does a sales-only session reach other guarded routes too?", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    storageState: "e2e/auth/salesperson-a.storage.json",
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    baseURL: BASE,
  });
  const page = await ctx.newPage();
  // warm the session first so this is not a cold-start artefact
  await page.goto("/sales/quotes", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  const routes = [
    "/accounting/receipts/create",
    "/admin/asan-export",
    "/accounting/payment-vouchers",
    "/accounting/treasury",
  ];
  for (const r of routes) {
    await page.goto(r, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);
    const body = await page.locator("body").innerText();
    console.log(
      `${r.padEnd(34)} url=${page.url().replace(BASE, "").padEnd(34)} ` +
        `redirected=${!page.url().includes(r)} ` +
        `denial=${/دسترسی ندارید|مجاز نیست|unauthorized/i.test(body)}`,
    );
  }
  await ctx.close();
});

test("F6: Asan journal export — list, select two, preview, compare", async ({
  page,
}, testInfo) => {
  await gotoApp(page, "/admin/asan-export");
  await page.waitForTimeout(2000);

  // The page's export menu is a set of buttons/tabs; click the one whose label
  // mentions receipts, which maps to the journal export the finding is about.
  const candidates = ["دریافت", "فیش", "سند حسابداری", "دفتر"];
  for (const c of candidates) {
    const btn = page.getByRole("button", { name: new RegExp(c) }).first();
    if ((await btn.count()) > 0) {
      await btn.click().catch(() => undefined);
      await page.waitForTimeout(800);
      console.log(`clicked menu candidate: ${c}`);
      break;
    }
  }

  await page.getByRole("button", { name: /نمایش/ }).first().click().catch(() => undefined);
  await page.waitForTimeout(3500);

  const rows = page.locator("table tbody tr");
  const n = await rows.count();
  console.log(`=== F6: listed rows = ${n} ===`);
  const selectedTexts: string[] = [];
  for (let i = 0; i < Math.min(n, 10); i++) {
    console.log(`  row${i}: ${(await rows.nth(i).innerText()).replace(/\n/g, " | ")}`);
  }
  await saveEvidence(page, testInfo, "F6-listed-rows");

  // tick the first two rows that have an enabled control
  const boxes = page.locator('table tbody [role="checkbox"], table tbody input[type="checkbox"]');
  const bc = await boxes.count();
  console.log(`checkbox controls in tbody: ${bc}`);
  let ticked = 0;
  for (let i = 0; i < bc && ticked < 2; i++) {
    const b = boxes.nth(i);
    if (await b.isEnabled().catch(() => false)) {
      await b.click().catch(() => undefined);
      selectedTexts.push((await rows.nth(i).innerText()).replace(/\n/g, " | "));
      ticked++;
      await page.waitForTimeout(300);
    }
  }
  console.log(`=== F6: ticked ${ticked} rows ===\n${selectedTexts.join("\n")}`);

  const pv = page.getByRole("button", { name: /پیش‌نمایش انتخاب‌شده‌ها/ }).first();
  if ((await pv.count()) > 0 && (await pv.isEnabled().catch(() => false))) {
    await pv.click();
    await page.waitForTimeout(2000);
    const panel = page.getByTestId("asan-export-preview");
    if ((await panel.count()) > 0) {
      console.log("=== F6 PREVIEW PANEL, verbatim ===\n" + (await panel.innerText()));
    } else {
      console.log("=== F6: preview panel did not render ===");
    }
    await saveEvidence(page, testInfo, "F6-preview-panel");
  } else {
    console.log("=== F6: preview button disabled or absent — nothing eligible selected ===");
  }
  // NO DOWNLOAD. The download button assigns real Asan numbers.
});
