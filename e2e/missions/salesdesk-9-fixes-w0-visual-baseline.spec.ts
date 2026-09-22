/**
 * Wave 0 visual-regression baselines for salesdesk-9-fixes.
 * Run: npx playwright test e2e/missions/salesdesk-9-fixes-w0-visual-baseline.spec.ts
 */
import { test } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { storageStateForRole } from "../helpers/role-session";

const BASE = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const SUPABASE = process.env.E2E_SUPABASE_URL ?? "http://192.168.170.8:9000";
const OUT = path.resolve(
  "docs/missions/salesdesk-9-fixes/evidence/W0/visual",
);

const PAGES: { name: string; path: string }[] = [
  { name: "sales-desk", path: "/operations/sales-desk" },
  { name: "caller-id-settings", path: "/settings/caller-id" },
  { name: "work-board", path: "/work" },
  { name: "purchase-form", path: "/accounting/purchases/new" },
  { name: "purchase-payments", path: "/accounting/purchase-payments" },
  { name: "pricing-my-workbench", path: "/pricing/my-workbench" },
];

test.describe("W0 visual baselines", () => {
  test.use({
    storageState: storageStateForRole("admin", BASE, SUPABASE),
  });

  test.beforeAll(() => {
    fs.mkdirSync(OUT, { recursive: true });
  });

  for (const p of PAGES) {
    test(`baseline ${p.name}`, async ({ page }) => {
      await page.goto(p.path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
      const file = path.join(OUT, `${p.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      // Ticket detail: open first card if on board
      if (p.name === "work-board") {
        const link = page.locator('a[href*="/work/"]').first();
        if (await link.count()) {
          await link.click();
          await page.waitForTimeout(1500);
          await page.screenshot({
            path: path.join(OUT, "ticket-detail.png"),
            fullPage: true,
          });
        }
      }
    });
  }
});
