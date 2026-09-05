/**
 * Wave 3 / agent Z — Z-1 (the open page's parent group opens, its row highlighted) and
 * Z-2 (the finance hub reaches /admin/persons-cleanup).
 *
 * WHAT THIS PROVES THAT SOURCE-LEVEL ASSERTIONS CANNOT. Both rows are CONNECT rows: the data
 * was already there and the question was only ever whether it reaches the screen. The registry
 * has carried `group`/`subgroup` on every entry since it was written and the Persian labels for
 * them have sat in `nav-items.ts` just as long, but nothing imported that file, so no group was
 * ever drawn (`docs/research/nav-active-state-20260905.md`, F7/F8). Reading the source back
 * would therefore prove nothing about the thing that was broken. So every assertion below is
 * against a rendered page.
 *
 * Z-1 is asserted as three separate claims, because two of them passed BEFORE this change and
 * only the third was missing:
 *   (a) the row for the open page is highlighted — `aria-current="page"`. This already worked
 *       (research note F5) and is asserted so that widening its input cannot silently break it.
 *   (b) the section holding that row is OPEN and marked as the active one.
 *   (c) a sibling section is CLOSED and its links are not reachable. Without (c) the test would
 *       pass against a panel that simply renders everything open, which is the old flat list
 *       with headings glued on.
 *
 * Z-2 is asserted by CLICKING the hub button rather than by reading the hub source, and by
 * `sales` and `viewer` sessions measurably not seeing it. Measured, not reasoned about:
 * `has_dynamic_permission` fails OPEN for a module with no `role_permissions` rows, so a gate
 * can look tight in source and be wide open at runtime.
 *
 * What this spec does NOT assert — that the route GUARD refuses those roles — is explained at
 * the bottom of this file. It does not, that is pre-existing, and it is reported rather than
 * silently encoded either way.
 *
 * RUN (against a dev server on a free port, NOT the shared :3100 container, which runs staging):
 *   VITE_SUPABASE_URL=http://192.168.170.8:<api-port> \
 *   VITE_SUPABASE_PUBLISHABLE_KEY=<anon key> npm run dev -- --port 8137
 *   E2E_BASE_URL=http://localhost:8137 AFRAKALA_LAN_ENV=<path to deploy/lan/.env.lan> \
 *     npx playwright test e2e/navigation/wave3-nav-active-state.spec.ts --reporter=line
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { lanEnv } from "../helpers/pgrest";
import { storageStateForRole, type TestRole } from "../helpers/role-session";

const SUPABASE_URL = `http://192.168.170.8:${lanEnv().SUPABASE_API_PORT}`;

/** The page both rows converge on. Admin-only in the registry and at its own guard. */
const CLEANUP = "/admin/persons-cleanup";
/** The menu/registry label — what the sidebar row and the hub button read. */
const CLEANUP_LABEL = "تکمیل و پاک‌سازی اشخاص";
/** The page's own <h1>, which is deliberately wordier than the menu label. Not the same string. */
const CLEANUP_HEADING = "تکمیل و پاک‌سازی پروندهٔ اشخاص";
/** مرکز مالی — the one entry the finance sidebar section still has. */
const HUB = "/accounting/receipts/create";

/**
 * Vite dev-server only. @tanstack/start-plugin-core emits the client entry as
 *   import("/@id/virtual:tanstack-start-client-entry")
 * but registers it under Vite's null-byte-encoded id, served at
 *   /@id/__x00__virtual:tanstack-start-client-entry
 * The first 404s and the second 200s, so the page never hydrates and nothing is clickable.
 * Same dev-mode toolchain bug `wave1-menu-wiring.spec.ts` documents; rewrite that one request.
 */
async function fixDevClientEntry(page: Page, baseURL: string) {
  if (!baseURL.includes("localhost")) return;
  await page.route("**/@id/virtual:tanstack-start-client-entry", async (route) => {
    const fixed = route.request().url().replace("/@id/virtual:", "/@id/__x00__virtual:");
    await route.fulfill({ response: await route.fetch({ url: fixed }) });
  });
}

