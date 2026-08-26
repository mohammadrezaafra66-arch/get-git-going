/**
 * Renders the Persian bank-slip fixture used by `e2e/security/og72-receipt-ocr-runs-locally.spec.ts`.
 *
 * WHY CHROMIUM AND NOT PILLOW. Persian is a cursive, right-to-left script: rendering it needs
 * glyph shaping (letters join and change form by position) and bidi reordering. Pillow on this
 * machine has neither — `features.check("raqm")` is false and `arabic_reshaper` / `python-bidi`
 * are absent — so it would draw disconnected letters in reversed order. A vision model failing
 * to read THAT would tell us nothing about whether it can read a real slip. Chromium is already
 * in this project's toolchain and shapes Persian correctly, so it is the honest renderer.
 *
 * The font is the repo's own local Vazirmatn (`public/fonts/vazirmatn/`), not a system font and
 * not a web font — mandatory principle 13 says fonts and critical assets must be local, and it
 * also means the fixture looks like what the app itself renders.
 *
 * The amounts and dates are written in PERSIAN DIGITS on purpose. `docs/ocr/requirements.md`
 * acceptance item 3 requires that "a slip with Persian digits parses to the correct amount", so
 * a fixture using Latin digits would quietly skip the hardest part of the job.
 *
 * Run:  node e2e/fixtures/generate-persian-slip.mjs
 */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const fontPath = path.join(ROOT, "public/fonts/vazirmatn/Vazirmatn-Regular.ttf");
const fontBoldPath = path.join(ROOT, "public/fonts/vazirmatn/Vazirmatn-Bold.ttf");
const font = readFileSync(fontPath).toString("base64");
const fontBold = readFileSync(fontBoldPath).toString("base64");

/** The values the gate asserts on. Kept here so the fixture and its expectations cannot drift. */
export const EXPECTED = {
  amountDigits: "1250000",
  trackingDigits: "987654321",
  dateJalali: "۱۴۰۵/۰۶/۰۴",
  dateDigits: "14050604",
};

const html = `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8">
<style>
  @font-face { font-family: Vazirmatn; font-weight: 400;
               src: url(data:font/ttf;base64,${font}) format('truetype'); }
  @font-face { font-family: Vazirmatn; font-weight: 700;
               src: url(data:font/ttf;base64,${fontBold}) format('truetype'); }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Vazirmatn, sans-serif; background:#fff; width:900px; }
  .slip { border:3px solid #111; }
  .head { background:#0d3b66; color:#fff; padding:18px 26px; }
  .head h1 { font-size:30px; font-weight:700; }
  .head p  { font-size:17px; opacity:.9; margin-top:4px; }
  table { width:100%; border-collapse:collapse; }
  td { padding:16px 26px; font-size:25px; border-bottom:1px solid #e3e3e3; }
  td.k { color:#444; width:40%; }
  td.v { font-weight:700; color:#000; }
  .amt { font-size:34px; }
  .foot { padding:16px 26px; font-size:19px; color:#0a7d32; font-weight:700; }
</style></head>
<body><div class="slip">
  <div class="head"><h1>بانک ملت</h1><p>رسید انتقال وجه - کارت به کارت</p></div>
  <table>
    <tr><td class="k">تاریخ</td><td class="v">${EXPECTED.dateJalali}</td></tr>
    <tr><td class="k">ساعت</td><td class="v">۱۱:۴۲:۰۷</td></tr>
    <tr><td class="k">مبلغ (ریال)</td><td class="v amt">۱,۲۵۰,۰۰۰</td></tr>
    <tr><td class="k">شماره پیگیری</td><td class="v">${EXPECTED.trackingDigits.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])}</td></tr>
    <tr><td class="k">شماره کارت مبدأ</td><td class="v">۶۱۰۴-۳۳۷۸-۲۱۴۵-۹۰۸۷</td></tr>
    <tr><td class="k">نام گیرنده</td><td class="v">شرکت افراکالا</td></tr>
  </table>
  <div class="foot">تراکنش با موفقیت انجام شد</div>
</div></body></html>`;

const out = path.join(ROOT, "e2e/fixtures/sample-persian-slip.png");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 620 } });
await page.setContent(html, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
const el = await page.$(".slip");
await el.screenshot({ path: out });
await browser.close();

writeFileSync(
  path.join(ROOT, "e2e/fixtures/sample-persian-slip.expected.json"),
  JSON.stringify(EXPECTED, null, 2) + "\n",
);
console.log("written", out);
