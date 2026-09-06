/**
 * Wave 6 · X-3 — removing the static permission matrix must not produce a flash of the wrong UI.
 *
 * ## What changed and why this spec exists
 *
 * `src/lib/rbac/roles.ts` used to carry a static `PERMISSIONS` matrix. `hasPermissionEx` read
 * live `role_permissions` and fell back to that matrix whenever the cache had not loaded yet.
 * X-3 deleted the matrix, so there is nothing left to fall back TO: while the table is in
 * flight, `hasPermissionEx` returns `false` for every non-admin.
 *
 * `false` is the safe direction but it is not a true answer, and rendering on it is exactly how
 * a user gets shown a refusal that is then replaced by the page (or a page whose controls pop in
 * a moment later). `AuthProvider` therefore publishes `permissionsLoading`, and `RouteRoleGate`
 * holds on it — the render-time equivalent of the `await` a React render cannot perform.
 *
 * ## Why the permission request is deliberately delayed
 *
 * On a fast LAN the load window is a few milliseconds, so a test that merely navigates and looks
 * would pass whether or not the fix exists — it would be measuring the network, not the code.
 * Each case below stalls the `role_permissions` request for {@link STALL_MS} and then samples the
 * DOM continuously for the whole window. That makes the intermediate state observable and, more
 * importantly, makes the WRONG behaviour observable too: without the fix the verdict resolves
 * during the stall, and these assertions fail.
 *
 * A stall is not an artificial scenario. It is what a slow connection, a cold PostgREST, or a
 * `role_permissions` refetch after an admin edits a role already does on this app.
 *
 * ## What is asserted
 *
 * For three gated routes and two cold sessions:
 *   1. while permissions are in flight the gate shows «در حال بررسی دسترسی…» and NO verdict;
 *   2. the FIRST verdict the user ever sees is the correct one — a denied user never sees page
 *      content first, and a permitted user never sees the refusal first;
 *   3. the settled state is correct.
 *
 * (2) is the row's whole point. A screenshot taken after everything settles proves none of it,
 * so the timeline of observed states is recorded and asserted, not just the final frame.
 *
 * Every session is COLD — a fresh browser context, logged in from scratch, with no storageState
 * and an empty cache — because `beforeLoad` runs only on the server for a cold direct
 * navigation, which is the case `RouteRoleGate` exists to cover.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";

const BASE = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const PASSWORD = process.env.E2E_LAN_TEST_PASSWORD ?? "AfraTest!1404";
const STALL_MS = 2_500;

const CHECKING = '[data-testid="route-gate-checking"]';
const DENIED = '[data-testid="route-gate-denied"]';

/** Gated routes, with the role list each one actually carries in `staticData.gate`. */
const ROUTES = [
  { path: "/accounting/treasury", allowed: ["admin", "manager", "accountant"] },
  { path: "/accounting/dynamic-capital", allowed: ["admin", "accountant"] },
  { path: "/admin/audit", allowed: ["admin", "manager"] },
] as const;

const SESSIONS = [
  { email: "test.viewer@afrakala.local", role: "viewer" },
  { email: "test.accountant@afrakala.local", role: "accountant" },
] as const;

type Sample = "checking" | "denied" | "page";

/**
 * Six cold logins in a row trip GoTrue's per-IP sign-in rate limit, which surfaces as a login
 * that simply never leaves /login. That is an environment limit, not the behaviour under test,
 * so it is retried with backoff rather than allowed to masquerade as a failure of the gate.
 */
async function coldLogin(
  browser: Browser,
  email: string,
): Promise<{ page: Page; close(): Promise<void> }> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
      await page.locator('input[name="email"], input[type="email"]').first().fill(email);
      await page.locator('input[name="password"][type="password"]').fill(PASSWORD);
      await page.getByRole("button", { name: /^ورود$/ }).click();
      await expect(page, `${email}: login should leave /login`).not.toHaveURL(/\/login(?:$|\?)/, {
        timeout: 30_000,
      });
      return { page, close: () => context.close() };
    } catch (err) {
      lastErr = err;
      await context.close();
      if (attempt < 4) await new Promise((r) => setTimeout(r, attempt * 8_000));
    }
  }
  throw lastErr;
}

/**
 * Navigate with `role_permissions` stalled, sampling what the user can actually see the whole
 * time. Returns the ordered list of distinct states observed.
 */
