/**
 * Build a browser session for a named test role WITHOUT mutating anything.
 *
 * Why this exists (wave 1, agent C)
 * --------------------------------
 * The refusal half of this mission has to show a `sales` and a `viewer` session
 * being turned away at a route. The material already in the repo does not cover
 * that:
 *
 *   - `e2e/auth/*.storage.json` holds only admin / accountant / salesperson-a /
 *     salesperson-b, and every one of them expired on 2026-09-03. There is no
 *     viewer state at all.
 *   - Reviving them means spending their refresh token, which GoTrue rotates.
 *     With four agents sharing one test server that quietly invalidates a file
 *     another mission is about to read.
 *   - `e2e/auth/generate-role-sessions.spec.ts` solves it by RESETTING the test
 *     users' passwords through the Auth Admin API. Sanctioned, but it is a write
 *     against shared accounts, and the same four-agent argument applies.
 *
 * So this helper mints the JWT locally instead, with `mintJwt` from
 * `./pgrest` — the same HS256/`JWT_SECRET` signing the API-level specs already
 * rely on. Nothing is written: no password changes, no token rotation, no
 * GoTrue call. The only database access is a SELECT for the user's id through
 * the read-only `dbScalar` helper, which refuses non-read-only SQL.
 *
 * The session is then handed to Playwright as a `storageState`, seeded into the
 * same `localStorage` key supabase-js would have written itself.
 */
import { dbScalar } from "./db";
import { mintJwt } from "./pgrest";

/** Test accounts on the LAN server. Roles verified against `public.user_roles`. */
export const ROLE_EMAILS = {
  admin: "test.admin@afrakala.local",
  manager: "test.manager@afrakala.local",
  sales: "test.sales@afrakala.local",
  accountant: "test.accountant@afrakala.local",
  viewer: "test.viewer@afrakala.local",
} as const;

export type TestRole = keyof typeof ROLE_EMAILS;

/**
 * supabase-js derives its storage key from the FIRST dot-separated label of the
 * Supabase host, so `http://192.168.170.8:9000` yields `sb-192-auth-token`. The
 * committed storage states use exactly that name, which is the cross-check that
 * this derivation is right.
 */
export function authStorageKey(supabaseUrl: string): string {
  return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
}

const idCache = new Map<string, string>();

/** Resolve a test account's uuid. SELECT only. */
export function userIdFor(role: TestRole): string {
  const email = ROLE_EMAILS[role];
  const cached = idCache.get(email);
  if (cached) return cached;
  const id = dbScalar(`select id from auth.users where email = '${email}'`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error(`No auth.users row for ${email} (got: ${JSON.stringify(id)})`);
  }
  idCache.set(email, id);
  return id;
}

/**
 * A Playwright storageState carrying a freshly minted session for `role`.
 *
 * The TTL is deliberately long (2h). supabase-js refreshes a session shortly
 * before it expires, and the minted token has no usable refresh token, so a
 * refresh attempt mid-test would sign the user out and turn a passing assertion
 * into a misleading failure.
 */
export function storageStateForRole(
  role: TestRole,
  origin: string,
  supabaseUrl: string,
): { cookies: never[]; origins: { origin: string; localStorage: { name: string; value: string }[] }[] } {
  const userId = userIdFor(role);
  const ttlSeconds = 2 * 60 * 60;
  const accessToken = mintJwt(userId, ttlSeconds);
  const session = {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: ttlSeconds,
    expires_at: Math.floor(Date.now() / 1000) + ttlSeconds,
    refresh_token: "",
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: ROLE_EMAILS[role],
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      created_at: new Date(0).toISOString(),
    },
  };

  return {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [{ name: authStorageKey(supabaseUrl), value: JSON.stringify(session) }],
      },
    ],
  };
}
