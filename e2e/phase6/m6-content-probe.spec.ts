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
