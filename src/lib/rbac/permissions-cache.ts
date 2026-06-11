export interface CachedRolePermissionRow {
  role_name: string;
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
  can_approve: boolean;
  can_export: boolean;
  can_view_sensitive: boolean;
}

let cached: CachedRolePermissionRow[] = [];

export function setCachedRolePermissions(rows: CachedRolePermissionRow[]) {
  cached = rows;
}

export function getCachedRolePermissions(): CachedRolePermissionRow[] {
  return cached;
}