async function openAs(role: TestRole, path: string, browser: Browser, baseURL: string) {
  const context = await browser.newContext({
    storageState: storageStateForRole(role, baseURL, SUPABASE_URL),
  });
  const page = await context.newPage();
  await fixDevClientEntry(page, baseURL);
  await page.goto(`${baseURL}${path}`, { waitUntil: "domcontentloaded" });
  // Never assert on a half-decided page.
  await expect(page.getByTestId("route-gate-checking")).toHaveCount(0, { timeout: 30_000 });
  return { context, page };
}

const section = (page: Page, key: string) => page.locator(`[data-nav-section="${key}"]`);

test.describe("Z-1 — the open page's parent group", () => {
  test("opens the section holding the page, and highlights the page's own row", async ({
    browser,
    baseURL,
  }) => {
    const { context, page } = await openAs("admin", CLEANUP, browser, baseURL!);

    // (a) The row is highlighted. This is the pre-existing mechanism, not a second one:
    //     the same `aria-current` AppSidebar has always set.
    const row = page.locator(`a[href="${CLEANUP}"][aria-current="page"]`);
    await expect(row, `no highlighted sidebar row for ${CLEANUP}`).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(CLEANUP_LABEL);

    // (b) Its parent section is open and identified as the active one. `adm-tools` is the
    //     subgroup the registry gives this route (registry.ts, `subgroup: "adm-tools"`).
    const tools = section(page, "adm-tools");
    await expect(tools).toHaveAttribute("data-nav-section-open", "true");
    await expect(tools).toHaveAttribute("data-nav-section-active", "true");
    await expect(
      tools.getByRole("button", { name: "گروه ابزارها و یکپارچه‌سازی" }),
    ).toHaveAttribute("aria-expanded", "true");
    // The highlighted row is INSIDE that section, not merely on the same page as it.
    await expect(tools.locator(`a[href="${CLEANUP}"]`)).toHaveCount(1);

    // (c) A sibling section is closed, and its rows are genuinely unreachable. Without this
    //     the test would pass against a panel that just renders every group open.
    const settings = section(page, "adm-settings");
    await expect(settings).toHaveAttribute("data-nav-section-open", "false");
    await expect(settings).toHaveAttribute("data-nav-section-active", "false");
    await expect(settings.locator('a[href="/admin/settings"]')).toBeHidden();

    await context.close();
  });

  test("the open section follows the route — a page in another group moves it", async ({
    browser,
    baseURL,
  }) => {
    // `/users` sits in `adm-users`, a different section of the same `admin` module. If the open
    // section were fixed, or merely opened once on first render, this would fail.
    const { context, page } = await openAs("admin", "/users", browser, baseURL!);

    await expect(page.locator('a[href="/users"][aria-current="page"]')).toBeVisible({
      timeout: 30_000,
    });
    await expect(section(page, "adm-users")).toHaveAttribute("data-nav-section-open", "true");
    await expect(section(page, "adm-tools")).toHaveAttribute("data-nav-section-open", "false");
    // ...and the page from the previous test is now the hidden one.
    await expect(section(page, "adm-tools").locator(`a[href="${CLEANUP}"]`)).toBeHidden();

    await context.close();
  });

  test("a collapsed group can still be opened by hand", async ({ browser, baseURL }) => {
    const { context, page } = await openAs("admin", CLEANUP, browser, baseURL!);

    const settings = section(page, "adm-settings");
    await expect(settings).toHaveAttribute("data-nav-section-open", "false");
    await settings.getByRole("button", { name: "گروه تنظیمات" }).click();
    await expect(settings).toHaveAttribute("data-nav-section-open", "true");
    await expect(settings.locator('a[href="/admin/settings"]')).toBeVisible();

    await context.close();
  });
});

