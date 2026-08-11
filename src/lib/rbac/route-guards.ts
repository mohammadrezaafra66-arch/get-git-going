import { redirect } from "@tanstack/react-router";
import type { AppRole, ModuleKey, ExtendedAction } from "@/lib/rbac/roles";
import { hasPermissionEx } from "@/lib/rbac/roles";
import { ensureAuthReady } from "@/lib/auth/session";
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

/** بررسی دسترسی کاربر به یک ماژول؛ در صورت نبود دسترسی به /unauthorized یا /login هدایت می‌کند. */
export async function requirePermission(module: ModuleKey, action: ExtendedAction = "view") {
  const auth = await resolveAuthWithRetry();
  if (!auth) return { user: null, roles: [] as AppRole[] };

  const user = auth.user;
  if (!user) {
    logAuthDiagnostic("redirect.login", `requirePermission(${module},${action}): no user`, {
      loading: auth.loading,
      initialized: auth.initialized,
    });
    throw redirect({ to: "/login" });
  }
  if (auth.rolesLoading || auth.profileLoading || auth.loading) return { user, roles: auth.roles };
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
  const auth = await resolveAuthWithRetry();
  if (!auth) return { user: null, roles: [] as AppRole[] };

  const user = auth.user;
  if (!user) {
    logAuthDiagnostic("redirect.login", "requireAdmin: no user", { loading: auth.loading });
    throw redirect({ to: "/login" });
  }
  if (auth.rolesLoading || auth.profileLoading || auth.loading) return { user, roles: auth.roles };
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
  const auth = await resolveAuthWithRetry();
  if (!auth) return { user: null, roles: [] as AppRole[] };

  const user = auth.user;
  if (!user) {
    logAuthDiagnostic("redirect.login", "requireAnyRole: no user", { loading: auth.loading });
    throw redirect({ to: "/login" });
  }
  if (auth.rolesLoading || auth.profileLoading || auth.loading) return { user, roles: auth.roles };
  if (auth.rolesError) throw new Error(`بارگذاری نقش‌های کاربر ناموفق بود: ${auth.rolesError}`);
  const roles = auth.roles as AppRole[];
  if (!roles.some((r) => allowed.includes(r))) throw redirect({ to: "/unauthorized" });
  return { user, roles };
}
