// Visual regression — Playwright config. Driven by compare.mjs, not run directly.
// See docs/runbooks/visual-regression/README.md.
import { defineConfig } from "@playwright/test";
import path from "node:path";

const OUT = process.env.VISREG_OUT ?? "";
const SIDE = process.env.VISREG_SIDE ?? "";
if (!OUT || !["before", "after"].includes(SIDE)) {
  throw new Error(
    "Run through scripts/visual-regression/compare.mjs (VISREG_OUT / VISREG_SIDE unset).",
  );
}

export default defineConfig({
  testDir: ".",
  testMatch: /capture\.spec\.ts$/,
  // The "before" run writes the baseline here; the "after" run compares against it.
  snapshotPathTemplate: path.join(OUT, "before", "{arg}{ext}"),
  outputDir: path.join(OUT, `test-results-${SIDE}`),
  reporter: [["list"], ["json", { outputFile: path.join(OUT, `report-${SIDE}.json`) }]],
  workers: 1,
  retries: 0,
  timeout: 120_000,
  use: {
    viewport: { width: 1366, height: 900 },
    deviceScaleFactor: 1,
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    colorScheme: "light",
    contextOptions: { reducedMotion: "reduce" },
    // A service worker can answer requests before page.route sees them — the write guard must see everything.
    serviceWorkers: "block",
    navigationTimeout: 60_000,
  },
});
