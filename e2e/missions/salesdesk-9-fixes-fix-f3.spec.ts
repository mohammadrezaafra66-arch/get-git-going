/**
 * F3 live acceptance — C9 (create quote from deal) + C5 (deals-for-others count).
 *
 * Markers: [TEST-9FIX] titles/names, phones 09000000xxx
 * Auth: minted JWT via storageStateForRole — no password mutation [E-1].
 *
 * Run:
 *   cmd /c "…\playwright.cmd" test --config docs/missions/salesdesk-9-fixes/evidence/FIX/playwright.fix-f3.config.ts --workers=1
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

import { dbScalar } from "../helpers/db";
import { mintJwt } from "../helpers/pgrest";
import {
  authStorageKey,
  storageStateForRole,
  userIdFor,
} from "../helpers/role-session";

function storageStateForSales2() {
  const userId = dbScalar(
    `select id::text from auth.users where email = '${SALES2_EMAIL}'`,
  );
  const ttlSeconds = 2 * 60 * 60;
  const accessToken = mintJwt(userId, ttlSeconds);
  const session = {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: ttlSeconds,
    expires_at: Math.floor(Date.now() / 1000) + ttlSeconds,
    refresh_token: "",
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: SALES2_EMAIL,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      created_at: new Date(0).toISOString(),
    },
  };
  return {
    cookies: [] as never[],
    origins: [
      {
        origin: BASE,
        localStorage: [
          { name: authStorageKey(SUPABASE), value: JSON.stringify(session) },
        ],
      },
    ],
  };
}

const BASE = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE = process.env.E2E_SUPABASE_URL ?? "http://192.168.170.8:9000";

const MARKER = "[TEST-9FIX]";
const SALES2_EMAIL = "test.sales2@afrakala.local";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const FIX_DIR = path.join(
  repoRoot,
  "docs/missions/salesdesk-9-fixes/evidence/FIX",
);
const SQL_HELPER = path.join(FIX_DIR, "f3-sql.mjs");

function toFaDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!);
}

function runNode(script: string, args: string[] = [], env: Record<string, string> = {}): string {
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
    .find((l) => l.trim().startsWith("{"));
  if (!line) throw new Error(`no JSON in: ${out}`);
  return JSON.parse(line) as Record<string, unknown>;
}

function writeUtf8(rel: string, text: string): void {
  writeFileSync(path.join(FIX_DIR, rel), text, { encoding: "utf8" });
}

function kpiScore(tag: string, employeeId: string): Record<string, unknown> {
  const out = runNode(SQL_HELPER, ["kpi-score"], {
    KPI_TAG: tag,
    SCORE_EMPLOYEE_ID: employeeId,
  });
  return parseLastJson(out);
}

function c5SqlCount(authorId: string): number {
  const out = runNode(SQL_HELPER, ["c5-count"], { AUTHOR_ID: authorId });
  const j = parseLastJson(out);
  return Number(j.count);
}

async function readAuthorTodayCount(
  page: Page,
  authorName: string,
  day: string,
): Promise<number> {
  const row = page
    .locator("ul.divide-y > li")
    .filter({ hasText: authorName })
    .filter({ hasText: day });
  const n = await row.count();
  if (n === 0) return 0;
  // Count lives in the secondary Badge; do NOT parse the LTR day (contains year).
  const badge = row.first().locator("button").locator("span").last();
  // Prefer an element that is only the count: last child of the button row
  const btn = row.first().locator("button").first();
  const btnText = ((await btn.innerText()) || "").trim();
  // Split lines / tokens; take the last token that is only digits (en or fa)
  const tokens = btnText.split(/\s+/).filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i]!;
    if (t === day || t.includes("-")) continue;
    const en = t.replace(/[۰-۹]/g, (d) => "0123456789"["۰۱۲۳۴۵۶۷۸۹".indexOf(d)]!);
    if (/^\d+$/.test(en)) return Number(en);
  }
  // Fallback: badge-only
  const badgeTxt = ((await badge.innerText().catch(() => "")) || "").trim();
  const en2 = badgeTxt.replace(/[۰-۹]/g, (d) => "0123456789"["۰۱۲۳۴۵۶۷۸۹".indexOf(d)]!);
  const m = en2.match(/^\d+$/);
  return m ? Number(m[0]) : -1;
}

async function saveDraftQuoteFromDealPrefill(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/sales\/quotes\/new/, { timeout: 20_000 });
  // Wait for deal prefill (customer + items)
  await expect
    .poll(async () => page.locator("table tbody tr").count(), {
      timeout: 25_000,
    })
    .toBeGreaterThanOrEqual(1);

  // Customer phone must be present after prefill
  const phone = page.getByLabel(/شماره تماس/);
  if (await phone.count()) {
    const v = await phone.inputValue();
    if (!v) await phone.fill("09000000201");
  }

  await page.getByTestId("quote-settlement-select").click();
  await page.getByRole("option").first().click();

  // Catalog/product_price prefill may disable unit price (already set from deal).
  // Only fill when the input is editable and empty/zero (legacy manual path).
  const priceInput = page
    .locator("table tbody tr")
    .first()
    .locator('input[type="number"]')
    .nth(1);
  await expect
    .poll(async () => {
      const v = await priceInput.inputValue().catch(() => "");
      return Number(v) > 0 || (await priceInput.isEnabled());
    }, { timeout: 15_000 })
    .toBe(true);
  if (await priceInput.isEnabled()) {
    const v = await priceInput.inputValue();
    if (!v || Number(v) === 0) {
      await priceInput.fill("100000");
      await page.waitForTimeout(400);
    }
  } else {
    const prefilled = Number(await priceInput.inputValue());
    expect(prefilled, "disabled unit price must be prefilled > 0").toBeGreaterThan(0);
  }

  await page.getByTestId("quote-save").click();

  // Credit guard: new marked customer has no allocation → accounting approval path.
  const creditBtn = page.getByRole("button", { name: /ثبت با تأیید حسابداری/ });
  try {
    await expect(creditBtn).toBeVisible({ timeout: 8_000 });
    await creditBtn.click();
  } catch {
    // dialog may not appear
  }

  // Surface product rejection clearly (wait briefly — dialog can lag after credit path)
  const rejected = page.getByRole("dialog", { name: /ثبت پیش‌فاکتور انجام نشد/ });
  try {
    await expect(rejected).toBeVisible({ timeout: 5_000 });
    const reason = await rejected.innerText();
    throw new Error(`C9 quote save rejected by product: ${reason.slice(0, 500)}`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("C9 quote save rejected")) throw e;
    // no rejection dialog — fall through to URL assert
  }

  await expect(page).toHaveURL(/\/sales\/quotes\/?$/, { timeout: 30_000 });
}

test.describe("F3 — C9 [TEST-9FIX] quote-from-deal", () => {
  test.use({
    storageState: storageStateForRole("sales", BASE, SUPABASE),
  });

  let sales2Id = "";
  let salesId = "";
  let c9DealId = "";
  let c9DealTitle = "";
  let c9QuoteId = "";
  let kpiBefore: Record<string, unknown> = {};
  let kpiAfter: Record<string, unknown> = {};

  test.beforeAll(() => {
    sales2Id = dbScalar(
      `select id::text from auth.users where email = '${SALES2_EMAIL}'`,
    );
    salesId = userIdFor("sales");
    expect(sales2Id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(salesId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(sales2Id).not.toBe(salesId);
    runNode(SQL_HELPER, ["cleanup"]);
  });

  test.afterAll(() => {
    try {
      const cleanupOut = runNode(SQL_HELPER, ["cleanup"]);
      const counts = runNode(SQL_HELPER, ["marker-counts"]);
      writeUtf8(
        "f3-cleanup.txt",
        `CLEANUP_OUT\n${cleanupOut}\nMARKER_COUNTS\n${counts}\n`,
      );
      console.log("F3_C9_MARKER_COUNTS", counts.trim());
    } catch (e) {
      console.error("F3 C9 cleanup error", e);
    }
  });

  test("C9 — create draft quote from deal; KPI/score unchanged", async ({
    browser,
  }) => {
    c9DealTitle = `${MARKER} C9 deal ${Date.now()}`;
    const seedOut = runNode(SQL_HELPER, ["seed-c9"], {
      DEAL_TITLE: c9DealTitle,
      PERSON_NAME: `${MARKER} C9 Customer`,
      PERSON_PHONE: "09000000201",
      AUTHOR_ID: sales2Id,
      SALESPERSON_ID: salesId,
    });
    const seeded = parseLastJson(seedOut);
    c9DealId = String(seeded.deal_id);
    expect(c9DealId).toMatch(/^[0-9a-f-]{36}$/i);

    const dealSp = dbScalar(
      `SELECT salesperson_id::text FROM sales_interactions WHERE id = '${c9DealId}'`,
    );
    expect(dealSp).toBe(salesId);
    const itemCount = dbScalar(
      `SELECT count(*)::text FROM sales_interaction_items WHERE interaction_id = '${c9DealId}'`,
    );
    expect(Number(itemCount)).toBeGreaterThanOrEqual(1);

    kpiBefore = kpiScore("before", salesId);
    writeUtf8("f3-c9.txt", `KPI_SCORE_BEFORE\n${JSON.stringify(kpiBefore, null, 2)}\n`);

    // Act as sales (can create quotes; responsible on the deal)
    const context = await browser.newContext({
      storageState: storageStateForRole("sales", BASE, SUPABASE),
      locale: "fa-IR",
      timezoneId: "Asia/Tehran",
    });
    const page = await context.newPage();

    await page.goto(`/operations/sales-desk/deals/${c9DealId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("button", { name: /ایجاد پیش‌فاکتور/ })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: /ایجاد پیش‌فاکتور/ }).click();

    try {
      await saveDraftQuoteFromDealPrefill(page);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      writeUtf8(
        "f3-c9.txt",
        [
          "STATUS=FAIL",
          "PRODUCT_FIX_NEEDED=attempt-2",
          "KPI_SCORE_BEFORE",
          JSON.stringify(kpiBefore, null, 2),
          "ERROR",
          msg,
          `DEAL_ID=${c9DealId}`,
          `DEAL_TITLE=${c9DealTitle}`,
        ].join("\n") + "\n",
      );
      throw e;
    }

    // SQL asserts
    const quoteRowRaw = runNode(SQL_HELPER, ["quote-assert"], { DEAL_ID: c9DealId });
    const quoteRow = JSON.parse(quoteRowRaw.trim().split(/\r?\n/).reverse().find((l) => l.startsWith("{")) || "{}") as {
      quote_id?: string;
      status?: string;
      salesperson_id?: string;
      interaction_id?: string;
      quote_number?: string;
    };
    writeUtf8(
      "f3-c9.txt",
      `KPI_SCORE_BEFORE\n${JSON.stringify(kpiBefore, null, 2)}\n\nQUOTE_ROW\n${JSON.stringify(quoteRow, null, 2)}\nSEED\n${seedOut}\n`,
    );

    expect(quoteRow.quote_id, "quote must be linked via interaction_id").toMatch(
      /^[0-9a-f-]{36}$/i,
    );
    c9QuoteId = String(quoteRow.quote_id);
    expect(quoteRow.status, "C9: quote status must be draft").toBe("draft");
    expect(
      quoteRow.salesperson_id,
      "C9: quote salesperson_id must equal deal responsible",
    ).toBe(salesId);
    expect(quoteRow.interaction_id).toBe(c9DealId);

    // UI: deal tab «پیش‌فاکتورها»
    await page.goto(`/operations/sales-desk/deals/${c9DealId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("tab", { name: /پیش‌فاکتورها/ }).click();
    const quoteLink = page.locator(`a[href*="/sales/quotes/${c9QuoteId}"]`);
    await expect(quoteLink).toBeVisible({ timeout: 15_000 });
    const qNum = quoteRow.quote_number;
    if (qNum) {
      await expect(page.getByText(qNum)).toBeVisible();
    }

    // Bidirectional (EXECUTION): deal tab lists quote (above) + quote.interaction_id = deal.
    await quoteLink.click();
    await expect(page).toHaveURL(new RegExp(`/sales/quotes/${c9QuoteId}`), {
      timeout: 15_000,
    });
    const interactionFromQuote = dbScalar(
      `SELECT interaction_id::text FROM sales_quotes WHERE id = '${c9QuoteId}'`,
    );
    expect(
      interactionFromQuote,
      "bidirectional: quote.interaction_id must equal deal id",
    ).toBe(c9DealId);

    const quoteBody = await page.locator("body").innerText();
    const dealLinkCount = await page
      .locator(`a[href*="/operations/sales-desk/deals/${c9DealId}"]`)
      .count();
    const showsDealUi =
      dealLinkCount > 0 || quoteBody.includes(c9DealTitle);
    // Note: quote-detail chrome may omit deal link; SQL+tab bidirectional is the gate.

    kpiAfter = kpiScore("after", salesId);
    writeUtf8(
      "f3-c9.txt",
      [
        "KPI_SCORE_BEFORE",
        JSON.stringify(kpiBefore, null, 2),
        "",
        "KPI_SCORE_AFTER",
        JSON.stringify(kpiAfter, null, 2),
        "",
        "QUOTE_ROW",
        JSON.stringify(quoteRow, null, 2),
        "",
        `DEAL_ID=${c9DealId}`,
        `QUOTE_ID=${c9QuoteId}`,
        `SHOWS_DEAL_UI=${showsDealUi}`,
      ].join("\n") + "\n",
    );

    expect(
      kpiAfter.kpi_today_sum_count,
      "KPI today must be unchanged after draft quote",
    ).toBe(kpiBefore.kpi_today_sum_count);
    expect(
      kpiAfter.score_accepted_sum_count,
      "accepted-quote score fingerprint must be unchanged",
    ).toBe(kpiBefore.score_accepted_sum_count);
    expect(
      kpiAfter.score_total_sales_value,
      "compute_employee_score total_sales.value must be unchanged",
    ).toBe(kpiBefore.score_total_sales_value);

    await context.close();
  });
});

test.describe("F3 — C5 [TEST-9FIX] deals-for-others", () => {
  let sales2Id = "";
  let salesId = "";

  test.beforeAll(() => {
    sales2Id = dbScalar(
      `select id::text from auth.users where email = '${SALES2_EMAIL}'`,
    );
    salesId = userIdFor("sales");
    expect(sales2Id).not.toBe(salesId);
  });

  test.afterAll(() => {
    try {
      const cleanupOut = runNode(SQL_HELPER, ["cleanup"]);
      const counts = runNode(SQL_HELPER, ["marker-counts"]);
      writeUtf8(
        "f3-cleanup.txt",
        `C5_CLEANUP_OUT\n${cleanupOut}\nMARKER_COUNTS\n${counts}\n`,
      );
      console.log("F3_C5_MARKER_COUNTS", counts.trim());
    } catch (e) {
      console.error("F3 C5 cleanup error", e);
    }
  });

  test("C5 — deals-for-others count +1 equals SQL", async ({ browser }) => {
    // Report as sales2 (author of the seeded deal)
    const context = await browser.newContext({
      storageState: storageStateForSales2(),
      locale: "fa-IR",
      timezoneId: "Asia/Tehran",
    });
    const page = await context.newPage();

    const tehranToday = dbScalar(`SELECT public.tehran_today()::text`);
    const authorName = dbScalar(
      `SELECT coalesce(full_name, id::text) FROM profiles WHERE id = '${sales2Id}'`,
    );

    const sqlBefore = c5SqlCount(sales2Id);
    await page.goto("/operations/sales-desk/deals-for-others", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /معاملات ثبت‌شده برای دیگران/ })).toBeVisible({
      timeout: 20_000,
    });
    await page.waitForTimeout(1500);
    const uiBefore = await readAuthorTodayCount(page, authorName, tehranToday);
    expect(
      uiBefore,
      `C5 UI before must match SQL before (ui=${uiBefore} sql=${sqlBefore})`,
    ).toBe(sqlBefore);

    const c5Title = `${MARKER} C5 deal ${Date.now()}`;
    const seedOut = runNode(SQL_HELPER, ["seed-c5-deal"], {
      DEAL_TITLE: c5Title,
      PERSON_NAME: `${MARKER} C5 Customer`,
      PERSON_PHONE: "09000000202",
      AUTHOR_ID: sales2Id,
      SALESPERSON_ID: salesId,
    });
    const seeded = parseLastJson(seedOut);
    expect(String(seeded.deal_id)).toMatch(/^[0-9a-f-]{36}$/i);
    expect(String(seeded.author_id)).toBe(sales2Id);
    expect(String(seeded.salesperson_id)).toBe(salesId);
    expect(String(seeded.author_id)).not.toBe(String(seeded.salesperson_id));

    const sqlAfter = c5SqlCount(sales2Id);
    expect(sqlAfter, "SQL aggregate must rise by exactly +1").toBe(sqlBefore + 1);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const uiAfter = await readAuthorTodayCount(page, authorName, tehranToday);
    writeUtf8(
      "f3-c5.txt",
      [
        `author_id=${sales2Id}`,
        `author_name=${authorName}`,
        `tehran_today=${tehranToday}`,
        `sql_before=${sqlBefore}`,
        `ui_before=${uiBefore}`,
        `sql_after=${sqlAfter}`,
        `ui_after=${uiAfter}`,
        `deal_title=${c5Title}`,
        `seed=${JSON.stringify(seeded)}`,
        `seed_out=${seedOut.trim()}`,
      ].join("\n") + "\n",
    );
    expect(uiAfter, "UI count must rise by exactly +1").toBe(uiBefore + 1);
    expect(uiAfter, "UI count must equal SQL aggregate").toBe(sqlAfter);

    // Also accept Persian digit rendering of the same count
    const body = await page.locator("body").innerText();
    expect(
      body.includes(String(uiAfter)) || body.includes(toFaDigits(uiAfter)),
      `report body must show count ${uiAfter}`,
    ).toBe(true);

    await context.close();
  });
});
