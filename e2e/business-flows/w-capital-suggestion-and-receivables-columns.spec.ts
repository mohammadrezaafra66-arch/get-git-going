/**
 * Wave 4, agent W — the two CONNECT rows, exercised in a real browser as an accountant.
 *
 * W-1  `/accounting/dynamic-capital` shows the figure `compute_daily_capital` computes, as a
 *      SUGGESTION the accountant may take, edit or ignore. Before this the function had zero
 *      callers and the accountant typed the day's capital from memory.
 * W-2  `/accounting/receivables` carries a salesperson column and a credit-ceiling column, and
 *      the ceiling says «سقفی ثبت نشده» — never ۰ — for a customer that never had one computed.
 *
 * The session is minted locally by `storageStateForRole`; no password is typed and no token is
 * rotated, so running this does not disturb the shared test accounts.
 *
 * Point `E2E_BASE_URL` at whatever origin serves the frontend under test.
 */
import { test, expect, type Page } from "@playwright/test";
import { storageStateForRole } from "../helpers/role-session";

const BASE = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? process.env.E2E_SUPABASE_URL ?? "http://192.168.170.8:9000";

test.use({ storageState: storageStateForRole("accountant", BASE, SUPABASE_URL) });

/** 2026-07-22 — the most recent date that has a `daily_capital_inputs` row. */
const DATE_WITH_INPUTS_JALALI = "۱۴۰۵/۰۴/۳۱";

async function waitForRows(page: Page) {
  await expect(page.getByRole("table").first()).toBeVisible({ timeout: 30_000 });
}

test.describe("W-2 — receivables carries the salesperson and the credit ceiling", () => {
  test("both columns exist and the ceiling distinguishes 'never computed' from zero", async ({
    page,
  }) => {
    await page.goto("/accounting/receivables");
    await waitForRows(page);

    // The two new columns.
    await expect(page.getByRole("columnheader", { name: "کارشناس فروش" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "سقف اعتبار" })).toBeVisible();

    // A customer that has never appeared in any capital snapshot. Its ceiling was never
    // computed, so the cell must name that rather than print a number.
    const noCeilingRow = page.getByRole("row").filter({ hasText: "مشتری آزمایشی 17" }).first();
    await expect(noCeilingRow).toBeVisible();
    await expect(noCeilingRow.getByTestId("receivables-ceiling")).toHaveText("سقفی ثبت نشده");

    // A customer that DOES carry an allocation in the newest snapshot. Its ceiling is a real
    // computed figure and must render as a number with the snapshot's own date beside it —
    // this is the pair that proves NULL and 0 are not being conflated.
    const withCeilingRow = page.getByRole("row").filter({ hasText: "شخص آزمایشی 20" }).first();
    await expect(withCeilingRow).toBeVisible();
    const ceilingCell = withCeilingRow.getByTestId("receivables-ceiling");
    await expect(ceilingCell).toContainText("تومان");
    await expect(ceilingCell).not.toContainText("سقفی ثبت نشده");
    // The snapshot the figure came from is named beside it.
    await expect(ceilingCell).toContainText(/سقف [۰-۹]/);

    // The salesperson comes from the quote itself, so every row has one.
    await expect(noCeilingRow.getByTestId("receivables-salesperson")).toHaveText(/کاربر آزمایشی/);
    await expect(withCeilingRow.getByTestId("receivables-salesperson")).toHaveText(/کاربر آزمایشی/);

    await page.screenshot({
      path: "test-results/w2-receivables-salesperson-and-ceiling.png",
      fullPage: true,
    });
  });
});

test.describe("W-1 — the dynamic-capital page suggests, it does not decide", () => {
  test("a date with no registered cash inputs is named, not given a fabricated zero", async ({
    page,
  }) => {
    await page.goto("/accounting/dynamic-capital");
    await expect(page.getByTestId("dynamic-capital-total-input")).toBeVisible({ timeout: 30_000 });

    // Today has no `daily_capital_inputs` row. compute_daily_capital still returns a figure,
    // clamped at zero, and presenting that as a suggestion would be the same defect as
    // printing a credit ceiling of ۰ for a customer whose ceiling was never computed.
    await expect(page.getByText("پیشنهاد سامانه محاسبه نشد")).toBeVisible();
    await expect(page.getByTestId("dynamic-capital-suggestion-value")).toHaveCount(0);
  });

  test("a date with cash inputs shows a suggestion the accountant can take and then overwrite", async ({
    page,
  }) => {
    await page.goto("/accounting/dynamic-capital");
    const totalInput = page.getByTestId("dynamic-capital-total-input");
    await expect(totalInput).toBeVisible({ timeout: 30_000 });

    // Move to the date that does have a `daily_capital_inputs` row.
    const dateInput = page.getByPlaceholder("انتخاب تاریخ").first();
    await dateInput.click();
    await dateInput.fill(DATE_WITH_INPUTS_JALALI);
    await page.keyboard.press("Escape");

    const suggestion = page.getByTestId("dynamic-capital-suggestion-value");
    await expect(suggestion).toBeVisible({ timeout: 30_000 });
    const suggested = (await suggestion.innerText()).trim();
    expect(suggested).toMatch(/تومان$/);
    // A suggestion of nothing is not a suggestion.
    expect(suggested.replace(/[^۰-۹0-9]/g, "").replace(/[۰0]/g, "")).not.toBe("");

    // The accountant has to ask for it. Nothing has been placed in the field yet.
    await expect(totalInput).toHaveValue("");

    await page.getByTestId("dynamic-capital-apply-suggestion").click();
    const applied = await totalInput.inputValue();
    expect(applied).not.toBe("");

    // And it stays theirs: the field is a plain editable input, not a locked readout.
    await totalInput.fill("123,456,789");
    await expect(totalInput).toHaveValue("123,456,789");
    await expect(suggestion).toHaveText(suggested);

    await page.screenshot({
      path: "test-results/w1-dynamic-capital-suggestion.png",
      fullPage: true,
    });
  });
});
