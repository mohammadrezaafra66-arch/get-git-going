import { hasPermissionEx } from "@/lib/rbac/roles";
import type { AppRole } from "@/lib/rbac/roles";
import { NAVIGATION_REGISTRY } from "./registry";
import type { NavigationEntry, NavigationPrimaryModule } from "./types";

const PRIMARY_ACTION_ROLE_PRECEDENCE: AppRole[] = [
  "admin",
  "manager",
  "accountant",
  "sales",
  "viewer",
];

export function getNavigationEntries(): NavigationEntry[] {
  return NAVIGATION_REGISTRY;
}

export function getNavigationEntryById(id: string): NavigationEntry | undefined {
  return NAVIGATION_REGISTRY.find((entry) => entry.id === id);
}

export function getNavigationEntryByRoute(route: string): NavigationEntry | undefined {
  return NAVIGATION_REGISTRY.find((entry) => entry.route === route);
}

export function getNavigationEntriesByModule(module: NavigationPrimaryModule): NavigationEntry[] {
  return NAVIGATION_REGISTRY.filter((entry) => entry.primaryModule === module);
}

export function isNavigationEntryVisible(
  entry: NavigationEntry,
  roles: AppRole[] | string[],
): boolean {
  if (entry.adminOnly && !roles.includes("admin") && !roles.includes("manager")) return false;
  if (entry.allowedRoles && !entry.allowedRoles.some((role) => roles.includes(role))) return false;
  return hasPermissionEx(roles, entry.permission.module, entry.permission.action);
}

export function getVisibleNavigationEntries(roles: AppRole[] | string[]): NavigationEntry[] {
  return NAVIGATION_REGISTRY.filter((entry) => isNavigationEntryVisible(entry, roles));
}

export function getSearchableNavigationEntries(roles: AppRole[] | string[]): NavigationEntry[] {
  return getVisibleNavigationEntries(roles);
}

export function getPinnableNavigationEntries(roles: AppRole[] | string[]): NavigationEntry[] {
  return getVisibleNavigationEntries(roles).filter((entry) => entry.pinnable);
}

export function getMobileNavigationEntries(roles: AppRole[] | string[]): NavigationEntry[] {
  return getVisibleNavigationEntries(roles)
    .filter((entry) => entry.mobileVisible)
    .sort((a, b) => (a.mobilePriority ?? 999) - (b.mobilePriority ?? 999));
}

export function getPrimaryActionEntry(roles: AppRole[] | string[]): NavigationEntry | undefined {
  const visible = getVisibleNavigationEntries(roles);
  const normalizedRoles = PRIMARY_ACTION_ROLE_PRECEDENCE.filter((role) => roles.includes(role));

  for (const role of normalizedRoles) {
    const entry = visible.find((item) => item.primaryForRoles.includes(role));
    if (entry) return entry;
  }

  return visible.find((item) => item.route === "/dashboard") ?? visible[0];
}
