/**
 * Wave 6 B-1 — a real browser sign-in must write exactly one `login_success` audit row.
 *
 * Why this spec exists. `audit_logs` held **0** rows with `action='login_success'` and 0 rows
 * of any action with `entity_type='auth'`, against 997 real sign-ins recorded in
 * `auth.audit_log_entries`. The cause was neither RLS nor a missing JWT — `public.log_event`
 * inserts correctly when called with a simulated `authenticated` JWT. supabase-js query
 * builders are LAZY: postgrest-js issues its `fetch` inside `PostgrestBuilder.then()`, so
 * `void supabase.rpc(...)` built a request object and discarded it without ever sending it.
 *
 * This spec is the FIX evidence: the same probe on both sides of one real browser login.
 * Against a build carrying the `void` it records +0; against the fixed build it records +1.
 *
 * It deliberately does NOT roll back. The row is a genuine sign-in by the E2E admin account,
 * and `audit_logs` is append-only history — a login that happened should be recorded. It
 * creates no financial document, so it is outside `rule12-no-gate-creates-posted-documents`.
 *
 * Point E2E_BASE_URL at the build under test. There is no storageState: the whole point is to
 * exercise the interactive sign-in path in `AuthProvider.signIn`, so it starts signed out.
 */
import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://192.168.170.8:3100";
const EMAIL = process.env.E2E_ADMIN_EMAIL ?? "test.admin@afrakala.local";
const PASSWORD = process.env.E2E_LAN_TEST_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "";

/** Read-only probe. Runs as `postgres` in a read-only transaction — it can never write. */
function countLoginSuccess(): number {
  const out = execFileSync(
    "docker",
    [
      "exec",
      "-u",
      "postgres",
      "-e",
      "PGOPTIONS=-c default_transaction_read_only=on",
      "afrakala-lan-db",
      "psql",
      "-d",
      "afrakala",
      "-Atc",
      "select count(*) from public.audit_logs where action='login_success'",
    ],
    { encoding: "utf8" },
  );
  return Number.parseInt(out.trim(), 10);
}

// The repo config signs every spec in as admin via storageState. This one must start signed
// OUT — an already-authenticated context never runs AuthProvider.signIn at all.
test.use({ storageState: { cookies: [], origins: [] } });

test("a real browser sign-in writes exactly one login_success audit row", async ({ page }) => {
  test.skip(!PASSWORD, "set E2E_LAN_TEST_PASSWORD to run the B-1 login probe");

  const before = countLoginSuccess();

  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.locator('input[name="email"][type="email"]').waitFor({ state: "visible" });
  await page.locator('input[name="email"][type="email"]').fill(EMAIL);
  await page.locator('input[name="password"][type="password"]').fill(PASSWORD);

  // The submit button renders disabled and captioned «در حال آماده‌سازی...» until auth has
  // initialised, and only then becomes «ورود». A Vite dev build compiles on demand and can sit
  // in that state for a while, so wait for the enabled button rather than racing it.
  const submit = page.getByRole("button", { name: /^ورود$/ });
  await expect(submit).toBeEnabled({ timeout: 90_000 });
  await submit.click();

  // The sign-in has to actually succeed, or the probe below proves nothing.
  await expect(page).not.toHaveURL(/\/login(?:$|\?)/, { timeout: 30_000 });

  // The write is awaited inside signIn(), so it has landed by the time navigation happens.
  // Poll anyway rather than sleeping, so a slow round-trip does not flake the assertion.
  await expect
    .poll(() => countLoginSuccess(), { timeout: 15_000, intervals: [250, 500, 1000] })
    .toBe(before + 1);

  const after = countLoginSuccess();
  // Exactly one, not "at least one": a double-write would be its own defect.
  expect(after - before).toBe(1);
});
