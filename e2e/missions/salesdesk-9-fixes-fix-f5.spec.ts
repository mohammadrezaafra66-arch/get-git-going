/**
 * F5 live acceptance — A2 close/reopen ticket; A5 quick-create supplier + purchase.
 *
 * Markers: [TEST-9FIX] in titles/names; phones 09000000xxx
 * Auth: admin (minted JWT via storageStateForRole)
 *
 * Contracts:
 *   «تاریخ بسته شدن» ↔ completed_at; reopen clears it
 *   sections: ایجاد کننده / مسئول / تاریخ ثبت
 *   Labels: «بازگشایی», «+ تأمین‌کنندهٔ جدید»
 *
 * Run:
 *   cmd /c "…\playwright.cmd" test --config docs/missions/salesdesk-9-fixes/evidence/FIX/playwright.fix-f5.config.ts --workers=1
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

import { dbScalar } from "../helpers/db";
import { storageStateForRole } from "../helpers/role-session";

const BASE = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE = process.env.E2E_SUPABASE_URL ?? "http://192.168.170.8:9000";
const MARKER = "[TEST-9FIX]";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const FIX_DIR = path.join(
  repoRoot,
  "docs/missions/salesdesk-9-fixes/evidence/FIX",
);
const SQL_HELPER = path.join(FIX_DIR, "f5-sql.mjs");

function runNode(
  script: string,
  args: string[] = [],
  env: Record<string, string> = {},
): string {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      AFRAKALA_LAN_ENV:
        process.env.AFRAKALA_LAN_ENV ??
        "D:\\AfraKalaTest\\app\\deploy\\lan\\.env.lan",
      ...env,
    },
  });
}

function parseLastJson(out: string): Record<string, unknown> {
  const line = out
    .trim()
    .split(/\r?\n/)
    .reverse()
    .find((l) => {
      const t = l.trim();
      return t.startsWith("{") || t.includes("{");
    });
  if (!line) throw new Error(`no JSON in: ${out}`);
  const start = line.indexOf("{");
  return JSON.parse(line.slice(start)) as Record<string, unknown>;
}

function writeUtf8(rel: string, text: string): void {
  writeFileSync(path.join(FIX_DIR, rel), text, { encoding: "utf8" });
}

test.describe.configure({ mode: "serial" });

test.describe("F5 — A2/A5 [TEST-9FIX]", () => {
  test.use({
    storageState: storageStateForRole("admin", BASE, SUPABASE),
  });

  let ticketId = "";
  let ticketTitle = "";
  const stamp = `f5${Date.now().toString().slice(-8)}`;
  const supplierName = `${MARKER} F5 supplier ${stamp}`;
  const purchaseNotes = `${MARKER} F5 purchase ${stamp}`;
  // Mission phones: 09000000xxx (11 digits total)
  const phone = `09000000${String(Date.now()).slice(-3)}`;

  test.beforeAll(() => {
    // At start: clean ANY leftover [TEST-9FIX] rows
    runNode(SQL_HELPER, ["cleanup"]);
    const pre = parseLastJson(runNode(SQL_HELPER, ["marker-counts"]));
    expect(Number(pre.work_items), "pre-clean work_items").toBe(0);
    expect(Number(pre.suppliers), "pre-clean suppliers").toBe(0);
    expect(Number(pre.purchases), "pre-clean purchases").toBe(0);
    expect(Number(pre.persons), "pre-clean persons").toBe(0);

    const seed = parseLastJson(
      runNode(SQL_HELPER, ["seed-ticket"], { SEED_STAMP: stamp }),
    );
    ticketId = String(seed.ticket_id);
    ticketTitle = String(seed.title);
    expect(ticketId).toMatch(/^[0-9a-f-]{36}$/i);
    writeUtf8("f5-seed.txt", JSON.stringify(seed, null, 2) + "\n");
  });

  test.afterAll(() => {
    runNode(SQL_HELPER, ["cleanup"]);
    const counts = parseLastJson(runNode(SQL_HELPER, ["marker-counts"]));
    writeUtf8("f5-cleanup.txt", JSON.stringify(counts) + "\n");
    console.log("F5_MARKER_COUNTS", JSON.stringify(counts));
    expect(Number(counts.work_items)).toBe(0);
    expect(Number(counts.suppliers)).toBe(0);
    expect(Number(counts.purchases)).toBe(0);
    expect(Number(counts.persons)).toBe(0);
    expect(Number(counts.customers ?? 0)).toBe(0);
  });

  test("A2 — close then reopen marked ticket (sections + تاریخ بسته شدن)", async ({
    page,
  }) => {
    await page.goto(`/operations/work/${ticketId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByText(ticketTitle, { exact: false }).first(),
    ).toBeVisible({ timeout: 20_000 });

    // A1-related display: creator / assignee / created_at sections
    await expect(page.getByText(/ایجاد\s*کننده/).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("مسئول", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/تاریخ\s*ثبت/).first()).toBeVisible();
    // Open ticket must NOT show completed timestamp yet
    await expect(page.getByText(/تاریخ\s*بسته\s*شدن/)).toHaveCount(0);

    await expect(
      page.getByRole("button", { name: /^بستن$/ }),
      "open ticket must offer «بستن»",
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /^بستن$/ }).click();

    // Same-page UI must flip: «بازگشایی» + «تاریخ بسته شدن» (no reload race)
    await expect(
      page.getByRole("button", { name: /بازگشایی/ }),
      "after «بستن», «بازگشایی» must appear",
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/تاریخ\s*بسته\s*شدن/).first(),
      "closed detail must show «تاریخ بسته شدن»",
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/سابقه/).first()).toBeVisible();

    await expect
      .poll(
        () => {
          const s = parseLastJson(
            runNode(SQL_HELPER, ["ticket-status"], { TICKET_ID: ticketId }),
          );
          return String(s.status);
        },
        { timeout: 15_000, message: "status must become done after «بستن»" },
      )
      .toBe("done");

    const closed = parseLastJson(
      runNode(SQL_HELPER, ["ticket-status"], { TICKET_ID: ticketId }),
    );
    expect(closed.status).toBe("done");
    expect(closed.completed_at, "SQL completed_at must be set after close").toBeTruthy();

    // Board sections
    await page.goto("/operations/work", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText("بسته شده", { exact: false }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("در حال اجرا", { exact: false }).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Reopen via UI «بازگشایی»
    await page.goto(`/operations/work/${ticketId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(
      page.getByText(ticketTitle, { exact: false }).first(),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("button", { name: /بازگشایی/ }),
      "closed ticket must offer «بازگشایی»",
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /بازگشایی/ }).click();

    await expect
      .poll(
        () => {
          const s = parseLastJson(
            runNode(SQL_HELPER, ["ticket-status"], { TICKET_ID: ticketId }),
          );
          return s.completed_at == null ? "cleared" : "set";
        },
        { timeout: 15_000, message: "reopen must clear completed_at" },
      )
      .toBe("cleared");

    const reopened = parseLastJson(
      runNode(SQL_HELPER, ["ticket-status"], { TICKET_ID: ticketId }),
    );
    expect(reopened.status, "status must leave done").not.toBe("done");
    expect(reopened.completed_at).toBeNull();

    // Same-page after reopen: «بستن» returns; «تاریخ بسته شدن» gone
    await expect(page.getByRole("button", { name: /^بستن$/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/تاریخ\s*بسته\s*شدن/)).toHaveCount(0);
    await expect(page.getByText(/سابقه/).first()).toBeVisible();
    expect(
      Number(reopened.event_count),
      "work_item_events should record close/reopen",
    ).toBeGreaterThanOrEqual(1);

    writeUtf8(
      "f5-a2.txt",
      JSON.stringify(
        {
          closed,
          reopened,
          pass: true,
        },
        null,
        2,
      ) + "\n",
    );
  });

  test("A5 — quick-create supplier and save marked purchase", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const productId = String(
      parseLastJson(runNode(SQL_HELPER, ["product"])).product_id,
    );

    await page.goto("/purchases/create", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("ثبت خرید جدید").first()).toBeVisible({
      timeout: 20_000,
    });

    // Exact Didar label «+ تأمین‌کنندهٔ جدید»
    await expect(
      page.getByRole("button", { name: /\+\s*تأمین‌کنندهٔ جدید/ }),
      "quick-create must use «+ تأمین‌کنندهٔ جدید»",
    ).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: /\+\s*تأمین‌کنندهٔ جدید/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.locator("#pm-name").fill(supplierName);
    await dialog.locator("#pm-phone").fill(phone);
    await dialog.getByRole("button", { name: /ذخیرهٔ شخص و ادامه/ }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    // Auto-select: supplier combobox must show the new name (not placeholder)
    await expect(
      page.getByText(supplierName, { exact: false }).first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("انتخاب تأمین‌کننده")).toHaveCount(0);

    // Product — combobox Button with placeholder (role=combobox, not getByRole('button'))
    await page
      .getByRole("combobox")
      .filter({ hasText: "جستجو و انتخاب محصول..." })
      .click();
    const firstProduct = page.getByRole("option").first();
    await expect(firstProduct).toBeVisible({ timeout: 15_000 });
    await firstProduct.click();
    await expect(
      page.getByRole("combobox").filter({ hasText: "جستجو و انتخاب محصول..." }),
    ).toHaveCount(0, { timeout: 10_000 });

    // Payment term — scope to combobox so zod error text does not collide
    await page
      .getByRole("combobox")
      .filter({ hasText: "انتخاب زمان تسویه" })
      .click();
    await page.getByRole("option").first().click();

    await page.locator("#purchase_price").fill("100000");
    await page.locator("#quantity").fill("1");
    await page.locator("#notes").fill(purchaseNotes);

    await page.getByRole("button", { name: "ثبت خرید", exact: true }).click();
    const confirm = page.getByRole("button", { name: "تأیید و ثبت" });
    await expect(confirm).toBeVisible({ timeout: 10_000 });
    await confirm.click();

    // Wait for redirect / success — then SQL prove purchase.supplier_id
    await expect
      .poll(
        () => {
          const sid = dbScalar(
            `SELECT id::text FROM suppliers WHERE name = '${supplierName.replace(/'/g, "''")}' LIMIT 1`,
          );
          if (!/^[0-9a-f-]{36}$/i.test(sid)) return "0";
          return dbScalar(
            `SELECT count(*)::text FROM purchases
              WHERE supplier_id = '${sid}'
                AND notes ILIKE '%${MARKER}%'`,
          );
        },
        {
          timeout: 25_000,
          message: "marked purchase with new supplier must exist",
        },
      )
      .not.toBe("0");

    const supplierId = dbScalar(
      `SELECT id::text FROM suppliers WHERE name = '${supplierName.replace(/'/g, "''")}' LIMIT 1`,
    );
    expect(supplierId, "supplier row must exist").toMatch(/^[0-9a-f-]{36}$/i);

    const purchaseRow = parseLastJson(
      runNode(SQL_HELPER, ["purchase-by-supplier"], {
        SUPPLIER_ID: supplierId,
      }),
    );
    expect(
      purchaseRow.purchase_id,
      "purchase.supplier_id must equal new supplier",
    ).toMatch(/^[0-9a-f-]{36}$/i);
    expect(String(purchaseRow.supplier_id)).toBe(supplierId);
    expect(String(purchaseRow.notes)).toContain(MARKER);

    await expect(page.getByText("خرید با موفقیت ثبت شد")).toBeVisible({
      timeout: 5_000,
    });
    // No live alert/toast for SUPPLIER_REQUIRED (blank-form zod after reset is OK)
    await expect(
      page.getByRole("alert").filter({ hasText: /SUPPLIER_REQUIRED/ }),
    ).toHaveCount(0);
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: /SUPPLIER_REQUIRED|تأمین‌کننده الزامی است/ }),
    ).toHaveCount(0);

    writeUtf8(
      "f5-a5.txt",
      JSON.stringify(
        {
          supplier_id: supplierId,
          supplier_name: supplierName,
          phone,
          purchase_id: purchaseRow.purchase_id,
          purchase_notes: purchaseRow.notes,
          product_id: productId,
          pass: true,
        },
        null,
        2,
      ) + "\n",
    );
  });
});
