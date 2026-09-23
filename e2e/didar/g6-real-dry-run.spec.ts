/**
 * G6.2 — real Didar file through the UI: parse → stage → classify only.
 * Does not commit. Counts only; never prints row contents.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { lanEnv } from "../helpers/pgrest";
import { storageStateForRole } from "../helpers/role-session";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;
const REAL =
  process.env.DIDAR_REAL_XLSX ??
  "D:/AfraKalaTest/research/didar-import/input/didar-contacts.xlsx";
const OUT = "D:/AfraKalaTest/research/didar-import/evidence/G6/real-dry-run.json";

test.use({ storageState: storageStateForRole("admin", BASE_URL, SUPABASE_URL) });

test.describe.configure({ timeout: 20 * 60_000 });

test("G6.2 real-file parse stage classify (no commit)", async ({ page }) => {
  test.skip(!process.env.DIDAR_G6_DRY_RUN, "set DIDAR_G6_DRY_RUN=1 to run the 36k-row dry run");
  const t0 = Date.now();
  await page.goto("/admin/didar-import", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "ورود اشخاص از دیدار" })).toBeVisible({
    timeout: 30_000,
  });
  const discard = page.getByRole("button", { name: "کنار گذاشتن" });
  if (await discard.isVisible().catch(() => false)) {
    await discard.click();
    await expect(page.getByLabel("فایل xlsx خروجی مخاطبان دیدار")).toBeVisible({
      timeout: 20_000,
    });
  }
  await expect(page.getByLabel("فایل xlsx خروجی مخاطبان دیدار")).toBeVisible({
    timeout: 30_000,
  });

  const parseStart = Date.now();
  await page.locator("#didar-contacts-file").setInputFiles(REAL);
  await expect(page.getByText(/ردیف خوانده شد/)).toBeVisible({ timeout: 180_000 });
  const parseMs = Date.now() - parseStart;
  const parseText = await page.getByText(/ردیف خوانده شد/).innerText();

  const stageStart = Date.now();
  await page.getByRole("button", { name: "ثبت در جدول موقت" }).click();
  await expect(page.getByText("طبقه‌بندی انجام شد")).toBeVisible({ timeout: 15 * 60_000 });
  const stageClassifyMs = Date.now() - stageStart;

  const body = await page.locator("body").innerText();
  const pick = (label: string): number | null => {
    const re = new RegExp(`${label}[:：]?\\s*([۰-۹0-9,]+)`);
    const m = body.match(re);
    if (!m) return null;
    const fa = "۰۱۲۳۴۵۶۷۸۹";
    const n = m[1]
      .replace(/[۰-۹]/g, (ch) => String(fa.indexOf(ch)))
      .replace(/,/g, "");
    return Number(n);
  };

  const result = {
    parse_text: parseText,
    parse_ms: parseMs,
    stage_classify_ms: stageClassifyMs,
    total_ms: Date.now() - t0,
    new: pick("شخص تازه"),
    incomplete: pick("ناقص"),
    conflict: pick("تعارض"),
    committed: false,
  };
  writeFileSync(OUT, JSON.stringify(result, null, 2), "utf8");
  expect(result.new ?? 0).toBeGreaterThan(0);
});
