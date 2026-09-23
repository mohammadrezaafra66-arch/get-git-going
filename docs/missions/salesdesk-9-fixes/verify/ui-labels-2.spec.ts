/**
 * A6 count + ticket detail + deal form labels + product search 287 via browser.
 */
import { test, expect } from "@playwright/test";
import { storageStateForRole } from "../../../../e2e/helpers/role-session";

const BASE = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE = process.env.E2E_SUPABASE_URL ?? "http://192.168.170.8:9000";

function fromFaDigits(s: string): string {
  const map: Record<string, string> = {
    "۰": "0",
    "۱": "1",
    "۲": "2",
    "۳": "3",
    "۴": "4",
    "۵": "5",
    "۶": "6",
    "۷": "7",
    "۸": "8",
    "۹": "9",
    "0": "0",
    "1": "1",
    "2": "2",
    "3": "3",
    "4": "4",
    "5": "5",
    "6": "6",
    "7": "7",
    "8": "8",
    "9": "9",
  };
  return [...s].map((c) => map[c] ?? c).join("");
}

test.use({
  storageState: storageStateForRole("admin", BASE, SUPABASE),
  baseURL: BASE,
  locale: "fa-IR",
  timezoneId: "Asia/Tehran",
});

test("A6 purchases badge count vs SQL 301", async ({ page }) => {
  await page.goto("/purchases");
  await page.waitForTimeout(2500);
  const badge = page.getByTestId("purchases-no-supplier-count");
  await expect(badge).toBeVisible({ timeout: 20_000 });
  const txt = fromFaDigits((await badge.innerText()).trim());
  console.log("A6_purchases_badge=" + txt);
  expect(Number(txt)).toBe(301);

  await page.goto("/accounting/purchase-payments");
  await page.waitForTimeout(2500);
  const t = await page.locator("body").innerText();
  console.log("A6_payments_has_filter=" + t.includes("بدون تأمین‌کننده"));
  const m = fromFaDigits(t).match(/بدون تأمین‌کننده\s*(\d+)/);
  const m2 = fromFaDigits(t).match(/(\d+)\s*بدون تأمین‌کننده/);
  console.log("A6_payments_count_near_label=" + JSON.stringify({ m, m2 }));
  // badge may use same test id or just digits in label area
  const payBadge = page.locator("text=بدون تأمین‌کننده").first();
  await expect(payBadge).toBeVisible();
});

test("A1 ticket detail labels + سابقه", async ({ page }) => {
  await page.goto("/operations/work");
  await page.waitForTimeout(2000);
  const link = page.locator('a[href*="/operations/work/"]').first();
  if (await link.count()) {
    await link.click();
    await page.waitForTimeout(2000);
  } else {
    // try clicking a row
    await page.locator("main").getByText(/./).first().click().catch(() => {});
    await page.waitForTimeout(1000);
  }
  const t = await page.locator("body").innerText();
  for (const label of ["ایجاد کننده", "مسئول", "تاریخ ثبت", "سابقه", "بستن", "بازگشایی", "تاریخ بسته شدن"]) {
    console.log(`ticket_detail_has_${label}=` + t.includes(label));
  }
});

test("C6 search 287 in deal form", async ({ page }) => {
  await page.goto("/operations/sales-desk");
  await page.getByRole("tab", { name: "افزودن معامله" }).click().catch(async () => {
    await page.getByText("افزودن معامله").first().click();
  });
  await page.waitForTimeout(1500);
  const t0 = await page.locator("body").innerText();
  console.log("deal_form_has_products_block=" + t0.includes("محصولات درخواستی"));
  console.log("deal_form_has_request_text=" + t0.includes("متن درخواست"));
  console.log("deal_form_has_creator=" + t0.includes("ایجاد کننده معامله"));
  console.log("deal_form_has_responsible=" + t0.includes("مسئول معامله"));

  const search = page.getByPlaceholder(/جستجو|محصول|کد/).first();
  if (await search.count()) {
    await search.fill("287");
    await page.waitForTimeout(2000);
    const t = await page.locator("body").innerText();
    console.log("search_287_has_X287=" + t.includes("X287"));
  } else {
    console.log("search_input_missing=true");
    // try any input near products
    const inputs = page.locator("input");
    const n = await inputs.count();
    console.log("input_count=" + n);
    for (let i = 0; i < Math.min(n, 8); i++) {
      const ph = await inputs.nth(i).getAttribute("placeholder");
      console.log("input_ph_" + i + "=" + ph);
    }
  }
});

test("C7 outcome button labels on desk", async ({ page }) => {
  await page.goto("/operations/sales-desk");
  await page.waitForTimeout(1500);
  const t = await page.locator("body").innerText();
  for (const label of ["جاری", "موفق", "ناموفق", "موفق شد", "ناموفق شد"]) {
    console.log(`desk_has_${label}=` + t.includes(label));
  }
});
