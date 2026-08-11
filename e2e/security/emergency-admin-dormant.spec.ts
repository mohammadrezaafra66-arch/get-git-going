import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { dbRows } from "../helpers/db";
import { ADMIN_USER_ID } from "../helpers/pgrest";

/**
 * ASAN M1.6 / migration 282 — `afra-admin@local.test` is a break-glass account.
 * It was activated for an earlier test harness and left active. It should exist,
 * and it should not be usable day to day.
 *
 * `src/routes/_app.tsx` redirects any profile whose status is not 'active' to
 * /pending-approval, so `status='inactive'` is what actually closes the door.
 *
 * This spec also guards the reason it was left active in the first place: the
 * harness depended on it. If a future change repoints the suite back at the
 * emergency account, these assertions fail rather than the account quietly
 * being reactivated to make a test pass.
 */

const EMERGENCY_EMAIL = "afra-admin@local.test";
const EMERGENCY_ID = "48f7c9d5-096e-437e-af9b-9cb0be5deb8c";

test.describe("M1.6 — the emergency admin is dormant", () => {
  test("the account exists but its profile is inactive", async () => {
    const row = dbRows(`
      select p.status || '|' || p.is_active::text
        from public.profiles p join auth.users u on u.id = p.id
       where u.email = '${EMERGENCY_EMAIL}'
    `);
    expect(row.length, `${EMERGENCY_EMAIL} is missing — it should exist, just be dormant`).toBe(1);
    expect(row[0], "the emergency admin is usable again").toBe("inactive|false");
  });

  test("the app refuses any profile that is not active", async () => {
    // The guard this relies on, asserted directly so a refactor that drops it is
    // caught here rather than by an account silently regaining access.
    const guard = fs.readFileSync("src/routes/_app.tsx", "utf8");
    expect(guard, "_app.tsx no longer redirects non-active profiles").toContain(
      'redirect({ to: "/pending-approval" })',
    );
    expect(guard).toContain('status !== "active"');
  });

  test("the e2e harness no longer depends on the emergency account", async () => {
    expect(ADMIN_USER_ID, "pgrest helper still mints JWTs for the emergency admin").not.toBe(
      EMERGENCY_ID,
    );

    const state = fs.readFileSync("e2e/auth/admin.storage.json", "utf8");
    expect(state, "the admin storageState still carries an emergency-admin session").not.toContain(
      EMERGENCY_EMAIL,
    );
    expect(state.length, "the admin storageState is empty — page.pause() trap").toBeGreaterThan(
      500,
    );

    const owner = dbRows(`
      select u.email from auth.users u where u.id = '${ADMIN_USER_ID}'
    `);
    expect(owner[0], "the harness admin is not the expected test account").toBe(
      "test.admin@afrakala.local",
    );
  });

  test("the replacement harness admin is active and really is an admin", async () => {
    const row = dbRows(`
      select p.status || '|' || p.is_active::text || '|' ||
             coalesce((select string_agg(r.role, ',' order by r.role)
                         from public.user_roles r where r.user_id = p.id), '')
        from public.profiles p
       where p.id = '${ADMIN_USER_ID}'
    `);
    expect(row.length).toBe(1);
    const [status, isActive, roles] = row[0].split("|");
    expect(status).toBe("active");
    expect(isActive).toBe("true");
    expect(roles.split(",")).toContain("admin");
  });
});
