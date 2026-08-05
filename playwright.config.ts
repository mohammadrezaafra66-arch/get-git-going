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
    // Issue 219 — purchase request/document suites.
    /purchase\/.*\.spec\.ts/,
    // P1+D8 mission (phase 12) — one suite per phase's hard gate. These are
    // API-level against the deployed stack: the rules they assert are enforced
    // in the database precisely so that no client can dodge them, so the
    // honest test is the one that tries to dodge them.
    /security\/.*\.spec\.ts/,
    /scoring\/.*\.spec\.ts/,
    /capital\/.*\.spec\.ts/,
    /warehouse\/.*\.spec\.ts/,
    /marketing\/.*\.spec\.ts/,
    /products\/.*\.spec\.ts/,
    // ASAN bridge (M3-M5). API-level for the same reason as the suites above: the
    // rules they assert live in triggers and RLS precisely so no client can dodge
    // them, so the honest test is the one that tries to dodge them.
    /asan\/.*\.spec\.ts/,
    /branding\/.*\.spec\.ts/,
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
