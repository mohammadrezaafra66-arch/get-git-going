import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseURL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";

export default defineConfig({
  testDir: __dirname,
  testMatch: /.*\.spec\.ts/,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  outputDir: path.join(__dirname, "../../test-results/collab-e2e-artifacts"),
  reporter: [
    ["list"],
    ["html", { outputFolder: path.join(__dirname, "../../test-results/collab-e2e-html"), open: "never" }],
    ["json", { outputFile: path.join(__dirname, "../../test-results/collab-e2e/results.json") }],
  ],
  use: {
    baseURL,
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium-collab",
      use: {
        ...devices["Desktop Chrome"],
        // Prefer system Chrome — sandbox PLAYWRIGHT_BROWSERS_PATH often lacks browsers
        channel: "chrome",
      },
    },
  ],
});
