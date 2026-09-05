/**
 * WAVE 4 / S-5 — a guarded route must ALSO carry the client-side gate, because on this app the
 * server-side guard cannot decide and never re-runs in the browser.
 *
 * ## What was measured, and how it differs from what was assumed
 *
 * The assumption going in was a race: `requireAnyRole` / `requireAdmin` / `requirePermission`
 * each contained
 *
 *     if (auth.rolesLoading || auth.profileLoading || auth.loading) return { user, roles: auth.roles };
 *
 * and a guard that RETURNS is a guard that PASSED, so a cold session would see the page for as
 * long as the roles query took. That line is real and this wave closed it.
 *
 * It is not what was actually happening. Instrumented on 2026-09-06 with a `console.warn` at the
 * top of `requireAnyRole`, a cold `viewer` opening `/admin/persons-cleanup` directly produced
 * exactly one line, and it came from the dev server's stdout, not the browser console:
 *
 *     [GATEPROBE] requireAnyRole ran; isBrowser= false [ 'admin' ]
 *
 * The guard ran ONCE, on the server. On the server `typeof window === "undefined"`, so
 * `resolveAuthWithRetry()` returns null and the guard returns `{ user: null, roles: [] }` without
 * refusing — it cannot do otherwise, because the Supabase session lives in `localStorage` and the
 * server cannot see it. The browser then hydrated and rendered the page. The client guard never
 * ran at all.
 *
 * So the exposure is not a window that closes. For a direct navigation it is permanent for that
 * page view: the cold `viewer` sat on `/admin/persons-cleanup` showing 93 person rows for the
 * full 20-second observation and never redirected.
 *
 * ## Why this test asserts on staticData rather than driving a browser
 *
 * `RouteRoleGate` (src/components/layout/RouteRoleGate.tsx) already exists, is already mounted in
 * `_app.tsx` around the `<Outlet/>`, and already implements the fail-closed client check —
 * holding on "در حال بررسی دسترسی…" while roles load and refusing afterwards. It reads the
 * requirement from `staticData.gate`. It was applied to 13 accounting routes in an earlier
 * mission and deliberately not rolled out further.
 *
 * Measured 2026-09-06: 149 route files call one of the three guards; 19 carry `staticData`. The
 * gate is therefore inert on the other 130, and a browser test can only ever sample a few of
 * them. Reading the route files finds every one of them at once, and it is the same fact.
 *
 * ## Scope, stated honestly
 *
 * This spec covers the routes wave 4 actually measured and fixed. It is NOT the repo-wide rule.
 * Rolling `staticData.gate` out to all 149 is an owner decision that has not been taken (it is
 * recorded as an Owner-Gate in RouteRoleGate's own header), and asserting it here would turn an
 * un-taken decision into a red suite.
 */
import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const ROUTES_DIR = path.join(process.cwd(), "src", "routes");

/**
 * The routes wave 4 measured on cold `viewer` and `sales` sessions, with the gate each one's
 * `beforeLoad` mirrors. Written out rather than parsed from the file: a test that derives the
 * expected value from the same text it is checking asserts only that the file equals itself.
 */
const MEASURED: { file: string; mustContain: string }[] = [
  {
    file: "_app.admin.persons-cleanup.tsx",
    mustContain: `staticData: { gate: { kind: "anyRole", allowed: ["admin"] } }`,
  },
  { file: "_app.api-keys.tsx", mustContain: `staticData: { gate: { kind: "admin" } }` },
  { file: "_app.presence.tsx", mustContain: `staticData: { gate: { kind: "admin" } }` },
  { file: "_app.admin.roles.tsx", mustContain: `staticData: { gate: { kind: "admin" } }` },
  {
    file: "_app.admin.audit.tsx",
    mustContain: `staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager"] } }`,
  },
];

for (const { file, mustContain } of MEASURED) {
  test(`⛔ ${file} carries the client-side gate its beforeLoad mirrors`, () => {
    const src = fs.readFileSync(path.join(ROUTES_DIR, file), "utf8");
    expect(
      src.includes(mustContain),
      `${file} calls a route guard but has no matching staticData.gate, so RouteRoleGate cannot ` +
        `enforce it. On a direct navigation beforeLoad runs only on the server, where it cannot ` +
        `see the session and returns without refusing — measured 2026-09-06 — so without this ` +
        `line the page renders for any signed-in user. Expected to find:\n  ${mustContain}`,
    ).toBe(true);
  });
}

test("the gate and the guard cannot drift: every measured route still calls a guard", () => {
  // The OPEN half. Deleting the beforeLoad call would make every assertion above pass while
  // removing the server-side check entirely, and `staticData` alone enforces nothing on the
  // server. Both halves have to be present for the route to be guarded on both sides.
  const missing = MEASURED.filter(({ file }) => {
    const src = fs.readFileSync(path.join(ROUTES_DIR, file), "utf8");
    return !/require(AnyRole|Admin|Permission)\s*\(/.test(src);
  }).map(({ file }) => file);

  expect(
    missing,
    `these carry a staticData.gate but no longer call a route guard: ${missing.join(", ")}`,
  ).toEqual([]);
});

test("RouteRoleGate is still mounted — the gate data is worthless if nothing reads it", () => {
  // Every assertion above is about DATA. This is the one assertion about the CODE that consumes
  // it: if RouteRoleGate stops wrapping the Outlet, all five routes above go quietly unguarded
  // on the client while this spec stays green.
  const appLayout = fs.readFileSync(path.join(ROUTES_DIR, "_app.tsx"), "utf8");
  expect(
    appLayout.includes("<RouteRoleGate>"),
    "src/routes/_app.tsx no longer wraps <Outlet/> in <RouteRoleGate>, so staticData.gate is " +
      "read by nothing and every client-side route gate is inert",
  ).toBe(true);

  const gate = fs.readFileSync(
    path.join(process.cwd(), "src", "components", "layout", "RouteRoleGate.tsx"),
    "utf8",
  );
  // Fail closed while the answer is unknown — the property the whole row is about.
  expect(
    /rolesLoading \|\| profileLoading \|\| loading/.test(gate),
    "RouteRoleGate no longer holds while roles are loading; it must never render the page " +
      "before the answer is known",
  ).toBe(true);
});
