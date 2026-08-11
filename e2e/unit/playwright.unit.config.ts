import { defineConfig } from "@playwright/test";

/** Node-only unit tests for receipt OCR — no browser, no live APIs. */
export default defineConfig({
  testDir: ".",
  testMatch: /receipt-ocr-structured\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {},
});
