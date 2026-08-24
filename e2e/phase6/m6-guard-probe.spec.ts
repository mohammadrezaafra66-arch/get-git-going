import { test, expect, type Page } from "@playwright/test";

/**
 * M6 / OG-24 — measurement probe. This file MEASURES, it does not assert a fix.
 *
 * It records, for each accounting route and each usable role, what a real session actually
 * sees in three navigation modes. The Persian text on the page is the measurement — "reached
 * the route" and "saw the page" are different outcomes and this programme has confused them
 * before.
 *
 * Nothing here submits a document or writes to the database.
 */

const ROUTES = [
  "/accounting/payment-vouchers",
  "/accounting/receipts",
  "/accounting/receipts/create",
  "/accounting/treasury",
  "/accounting/receivables",
  "/accounting/payables",
  "/accounting/bank-accounts",
  "/accounting/dynamic-capital",
  "/accounting/mutual-settlement",
  "/accounting/external-parties",
  "/accounting/purchase-payments",
  "/accounting/salesperson-scoring",
  "/accounting/receipts/training",
];

const SESSIONS = [
  { name: "admin", file: "e2e/auth/admin.storage.json" },
  { name: "accountant", file: "e2e/auth/accountant.storage.json" },
  { name: "sales", file: "e2e/auth/salesperson-a.storage.json" },
];

const DENIAL = "دسترسی ندارید";
const CHECKING = "در حال بررسی دسترسی";
const ROLE_ERROR = "بارگذاری نقش‌های شما ناموفق بود";

async function observe(page: Page): Promise<string> {
  await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
  const url = new URL(page.url()).pathname;
  const body = (await page.locator("body").innerText().catch(() => "")) || "";
  const flat = body.replace(/\s+/g, " ").trim();
  let verdict = "RENDERED";
  if (url === "/unauthorized") verdict = "UNAUTHORIZED-REDIRECT";
  else if (url === "/login") verdict = "LOGIN-BOUNCE";
  else if (url === "/pending-approval") verdict = "PENDING-REDIRECT";
  else if (flat.includes(DENIAL)) verdict = "DENIAL-TEXT";
  else if (flat.includes(ROLE_ERROR)) verdict = "ROLE-LOAD-ERROR";
  else if (flat.includes(CHECKING)) verdict = "STILL-CHECKING";
  return `${verdict} | url=${url} | seen="${flat.slice(0, 110)}"`;
}

for (const s of SESSIONS) {
  test.describe(`M6 probe — ${s.name}`, () => {
    test.use({ storageState: s.file });

    test(`${s.name}: FULL PAGE LOAD`, async ({ page }) => {
      const lines: string[] = [];
      for (const r of ROUTES) {
        await page.goto(r, { waitUntil: "domcontentloaded" }).catch(() => {});
        lines.push(`  [${s.name}] FULL  ${r.padEnd(38)} -> ${await observe(page)}`);
      }
      console.log("\n" + lines.join("\n"));
      expect(lines.length).toBe(ROUTES.length);
    });

    test(`${s.name}: CLIENT-SIDE NAVIGATION`, async ({ page }) => {
      const lines: string[] = [];
      await page.goto("/", { waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      for (const r of ROUTES) {
        // in-app navigation through the router, no document request
        await page
          .evaluate((to) => {
            window.history.pushState({}, "", to);
            window.dispatchEvent(new PopStateEvent("popstate"));
          }, r)
          .catch(() => {});
        await page.waitForTimeout(1200);
        lines.push(`  [${s.name}] CSN   ${r.padEnd(38)} -> ${await observe(page)}`);
      }
      console.log("\n" + lines.join("\n"));
      expect(lines.length).toBe(ROUTES.length);
    });

    test(`${s.name}: ROLES STILL LOADING`, async ({ page }) => {
      // Force the guard to evaluate while roles are in flight by stalling the
      // user_roles read. Everything else loads normally.
      await page.route("**/rest/v1/user_roles*", async (route) => {
        await new Promise((r) => setTimeout(r, 9000));
        await route.continue();
      });
      const lines: string[] = [];
      for (const r of ROUTES.slice(0, 4)) {
        await page.goto(r, { waitUntil: "domcontentloaded" }).catch(() => {});
        await page.waitForTimeout(2500); // observe DURING the stall, not after
        const url = new URL(page.url()).pathname;
        const body = (await page.locator("body").innerText().catch(() => "")) || "";
        const flat = body.replace(/\s+/g, " ").trim();
        let v = "RENDERED-WHILE-LOADING";
        if (url === "/unauthorized") v = "UNAUTHORIZED-REDIRECT";
        else if (url === "/login") v = "LOGIN-BOUNCE";
        else if (flat.includes(CHECKING)) v = "LOADING-STATE";
        else if (flat.includes(DENIAL)) v = "DENIAL-WHILE-LOADING";
        lines.push(`  [${s.name}] LOAD  ${r.padEnd(38)} -> ${v} | url=${url} | seen="${flat.slice(0, 110)}"`);
      }
      console.log("\n" + lines.join("\n"));
      expect(lines.length).toBe(4);
    });
  });
}
