import { redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole, ModuleKey, Action } from "@/lib/rbac/roles";
import { hasPermission } from "@/lib/rbac/roles";

/** بررسی دسترسی کاربر به یک ماژول؛ در صورت نبود دسترسی به /unauthorized یا /login هدایت می‌کند. */
export async function requirePermission(module: ModuleKey, action: Action = "view") {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw redirect({ to: "/login" });

  const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const roles = (data ?? []).map((r) => r.role as AppRole);

  if (!hasPermission(roles, module, action)) {
    throw redirect({ to: "/unauthorized" });
  }
  return { user, roles };
}

export async function requireAdmin() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw redirect({ to: "/login" });
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const roles = (data ?? []).map((r) => r.role as AppRole);
  if (!roles.includes("admin")) throw redirect({ to: "/unauthorized" });
  return { user, roles };
}