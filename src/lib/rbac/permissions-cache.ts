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

/**
 * Whether `role_permissions` has actually been read yet.
 *
 * This exists because wave 6 X-3 removed the static PERMISSIONS matrix from `roles.ts`. While
 * that matrix existed an unloaded cache was harmless: `hasPermissionEx` fell through to it and
 * produced a plausible answer. With the matrix gone, an unloaded cache and a genuinely empty
 * permission set are indistinguishable from the rows alone — both are `[]` — and answering
 * "denied" for the first is a confident, wrong answer that flashes the refusal UI at a user who
 * is in fact permitted.
 *
 * So the two states are kept apart explicitly: `cached.length === 0` says nothing on its own,
 * and this flag is the only thing that says the answer is knowable.
 */
let loaded = false;

export function setCachedRolePermissions(rows: CachedRolePermissionRow[]) {
  cached = rows;
  loaded = true;
}

/**
 * Return to the "not loaded" state. Use this — not `setCachedRolePermissions([])` — when
 * invalidating, or the cache would claim to hold an authoritative empty permission set and
 * every non-admin check would answer "denied" until the refetch lands.
 */
export function clearCachedRolePermissions() {
  cached = [];
  loaded = false;
}

export function getCachedRolePermissions(): CachedRolePermissionRow[] {
  return cached;
}

export function areRolePermissionsLoaded(): boolean {
  return loaded;
}
