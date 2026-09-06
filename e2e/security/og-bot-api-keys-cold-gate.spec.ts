/**
 * /bot-api-keys must refuse a cold `viewer` and a cold `sales` session.
 *
 * ## What was open
 *
 * Measured 2026-09-06 on the deployed build: a COLD `viewer` and a COLD `sales` session both
 * saw the full Bot API Keys management page — heading, «مستندات و تست API», «گزارش استفاده»,
 * and the «کلید جدید» (new key) button. No key data leaked, but only because the table happened
 * to be empty. `role_permissions` is unambiguous that this is not intended access:
 *
 *     role_name           | can_view
 *     admin/manager/site  | t
 *     accountant/sales/viewer/purchase_specialist | f
 *
 * ## Why the server guard did not stop it
 *
 * `_app.bot-api-keys.tsx` calls `requirePermission("bot-api-keys","view")` in `beforeLoad`.
 * That guard returns WITHOUT throwing during SSR and while roles load, and on a cold load
 * `beforeLoad` runs only on the server — never in the browser. So the exposure was permanent
 * for the page view, not a brief loading-window race. The fix is the `staticData.gate` that
 * `RouteRoleGate` reads on the client.
 *
 * ## Why the test insists on a COLD session
 *
 * A warm session masks this completely: client-side navigation was always correct. The bug only
 * appears on a full document load, so every case below builds a FRESH context with no
 * `storageState`, asserts browser storage is empty before logging in, and then does a full
 * `page.goto` rather than an in-app link click.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = "AfraTest!1404";
const ROUTES = ["/bot-api-keys", "/bot-api-keys/"] as const;

/** A context with no stored session at all. Never pass storageState here — that is the bug's blind spot. */
async function coldLogin(browser: Browser, email: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ storageState: undefined, locale: "fa-IR" });
  const page = await context.newPage();

  await page.goto("/login", { waitUntil: "domcontentloaded" });

  // Prove the session really is cold before we log in, so a pass cannot come from a warm cache.
  //
  // This asserts "no stored SESSION", not "no stored anything". An earlier draft asserted the
  // storage was entirely empty and was flaky: measured 4/4 runs, loading /login deterministically
  // writes `afrakala:build-tag` to localStorage and `afrakala:auth-diagnostics` to sessionStorage
  // a moment after domcontentloaded. Neither is a session, so the strict form was racing against
  // two irrelevant keys. Supabase stores the session under a key containing `auth-token`; that is
  // the only thing whose absence makes this test's "cold" claim true.
  const authKeys = await page.evaluate(() =>
    [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((k) =>
      k.includes("auth-token"),
    ),
  );
  expect(authKeys, `${email}: a session was already stored, so this run would not be cold`).toEqual(
    [],
  );

  await page.locator('input[name="email"][type="email"]').waitFor({ state: "visible" });
  await page.locator('input[name="email"][type="email"]').fill(email);
  await page.locator('input[name="password"][type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^ورود$/ }).click();
  await expect(page, `${email}: login should leave /login`).not.toHaveURL(/\/login(?:$|\?)/, {
    timeout: 30_000,
  });

  return { page, close: () => context.close() };
}

/** A full document load — the only path that reproduces the defect. */
async function coldVisit(page: Page, route: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  return {
    denied: await page.getByTestId("route-gate-denied").count(),
    checking: await page.getByTestId("route-gate-checking").count(),
    newKeyButton: await page.getByRole("button", { name: /کلید جدید/ }).count(),
  };
}

for (const email of ["test.viewer@afrakala.local", "test.sales@afrakala.local"]) {
  for (const route of ROUTES) {
    test(`⛔ cold ${email.split("@")[0]} is refused at ${route}`, async ({ browser }) => {
      const { page, close } = await coldLogin(browser, email);
      try {
        const seen = await coldVisit(page, route);

        expect(
          seen.newKeyButton,
          `${email} saw the «کلید جدید» button at ${route} — the Bot API Keys management page rendered ` +
            "for a role whose role_permissions row says can_view = false.",
        ).toBe(0);

        expect(
          seen.denied + seen.checking,
          `${email} at ${route} rendered neither a refusal nor the checking state. The route must ` +
            "fail closed; rendering the page for an unauthorized role is the defect this test exists for.",
        ).toBeGreaterThan(0);
      } finally {
        await close();
      }
    });
  }
}

test("the open half still holds — a cold admin reaches /bot-api-keys", async ({ browser }) => {
  // Without this, revoking the route from everyone would pass every assertion above.
  const { page, close } = await coldLogin(browser, "test.admin@afrakala.local");
  try {
    const seen = await coldVisit(page, "/bot-api-keys");
    expect(seen.denied, "admin must NOT be refused at /bot-api-keys").toBe(0);
    expect(seen.newKeyButton, "admin should still reach the «کلید جدید» button").toBeGreaterThan(0);
  } finally {
    await close();
  }
});
