import type { RolePermissionRow } from "./dynamic-permissions";

let cached: RolePermissionRow[] = [];

export function setCachedRolePermissions(rows: RolePermissionRow[]) {
  cached = rows;
}

export function getCachedRolePermissions(): RolePermissionRow[] {
  return cached;
}