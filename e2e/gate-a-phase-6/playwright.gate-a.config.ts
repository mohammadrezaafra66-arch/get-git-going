/**
 * Gate A — phase 6 review harness.
 *
 * The repository's playwright.config.ts uses an explicit testMatch allowlist, and
 * this review's specs are deliberately NOT added to it: they are evidence
 * artefacts that print to the console and never assert a green/red contract, so
 * putting them in the regression suite would be noise at best and a flaky gate at
 * worst. This config runs them and nothing else.
 *
 *   npx playwright test --config e2e/gate-a-phase-6/playwright.gate-a.config.ts
 *
 * `use` mirrors the repository config so the review sees exactly what the
 * regression suite would see: same base URL, same admin session, same locale and
 * timezone.
 */
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";

export default defineConfig({
  testDir: ".",
  testMatch: [/.*\.spec\.ts/],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: "../../test-results/gate-a-phase-6",
  use: {
    baseURL,
    storageState: process.env.E2E_STORAGE ?? "e2e/auth/admin.storage.json",
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 20_000,
    ...devices["Desktop Chrome"],
  },
});
