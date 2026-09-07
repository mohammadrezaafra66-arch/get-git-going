/**
 * V-1 — /admin/call-extensions, opened in a real browser for the first time.
 *
 * Wave 6 proved `call_log_extensions` at the database layer. This drives the screen:
 * an admin adds extension 101, names it «آرمین», saves, and RELOADS. The reload is the
 * whole point — it separates "the input accepted my text" from "the value reached the
 * database", which is the only thing that matters here.
 *
 * The second test is the refusal, and it is taken from a COLD context: a fresh browser
 * with no storageState, logging in from /login. `beforeLoad` runs only on the server and
 * never sees a browser session, so a stored session covers exactly the window under test.
 */
import { test, expect } from "@playwright/test";
import { coldContext, coldLogin } from "./cold";
import { armLeakDetector, readLeaks } from "./leak";

const ART = ".artifacts";
const EXT = "101";
const NAME = "آرمین";

/** Text that only the protected page renders. */
const PROTECTED = [
  "افزودن داخلی تازه",
  "هر شمارهٔ داخلی متعلق به کدام همکار است",
  "این فهرست را خودتان پر می‌کنید",
];

test("V-1 admin names an extension and the name survives a reload", async ({ browser }) => {
  const ctx = await coldContext(browser);
  const page = await ctx.newPage();
  await coldLogin(page, "admin");

  await page.goto("/admin/call-extensions", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "داخلی‌های تلفن" })).toBeVisible();
  await expect(page.getByTestId("call-extensions-denied")).toHaveCount(0);
  await page.screenshot({ path: `${ART}/v1-admin-page-empty.png`, fullPage: true });

  // Add the extension with NO label, so that naming it is a separate, observable save.
  const row = page.getByRole("row").filter({ hasText: EXT });
  if ((await row.count()) === 0) {
    await page.getByPlaceholder("شمارهٔ داخلی").fill(EXT);
    await page.getByRole("button", { name: "افزودن", exact: true }).click();
    await expect(page.getByText("داخلی ثبت شد.")).toBeVisible();
  }

  const target = page.getByRole("row").filter({ hasText: EXT });
  await expect(target).toHaveCount(1);
  await target.getByPlaceholder("بدون عنوان").fill(NAME);
  await target.getByRole("button", { name: "ذخیره" }).click();
  await expect(page.getByText(`داخلی ${EXT} ذخیره شد.`)).toBeVisible();
  await page.screenshot({ path: `${ART}/v1-admin-saved-before-reload.png`, fullPage: true });

  // THE PROOF. Everything above could be client state; only this survives a fresh load.
  await page.reload({ waitUntil: "domcontentloaded" });
  const reloaded = page.getByRole("row").filter({ hasText: EXT });
  await expect(reloaded).toHaveCount(1);
  await expect(reloaded.getByPlaceholder("بدون عنوان")).toHaveValue(NAME);
  await page.screenshot({ path: `${ART}/v1-admin-named-extension.png`, fullPage: true });

  await ctx.close();
});

test("V-1 viewer is refused from a cold context and the page never paints", async ({ browser }) => {
  const ctx = await coldContext(browser);
  const page = await ctx.newPage();
  await armLeakDetector(page, PROTECTED);
  await coldLogin(page, "viewer");

  // A DIRECT navigation, which is the case where `beforeLoad` ran only on the server.
  await page.goto("/admin/call-extensions", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("route-gate-denied")).toBeVisible();
  await page.waitForTimeout(4000); // give any late render a chance to betray itself
  await page.screenshot({ path: `${ART}/v1-viewer-cold-refused.png`, fullPage: true });

  const leaks = await readLeaks(page);
  expect(leaks, `protected content painted: ${JSON.stringify(leaks)}`).toEqual([]);
  await expect(page.getByRole("heading", { name: "داخلی‌های تلفن" })).toHaveCount(0);
  // Observed, not asserted: whether the menu entry itself is visible to a viewer is a
  // separate question from whether the page rendered, and this row only judges the page.
  const navLinks = await page.getByRole("link", { name: "داخلی‌های تلفن" }).count();
  console.log("V-1 refusal url:", page.url(), "| sidebar links to the page:", navLinks);
  await ctx.close();
});
