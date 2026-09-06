/**
 * Security wave 2 / B-1 — the browser half of the tier-1 route gates.
 *
 * `s5-guarded-admin-routes-carry-a-client-gate.spec.ts` proves the gate DATA is present on every
 * tier-1 route. It cannot prove the data does anything. This spec drives a real browser and
 * proves the refusal, on the one path where the defect actually appears.
 *
 * ## Why every case here builds a COLD session
 *
 * A warm session masks the bug completely: client-side navigation was always correct, and is now
 * correct for a second reason as well (`settleRoles()` awaits the role load). What remains open
 * is the SSR pass. `resolveAuthWithRetry()` returns null when `typeof window === "undefined"`
 * (src/lib/rbac/route-guards.ts:15) and each guard then returns `{ user: null, roles: [] }`
 * without refusing — it cannot do otherwise, because the Supabase session lives in `localStorage`
 * and the server cannot read it. On a cold direct navigation `beforeLoad` runs ONLY on the
 * server, so for that page view the guard never refuses at all and the exposure is permanent
 * rather than a loading-window race.
 *
 * So: a fresh context with **no `storageState`**, an assertion that no session is stored before
 * the login, and a full `page.goto` rather than an in-app link click. Passing `storageState` here
 * would test the one path that never had the bug. (Pattern taken from
 * `og-bot-api-keys-cold-gate.spec.ts:35-37`.)
 *
 * ## Why these five routes
 *
 * They cover all three guard kinds, and each one is a route where BOTH `viewer` and `sales` are
 * outside the live authority — so a single matrix proves both roles at once:
 *
 *   /sales/credit-rules        requireAnyRole(["admin","accountant"])       the wave-2 halt route
 *   /admin/penalties           requireAnyRole(["admin","manager"])          HR records on named staff
 *   /roles                     requireAdmin()                              assigns and revokes roles
 *   /persons/create            requirePermission("persons","create")       live = admin, manager
 *   /products/regenerate-names requirePermission("products","update")      live = admin, manager, accountant
 *
 * The last two are the ones that matter most for this wave's trap: `requirePermission` routes take
 * their `allowed` array from the LIVE `role_permissions` table, and a gate mis-copied from
 * `src/lib/rbac/roles.ts` would be the wrong list. `/products/regenerate-names` is exactly such a
 * case — live `products.can_update` includes `accountant` and the static table does not.
 *
 * ## The open half is not optional
 *
 * Refusing everybody would satisfy every assertion above. Two cases therefore prove the gates
 * still ADMIT: a cold `admin` reaches all five, and a cold `accountant` — a role the live table
 * admits on two of them and the static table does not — reaches those two. Without that second
 * case, the most likely wrong gate in this wave (three roles copied from `roles.ts` where the
 * database says five) would pass silently.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";

const PASSWORD = "AfraTest!1404";

/**
 * route -> the page's own `<h1>`, which `PageHeader` renders and which appears only when the page
 * body itself is drawn.
 *
 * It has to be the heading and not just any text on the page. A first draft matched
 * `getByText(marker)` and produced a FALSE EXPOSURE on `/roles`: the sidebar entry for that route
 * is «نقش‌ها و دسترسی‌ها» and the page heading is «نقش‌ها و دسترسی», so a substring match found the
 * navigation label on a page that RouteRoleGate had correctly refused. The app chrome renders for
 * everybody by design; only the `<h1>` distinguishes "the page drew itself" from "the shell drew
 * itself around a refusal".
 */
const TIER1 = [
  { route: "/sales/credit-rules", marker: "قوانین امتیازدهی" },
  { route: "/admin/penalties", marker: "مدیریت کارت‌های قرمز" },
  { route: "/roles", marker: "نقش‌ها و دسترسی" },
  { route: "/persons/create", marker: "شخص جدید" },
  { route: "/products/regenerate-names", marker: "ساخت خودکار نام محصولات" },
] as const;

