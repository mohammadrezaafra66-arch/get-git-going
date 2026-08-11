import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";

/**
 * Dedicated config for interactive auth capture / validation.
 * Normal regression uses playwright.config.ts and does not include these specs.
 *
 *   npx playwright test --config=playwright.auth.config.ts e2e/auth/generate-role-sessions.spec.ts
 *   npx playwright test --config=playwright.auth.config.ts e2e/auth/save-role-sessions.spec.ts --headed
 *   npx playwright test --config=playwright.auth.config.ts e2e/auth/validate-role-sessions.spec.ts
 */
export default defineConfig({
  testDir: "./e2e/auth",
  testMatch: /\.spec\.ts$/,
  timeout: 15 * 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results/auth-setup",
  use: {
    baseURL,
    // Fresh anonymous context by default; individual tests may load a storageState.
    storageState: { cookies: [], origins: [] },
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium-auth",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
