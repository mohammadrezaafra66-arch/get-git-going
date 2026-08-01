import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";

export default defineConfig({
  testDir: "./e2e",
  // Normal regression: requirements smoke + business-flow suites.
  // Auth setup/validation under e2e/auth/ are NOT matched here — invoke those files explicitly.
  testMatch: [
    /requirements\/.*\.spec\.ts/,
    /business-flows\/.*\.spec\.ts/,
    // Phase 3-5 unified-persons UI suite.
    /persons\/.*\.spec\.ts/,
  ],
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "test-results/playwright-html", open: "never" }],
    ["json", { outputFile: "test-results/211-218-playwright-results.json" }],
  ],
  outputDir: "test-results/211-218",
  use: {
    baseURL,
    storageState: "e2e/auth/admin.storage.json",
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    trace: "retain-on-failure",
    video: "on",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: "chromium-admin",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
