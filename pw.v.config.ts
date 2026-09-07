/**
 * Throwaway Playwright config for the close-out group V browser proofs.
 * Deliberately NOT wired into playwright.config.ts's testMatch: these specs
 * drive the deployed app and write real rows, so they must be invoked by name.
 *
 * No `storageState` here on purpose. Every spec logs in from zero, which is the
 * only session shape that exercises the cold-navigation window.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/closeout-v",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results/closeout-v",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100",
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    trace: "retain-on-failure",
    video: "off",
    screenshot: "off",
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium-cold", use: { ...devices["Desktop Chrome"] } }],
});