/** A context with no stored session at all. Never pass storageState here — that is the bug's blind spot. */
async function coldLogin(
  browser: Browser,
  email: string,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ storageState: undefined, locale: "fa-IR" });
  const page = await context.newPage();

  await page.goto("/login", { waitUntil: "domcontentloaded" });

  // Prove the session really is cold before logging in, so a pass cannot come from a warm cache.
  // This asserts "no stored SESSION", not "no stored anything": loading /login deterministically
  // writes `afrakala:build-tag` and `afrakala:auth-diagnostics`, neither of which is a session.
  // Supabase stores the session under a key containing `auth-token`.
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
async function coldVisit(page: Page, route: string, marker: string) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  return {
    url: page.url(),
    denied: await page.getByTestId("route-gate-denied").count(),
    checking: await page.getByTestId("route-gate-checking").count(),
    marker: await page.getByRole("heading", { level: 1, name: marker, exact: true }).count(),
  };
}

for (const email of ["test.viewer@afrakala.local", "test.sales@afrakala.local"]) {
  const who = email.split("@")[0];
  test(`⛔ cold ${who} is refused at every tier-1 route`, async ({ browser }) => {
    test.setTimeout(180_000);
    const { page, close } = await coldLogin(browser, email);
    // Every route is visited before anything is asserted, so a failing run reports the WHOLE
    // exposure matrix instead of stopping at the first route. A loop that threw on route one
    // would have hidden the other four, which is the opposite of what an audit needs.
    const exposed: string[] = [];
    const notClosed: string[] = [];
    try {
      for (const { route, marker } of TIER1) {
        const seen = await coldVisit(page, route, marker);
        // A redirect to /unauthorized is a refusal too — it means the client guard did run and
        // threw, which happens on an in-app navigation. Either shape is fail-closed.
        const redirected = /\/unauthorized/.test(seen.url);
        if (seen.marker > 0) exposed.push(`${route} («${marker}» rendered)`);
        if (seen.denied + seen.checking + (redirected ? 1 : 0) === 0) notClosed.push(route);
      }
    } finally {
      await close();
    }

    expect(
      exposed,
      `${who} saw the page content at these routes. Each rendered for a role the live ` +
        `role_permissions table — or the route's own requireAnyRole/requireAdmin call — does not ` +
        `admit. This is the exposure the wave-2 gates exist to close:\n  ${exposed.join("\n  ")}`,
    ).toEqual([]);

    expect(
      notClosed,
      `${who} got neither a refusal, nor the checking state, nor a redirect to /unauthorized at ` +
        `these routes. A route must fail closed on a cold direct navigation:\n  ${notClosed.join("\n  ")}`,
    ).toEqual([]);
  });
}

test("the open half — a cold admin still reaches all five", async ({ browser }) => {
  // Without this, revoking every route from everybody would pass every assertion above.
  test.setTimeout(180_000);
  const { page, close } = await coldLogin(browser, "test.admin@afrakala.local");
  try {
    for (const { route, marker } of TIER1) {
      const seen = await coldVisit(page, route, marker);
      expect(seen.denied, `admin must NOT be refused at ${route}`).toBe(0);
      expect(seen.marker, `admin should still reach «${marker}» at ${route}`).toBeGreaterThan(0);
    }
  } finally {
    await close();
  }
});

test("the gate is not over-narrow — a cold accountant reaches the two routes live admits", async ({
  browser,
}) => {
  // The single most likely wrong gate in this wave is one copied from src/lib/rbac/roles.ts
  // instead of read from the database. `accountant` is the role that catches it here:
  //
  //   /sales/credit-rules         requireAnyRole(["admin","accountant"])  — the route's own array
  //   /products/regenerate-names  products.can_update = admin, manager, accountant (LIVE)
  //                               roles.ts says admin, manager — a gate copied from it would
  //                               refuse this accountant and contradict the server guard.
  test.setTimeout(180_000);
  const { page, close } = await coldLogin(browser, "test.accountant@afrakala.local");
  try {
    for (const route of ["/sales/credit-rules", "/products/regenerate-names"] as const) {
      const marker = TIER1.find((t) => t.route === route)!.marker;
      const seen = await coldVisit(page, route, marker);
      expect(
        seen.denied,
        `accountant was refused at ${route}, but both the live role_permissions table and the ` +
          `route's own guard admit accountant. A gate that denies a role its guard admits is a ` +
          `false denial and makes the two layers contradict each other.`,
      ).toBe(0);
      expect(seen.marker, `accountant should reach «${marker}» at ${route}`).toBeGreaterThan(0);
    }
  } finally {
    await close();
  }
});
