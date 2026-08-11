import { test } from "@playwright/test";

/**
 * Retired by ASAN M1.6. Do not restore this spec's previous body.
 *
 * It called `page.pause()` and waited for a human to log in. Headless does not
 * block on pause, so running it non-interactively wrote an EMPTY
 * `e2e/auth/admin.storage.json` and turned the whole regression red — with no
 * error, because saving an empty storage state succeeds.
 *
 * The admin session is now produced by `e2e/auth/generate-role-sessions.spec.ts`
 * alongside the accountant and the two salespeople, non-interactively, for
 * `test.admin@afrakala.local`. This file is kept as a signpost rather than
 * deleted, because the old command is in people's shell history.
 */
test("save admin authenticated session (retired — use generate-role-sessions)", () => {
  throw new Error(
    [
      "This spec is retired: it used page.pause(), which silently writes an empty",
      "storageState when run headless and turns the whole suite red.",
      "",
      "Generate all four sessions instead:",
      "  npx playwright test e2e/auth/generate-role-sessions.spec.ts --config=playwright.auth.config.ts",
    ].join("\n"),
  );
});
