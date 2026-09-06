import { supabase } from "@/integrations/supabase/client";
import type { ModuleKey, Action } from "./roles";
import { clearCachedRolePermissions, setCachedRolePermissions } from "./permissions-cache";

export type DynamicAction = Action | "approve" | "export" | "view_sensitive";

export interface RolePermissionRow {
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

const CACHE_TTL_MS = 5 * 60 * 1000;
const PERMISSIONS_TIMEOUT_MS = 10_000;
let cache: { rows: RolePermissionRow[]; ts: number } | null = null;
let inflight: Promise<RolePermissionRow[]> | null = null;

async function withPermissionsTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("role permissions timeout")),
      PERMISSIONS_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function loadRolePermissions(force = false): Promise<RolePermissionRow[]> {
  if (!force && cache && Date.now() - cache.ts < CACHE_TTL_MS) return cache.rows;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await withPermissionsTimeout(
        supabase
          .from("role_permissions" as never)
          .select(
            "role_name,module,can_view,can_create,can_update,can_delete,can_approve,can_export,can_view_sensitive",
          ),
      );
      if (error) {
        inflight = null;
        return cache?.rows ?? [];
      }
      const rows = (data ?? []) as unknown as RolePermissionRow[];
      cache = { rows, ts: Date.now() };
      setCachedRolePermissions(rows);
      inflight = null;
      return rows;
    } catch {
      inflight = null;
      return cache?.rows ?? [];
    }
  })();
  return inflight;
}

export function invalidateRolePermissionsCache() {
  cache = null;
  // clear, NOT setCachedRolePermissions([]) — the latter marks the cache "loaded" while holding
  // no rows, so every non-admin check would answer a confident "denied" until the refetch lands.
  clearCachedRolePermissions();
}

const ACTION_COL: Record<DynamicAction, keyof RolePermissionRow> = {
  view: "can_view",
  create: "can_create",
  update: "can_update",
  delete: "can_delete",
  approve: "can_approve",
  export: "can_export",
  view_sensitive: "can_view_sensitive",
};

export function hasPermissionDynamic(
  roles: string[],
  module: ModuleKey | string,
  action: DynamicAction,
  rows: RolePermissionRow[],
): boolean {
  if (roles.includes("admin")) return true;
  const col = ACTION_COL[action];
  const matched = rows.filter((r) => roles.includes(r.role_name) && r.module === module);
  if (matched.length > 0) return matched.some((r) => Boolean(r[col]));
  // No static fallback: the static PERMISSIONS matrix was removed in wave 6 (X-3), and
  // migration 485 closed the last three role x module gaps, so a missing row is a real denial.
  return false;
}