test.describe("Z-2 — the finance hub reaches persons-cleanup", () => {
  test("admin reaches the page by CLICKING the hub button", async ({ browser, baseURL }) => {
    const { context, page } = await openAs("admin", HUB, browser, baseURL!);

    const button = page.getByRole("main").locator(`a[href="${CLEANUP}"]`).first();
    await expect(button, "no persons-cleanup button on the finance hub").toBeVisible({
      timeout: 30_000,
    });
    await expect(button).toContainText(CLEANUP_LABEL);

    await button.click();
    await page.waitForURL(`**${CLEANUP}`, { timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe(CLEANUP);

    // It really arrived, rather than landing on the guard's refusal.
    await expect(page.getByTestId("route-gate-checking")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("route-gate-denied")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: CLEANUP_HEADING }).last()).toBeVisible({
      timeout: 30_000,
    });

    await context.close();
  });

  /**
   * `sales` and `viewer` never reach the hub at all — measured, not assumed. The hub route is
   * `requireAnyRole(["admin","manager","accountant"])` and it refuses them on the page itself.
   * So for these two the button is unreachable a fortiori, and this test says exactly that
   * rather than pretending to have exercised the hub's own per-item filter.
   */
  for (const role of ["sales", "viewer"] as const) {
    test(`${role} is refused the hub, so cannot see the button`, async ({ browser, baseURL }) => {
      const { context, page } = await openAs(role, HUB, browser, baseURL!);

      await expect(page.getByText("دسترسی ندارید", { exact: false }).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.locator(`a[href="${CLEANUP}"]`)).toHaveCount(0);

      await context.close();
    });
  }

  /**
   * The non-vacuous half, and the one that actually tests Z-2's gate.
   *
   * `accountant` and `manager` ARE allowed on the hub, so the page renders for them in full.
   * The persons-cleanup button must still be absent, because the registry allowlist for that
   * route is ["admin"] alone. If the hub had been given a hand-written role list, or if it
   * leaned on the accounting module instead of the allowlist, this is the test that would fail:
   * `has_dynamic_permission` grants a module to every role when no `role_permissions` row
   * exists for it, so a module-level check could not have kept these two out.
   */
  for (const role of ["accountant", "manager"] as const) {
    test(`${role} sees the hub but not the admin-only button`, async ({ browser, baseURL }) => {
      const { context, page } = await openAs(role, HUB, browser, baseURL!);

      // The hub really rendered for this role — otherwise "absent" would prove nothing. The
      // hub's own <h1> is the anchor, not one of its links, so this precondition does not
      // itself depend on some other route's allowlist.
      await expect(page.getByRole("heading", { name: "مرکز مالی" }).first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.locator(`a[href="${CLEANUP}"]`)).toHaveCount(0);

      await context.close();
    });
  }
});

/**
 * NOT ASSERTED HERE, AND DELIBERATELY SO — the route guard does not refuse these roles.
 *
 * Measured 2026-09-05 against the deployed staging container (192.168.170.8:3100, i.e. this
 * code WITHOUT the change in this branch, so it is pre-existing and nothing here caused it):
 * a minted `viewer` session — correctly resolved, the sidebar showed «بیننده» and disabled the
 * مالی module — navigated cold to /admin/persons-cleanup and the page RENDERED IN FULL: the
 * heading «تکمیل و پاک‌سازی پروندهٔ اشخاص», 93 person rows, and their حذف buttons. `sales`
 * behaved identically. Neither a `route-gate-denied` banner nor a redirect to /unauthorized.
 *
 * The mechanism is visible in the source and is not a race that only tests hit:
 *   - `_app.admin.persons-cleanup.tsx:560` is guarded ONLY by `beforeLoad: requireAnyRole(["admin"])`.
 *     The file contains no `RouteRoleGate` (grep: 0 matches), so nothing re-checks after mount.
 *   - `src/lib/rbac/route-guards.ts:86` — `requireAnyRole` returns WITHOUT denying while
 *     `auth.rolesLoading || auth.profileLoading || auth.loading`. A cold navigation that reaches
 *     the guard before roles have loaded is therefore admitted, permanently.
 *
 * An assertion that the guard refuses would fail today, and one written to match what it
 * actually does would enshrine the hole as expected behaviour. So this spec asserts neither,
 * and the finding is reported to the owner instead. Fixing it is outside Z-2: it is shared RBAC
 * code, the fix belongs with whoever owns route guards, and Z-2 changed no guard.
 */

