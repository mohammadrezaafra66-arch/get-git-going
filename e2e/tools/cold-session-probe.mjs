/**
 * S-5 cold-session probe.
 *
 * HOW COLDNESS IS GUARANTEED, and it is asserted rather than assumed:
 *   1. Every (role, route) pair gets its OWN browser.newContext(). A fresh context has an empty
 *      cookie jar and empty per-origin storage; nothing is shared with any other pair or with
 *      any previous run, and no storageState file is passed.
 *   2. Before logging in, the probe opens the origin and reads localStorage.length. supabase-js
 *      persists its session under `sb-<ref>-auth-token` in localStorage, so a non-zero length
 *      would mean a session was already present. The probe RECORDS this number; a run where it
 *      is not 0 is not a cold run and is reported as such.
 *   3. The target route is entered by a full navigation immediately after login, so the app
 *      bootstraps from scratch: ensureAuthReady() runs, the session is read back, and the roles
 *      query is in flight. That in-flight moment is the window under test. A warm session masks
 *      it entirely because the roles are already in the snapshot before the navigation starts.
 */
import { chromium } from "@playwright/test";

const BASE = process.argv[2];
const LABEL = process.argv[3] ?? BASE;
const PASSWORD = "AfraTest!1404";

const ROLES = [
  { role: "viewer", email: "test.viewer@afrakala.local" },
  { role: "sales", email: "test.sales@afrakala.local" },
  // admin is the OPEN half: a guard that refuses everyone would satisfy every closed-half
  // assertion and would simply have broken the admin area.
  { role: "admin", email: "test.admin@afrakala.local" },
];

const ROUTES = [
  { path: "/admin/persons-cleanup", guard: 'requireAnyRole(["admin"])' },
  { path: "/api-keys", guard: "requireAdmin()" },
  { path: "/presence", guard: "requireAdmin()" },
  { path: "/admin/roles", guard: "requireAdmin()" },
  { path: "/admin/audit", guard: 'requireAnyRole(["admin","manager"])' },
  { path: "/bot-api-keys", guard: 'requirePermission("bot-api-keys","view")' },
];

const SAMPLE_MS = 75;
const SAMPLE_FOR_MS = 20000;

async function probe(browser, role, email, route) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const result = { role, route: route.path, guard: route.guard };

  try {
    // --- coldness proof -----------------------------------------------------------------
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
    result.storageKeysBeforeLogin = await page.evaluate(() => {
      try {
        return localStorage.length;
      } catch {
        return -1;
      }
    });

    // --- log in -------------------------------------------------------------------------
    await page
      .locator('input[name="email"][type="email"]')
      .waitFor({ state: "visible", timeout: 45000 });
    // The dev server hydrates noticeably later than the built bundle. A click that lands before
    // React has attached onSubmit does nothing and produces no auth request at all, so the
    // submit is retried until the session actually appears rather than assumed to have worked.
    await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});
    let attempts = 0;
    while (attempts < 6) {
      attempts += 1;
      await page.locator('input[name="email"][type="email"]').fill(email);
      await page.locator('input[name="password"][type="password"]').fill(PASSWORD);
      await page.getByRole("button", { name: /^ورود$/ }).click().catch(() => {});
      try {
        await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 8000 });
        break;
      } catch {
        /* not hydrated yet, or still in flight - try again */
      }
    }
    if (new URL(page.url()).pathname.startsWith("/login")) {
      throw new Error(`login did not complete after ${attempts} submit attempts`);
    }
    result.loginAttempts = attempts;
    result.loggedIn = true;

    // --- enter the guarded route on a cold runtime ---------------------------------------
    await page.goto(`${BASE}${route.path}`, { waitUntil: "commit", timeout: 45000 });

    const samples = [];
    const t0 = Date.now();
    let renderedTarget = false;
    const gateStates = new Set();
    let maxRows = 0;
    let maxButtons = 0;
    while (Date.now() - t0 < SAMPLE_FOR_MS) {
      let s;
      try {
        s = await page.evaluate(() => {
          // Classify by the gate's OWN markers rather than by how much text is on screen.
          // The first version of this probe called anything over 300 characters "rendered",
          // which counted the AppShell chrome that surrounds a REFUSAL and reported denied
          // pages as leaks. RouteRoleGate stamps a data-testid for each of its three states.
          const gate = document.querySelector(
            '[data-testid="route-gate-denied"],[data-testid="route-gate-checking"],' +
              '[data-testid="route-gate-roles-error"]',
          );
          const main = document.querySelector("main") ?? document.body;
          return {
            path: location.pathname,
            gate: gate ? (gate.getAttribute("data-testid") ?? "") : "",
            len: (main?.innerText ?? "").length,
            text: (main?.innerText ?? "").slice(0, 160).replace(/\s+/g, " "),
            rows: document.querySelectorAll("table tbody tr").length,
            buttons: document.querySelectorAll("button").length,
          };
        });
      } catch {
        await page.waitForTimeout(SAMPLE_MS);
        continue;
      }
      samples.push({ t: Date.now() - t0, ...s });
      // A LEAK is: still on the guarded path, no gate marker on screen, and real page content
      // (a data table, or main content beyond the shell's own furniture).
      if (s.path === route.path && !s.gate && (s.rows > 0 || s.len > 300)) {
        renderedTarget = true;
        maxRows = Math.max(maxRows, s.rows);
        maxButtons = Math.max(maxButtons, s.buttons);
      }
      if (s.gate) gateStates.add(s.gate);
      await page.waitForTimeout(SAMPLE_MS);
    }

    const last = samples[samples.length - 1] ?? {};
    result.finalPath = last.path;
    result.finalTextHead = last.text;
    result.renderedGuardedPage = renderedTarget;
    result.gateStatesSeen = [...gateStates];
    result.maxRows = maxRows;
    result.maxButtons = maxButtons;
    result.firstTargetRenderAtMs = renderedTarget
      ? samples.find((s) => s.path === route.path && !s.gate && (s.rows > 0 || s.len > 300)).t
      : null;
    result.samples = samples.filter((_, i) => i % 4 === 0).slice(0, 24);
  } catch (e) {
    result.error = String(e).slice(0, 300);
  } finally {
    await context.close();
  }
  return result;
}

const browser = await chromium.launch();
const out = { label: LABEL, base: BASE, at: new Date().toISOString(), results: [] };
for (const { role, email } of ROLES) {
  for (const route of ROUTES) {
    const r = await probe(browser, role, email, route);
    out.results.push(r);
    console.error(
      `${LABEL} ${role.padEnd(7)} ${r.route.padEnd(24)} cold(localStorage)=${r.storageKeysBeforeLogin} ` +
        `rendered=${r.renderedGuardedPage} rows=${r.maxRows} final=${r.finalPath} ${r.error ?? ""}`,
    );
  }
}
await browser.close();
console.log(JSON.stringify(out, null, 2));
