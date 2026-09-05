/**
 * Wave 1 / agent C — the five routes that were wired into the menu (C-1..C-4, C-7).
 *
 * Two things are proved here, and they are separate claims:
 *
 *   1. The page RENDERS for a role that is allowed to see it. A route can carry a
 *      registry seed and a `paths[]` entry and still render nothing.
 *   2. The page is REFUSED for a role that is not. This is the half that matters,
 *      because menu visibility and the route guard are decided by different code:
 *      `ROLE_ALLOWLIST_BY_ROUTE` only filters the sidebar, while `RouteRoleGate`
 *      (`src/components/layout/RouteRoleGate.tsx:143-150`) is what actually blocks.
 *      `has_dynamic_permission` additionally fails OPEN for a module with no
 *      `role_permissions` rows, so "it is not in their menu" is not evidence of
 *      anything. Only the guard's own refusal is.
 *
 * Refusal is observed as `data-testid="route-gate-denied"`. The spec deliberately
 * also asserts the page's own heading is ABSENT, so a gate that renders its denial
 * banner ABOVE a page that still mounted cannot pass.
 *
 * Sessions are minted locally by `e2e/helpers/role-session.ts` — see the note there
 * on why the committed storage states could not be used.
 */
import { test, expect, type Page } from "@playwright/test";
import { lanEnv } from "../helpers/pgrest";
import { storageStateForRole, type TestRole } from "../helpers/role-session";

const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;

/** The route table under test. `heading` is the page's own PageHeader title. */
const ROUTES = [
  {
    id: "C-1",
    path: "/api-keys",
    heading: "حاکمیت کلیدهای API",
    // A page in the SAME primary module, so the sidebar already lists this route's
    // group when we start. `itemsForModule()` renders only the active module.
    siblingInModule: "/bot-api-keys",
    allowed: ["admin"] as TestRole[],
    denied: ["sales", "viewer"] as TestRole[],
  },
  {
    id: "C-2",
    path: "/presence",
    heading: "گزارش حضور و غیاب",
    siblingInModule: "/bot-api-keys",
    allowed: ["admin"] as TestRole[],
    denied: ["sales", "viewer"] as TestRole[],
  },
  {
    id: "C-3",
    path: "/operations/purchase-advisor",
    heading: "دستیار هوشمند خرید",
    siblingInModule: "/purchase",
    allowed: ["admin", "manager"] as TestRole[],
    denied: ["sales", "viewer"] as TestRole[],
  },
  {
    id: "C-4",
    path: "/gamification/achievements",
    heading: "نشان‌ها",
    siblingInModule: "/gamification/league",
    allowed: ["admin", "viewer"] as TestRole[],
    denied: [] as TestRole[],
  },
  {
    id: "C-7",
    path: "/admin/system-health",
    heading: "سلامت داده‌ها",
    siblingInModule: "/bot-api-keys",
    allowed: ["admin"] as TestRole[],
    denied: ["sales", "viewer"] as TestRole[],
  },
];

/** Wait for the gate to stop saying "checking", so we never assert on a half-decided page. */
async function settle(page: Page) {
  await expect(page.getByTestId("route-gate-checking")).toHaveCount(0, { timeout: 20_000 });
}

async function openAs(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await settle(page);
}

/**
 * The page's own PageHeader title. Several of these routes also carry an `sr-only`
 * <h1> with the same text (e.g. `_app.api-keys.tsx:275`), so the accessible-name
 * lookup legitimately matches twice; `.last()` is the visible PageHeader one.
 */
function pageHeading(page: Page, name: string) {
  return page.getByRole("heading", { name }).last();
}

for (const route of ROUTES) {
  for (const role of route.allowed) {
    test(`${route.id} ${route.path} renders for ${role}`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({
        storageState: storageStateForRole(role, baseURL!, SUPABASE_URL),
      });
      const page = await context.newPage();
      await openAs(page, route.path);

      await expect(page.getByTestId("route-gate-denied")).toHaveCount(0);
      await expect(pageHeading(page, route.heading)).toBeVisible({ timeout: 20_000 });
      expect(new URL(page.url()).pathname).toBe(route.path);
      await context.close();
    });
  }

  for (const role of route.denied) {
    test(`${route.id} ${route.path} is REFUSED for ${role}`, async ({ browser, baseURL }) => {
      const context = await browser.newContext({
        storageState: storageStateForRole(role, baseURL!, SUPABASE_URL),
      });
      const page = await context.newPage();
      await openAs(page, route.path);

      // The guard refused...
      await expect(page.getByTestId("route-gate-denied")).toBeVisible({ timeout: 20_000 });
      // ...and the page behind it did not render.
      await expect(page.getByRole("heading", { name: route.heading })).toHaveCount(0);
      await context.close();
    });
  }
}

/**
 * Menu wiring, proved by CLICKING rather than by reading the source.
 *
 * A route needs BOTH a `registry.ts` seed and an exact entry in its module's
 * `paths[]` — `itemsForModule()` matches exactly, not by prefix — so a route can
 * be perfectly implemented and still be unreachable. The sidebar renders only the
 * ACTIVE module's items (measured: on `/` none of the five appear; on `/api-keys`
 * the three admin ones do), so each test starts on a sibling page in the same
 * module and then clicks the link the menu offers.
 */
for (const route of ROUTES) {
  test(`${route.id} ${route.path} is reachable by clicking it in the sidebar`, async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      storageState: storageStateForRole("admin", baseURL!, SUPABASE_URL),
    });
    const page = await context.newPage();
    await openAs(page, route.siblingInModule);

    const link = page.locator(`a[href="${route.path}"]`).first();
    await expect(link, `no sidebar link to ${route.path} from ${route.siblingInModule}`).toBeVisible(
      { timeout: 20_000 },
    );
    await link.click();

    await expect(page).toHaveURL(new RegExp(`${route.path.replace(/\//g, "\\/")}$`));
    await settle(page);
    await expect(pageHeading(page, route.heading)).toBeVisible({ timeout: 20_000 });

    await context.close();
  });
}
