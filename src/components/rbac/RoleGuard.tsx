import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { AppRole } from "@/lib/rbac/roles";

interface Props {
  roles: AppRole[];
  fallback?: ReactNode;
  children: ReactNode;
}

export function RoleGuard({ roles, fallback = null, children }: Props) {
  const { roles: userRoles } = useAuth();
  if (userRoles.includes("admin")) return <>{children}</>;
  const ok = userRoles.some((r) => roles.includes(r));
  return <>{ok ? children : fallback}</>;
}
