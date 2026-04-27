import { redirect } from "@tanstack/react-router";
import type { AppRole, ModuleKey, Action } from "@/lib/rbac/roles";
import { hasPermission } from "@/lib/rbac/roles";
import { ensureAuthReady } from "@/lib/auth/session";

/** بررسی دسترسی کاربر به یک ماژول؛ در صورت نبود دسترسی به /unauthorized یا /login هدایت می‌کند. */
export async function requirePermission(module: ModuleKey, action: Action = "view") {
  const auth = await ensureAuthReady();
  const user = auth.user;
  if (!user) throw redirect({ to: "/login" });
  if (auth.rolesLoading || auth.profileLoading || auth.loading) return { user, roles: auth.roles };
  if (auth.rolesError) throw new Error(`بارگذاری نقش‌های کاربر ناموفق بود: ${auth.rolesError}`);

  const roles = auth.roles as AppRole[];

  if (!hasPermission(roles, module, action)) {
    throw redirect({ to: "/unauthorized" });
  }
  return { user, roles };
}

export async function requireAdmin() {
  const auth = await ensureAuthReady();
  const user = auth.user;
  if (!user) throw redirect({ to: "/login" });
  if (auth.rolesLoading || auth.profileLoading || auth.loading) return { user, roles: auth.roles };
  if (auth.rolesError) throw new Error(`بارگذاری نقش‌های کاربر ناموفق بود: ${auth.rolesError}`);

  const roles = auth.roles as AppRole[];
  if (!roles.includes("admin")) throw redirect({ to: "/unauthorized" });
  return { user, roles };
}

/** بررسی اینکه کاربر یکی از نقش‌های مجاز را داشته باشد. */
export async function requireAnyRole(allowed: AppRole[]) {
  const auth = await ensureAuthReady();
  const user = auth.user;
  if (!user) throw redirect({ to: "/login" });
  if (auth.rolesLoading || auth.profileLoading || auth.loading) return { user, roles: auth.roles };
  if (auth.rolesError) throw new Error(`بارگذاری نقش‌های کاربر ناموفق بود: ${auth.rolesError}`);
  const roles = auth.roles as AppRole[];
  if (!roles.some((r) => allowed.includes(r))) throw redirect({ to: "/unauthorized" });
  return { user, roles };
}