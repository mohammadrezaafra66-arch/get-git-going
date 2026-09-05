import { redirect } from "@tanstack/react-router";
import type { AppRole, ModuleKey, ExtendedAction } from "@/lib/rbac/roles";
import { hasPermissionEx } from "@/lib/rbac/roles";
import {
  ensureAuthReady,
  getAuthSnapshot,
  refreshAuthIdentity,
  type AuthSnapshot,
} from "@/lib/auth/session";
import { loadRolePermissions } from "@/lib/rbac/dynamic-permissions";
import { logAuthDiagnostic } from "@/lib/auth/diagnostics";

/** اگر کاربر در snapshot نبود ولی auth هنوز در حال load است، یک بار force refresh کن. */
async function resolveAuthWithRetry() {
  if (typeof window === "undefined") return null;

  let auth = await ensureAuthReady();
  if (!auth.user && (auth.loading || !auth.initialized)) {
    auth = await ensureAuthReady(true);
  }
  return auth;
}

/**
 * A snapshot is usable for an access decision only when nothing is still in flight AND a role
 * set actually arrived.
 *
 * The second half is the part that is easy to miss. `roles: []` is NOT "this user has no roles" —
 * `loadIdentity` normalises a clean empty result to `["viewer"]`, precisely so that a real user
 * with no row is a viewer rather than a blank. So an empty array with no `rolesError` can only
 * mean the roles query has not produced an answer yet, and deciding on it would be deciding on
 * nothing.
 */
const isSettled = (auth: AuthSnapshot) =>
  !auth.rolesLoading &&
  !auth.profileLoading &&
  !auth.loading &&
  (auth.roles.length > 0 || !!auth.rolesError);

/**
 * Wait until the auth snapshot has actually finished loading roles.
 *
 * ## The hole this closes
 *
 * All three guards below used to contain this line:
 *
 *     if (auth.rolesLoading || auth.profileLoading || auth.loading) return { user, roles: auth.roles };
 *
 * A guard that RETURNS is a guard that PASSED. So during the window between "we know who you
 * are" and "we know what you may do", every guarded route in the application resolved
 * successfully and rendered. `auth.roles` is `[]` at that moment, so the page was handed an
 * empty role list and drew itself anyway.
 *
 * Measured on 2026-09-06, cold `viewer` session, `/admin/persons-cleanup`: the full page
 * rendered — 93 person rows, each with a delete button. The delete RPC itself is safely gated
 * (SECURITY INVOKER, and RLS admits only `admin`), so the exposure is SEEING, not deleting. That
 * distinction matters for severity and not at all for whether this is a defect: an admin-only
 * page listing every person in the business is a disclosure on its own.
 *
 * A warm session hides this completely — the roles are already in the snapshot before the
 * navigation starts, so the branch is never taken. It reproduces only on a genuinely cold one.
 *
 * ## Why waiting is the fix, and not a spinner component
 *
 * These guards run in `beforeLoad`. Awaiting here keeps the route in its PENDING state, which is
 * exactly the state the router already renders a pending component for. The page component is
 * not constructed, so there is no window in which it can paint with `roles: []`. Returning early
 * and then trying to re-check after hydration would mean the page had already rendered once,
 * which is the bug rather than the fix.
 *
 * ## Fail closed, in all three directions
 *
 * If roles arrive, the settled snapshot is returned and the normal role check decides.
 * If they arrive as `rolesError`, the caller throws — an unknown role set is not an empty one.
 * If they do not arrive at all, the snapshot comes back UNSETTLED and the caller refuses with a
 * redirect to /unauthorized. There is deliberately no branch here that returns an unsettled
 * snapshot as a pass, which is exactly what the line this replaced did.
 */
async function settleRoles(auth: AuthSnapshot): Promise<AuthSnapshot> {
  if (isSettled(auth)) return auth;

  const current = getAuthSnapshot();
  if (isSettled(current)) return current;

  // Drive the load rather than listening for it.
  //
  // The first version of this waited on subscribeAuthSnapshot() for the flags to clear. That is
  // the obvious shape and it was wrong in a way worth recording: nothing was guaranteed to
  // CAUSE another snapshot update, so when the identity load had already finished in a state
  // this function did not consider settled, no further notification was ever emitted and the
  // guard sat until its timeout on every navigation. Measured on a cold viewer session: the
  // route stayed on "در حال بررسی جلسه کاربری..." indefinitely.
  //
  // refreshAuthIdentity() awaits loadIdentity() directly. It is bounded by the session module's
  // own withAuthTimeout, and on timeout it SETS rolesError rather than leaving the flags
  // ambiguous — which isSettled() then accepts as an answer, and the caller turns into a refusal
  // one line later. So the wait is bounded by construction and there is no deadline to invent
  // here.
  const refreshed = await refreshAuthIdentity();
  if (!isSettled(refreshed)) {
    logAuthDiagnostic("guard.roles.unsettled", "roles did not resolve after a forced refresh", {
      rolesLoading: refreshed.rolesLoading,
      profileLoading: refreshed.profileLoading,
      loading: refreshed.loading,
      roleCount: refreshed.roles.length,
    });
  }
  return refreshed;
}

