/**
 * Cold sessions for the group-V close-out proofs.
 *
 * "Cold" here has a precise meaning that this whole mission turns on: a browser
 * context created with NO `storageState`, no cookies, that then logs in from the
 * /login form like a person would. A stored `*.storage.json` is a WARM session —
 * the app's `beforeLoad` guards run only on the server and never see a
 * localStorage session, so a warm context skips exactly the window under test.
 *
 * `coldRefusalContext` goes one step further and does not log in at all for the
 * navigation being judged: it logs in, then navigates directly to the protected
 * URL as a first navigation of that URL, which is the cold-direct-navigation case.
 */
import { type Browser, type BrowserContext, type Page, expect } from "@playwright/test";

export const PASSWORD = "AfraTest!1404";

export const EMAIL = {
  admin: "test.admin@afrakala.local",
  manager: "test.manager@afrakala.local",
  sales: "test.sales@afrakala.local",
  accountant: "test.accountant@afrakala.local",
  viewer: "test.viewer@afrakala.local",
} as const;

export type Role = keyof typeof EMAIL;

/** A brand-new context with nothing carried over. */
export async function coldContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    storageState: { cookies: [], origins: [] },
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    viewport: { width: 1440, height: 900 },
  });
}

/** Log a role in from zero on a page that has never held a session. */
export async function coldLogin(page: Page, role: Role): Promise<void> {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const email = page.locator("#login-email");
  await expect(email).toBeVisible();
  // The submit button is disabled until the island hydrates; waiting for that is
  // what stops a click landing on a dead form.
  const submit = page.getByRole("button", { name: "ورود", exact: true });
  await expect(submit).toBeEnabled({ timeout: 30_000 });
  await email.fill(EMAIL[role]);
  await page.locator("#login-password").fill(PASSWORD);
  await submit.click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 });
}
