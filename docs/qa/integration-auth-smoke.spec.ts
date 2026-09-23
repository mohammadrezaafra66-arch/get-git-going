/**
 * Integration Phase 5 auth smoke — cold session + warm roles on key routes.
 * Prefix markers: none (read-only navigation).
 */
import { expect, test, type Browser } from "@playwright/test";
import { mintJwt } from "../../e2e/helpers/pgrest";
import { authStorageKey, storageStateForRole, type TestRole } from "../../e2e/helpers/role-session";

const APP = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPA = "http://192.168.170.8:9000";

const ROUTES = [
  "/dashboard",
  "/sales/quotes",
  "/pricing/my-workbench",
  "/collaboration",
  "/messages",
  "/sales",
];

const ROLES: TestRole[] = ["admin", "manager", "sales", "accountant"];

test.describe("integration auth smoke", () => {
  test.setTimeout(180_000);

  test("cold session redirects to login", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    for (const route of ROUTES) {
      await page.goto(`${APP}${route}`, { waitUntil: "domcontentloaded" });
      await expect.poll(() => page.url(), { timeout: 20_000 }).toMatch(/\/login(?:$|\?)/);
    }
    await ctx.close();
  });

  for (const role of ROLES) {
    test(`warm ${role} opens guarded routes without login bounce`, async ({ browser }) => {
      const ctx = await browser.newContext({
        storageState: storageStateForRole(role, APP, SUPA),
        locale: "fa-IR",
        baseURL: APP,
      });
      const page = await ctx.newPage();
      for (const route of ROUTES) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await expect(page, `role=${role} route=${route}`).not.toHaveURL(/\/login(?:$|\?)/, {
          timeout: 25_000,
        });
        // No redirect loop: URL should stabilize on the target or unauthorized, not thrash
        const url = page.url();
        expect(url.includes("/login")).toBe(false);
        const body = await page.locator("body").innerText();
        expect(body.length, `empty body ${role} ${route}`).toBeGreaterThan(20);
      }
      await ctx.close();
    });
  }
});
