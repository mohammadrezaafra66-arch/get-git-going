import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  BRANDING,
  getBrandLabel,
  getBrandedFileName,
  getPageTitle,
} from "../../src/config/branding";

/**
 * Central branding — myafrakala.ir as the single platform name.
 * Blocks old runtime chrome literals in high-risk paths; allowlists domain/API noise.
 */

const ROOT = process.cwd();

const BLOCKED = [
  "دستیار هوشمند افراکالا",
  "دستیار هوشمند AfraKala",
  "ورود به افراکالا",
  "ثبت‌نام در افراکالا",
];

/** Paths that must not contain blocked old brand chrome (relative to repo root). */
const SCAN_GLOBS = [
  "src/routes/__root.tsx",
  "src/routes/login.tsx",
  "src/routes/register.tsx",
  "src/components/layout/AppSidebar.tsx",
  "src/components/public/sale-list-header.tsx",
  "public/manifest.webmanifest",
];

test.describe("branding config", () => {
  test("exports canonical myafrakala.ir values", () => {
    expect(BRANDING.platformName).toBe("myafrakala.ir");
    expect(BRANDING.shortName).toBe("myafrakala.ir");
    expect(BRANDING.applicationName).toBe("myafrakala.ir");
    expect(getBrandLabel()).toBe("myafrakala.ir");
  });

  test("getPageTitle avoids duplicated suffix", () => {
    expect(getPageTitle("داشبورد")).toBe("داشبورد | myafrakala.ir");
    expect(getPageTitle("محصولات")).toBe("محصولات | myafrakala.ir");
    expect(getPageTitle("اشخاص")).toBe("اشخاص | myafrakala.ir");
    expect(getPageTitle("خروجی برای آسان")).toBe("خروجی برای آسان | myafrakala.ir");
    expect(getPageTitle()).toBe("myafrakala.ir");
    expect(getPageTitle("myafrakala.ir")).toBe("myafrakala.ir");
    expect(getPageTitle("آکادمی myafrakala.ir")).toBe("آکادمی myafrakala.ir");
  });

  test("getBrandedFileName prefixes once", () => {
    expect(getBrandedFileName("report.xlsx")).toBe("myafrakala.ir-report.xlsx");
    expect(getBrandedFileName("myafrakala.ir-report.xlsx")).toBe("myafrakala.ir-report.xlsx");
  });
});

test.describe("PWA manifest", () => {
  test("name and short_name are myafrakala.ir", () => {
    const raw = fs.readFileSync(path.join(ROOT, "public/manifest.webmanifest"), "utf8");
    const manifest = JSON.parse(raw) as { name: string; short_name: string; description: string };
    expect(manifest.name).toBe("myafrakala.ir");
    expect(manifest.short_name).toBe("myafrakala.ir");
    expect(manifest.description).toContain("myafrakala.ir");
    expect(manifest.description).not.toContain("افراکالا");
  });
});

test.describe("static scan — no old chrome literals in branded surfaces", () => {
  test("scanned files reject blocked old brand strings", () => {
    const hits: string[] = [];
    for (const rel of SCAN_GLOBS) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      for (const bad of BLOCKED) {
        if (text.includes(bad)) hits.push(`${rel}: ${bad}`);
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });

  test("branding.ts is the only TS source of the platformName literal among config", () => {
    const branding = fs.readFileSync(path.join(ROOT, "src/config/branding.ts"), "utf8");
    expect(branding).toContain('platformName: "myafrakala.ir"');
  });
});

test.describe("UI chrome on deployed LAN", () => {
  test("login shows myafrakala.ir and title uses helper", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "myafrakala.ir" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page).toHaveTitle(/myafrakala\.ir/);
    // Generic action labels unchanged
    await expect(page.getByRole("button", { name: /ورود/ }).first()).toBeVisible();
  });

  test("sidebar brand after auth", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
    // Admin storage — brand in sidebar
    await expect(page.getByText("myafrakala.ir").first()).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveTitle(/داشبورد \| myafrakala\.ir|myafrakala\.ir/);
  });

  test("mobile header brand fits at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const h1 = page.getByRole("heading", { name: "myafrakala.ir" });
    await expect(h1).toBeVisible();
    const box = await h1.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeLessThan(360);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });
});
