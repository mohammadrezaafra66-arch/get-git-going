/**
 * Independent UI label/count probes against deployed 3100.
 * Marker: [TEST-9FIX-V] — cleanup any created rows at end (none created by default).
 */
import { test, expect } from "@playwright/test";
import { storageStateForRole } from "../../../../e2e/helpers/role-session";

const BASE = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE = process.env.E2E_SUPABASE_URL ?? "http://192.168.170.8:9000";

test.use({
  storageState: storageStateForRole("admin", BASE, SUPABASE),
  baseURL: BASE,
  locale: "fa-IR",
  timezoneId: "Asia/Tehran",
});

test.describe("verify W1 labels", () => {
  test("purchases: بدون تأمین‌کننده filter; no نامشخص option in form", async ({
    page,
  }) => {
    await page.goto("/purchases");
    await expect(page.getByText("بدون تأمین‌کننده").first()).toBeVisible({
      timeout: 30_000,
    });
    const body = await page.locator("body").innerText();
    // count line if present
    const m = body.match(/(\d+)\s*خرید بدون تأمین‌کننده/);
    if (m) {
      console.log("UI_purchases_null_count=" + m[1]);
    } else {
      console.log("UI_purchases_null_count=NOT_FOUND body_snip=" + body.slice(0, 400));
    }

    await page.goto("/accounting/purchase-payments");
    await expect(page.getByText("بدون تأمین‌کننده").first()).toBeVisible({
      timeout: 30_000,
    });

    await page.goto("/purchases/create");
    const formText = await page.locator("body").innerText();
    console.log(
      "purchase_form_has_plus_supplier=" +
        formText.includes("+ تأمین‌کنندهٔ جدید"),
    );
    console.log(
      "purchase_form_has_namoshakhas_option=" +
        /گزینه|انتخاب[\s\S]{0,40}نامشخص|نامشخص\s*$/m.test(formText),
    );
    // stricter: select options containing only نامشخص as supplier choice
    const options = await page.locator('[role="option"]').allTextContents().catch(() => []);
    console.log(
      "select_options_namoshakhas=" +
        JSON.stringify(options.filter((o) => o.trim() === "نامشخص")),
    );
  });

  test("work board: sections and columns", async ({ page }) => {
    await page.goto("/operations/work");
    await page.waitForTimeout(2000);
    const t = await page.locator("body").innerText();
    for (const label of [
      "در حال اجرا",
      "بسته شده",
      "ایجاد کننده",
      "مسئول",
      "تاریخ ثبت",
    ]) {
      console.log(`work_board_has_${label}=` + t.includes(label));
    }
  });
});

test.describe("verify W2/W3/W4 labels", () => {
  test("caller-id settings labels", async ({ page }) => {
    await page.goto("/settings/caller-id");
    await page.waitForTimeout(1500);
    const t = await page.locator("body").innerText();
    for (const label of [
      "مدت زمان نمایش پنجره تماس (ثانیه)",
      "فقط تماس‌های داخلی خودم",
      "فقط تماس‌های مربوط به خودم",
    ]) {
      console.log(`caller_has_${label}=` + t.includes(label));
    }
  });

  test("sales desk terms", async ({ page }) => {
    await page.goto("/operations/sales-desk");
    await page.waitForTimeout(2000);
    const t = await page.locator("body").innerText();
    for (const label of [
      "افزودن معامله",
      "کارهای من",
      "فعالیت‌ها",
      "معاملات ثبت‌شده برای دیگران",
      "ثبت درخواست",
    ]) {
      console.log(`salesdesk_has_${label}=` + t.includes(label));
    }
  });

  test("my-work section D7", async ({ page }) => {
    await page.goto("/operations/sales-desk");
    await page.getByRole("tab", { name: "کارهای من" }).click().catch(async () => {
      await page.getByText("کارهای من").first().click();
    });
    await page.waitForTimeout(1500);
    const t = await page.locator("body").innerText();
    console.log(
      "mywork_has_today_overdue=" +
        t.includes("فعالیت‌های امروز و عقب‌افتاده"),
    );
    console.log(
      "mywork_has_no_activity_filter=" +
        t.includes("معاملاتی که فعالیتی روی آن‌ها نیست"),
    );
  });

  test("activities page buckets", async ({ page }) => {
    await page.goto("/operations/sales-desk/activities");
    await page.waitForTimeout(2000);
    const t = await page.locator("body").innerText();
    for (const label of [
      "فعالیت‌ها",
      "گذشته تا امروز",
      "تاریخ گذشته",
      "امروز",
      "فردا",
      "تا آخر هفته",
      "تاریخ دیگر",
      "انجام نشده",
      "انجام شده",
      "همه فعالیت ها",
    ]) {
      console.log(`activities_has_${label}=` + t.includes(label));
    }
  });

  test("deal lost reasons settings", async ({ page }) => {
    await page.goto("/settings/deal-lost-reasons");
    await page.waitForTimeout(1500);
    const t = await page.locator("body").innerText();
    for (const label of [
      "دلایل شکست معامله",
      "ایجاد دلیل شکست جدید",
      "سایر",
      "عنوان",
      "فعال",
      "غیرفعال",
    ]) {
      console.log(`lost_settings_has_${label}=` + t.includes(label));
    }
  });

  test("pricing workbench still loads", async ({ page }) => {
    const res = await page.goto("/pricing/my-workbench");
    console.log("workbench_status=" + res?.status());
    await page.waitForTimeout(2000);
    const t = await page.locator("body").innerText();
    console.log("workbench_body_len=" + t.length);
    console.log("workbench_has_error_boundary=" + /Something went wrong|خطای غیرمنتظره/.test(t));
    expect(res?.status()).toBeLessThan(400);
  });
});
