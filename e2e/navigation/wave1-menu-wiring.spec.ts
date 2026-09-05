/**
 * C-1..C-4, C-7 (unwired wave 1) — the five routes wired into the menu in this change.
 *
 * Per route it asserts three separate things:
 *   1. the link is really in the sidebar for the role that should have it — found by
 *      clicking the primary-module button and then the link, not by re-deriving
 *      visibility inside the test,
 *   2. clicking that link lands on the route and the page renders,
 *   3. a role that must NOT have it is measurably refused: the link is absent from the
 *      sidebar AND a direct navigation ends on /unauthorized.
 *
 * Run:
 *   E2E_BASE_URL=http://localhost:8080 npx playwright test \
 *     e2e/navigation/wave1-menu-wiring.spec.ts --workers=1 --reporter=line
 */
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:8080";

/**
 * Sessions. e2e/auth/*.storage.json are bound to the :3100 origin and their access
 * tokens expired on 2026-09-03, and the documented shared password (AfraTest!1404) no
 * longer works — measured: POST /auth/v1/token?grant_type=password returns 400
 * «ایمیل یا رمز عبور اشتباه است.» for test.admin. So each role's session is minted for
 * the run through the GoTrue admin API (generate_link -> verify), which sets no password
 * and changes no user row. See scratchpad/mint.mjs; point E2E_SESSION_DIR at its output.
 */
const SESSION_DIR =
  process.env.E2E_SESSION_DIR ?? path.resolve(process.cwd(), "../scratchpad/sessions");

const ACCOUNTS = {
  admin: "test.admin",
  sales: "test.sales",
  viewer: "test.viewer",
} as const;

const sessionFor = (role: keyof typeof ACCOUNTS) => path.join(SESSION_DIR, `${ACCOUNTS[role]}.json`);

/** The five routes this change wires in. */
const WIRED = [
  { route: "/api-keys", label: "حاکمیت کلیدهای API", module: "مدیریت", adminOnly: true },
  { route: "/presence", label: "گزارش حضور و غیاب", module: "مدیریت", adminOnly: true },
  { route: "/admin/system-health", label: "سلامت داده‌ها", module: "مدیریت", adminOnly: true },
  {
    route: "/operations/purchase-advisor",
    label: "دستیار هوشمند خرید",
    module: "کالا",
    adminOnly: true,
  },
  { route: "/gamification/achievements", label: "نشان‌ها", module: "تحلیل", adminOnly: false },
] as const;

/**
 * Vite dev-server only. @tanstack/start-plugin-core 1.167 emits the client entry as
 *   import("/@id/virtual:tanstack-start-client-entry")
 * but registers the module under Vite's null-byte-encoded id, served at
 *   /@id/__x00__virtual:tanstack-start-client-entry
 * Measured on this checkout: the first URL returns 404, the second 200, so the page never
 * hydrates. That is a dev-mode toolchain bug, unrelated to anything this change touches
 * (the container build is unaffected). Rewrite that one request; nothing else is touched.
 */
async function fixDevClientEntry(page: Page) {
  if (!BASE.includes("localhost:8080")) return;
  await page.route("**/@id/virtual:tanstack-start-client-entry", async (route) => {
    const fixed = route.request().url().replace("/@id/virtual:", "/@id/__x00__virtual:");
    await route.fulfill({ response: await route.fetch({ url: fixed }) });
  });
}

/** Land on the dashboard with the session installed, and wait for RBAC to resolve. */
async function enterApp(page: Page) {
  await fixDevClientEntry(page);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "داشبورد", exact: true })
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });
}

function sidebarLink(page: Page, label: string) {
  return page.locator("aside, [data-sidebar]").getByRole("link", { name: label, exact: true });
}

test.describe("wave1 menu wiring — admin", () => {
  test.use({ storageState: sessionFor("admin") });

  test("admin reaches all five routes from the sidebar", async ({ page }) => {
    test.setTimeout(240_000);
    await enterApp(page);

    for (const item of WIRED) {
      await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: item.module, exact: true }).first().click();

      const link = sidebarLink(page, item.label).first();
      await expect(link, `sidebar link «${item.label}» for admin`).toBeVisible({ timeout: 30_000 });

      await link.click();
      await page.waitForURL(`**${item.route}`, { timeout: 30_000 });
      expect(new URL(page.url()).pathname).toBe(item.route);
      await expect(page.getByText(item.label).first()).toBeVisible({ timeout: 30_000 });
    }
  });
});

for (const role of ["sales", "viewer"] as const) {
  test.describe(`wave1 menu wiring — ${role}`, () => {
    test.use({ storageState: sessionFor(role) });

    test(`${role} is refused the admin-only routes and keeps the shared one`, async ({ page }) => {
      test.setTimeout(240_000);
      await enterApp(page);

      for (const item of WIRED) {
        // (a) menu: open the module that would carry the link, then assert presence.
        await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
        const moduleButton = page.getByRole("button", { name: item.module, exact: true }).first();
        if (await moduleButton.isEnabled()) {
          await moduleButton.click();
          await page.waitForTimeout(500);
        }
        const linkCount = await sidebarLink(page, item.label).count();
        expect(linkCount > 0, `${role} sees sidebar link «${item.label}»`).toBe(!item.adminOnly);

        // (b) guard: navigate directly, cold, and read what actually happened.
        //
        // A refusal here has two legitimate shapes and the test accepts either, because
        // both are refusals and which one fires depends on timing:
        //   - beforeLoad wins the race  -> redirect to /unauthorized
        //   - it does not (cold load)   -> RouteRoleGate renders `route-gate-denied`
        // What is NOT accepted is the page rendering. Measured on this branch before the
        // staticData gates were added: test.viewer opened /api-keys cold and saw the full
        // «کلید جدید» screen, because requireAdmin returns without throwing while roles load.
        await page.goto(`${BASE}${item.route}`, { waitUntil: "domcontentloaded" });
        if (item.adminOnly) {
          await expect
            .poll(
              async () =>
                new URL(page.url()).pathname === "/unauthorized" ||
                (await page.getByTestId("route-gate-denied").count()) > 0,
              {
                timeout: 30_000,
                message: `${role} must be refused ${item.route}`,
              },
            )
            .toBe(true);
        } else {
          await page.waitForTimeout(4000);
          expect(new URL(page.url()).pathname, `${role} reaches ${item.route}`).toBe(item.route);
        }
      }
    });
  });
}
