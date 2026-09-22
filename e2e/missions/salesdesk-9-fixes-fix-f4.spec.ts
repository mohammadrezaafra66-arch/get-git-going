/**
 * F4 live acceptance — D4 (menu badge), D5 (traffic lights + filter), D6 (reminder + postpone).
 *
 * Markers: [TEST-9FIX] F4 … in titles/names
 * Auth: minted JWT for test.sales2@afrakala.local — no password mutation [E-1].
 *
 * Semantics (FollowUpTrafficLightIcon):
 *   red=overdue «فعالیت عقب‌افتاده»
 *   green=today «فعالیت امروز»
 *   grey=future «فعالیت آینده»
 *   yellow=no planned «فعالیتی برنامه‌ریزی نشده»
 *
 * Run:
 *   cmd /c "…\playwright.cmd" test --config docs/missions/salesdesk-9-fixes/evidence/FIX/playwright.fix-f4.config.ts --workers=1
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

import { dbScalar } from "../helpers/db";
import { mintJwt } from "../helpers/pgrest";
import { authStorageKey } from "../helpers/role-session";

const BASE = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE = process.env.E2E_SUPABASE_URL ?? "http://192.168.170.8:9000";
const SALES2_EMAIL = "test.sales2@afrakala.local";
const MARKER = "[TEST-9FIX]";
const F4_MARK = `${MARKER} F4`;

const LIGHT_TITLE = {
  red: "فعالیت عقب‌افتاده",
  green: "فعالیت امروز",
  grey: "فعالیت آینده",
  yellow: "فعالیتی برنامه‌ریزی نشده",
} as const;

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const FIX_DIR = path.join(
  repoRoot,
  "docs/missions/salesdesk-9-fixes/evidence/FIX",
);
const SQL_HELPER = path.join(FIX_DIR, "f4-sql.mjs");

type SeedJson = {
  stamp: string;
  salesperson_id: string;
  deal_red: string;
  deal_green: string;
  deal_grey: string;
  deal_yellow: string;
  act_red: string;
  act_green: string;
  act_grey: string;
  act_remind: string;
  act_postpone: string;
  remind_due_at: string;
  postpone_original: string;
};

function toFaDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!);
}

function fromFaDigits(s: string): string {
  return s.replace(/[۰-۹]/g, (d) => "0123456789"["۰۱۲۳۴۵۶۷۸۹".indexOf(d)]!);
}

function sales2StorageState() {
  const userId = dbScalar(
    `select id::text from auth.users where email = '${SALES2_EMAIL}'`,
  );
  expect(userId).toMatch(/^[0-9a-f-]{36}$/i);
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

function seedF4(stamp: string): SeedJson {
  const out = runNode(SQL_HELPER, ["seed"], {
    SEED_STAMP: stamp,
    SALESPERSON_ID: sales2Id,
    AUTHOR_ID: sales2Id,
    REMIND_AHEAD_SECS: "120",
    PHONE_BASE: "090000003",
  });
  return parseLastJson(out) as unknown as SeedJson;
}

function rpcCount(salespersonId: string): number {
  const out = runNode(SQL_HELPER, ["rpc-count"], {
    SALESPERSON_ID: salespersonId,
  });
  return Number(parseLastJson(out).count);
}

function getOriginal(activityId: string): Record<string, unknown> {
  const out = runNode(SQL_HELPER, ["get-original", activityId]);
  return parseLastJson(out);
}

function firedStatus(activityId: string): Record<string, unknown> {
  const out = runNode(SQL_HELPER, ["fired-status", activityId]);
  return parseLastJson(out);
}

function setDuePast(activityId: string): Record<string, unknown> {
  const out = runNode(SQL_HELPER, ["set-due-past", activityId]);
  return parseLastJson(out);
}

/** Find deal list item by unique title substring. */
function dealRow(page: Page, dealTitle: string) {
  return page.locator("ul.space-y-2 > li").filter({ hasText: dealTitle });
}

