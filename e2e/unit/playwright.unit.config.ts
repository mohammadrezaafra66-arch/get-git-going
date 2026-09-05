import { defineConfig } from "@playwright/test";

/**
 * Node-only unit tests — no browser, no live APIs, no database.
 *
 * `receipt-ocr-structured` — form mapping helpers against mocked OCR JSON.
 * `ledger-wizard-party-pick` — D-1/D-3: which file the wizard books a document
 *   against. Pure decision function; the browser cannot reach either defect
 *   (see the header of that spec for the measurement).
 */
export default defineConfig({
  testDir: ".",
  testMatch: /(receipt-ocr-structured|ledger-wizard-party-pick|ai-usage-route)\.spec\.ts/,
  timeout: 30_000,
  fullyParallel: true,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {},
});
