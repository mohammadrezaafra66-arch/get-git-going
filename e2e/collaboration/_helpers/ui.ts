import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { APP_URL, type CollabRole } from "./constants";
import { storageFor, assertNoProdUrl } from "./client";

assertNoProdUrl(APP_URL);

export async function contextForRole(
  browser: Browser,
  role: CollabRole,
): Promise<BrowserContext> {
  return browser.newContext({
    storageState: storageFor(role),
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    baseURL: APP_URL,
  });
}

export async function pageForRole(browser: Browser, role: CollabRole): Promise<Page> {
  const ctx = await contextForRole(browser, role);
  return ctx.newPage();
}

export async function gotoAuthed(page: Page, route: string): Promise<void> {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(page).not.toHaveURL(/\/login(?:$|\?)/, { timeout: 20_000 });
}

export async function expectRedirectToLogin(page: Page, route: string): Promise<void> {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/login(?:$|\?)/, { timeout: 15_000 });
}

export function persianDigitRegex(n: number): RegExp {
  const map = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  const fa = String(n).replace(/[0-9]/g, (d) => map[Number(d)]);
  return new RegExp(fa);
}