async function openMyWorkTab(page: Page): Promise<void> {
  await page.goto("/operations/sales-desk", { waitUntil: "domcontentloaded" });
  const tab = page.getByRole("tab", { name: /کارهای من/ });
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click();
  await expect(page.getByRole("button", { name: /معاملاتی که فعالیتی روی آن‌ها نیست/ })).toBeVisible({
    timeout: 15_000,
  });
}

async function readActivitiesBadge(page: Page): Promise<number | null> {
  // Prefer the dedicated title on the destructive badge (not the header link).
  // On deploy without permissionsLoading refresh, فروش rail stays empty — use search.
  const search = page.getByPlaceholder("جستجوی سریع...");
  await expect(search).toBeVisible({ timeout: 20_000 });
  if ((await search.inputValue()) !== "فعالیت") {
    await search.fill("فعالیت");
  }
  await page.waitForTimeout(600);
  const badge = page.locator(
    'span[title="فعالیت‌های امروز و عقب‌افتاده"].bg-destructive',
  );
  if ((await badge.count()) === 0) return 0;
  const txt = ((await badge.first().innerText()) || "").trim();
  const en = fromFaDigits(txt);
  if (!/^\d+$/.test(en)) return null;
  return Number(en);
}

async function pickPostponeDate(page: Page): Promise<void> {
  const dateInput = page.getByPlaceholder("تاریخ شمسی").last();
  await expect(dateInput).toBeVisible({ timeout: 10_000 });
  await dateInput.click();
  const calendar = page.locator(".rmdp-calendar").last();
  await expect(calendar).toBeVisible({ timeout: 10_000 });
  // Mid-grid day; do not click month arrows (they can open year view).
  const dayNum = calendar
    .locator(".rmdp-day:not(.rmdp-disabled):not(.rmdp-day-hidden) .sd")
    .nth(10);
  await expect(dayNum).toBeVisible({ timeout: 10_000 });
  await dayNum.click();
  await page.waitForTimeout(300);
  await expect(dateInput).not.toHaveValue("", { timeout: 5_000 });
}

let sales2Id = "";
let seed: SeedJson | null = null;
const stamp = `f4${Date.now().toString().slice(-8)}`;

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  sales2Id = dbScalar(
    `select id::text from auth.users where email = '${SALES2_EMAIL}'`,
  );
  expect(sales2Id).toMatch(/^[0-9a-f-]{36}$/i);
  runNode(SQL_HELPER, ["cleanup"]);
  seed = seedF4(stamp);
  expect(seed.deal_red).toMatch(/^[0-9a-f-]{36}$/i);
  expect(seed.salesperson_id).toBe(sales2Id);
  writeUtf8(
    "f4-seed.txt",
    `SEED\n${JSON.stringify(seed, null, 2)}\nRPC=${rpcCount(sales2Id)}\n`,
  );
});

test.afterAll(() => {
  try {
    let cleanupOut = runNode(SQL_HELPER, ["cleanup"]);
    let counts = runNode(SQL_HELPER, ["marker-counts"]);
    let j = parseLastJson(counts);
    if (Number(j.sales_interactions) > 0) {
      cleanupOut += "\n" + runNode(SQL_HELPER, ["cleanup"]);
      counts = runNode(SQL_HELPER, ["marker-counts"]);
      j = parseLastJson(counts);
    }
    writeUtf8(
      "f4-cleanup.txt",
      `CLEANUP_OUT\n${cleanupOut}\nMARKER_COUNTS\n${counts}\n`,
    );
    expect(
      Number(j.sales_interactions),
      "F4 marker sales_interactions leftover",
    ).toBe(0);
    expect(Number(j.persons), "F4 marker persons leftover").toBe(0);
    expect(Number(j.customers), "F4 marker customers leftover").toBe(0);
    expect(
      Number(j.notification_queue),
      "F4 marker notification_queue leftover",
    ).toBe(0);
  } catch (e) {
    console.error("F4 cleanup error", e);
    try {
      runNode(SQL_HELPER, ["cleanup"]);
    } catch {
      /* */
    }
    throw e;
  }
});

