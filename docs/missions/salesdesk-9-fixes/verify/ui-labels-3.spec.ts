import { test, expect } from "@playwright/test";
import { storageStateForRole } from "../../../../e2e/helpers/role-session";

const BASE = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE = process.env.E2E_SUPABASE_URL ?? "http://192.168.170.8:9000";
const TICKET = "ef1d91f6-3a99-4870-9761-727e1b0b0f09";

test.use({
  storageState: storageStateForRole("admin", BASE, SUPABASE),
  baseURL: BASE,
  locale: "fa-IR",
  timezoneId: "Asia/Tehran",
});

test("ticket detail by id", async ({ page }) => {
  const res = await page.goto(`/operations/work/${TICKET}`);
  console.log("ticket_status=" + res?.status());
  await page.waitForTimeout(2500);
  const t = await page.locator("body").innerText();
  for (const label of [
    "ایجاد کننده",
    "مسئول",
    "تاریخ ثبت",
    "سابقه",
    "بستن",
    "بازگشایی",
    "تاریخ بسته شدن",
  ]) {
    console.log(`ticket_detail_has_${label}=` + t.includes(label));
  }
});

test("C6 product search 287 with debounce wait", async ({ page }) => {
  await page.goto("/operations/sales-desk");
  await page.getByRole("tab", { name: "افزودن معامله" }).click();
  await page.waitForTimeout(1000);
  const input = page.getByPlaceholder("جستجوی کد، نام یا برند…");
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill("287");
  await page.waitForTimeout(2500);
  const t = await page.locator("body").innerText();
  console.log("search_has_X287=" + t.includes("X287"));
  console.log("search_has_یخچال=" + t.includes("یخچال"));
  console.log("search_snip=" + t.slice(t.indexOf("محصولات درخواستی"), t.indexOf("محصولات درخواستی") + 500));
});

test("A6 payments badge digits", async ({ page }) => {
  await page.goto("/accounting/purchase-payments");
  await page.waitForTimeout(2500);
  const label = page.locator("label", { hasText: "بدون تأمین‌کننده" }).first();
  await expect(label).toBeVisible({ timeout: 20_000 });
  const txt = await label.innerText();
  console.log("payments_label_text=" + JSON.stringify(txt));
  const fa = [..."۰۱۲۳۴۵۶۷۸۹"];
  const digits = [...txt]
    .map((c) => {
      const i = fa.indexOf(c);
      return i >= 0 ? String(i) : /\d/.test(c) ? c : "";
    })
    .join("");
  console.log("payments_badge_digits=" + digits);
});
