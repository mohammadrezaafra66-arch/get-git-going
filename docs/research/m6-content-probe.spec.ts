/*
 * WHY THIS FILE LIVES IN docs/ AND NOT IN e2e/ — moved 2026-08-25, M5C.
 *
 * It is a measurement probe, and it was committed into the permanent suite by mistake. Two
 * facts about it, both measured rather than asserted:
 *
 * 1. ITS ONE ASSERTION CANNOT FAIL. `expect(out.length).toBeGreaterThan(0)` runs against an
 *    array that receives three unconditional pushes per route across four routes, so its
 *    length is 12 no matter what the browser did. Every await in the loop ends in
 *    `.catch(() => {})`, so a navigation that never arrives, a page that renders nothing and
 *    a page that renders the wrong thing all produce the same green result. The file cannot
 *    go red for the reason it exists.
 *
 * 2. THE ONLY THING THAT CAN TURN IT RED IS HOST SPEED. Four navigations, each allowed up to
 *    20 s of networkidle, inside Playwright's 45 s per-test budget — 80 s worst case. So the
 *    single failure mode it does have is unrelated to what it measures. That is the same
 *    defect m6-guard-probe.spec.ts was moved out for on the same day, arrived at from the
 *    opposite direction: that one is too slow to finish, this one can never fail.
 *
 * It is kept because the measurement is genuinely useful — it is how "reached the route" was
 * separated from "saw the page" during M6, and it prints the REST calls each page actually
 * causes, which is how the OG-24 exposure was shown to be UI-only.
 *
 * TO RUN IT: playwright's testDir is ./e2e, so a file here is not discovered and not run, by
 * design. Copy it back temporarily and delete the copy afterwards:
 *
 *     cp docs/research/m6-content-probe.spec.ts e2e/phase6/
 *     npx playwright test e2e/phase6/m6-content-probe.spec.ts --workers=1 --timeout=300000
 *     rm e2e/phase6/m6-content-probe.spec.ts
 *
 * Read its console output. Do not read its pass/fail — that is the point of this note.
 */

import { test, expect } from "@playwright/test";

/**
 * M6 / 0.2 + 0.3 — what a `sales` user ACTUALLY sees inside the page, and what the
 * page causes the database to run. Reads only; submits nothing.
 */

const ROUTES = [
  "/accounting/payment-vouchers",
  "/accounting/treasury",
  "/accounting/receivables",
  "/accounting/bank-accounts",
];

for (const s of [
  { name: "sales", file: "e2e/auth/salesperson-a.storage.json" },
  { name: "accountant", file: "e2e/auth/accountant.storage.json" },
]) {
  test.describe(`content — ${s.name}`, () => {
    test.use({ storageState: s.file });

    test(`${s.name}: main content on a cold load`, async ({ page }) => {
      const rest: string[] = [];
      page.on("request", (r) => {
        const u = r.url();
        if (u.includes("/rest/v1/")) rest.push(`${r.method()} ${u.split("/rest/v1/")[1].split("&")[0]}`);
      });
      const out: string[] = [];
      for (const r of ROUTES) {
        rest.length = 0;
        await page.goto(r, { waitUntil: "domcontentloaded" }).catch(() => {});
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        const main = await page
          .locator("main")
          .first()
          .innerText()
          .catch(() => "");
        const flat = (main || "").replace(/\s+/g, " ").trim();
        out.push(`  [${s.name}] ${r}`);
        out.push(`      MAIN: "${flat.slice(0, 260)}"`);
        out.push(`      REST: ${[...new Set(rest)].slice(0, 8).join(" | ") || "(none)"}`);
      }
      console.log("\n" + out.join("\n"));
      expect(out.length).toBeGreaterThan(0);
    });
  });
}