/** بررسی دسترسی کاربر به یک ماژول؛ در صورت نبود دسترسی به /unauthorized یا /login هدایت می‌کند. */
export async function requirePermission(module: ModuleKey, action: ExtendedAction = "view") {
  const resolved = await resolveAuthWithRetry();
  if (!resolved) return { user: null, roles: [] as AppRole[] };

  const user = resolved.user;
  if (!user) {
    logAuthDiagnostic("redirect.login", `requirePermission(${module},${action}): no user`, {
      loading: resolved.loading,
      initialized: resolved.initialized,
    });
    throw redirect({ to: "/login" });
  }
  // Wait for roles instead of returning success while they load. See settleRoles().
  const auth = await settleRoles(resolved);
  if (!isSettled(auth)) {
    logAuthDiagnostic(
      "redirect.unauthorized",
      `requirePermission(${module},${action}): roles never settled`,
      {},
    );
    throw redirect({ to: "/unauthorized" });
  }
  if (auth.rolesError) throw new Error(`بارگذاری نقش‌های کاربر ناموفق بود: ${auth.rolesError}`);

  const roles = auth.roles as AppRole[];
  // Ensure dynamic permissions cache is populated before checking.
  await loadRolePermissions();

  if (!hasPermissionEx(roles, module, action)) {
    logAuthDiagnostic("redirect.unauthorized", `requirePermission(${module},${action}) denied`, {
      roles,
    });
    throw redirect({ to: "/unauthorized" });
  }
  return { user, roles };
}

export async function requireAdmin() {
  const resolved = await resolveAuthWithRetry();
  if (!resolved) return { user: null, roles: [] as AppRole[] };

  const user = resolved.user;
  if (!user) {
    logAuthDiagnostic("redirect.login", "requireAdmin: no user", { loading: resolved.loading });
    throw redirect({ to: "/login" });
  }
  // Wait for roles instead of returning success while they load. See settleRoles().
  const auth = await settleRoles(resolved);
  if (!isSettled(auth)) {
    logAuthDiagnostic("redirect.unauthorized", "requireAdmin: roles never settled", {});
    throw redirect({ to: "/unauthorized" });
  }
  if (auth.rolesError) throw new Error(`بارگذاری نقش‌های کاربر ناموفق بود: ${auth.rolesError}`);

  const roles = auth.roles as AppRole[];
  if (!roles.includes("admin")) throw redirect({ to: "/unauthorized" });
  return { user, roles };
}

/**
 * بررسی اینکه کاربر یکی از نقش‌های مجاز را داشته باشد.
 *
 * Phase 6.7 — use THIS, never a hand-rolled `ensureAuthReady()` guard. Three
 * routes (/sales/quotes/new, /pricing/quick-price, /pricing/settlement-types)
 * open-coded the check as `if (!auth.user) throw redirect({to:"/login"})` and
 * bounced authenticated users to the login page on every server-rendered
 * navigation: ensureAuthReady() deliberately returns an UNINITIALIZED snapshot
 * during SSR, so `auth.user` is null on the server pass. resolveAuthWithRetry()
 * below returns null in that situation so the guard defers to the client pass,
 * and force-refreshes once when the session is still initializing.
 */
export async function requireAnyRole(allowed: readonly AppRole[]) {
  const resolved = await resolveAuthWithRetry();
  if (!resolved) return { user: null, roles: [] as AppRole[] };

  const user = resolved.user;
  if (!user) {
    logAuthDiagnostic("redirect.login", "requireAnyRole: no user", { loading: resolved.loading });
    throw redirect({ to: "/login" });
  }
  // Wait for roles instead of returning success while they load. See settleRoles().
  const auth = await settleRoles(resolved);
  if (!isSettled(auth)) {
    logAuthDiagnostic("redirect.unauthorized", "requireAnyRole: roles never settled", {});
    throw redirect({ to: "/unauthorized" });
  }
  if (auth.rolesError) throw new Error(`بارگذاری نقش‌های کاربر ناموفق بود: ${auth.rolesError}`);
  const roles = auth.roles as AppRole[];
  if (!roles.some((r) => allowed.includes(r))) throw redirect({ to: "/unauthorized" });
  return { user, roles };
}