test.describe("F4 — D5 [TEST-9FIX] traffic lights + filter", () => {
  test("D5 — red/green/grey/yellow icons + no-activity filter", async ({
    browser,
  }) => {
    expect(seed).toBeTruthy();
    const s = seed!;
    const context = await browser.newContext({
      storageState: sales2StorageState(),
      locale: "fa-IR",
      timezoneId: "Asia/Tehran",
    });
    const page = await context.newPage();
    const lines: string[] = [];

    await openMyWorkTab(page);
    // Wait for lights query
    await page.waitForTimeout(2500);

    const titleRed = `${F4_MARK} deal-red ${stamp}`;
    const titleGreen = `${F4_MARK} deal-green ${stamp}`;
    const titleGrey = `${F4_MARK} deal-grey ${stamp}`;
    const titleYellow = `${F4_MARK} deal-yellow ${stamp}`;
    // Person names are also unique and shown as the bold line
    const personRed = `${F4_MARK} red ${stamp}`;

    // Prefer title match; fall back to person display_name if title clipped
    const redRow = dealRow(page, titleRed).or(dealRow(page, personRed));
    const greenRow = dealRow(page, titleGreen).or(
      dealRow(page, `${F4_MARK} green ${stamp}`),
    );
    const greyRow = dealRow(page, titleGrey).or(
      dealRow(page, `${F4_MARK} grey ${stamp}`),
    );
    const yellowRow = dealRow(page, titleYellow).or(
      dealRow(page, `${F4_MARK} yellow ${stamp}`),
    );

    await expect(redRow, "red deal visible on کارهای من").toBeVisible({
      timeout: 20_000,
    });
    await expect(greenRow).toBeVisible({ timeout: 10_000 });
    await expect(greyRow).toBeVisible({ timeout: 10_000 });
    await expect(yellowRow).toBeVisible({ timeout: 10_000 });

    await expect(
      redRow.getByLabel(LIGHT_TITLE.red),
      "D5 red = overdue",
    ).toBeVisible();
    await expect(
      greenRow.getByLabel(LIGHT_TITLE.green),
      "D5 green = today",
    ).toBeVisible();
    await expect(
      greyRow.getByLabel(LIGHT_TITLE.grey),
      "D5 grey = future",
    ).toBeVisible();
    await expect(
      yellowRow.getByLabel(LIGHT_TITLE.yellow),
      "D5 yellow = no planned activity",
    ).toBeVisible();

    // Also assert classes used by FollowUpTrafficLightIcon
    await expect(redRow.locator("svg.fill-red-500").first()).toBeVisible();
    await expect(greenRow.locator("svg.fill-emerald-500").first()).toBeVisible();
    await expect(greyRow.locator("svg.fill-slate-400").first()).toBeVisible();
    await expect(yellowRow.locator("svg.fill-amber-400").first()).toBeVisible();

    lines.push("LIGHTS_OK");
    lines.push(
      JSON.stringify({
        red: LIGHT_TITLE.red,
        green: LIGHT_TITLE.green,
        grey: LIGHT_TITLE.grey,
        yellow: LIGHT_TITLE.yellow,
        deal_red: s.deal_red,
        deal_green: s.deal_green,
        deal_grey: s.deal_grey,
        deal_yellow: s.deal_yellow,
      }),
    );

    // Filter: only no-activity deals
    await page.getByRole("button", { name: /معاملاتی که فعالیتی روی آن‌ها نیست/ }).click();
    await page.waitForTimeout(800);
    await expect(yellowRow, "filter keeps yellow deal").toBeVisible({
      timeout: 10_000,
    });
    await expect(redRow, "filter hides red deal").toHaveCount(0);
    await expect(greenRow, "filter hides green deal").toHaveCount(0);
    await expect(greyRow, "filter hides grey deal").toHaveCount(0);
    lines.push("FILTER_OK");

    writeUtf8("f4-d5.txt", lines.join("\n") + "\n");
    await context.close();
  });
});

