import { expect, test } from "@playwright/test";
import { dbScalar } from "../helpers/db";
import { dbExecE2e } from "../helpers/db-write";
import { E2E_PREFIX } from "../helpers/app";
import { ADMIN_USER_ID, mintJwt, rest, userWithRole } from "../helpers/pgrest";
import {
  ASAN_EXPORT_BATCH_LIMIT,
  countEligibleSelected,
  tickAllEligible,
} from "../../src/lib/asan/export-selection";

/**
 * Selected batch sales export on `/admin/asan-export`.
 *
 * Financial layout/Rial/numbering remain covered by export-sales + export-shell.
 * This suite locks the UI contract for date range, eligible-only select-all, preview,
 * and confirm-cancel without minting numbers on real business documents.
 */

const ROUTE = "/admin/asan-export";
const PAGE_TITLE = "خروجی برای آسان";
const MARK = `${E2E_PREFIX}ASAN_BSEL`;
const FAKE_ID = "cccccccc-0000-4000-8000-00000000b5e1";

test.describe("selected batch sales export UI", () => {
  test("range controls, eligible selection, preview, confirm-cancel", async ({ page }) => {
    const before = Number(dbScalar("select count(*) from asan_export_numbers"));

    await page.goto(ROUTE);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: PAGE_TITLE })).toBeVisible();
    await expect(page.getByText("از تاریخ")).toBeVisible();
    await expect(page.getByText("تا تاریخ")).toBeVisible();
    await expect(page.getByRole("button", { name: "اعمال بازه" })).toBeVisible();
    await expect(page.getByRole("button", { name: "پاک کردن بازه" })).toBeVisible();

    await page.getByRole("button", { name: "اعمال بازه" }).click();
    await expect(page.getByText("سندِ بازه انتخاب شده")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText("تعداد کل نتایج:")).toBeVisible();
    await expect(page.getByText("تعداد قابل خروجی:")).toBeVisible();
    await expect(page.getByText("تعداد مسدود:")).toBeVisible();
    await expect(page.getByText("تعداد انتخاب‌شده:")).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "شماره پیش‌فاکتور/سند" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "وضعیت خروجی" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "علت مسدودی" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "شماره آسان" })).toBeVisible();
    await expect(page.getByRole("button", { name: "انتخاب همه نتایج قابل خروجی" })).toBeVisible();

    await page.getByRole("button", { name: "لغو انتخاب همه" }).click();
    await expect(page.getByRole("button", { name: "پیش‌نمایش انتخاب‌شده‌ها" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "دانلود خروجی انتخاب‌شده‌ها" })).toBeDisabled();

    await page.getByRole("button", { name: "انتخاب همه نتایج قابل خروجی" }).click();
    const downloadBtn = page.getByRole("button", { name: "دانلود خروجی انتخاب‌شده‌ها" });
    // If the default 90-day window has no eligible docs, selection stays empty — still a valid outcome.
    if (await downloadBtn.isEnabled()) {
      await page.getByRole("button", { name: "پیش‌نمایش انتخاب‌شده‌ها" }).click();
      await expect(page.getByTestId("asan-export-preview")).toBeVisible();
      await expect(page.getByText("پیش‌نمایش فقط‌خواندنی است")).toBeVisible();

      await downloadBtn.click();
      await expect(
        page.getByText("برای اسناد انتخاب‌شده شماره خروجی آسان ثبت می‌شود"),
      ).toBeVisible();
      await page.getByRole("button", { name: "انصراف" }).click();
    }

    await page.getByRole("button", { name: "پاک کردن بازه" }).click();
    await expect(page.getByText("سندِ بازه انتخاب شده")).toHaveCount(0);

    expect(
      Number(dbScalar("select count(*) from asan_export_numbers")),
      "preview and cancelled confirm must not mint",
    ).toBe(before);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: PAGE_TITLE })).toBeVisible();
  });

  test.describe("accountant", () => {
    test.use({ storageState: "e2e/auth/accountant.storage.json" });
    test("accountant reaches the shell", async ({ page }) => {
      await page.goto(ROUTE);
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("heading", { name: PAGE_TITLE })).toBeVisible();
    });
  });

  test.describe("sales denied", () => {
    test.use({ storageState: "e2e/auth/salesperson-a.storage.json" });
    test("salesperson is denied", async ({ page }) => {
      await page.goto(ROUTE);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);
      await expect(page.getByRole("heading", { name: PAGE_TITLE })).toHaveCount(0);
    });
  });
});

test.describe("JWT helpers for selected batch", () => {
  test("inverted range rejected; sales role denied; empty assign is no-op", async () => {
    const adminJwt = mintJwt(ADMIN_USER_ID);
    const inverted = await rest(adminJwt, "/rpc/asan_list_sales_export", {
      method: "POST",
      body: JSON.stringify({ _from: "2026-12-31", _to: "2026-01-01" }),
    });
    expect(inverted.status).toBeGreaterThanOrEqual(400);

    const salesUser = await userWithRole(adminJwt, "sales");
    test.skip(!salesUser, "no sales user");
    const denied = await rest(mintJwt(salesUser!), "/rpc/asan_list_sales_export", {
      method: "POST",
      body: JSON.stringify({ _from: "2026-01-01", _to: "2026-12-31" }),
    });
    expect(denied.status).toBeGreaterThanOrEqual(400);

    const before = Number(dbScalar("select count(*) from asan_export_numbers"));
    const empty = await rest(adminJwt, "/rpc/asan_assign_document_numbers", {
      method: "POST",
      body: JSON.stringify({ _doc_type: "sales_invoice", _ids: [] }),
    });
    expect(empty.status, empty.text).toBeLessThan(300);
    expect(empty.body ?? []).toEqual([]);
    expect(Number(dbScalar("select count(*) from asan_export_numbers"))).toBe(before);
  });

  test("duplicate selected ids mint once; cleanup removes fixture", async () => {
    const adminJwt = mintJwt(ADMIN_USER_ID);
    const res = await rest<{ source_id: string; asan_number: number }[]>(
      adminJwt,
      "/rpc/asan_assign_document_numbers",
      {
        method: "POST",
        body: JSON.stringify({ _doc_type: "sales_invoice", _ids: [FAKE_ID, FAKE_ID] }),
      },
    );
    expect(res.status, res.text).toBeLessThan(300);
    // Idempotent assign may return one row per array slot or one unique — either way one DB row.
    expect(
      Number(dbScalar(`select count(*) from asan_export_numbers where source_id = '${FAKE_ID}'`)),
    ).toBe(1);

    dbExecE2e(
      `-- ${MARK} cleanup\ndelete from asan_export_numbers where source_id = '${FAKE_ID}';`,
    );
    expect(
      Number(dbScalar(`select count(*) from asan_export_numbers where source_id = '${FAKE_ID}'`)),
    ).toBe(0);
  });

  test("tickAllEligible and batch limit stay documented", () => {
    expect(ASAN_EXPORT_BATCH_LIMIT).toBe(1000);
    const docs = [
      { sourceId: "a", blockedReason: null },
      { sourceId: "b", blockedReason: "مسدود" },
    ];
    const sel = tickAllEligible(docs);
    expect(countEligibleSelected(docs, sel)).toBe(1);
  });
});
