import { test, expect } from "@playwright/test";

import { readAccountingRoutes } from "./m6-gate-coverage";

/**
 * M6 / OG-24 — THE assertion gate for this mission. One gate, and it is a test rather than a
 * migration because this mission touches no schema object.
 *
 * It must fail if EITHER fail-open path returns:
 *
 *   SSR path        — a `sales` full page load reaching an accounting page.
 *   roles-loading   — any page rendering before the roles are known.
 *
 * and it must equally fail if the fix over-reaches: `admin` and `accountant` bounced to
 * `/login`, or shown a denial, on a cold load.
 *
 * ## Repaired after review round 1
 *
 * The first version hardcoded thirteen paths, and the reviewer defeated it in the obvious way:
 * a route that calls a guard but carries no `staticData` is fail-open, and every assertion
 * stayed green. Demonstrated on routes that already exist — `sales` cold-loads `/admin/audit`
 * and `/admin/documents` in full. The route list is now DERIVED from `src/routes/`, and a
 * static check asserts that every guarded accounting route carries `staticData` whose role list
 * equals its own `requireAnyRole` argument. That second check also covers the `manager` and
 * `viewer` dimension, which no behavioural test on this server can reach: both users are
 * `status=rejected` and the `_app` layout redirects them before any guard runs (OG-36).
 *
 * The per-role cold-load loops were also split into one test per route. As a single 13-load
 * test they ran at 55–100% of the 45s budget and the reviewer saw them red twice on a cold
 * server — a gate that is red for timing reasons teaches people to ignore it.
 *
 * Attacked before being trusted: with the RouteRoleGate wiring removed from `_app`, the `sales`
 * full-load assertions fail. A gate that has never been red is not a gate.
 *
 * Nothing here submits a document. No row is created by this file.
 */

const ROUTES = readAccountingRoutes();
const GUARDED = ROUTES.filter((r) => r.guarded && r.url).map((r) => r.url as string);

const DENIED = '[data-testid="route-gate-denied"], [data-testid="create-denied"]';
const CHECKING = '[data-testid="route-gate-checking"], [data-testid="create-roles-checking"]';

test.describe("M6 — every guarded accounting route is actually covered", () => {
  test("the derived route list is not empty", () => {
    // Guards the guard: if the glob or the filename convention changes, every assertion below
    // would pass vacuously against nothing.
    expect(ROUTES.length, "no _app.accounting.* route files were found").toBeGreaterThanOrEqual(
      14,
    );
    expect(GUARDED.length, "no guarded accounting routes were derived").toBeGreaterThanOrEqual(13);
  });

  for (const r of ROUTES) {
    test(`${r.file} carries a staticData gate matching its own guard`, () => {
      if (!r.guarded) return; // an unguarded accounting route needs no gate
      expect(
        r.staticRoles,
        `${r.file} calls a route guard but carries no staticData.gate — RouteRoleGate cannot see it and this route is fail-open on a full page load`,
      ).not.toBeNull();
      expect(
        r.guardRoles,
        `${r.file} has staticData but its requireAnyRole call could not be read`,
      ).not.toBeNull();
      expect(
        [...(r.staticRoles as string[])].sort(),
        `${r.file}: staticData.gate.allowed disagrees with requireAnyRole — one of the two silently widens or narrows access`,
      ).toEqual([...(r.guardRoles as string[])].sort());
    });
  }
});

test.describe("M6 — sales is denied on a FULL PAGE LOAD (the SSR fail-open)", () => {
  test.use({ storageState: "e2e/auth/salesperson-a.storage.json" });

  for (const route of GUARDED) {
    test(`sales cold-loads ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});

      const path = new URL(page.url()).pathname;
      // A redirect to /unauthorized is also a correct denial; what must never happen is the
      // page rendering.
      if (path === "/unauthorized") return;

      await expect(page.locator(DENIED).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.locator(DENIED).first()).toContainText("دسترسی ندارید");
    });
  }
});

test.describe("M6 — sales is denied on CLIENT-SIDE NAVIGATION (must not regress)", () => {
  test.use({ storageState: "e2e/auth/salesperson-a.storage.json" });

  test("sales navigates in-app to each guarded route", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    for (const route of GUARDED) {
      await page.evaluate((to) => {
        window.history.pushState({}, "", to);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }, route);
      await page.waitForTimeout(1200);
      const path = new URL(page.url()).pathname;
      const denied = await page.locator(DENIED).first().isVisible().catch(() => false);
      expect(
        path === "/unauthorized" || denied,
        `${route}: sales saw neither /unauthorized nor a denial`,
      ).toBe(true);
    }
  });
});

for (const who of [
  { name: "admin", file: "e2e/auth/admin.storage.json" },
  { name: "accountant", file: "e2e/auth/accountant.storage.json" },
]) {
  test.describe(`M6 — ${who.name} is NOT locked out on a full page load`, () => {
    test.use({ storageState: who.file });

    for (const route of GUARDED) {
      test(`${who.name} cold-loads ${route}`, async ({ page }) => {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        const path = new URL(page.url()).pathname;

        // The constraint that killed the server-side fix. If this ever trips, the remedy has
        // reintroduced the phase-6.7 regression.
        expect(path, `${route}: ${who.name} was bounced to /login`).not.toBe("/login");
        expect(path, `${route}: ${who.name} was sent to /unauthorized`).not.toBe("/unauthorized");

        const denied = await page.locator(DENIED).first().isVisible().catch(() => false);
        expect(denied, `${route}: ${who.name} was shown a denial`).toBe(false);

        const stuck = await page.locator(CHECKING).first().isVisible().catch(() => false);
        expect(stuck, `${route}: ${who.name} stuck on the access-check state`).toBe(false);
      });
    }
  });
}

test.describe("M6 — while roles load, the user waits and is NOT denied", () => {
  test.use({ storageState: "e2e/auth/accountant.storage.json" });

  test("accountant sees the checking state, never a denial, while roles are in flight", async ({
    page,
  }) => {
    await page.route("**/rest/v1/user_roles*", async (route) => {
      await new Promise((r) => setTimeout(r, 9000));
      await route.continue();
    });

    await page.goto("/accounting/treasury", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500); // observe DURING the stall

    const denied = await page.locator(DENIED).first().isVisible().catch(() => false);
    expect(denied, "a denial was shown while the roles were still loading").toBe(false);

    const bodyText = ((await page.locator("body").innerText().catch(() => "")) || "").replace(
      /\s+/g,
      " ",
    );
    expect(
      bodyText.includes("در حال بررسی دسترسی") || bodyText.includes("در حال بررسی جلسه کاربری"),
      "no loading state was shown while the roles were still loading",
    ).toBe(true);
  });
});
