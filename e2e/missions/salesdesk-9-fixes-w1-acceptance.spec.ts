/**
 * Wave 1 acceptance smoke — EXECUTION-PROMPT §9 Wave 1 (Persian script).
 *
 * Automates as much as the deployed 3100 UI exposes. Points that still need
 * product code (A1–A6) fail loudly until those land and 3100 is redeployed.
 *
 * Script points:
 *  1. ثبت خرید بدون تأمین‌کننده خطا می‌دهد
 *  2. ساخت سریع تأمین‌کننده در فرم کار می‌کند
 *  3. فیلتر «بدون تأمین‌کننده» تعداد درست دارد
 *  4. در تیکت ایجادکننده، مسئول و زمان ثبت دیده می‌شود
 *  5. بستن تیکت آن را به «بسته شده» می‌برد و سابقه دارد
 *  6. بازگشایی کار می‌کند
 *
 * Run via docs/missions/salesdesk-9-fixes/evidence/W1/playwright.w1.config.ts
 */
import { expect, test } from "@playwright/test";

import { dbScalar } from "../helpers/db";
import { storageStateForRole } from "../helpers/role-session";

const BASE = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE = process.env.E2E_SUPABASE_URL ?? "http://192.168.170.8:9000";

test.describe("W1 acceptance — purchases", () => {
  test.use({
    storageState: storageStateForRole("admin", BASE, SUPABASE),
  });

  test("1 — purchase form refuses missing supplier (no «نامشخص», shows الزامی)", async ({
    page,
  }) => {
    await page.goto("/purchases/create", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    await expect(page.getByText("تأمین‌کننده", { exact: false }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Open the supplier combobox and assert the Didar-forbidden option is gone.
    const supplierTrigger = page
      .locator("label", { hasText: /^تأمین‌کننده$/ })
      .locator("xpath=following::button[1] | following::*[@role='combobox'][1]")
      .first();
    if (await supplierTrigger.count()) {
      await supplierTrigger.click();
      await page.waitForTimeout(400);
    }
    const unknownOption = page.getByRole("option", { name: /^نامشخص$/ });
    expect(
      await unknownOption.count(),
      "supplier picker must not offer «نامشخص»",
    ).toBe(0);
    await page.keyboard.press("Escape");

    // Submit with supplier left empty / unset — must surface the mapped error.
    const submit = page.getByRole("button", { name: /^ثبت خرید$/ });
    await expect(submit).toBeVisible({ timeout: 10_000 });
    await submit.click();
    await page.waitForTimeout(1000);

    const after = await page.locator("body").innerText();
    expect(
      after,
      "missing supplier must surface «تأمین‌کننده الزامی است»",
    ).toMatch(/تأمین‌کننده الزامی است/);
  });

  test("2 — purchase form offers «+ تأمین‌کنندهٔ جدید» quick-create", async ({
    page,
  }) => {
    await page.goto("/purchases/create", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    await expect(
      page.getByText(/\+\s*تأمین‌کنندهٔ جدید/),
      "quick-create control must use the exact Didar label «+ تأمین‌کنندهٔ جدید»",
    ).toBeVisible({ timeout: 15_000 });
  });

  test("3 — «بدون تأمین‌کننده» filter count matches SQL", async ({ page }) => {
    const sqlCount = dbScalar(
      `SELECT count(*)::text FROM public.purchases WHERE supplier_id IS NULL`,
    );

    await page.goto("/accounting/purchase-payments", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1500);

    // Prefer the dedicated filter control (A6). Row cells also say
    // «بدون تأمین‌کننده», so never use a bare getByText.
    const filter = page.locator("label[for='pp-no-supplier']");
    await expect(
      filter,
      "purchase-payments must expose the «بدون تأمین‌کننده» filter (label[for=pp-no-supplier])",
    ).toBeVisible({ timeout: 15_000 });
    await filter.click();
    await page.waitForTimeout(1500);

    const body = await page.locator("body").innerText();
    const fa = sqlCount.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!);

    // Visible counter next to the filter, or filtered table row count.
    const counterNearFilter = page.locator(
      "label[for='pp-no-supplier'], #pp-no-supplier",
    ).locator("xpath=ancestor::*[1]");
    const counterText = ((await counterNearFilter.count())
      ? await counterNearFilter.first().innerText()
      : "") + body.slice(0, 800);

    const rowCount = await page.locator("table tbody tr").count();
    const hasCount =
      counterText.includes(sqlCount) ||
      counterText.includes(fa) ||
      String(rowCount) === sqlCount;

    expect(
      hasCount,
      `UI count must equal SQL count ${sqlCount} (rows=${rowCount})`,
    ).toBe(true);
  });
});

test.describe("W1 acceptance — tickets", () => {
  test.use({
    storageState: storageStateForRole("admin", BASE, SUPABASE),
  });

  test("4 — ticket detail shows ایجاد کننده، مسئول، تاریخ ثبت", async ({
    page,
  }) => {
    const itemId = dbScalar(
      `SELECT id::text FROM public.work_items ORDER BY created_at DESC LIMIT 1`,
    );
    expect(itemId).toMatch(/^[0-9a-f-]{36}$/i);

    await page.goto(`/operations/work/${itemId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1500);

    const body = await page.locator("body").innerText();
    expect(body).toMatch(/ایجاد\s*کننده/);
    expect(body).toMatch(/مسئول/);
    expect(body).toMatch(/تاریخ\s*ثبت/);
  });

  test("5 — بستن moves ticket to بسته شده and سابقه records it", async ({
    page,
  }) => {
    // Prefer an open ticket so the detail header shows «بستن», not «بازگشایی».
    const openId = dbScalar(
      `SELECT id::text FROM public.work_items
        WHERE status NOT IN ('done','cancelled')
          AND completed_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1`,
    );
    expect(
      openId,
      "need at least one open work_items row to exercise «بستن»",
    ).toMatch(/^[0-9a-f-]{36}$/i);

    await page.goto(`/operations/work/${openId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1500);

    const closeBtn = page.getByRole("button", { name: /^بستن$/ });
    await expect(closeBtn, "detail must offer «بستن»").toBeVisible({
      timeout: 10_000,
    });
    await closeBtn.click();
    await page.waitForTimeout(1500);

    const body = await page.locator("body").innerText();
    // Detail uses status label «انجام‌شده» + «بازگشایی»; board section title is «بسته شده».
    expect(
      /بازگشایی|انجام‌شده|تیکت بسته شد|بسته\s*شده/.test(body),
      "after «بستن» the ticket must look closed",
    ).toBe(true);
    expect(body).toMatch(/سابقه/);

    await page.goto("/operations/work", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await expect(
      page.getByText("بسته شده", { exact: false }).first(),
      "board must expose the «بسته شده» section after close",
    ).toBeVisible({ timeout: 10_000 });
  });

  test("6 — بازگشایی works after close", async ({ page }) => {
    // Find a closed/done ticket if any; otherwise close then reopen.
    const closedId = dbScalar(
      `SELECT id::text FROM public.work_items
        WHERE status IN ('done','cancelled') OR completed_at IS NOT NULL
        ORDER BY coalesce(completed_at, updated_at) DESC NULLS LAST
        LIMIT 1`,
    );

    let itemId = closedId;
    if (!/^[0-9a-f-]{36}$/i.test(itemId)) {
      itemId = dbScalar(
        `SELECT id::text FROM public.work_items ORDER BY created_at DESC LIMIT 1`,
      );
    }
    expect(itemId).toMatch(/^[0-9a-f-]{36}$/i);

    await page.goto(`/operations/work/${itemId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1500);

    const reopen = page.getByRole("button", { name: /بازگشایی/ });
    if ((await reopen.count()) === 0) {
      const closeBtn = page.getByRole("button", { name: /بستن/ });
      await expect(closeBtn).toBeVisible({ timeout: 10_000 });
      await closeBtn.click();
      await page.waitForTimeout(1500);
    }

    await expect(
      page.getByRole("button", { name: /بازگشایی/ }),
      "after close, «بازگشایی» must appear",
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /بازگشایی/ }).click();
    await page.waitForTimeout(1500);

    const body = await page.locator("body").innerText();
    expect(body).toMatch(/در حال اجرا|باز|pending|جاری/);
  });
});