test.describe("F4 — D4 [TEST-9FIX] menu badge", () => {
  test("D4 — red menu count equals RPC with N>0", async ({ browser }) => {
    expect(seed).toBeTruthy();
    const sqlN = rpcCount(sales2Id);
    expect(sqlN, "seed must yield N>0 open due today/overdue").toBeGreaterThan(0);

    const context = await browser.newContext({
      storageState: sales2StorageState(),
      locale: "fa-IR",
      timezoneId: "Asia/Tehran",
    });
    const page = await context.newPage();
    await page.goto("/operations/sales-desk", { waitUntil: "domcontentloaded" });
    // Do NOT require فروش rail enabled — on APP_GIT_SHA without e2d67d0e the
    // sidebar visible[] memo never refreshes after role_permissions load.
    await expect(page.getByPlaceholder("جستجوی سریع...")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(3000);

    const sqlAgain = rpcCount(sales2Id);
    let badge: number | null = null;
    try {
      await expect
        .poll(
          async () => {
            badge = await readActivitiesBadge(page);
            return badge;
          },
          { timeout: 45_000, intervals: [1500, 2500, 4000] },
        )
        .toBe(sqlAgain);
    } catch (e) {
      writeUtf8(
        "f4-d4.txt",
        [
          "STATUS=FAIL",
          `sql_count=${sqlN}`,
          `sql_count_again=${sqlAgain}`,
          `badge=${badge}`,
          `fa=${toFaDigits(sqlAgain)}`,
          `salesperson_id=${sales2Id}`,
          `APP_GIT_SHA_EXPECTED=2102fc48_or_e2d67d0e`,
          "PRODUCT_FIX_NEEDED=deploy e2d67d0e (sidebar permissionsLoading refresh) so فعالیت‌ها badge can render",
          `error=${e instanceof Error ? e.message : String(e)}`,
        ].join("\n") + "\n",
      );
      throw e;
    }

    writeUtf8(
      "f4-d4.txt",
      [
        "STATUS=PASS",
        `sql_count=${sqlN}`,
        `sql_count_again=${sqlAgain}`,
        `badge=${badge}`,
        `fa=${toFaDigits(sqlAgain)}`,
        `salesperson_id=${sales2Id}`,
      ].join("\n") + "\n",
    );

    expect(badge, "sidebar badge must be visible with N>0").toBeGreaterThan(0);
    expect(
      badge,
      `D4 badge must equal count_open_activities_due_today_or_overdue (badge=${badge} sql=${sqlAgain})`,
    ).toBe(sqlAgain);

    await page.goto("/operations/sales-desk/activities", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByRole("heading", { name: /فعالیت/ })).toBeVisible({
      timeout: 20_000,
    });

    await context.close();
  });
});

test.describe("F4 — D6 [TEST-9FIX] reminder + postpone", () => {
  test("D6 — bell reminder fires; postpone keeps original_due_at", async ({
    browser,
  }) => {
    expect(seed).toBeTruthy();
    const s = seed!;
    const remindTitle = `${F4_MARK} remind ${stamp}`;
    const postponeTitle = `${F4_MARK} postpone ${stamp}`;

    const before = firedStatus(s.act_remind);
    expect(before.reminder_enabled).toBe(true);
    expect(before.reminder_fired_at, "must not be pre-fired by seed").toBeNull();

    // Server-side due check — Playwright clock cannot move DB now().
    // Accelerate due_at to past WITHOUT setting reminder_fired_at (sensor stays honest).
    const accelerated = setDuePast(s.act_remind);
    expect(accelerated.reminder_fired_at).toBeNull();
    writeUtf8(
      "f4-d6.txt",
      `BEFORE\n${JSON.stringify(before)}\nACCELERATED\n${JSON.stringify(accelerated)}\n`,
    );

    const context = await browser.newContext({
      storageState: sales2StorageState(),
      locale: "fa-IR",
      timezoneId: "Asia/Tehran",
    });
    const page = await context.newPage();

    // Mount NotificationBell → materialize on load; also poll 30s.
    await page.goto("/operations/sales-desk", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /نوتیفیکیشن/ })).toBeVisible({
      timeout: 20_000,
    });

    // Wait until DB marks fired (materialize on read); reload once to re-trigger load().
    await expect
      .poll(
        async () => {
          let st = firedStatus(s.act_remind);
          if (st.reminder_fired_at) return "fired";
          // Re-enter page to remount bell / call materialize
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.waitForTimeout(1500);
          st = firedStatus(s.act_remind);
          return st.reminder_fired_at ? "fired" : "pending";
        },
        { timeout: 90_000, intervals: [2000, 3000, 5000] },
      )
      .toBe("fired");

    const afterFire = firedStatus(s.act_remind);
    expect(afterFire.reminder_fired_at, "reminder_fired_at must be set").toBeTruthy();
    expect(Number(afterFire.queue_count), "notification_queue row").toBeGreaterThanOrEqual(1);

    // Bell UI shows the reminder title
    await page.getByRole("button", { name: /نوتیفیکیشن/ }).click();
    await expect(
      page.getByText(remindTitle, { exact: false }).first(),
      "bell must show reminder title",
    ).toBeVisible({ timeout: 15_000 });
    // Close dropdown before navigating
    await page.keyboard.press("Escape");

    writeUtf8(
      "f4-d6.txt",
      [
        "REMINDER=PASS",
        `remind_title=${remindTitle}`,
        `before=${JSON.stringify(before)}`,
        `accelerated=${JSON.stringify(accelerated)}`,
        `after_fire=${JSON.stringify(afterFire)}`,
      ].join("\n") + "\n",
    );

    // ——— Postpone via UI ———
    const origBefore = getOriginal(s.act_postpone);
    const originalDue = String(origBefore.original_due_at);
    expect(originalDue).toBeTruthy();
    const linkedDeal = dbScalar(
      `SELECT deal_id::text FROM sales_interactions WHERE id = '${s.act_postpone}'`,
    );
    expect(linkedDeal).toMatch(/^[0-9a-f-]{36}$/i);
    const titleInDb = dbScalar(
      `SELECT title FROM sales_interactions WHERE id = '${s.act_postpone}'`,
    );
    expect(titleInDb).toContain("postpone");

    await page.goto(`/operations/sales-desk/deals/${linkedDeal}`, {
      waitUntil: "networkidle",
    });
    await page.getByRole("tab", { name: /فعالیت‌ها/ }).click();
    await expect(page.getByText(titleInDb, { exact: false }).first()).toBeVisible({
      timeout: 25_000,
    });
    const actBlock = page.locator("li").filter({ hasText: titleInDb }).first();
    await expect(actBlock).toBeVisible({ timeout: 10_000 });
    await actBlock.getByRole("button", { name: /به تعویق انداختن/ }).click();
    await pickPostponeDate(page);
    const timeInput = page.locator('input[type="time"]').last();
    if (await timeInput.isEnabled().catch(() => false)) {
      await timeInput.fill("15:45");
    }
    await page.getByRole("button", { name: /تأیید تعویق/ }).click();

    await expect
      .poll(
        () => {
          const row = getOriginal(s.act_postpone);
          return String(row.due_at) !== String(origBefore.due_at)
            ? "changed"
            : "same";
        },
        { timeout: 25_000, intervals: [500, 1000, 2000] },
      )
      .toBe("changed");

    const origAfter = getOriginal(s.act_postpone);
    expect(
      String(origAfter.original_due_at),
      "D6 original_due_at must stay unchanged after postpone",
    ).toBe(originalDue);
    expect(
      String(origAfter.due_at),
      "due_at must change on postpone",
    ).not.toBe(String(origBefore.due_at));

    writeUtf8(
      "f4-d6.txt",
      [
        "STATUS=PASS",
        `remind_title=${remindTitle}`,
        `before=${JSON.stringify(before)}`,
        `accelerated=${JSON.stringify(accelerated)}`,
        `after_fire=${JSON.stringify(afterFire)}`,
        `postpone_before=${JSON.stringify(origBefore)}`,
        `postpone_after=${JSON.stringify(origAfter)}`,
      ].join("\n") + "\n",
    );

    await context.close();
  });
});
