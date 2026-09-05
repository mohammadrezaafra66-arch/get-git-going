import { defineConfig, devices } from "@playwright/test";

// Throwaway config: the main playwright.config.ts deliberately excludes e2e/auth/ from
// testMatch ("invoke those files explicitly"), which makes the generators unreachable by
// path. This config exists only to run them. Not committed.
export default defineConfig({
  testDir: "./e2e",
  testMatch: [/auth\/.*\.spec\.ts/],
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results/auth-regen",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100",
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "auth", use: { ...devices["Desktop Chrome"] } }],
});
