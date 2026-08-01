import { test, expect } from "@playwright/test";

/**
 * Probe: is e2e/auth/admin.storage.json still a usable session?
 *
 * The stored access token expired on 2026-07-29; this checks whether the
 * refresh token still gets us an authenticated app shell. Every other spec in
 * this folder depends on the answer, so this runs first (leading underscore
 * sorts it to the top).
 */
test("admin storage state still authenticates", async ({ page }) => {
  await page.goto("/persons");
  await page.waitForLoadState("networkidle");

  const url = page.url();
  const bodyText = (await page.locator("body").innerText()).slice(0, 400);

  console.log("URL after /persons:", url);
  console.log("BODY HEAD:", bodyText.replace(/\s+/g, " "));

  // A redirect to the login route, or a visible login form, means the session
  // is dead and a human must re-run e2e/auth/save-admin-session.spec.ts.
  const onLogin = /\/(login|auth|sign-?in)/i.test(url);
  const hasPasswordField = await page.locator('input[type="password"]').count();

  expect(
    onLogin || hasPasswordField > 0,
    `Session appears DEAD (url=${url}). A human must re-run save-admin-session.spec.ts.`,
  ).toBeFalsy();
});