async function timelineFor(
  page: Page,
  route: string,
): Promise<{ seen: Sample[]; firstPageAt: number | null }> {
  await page.route("**/role_permissions*", async (r) => {
    await new Promise((res) => setTimeout(res, STALL_MS));
    await r.continue();
  });

  const seen: Sample[] = [];
  let firstPageAt: number | null = null;
  const record = (s: Sample) => {
    if (s === "page" && firstPageAt === null) firstPageAt = Date.now() - startedAt;
    if (seen[seen.length - 1] !== s) seen.push(s);
  };

  const startedAt = Date.now();
  await page.goto(`${BASE}${route}`, { waitUntil: "commit" });

  const deadline = Date.now() + STALL_MS + 8_000;
  let settled = false;
  while (Date.now() < deadline) {
    const state = await page
      .evaluate(
        ([checking, denied]) => {
          if (document.querySelector(checking)) return "checking";
          if (document.querySelector(denied)) return "denied";
          const t = document.body?.innerText?.trim() ?? "";
          // Only count the page once it has drawn something substantial; an empty shell mid
          // hydration is neither a verdict nor content and must not be recorded as either.
          return t.length > 120 ? "page" : "";
        },
        [CHECKING, DENIED],
      )
      .catch(() => "");
    if (state) record(state as Sample);
    if (seen.length && (seen[seen.length - 1] === "denied" || seen[seen.length - 1] === "page")) {
      // Give it a moment to prove the verdict is stable rather than a transient.
      if (settled) break;
      settled = true;
    }
    await page.waitForTimeout(100);
  }
  await page.unroute("**/role_permissions*");
  return { seen, firstPageAt };
}

test.describe.configure({ mode: "serial" });
test.setTimeout(3 * 60_000);

for (const session of SESSIONS) {
  for (const route of ROUTES) {
    const permitted = (route.allowed as readonly string[]).includes(session.role);
    const label = permitted ? "sees the page" : "is refused";

    test(`cold ${session.role} at ${route.path} ${label} — with no flash of the wrong one`, async ({
      browser,
    }) => {
      const { page, close } = await coldLogin(browser, session.email);
      try {
        const { seen, firstPageAt } = await timelineFor(page, route.path);

        // 1 · the honest loading state is actually reached and is visible to the user
        expect(
          seen,
          `${route.path}: the gate must hold while role_permissions is in flight, not guess`,
        ).toContain("checking");

        // 2 · THE POINT OF THIS ROW — the first verdict is the right one
        const verdicts = seen.filter((s) => s !== "checking");
        const expectedVerdict: Sample = permitted ? "page" : "denied";
        expect(
          verdicts[0],
          `${route.path} as ${session.role}: the FIRST thing the user saw after the spinner was ` +
            `"${verdicts[0]}", expected "${expectedVerdict}". A wrong verdict that is corrected ` +
            `a moment later is the flash this row exists to remove.`,
        ).toBe(expectedVerdict);

        // 3 · and it never flips afterwards
        expect(
          new Set(verdicts).size,
          `${route.path} as ${session.role}: the verdict changed after it was first shown ` +
            `(${verdicts.join(" -> ")})`,
        ).toBe(1);

        // 4 · THE ASSERTION THAT DISCRIMINATES THE FIX.
        //
        //     The gates on these routes are `anyRole` and never read `role_permissions`, so the
        //     VERDICT above is reached from roles alone and would look identical with or without
        //     X-3's change. What X-3 actually changes is WHEN the page is allowed to draw: the
        //     page beneath consults `hasPermissionEx`, so it must not render until the table has
        //     loaded, or its controls render from an unloaded cache and then correct themselves.
        //
        //     `role_permissions` is stalled for STALL_MS, so a permitted page that appears before
        //     that has rendered on an unloaded cache. Measured on this build with the
        //     `permissionsLoading` hold removed from RouteRoleGate, the page appeared during the
        //     stall and this assertion fails; with it, the page waits.
        if (permitted) {
          expect(
            firstPageAt,
            `${route.path} as ${session.role}: the page must not draw before role_permissions ` +
              `has loaded — it rendered ${firstPageAt}ms in, inside the ${STALL_MS}ms stall, so ` +
              `its permission-dependent controls were drawn from an unloaded cache`,
          ).toBeGreaterThanOrEqual(STALL_MS);
          await expect(page.locator(DENIED)).toHaveCount(0);
        } else {
          // The denial path does not depend on permissions and is unchanged by X-3; asserted
          // here as a regression guard, not as evidence for the row.
          await expect(page.locator(DENIED)).toHaveCount(1);
        }
      } finally {
        await close();
      }
    });
  }
}
