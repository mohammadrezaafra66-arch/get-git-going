import {
  areRolePermissionsLoaded,
  getCachedRolePermissions,
  type CachedRolePermissionRow,
} from "./permissions-cache";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Mirrors the `app_role` enum in the database.
 *
 * `purchase_specialist` and `site` exist in the DB enum and in
 * `role_permissions` (phase 1 of the 140-193 plan fixed the seeded name from
 * `purchasing_expert` to `purchase_specialist`), but were missing here, so
 * guards could not name them. They are intentionally NOT added to `ALL_ROLES`:
 * that list drives the role-picker UI and stays the five fixed system roles.
 */
export type AppRole =
  | "admin"
  | "manager"
  | "sales"
  | "accountant"
  | "viewer"
  | "purchase_specialist"
  | "site";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "مدیر کل",
  manager: "مدیر بخش",
  sales: "فروشنده",
  accountant: "حسابدار",
  viewer: "بیننده",
  purchase_specialist: "کارشناس خرید",
  site: "سایت",
};

export const ALL_ROLES: AppRole[] = ["admin", "manager", "sales", "accountant", "viewer"];

/**
 * Returns the full list of role names: the 5 fixed system roles plus any
 * active rows from `custom_roles`. System roles always come first; custom
 * roles are de-duplicated against the fixed list.
 */
export type RoleOption = { name: string; label: string };

export function useAllRoles() {
  const query = useQuery({
    queryKey: ["all-roles-combined"],
    queryFn: async (): Promise<RoleOption[]> => {
      const { data, error } = await supabase
        .from("custom_roles" as never)
        .select("name, display_name, is_active")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      const fixed: RoleOption[] = ALL_ROLES.map((n) => ({ name: n, label: ROLE_LABELS[n] }));
      const fixedSet = new Set(ALL_ROLES as string[]);
      const custom: RoleOption[] = (
        (data ?? []) as unknown as { name: string; display_name: string | null }[]
      )
        .filter((r) => !fixedSet.has(r.name))
        .map((r) => ({ name: r.name, label: r.display_name || r.name }));
      return [...fixed, ...custom];
    },
  });
  return { data: query.data ?? [], isLoading: query.isLoading, error: query.error };
}

export type ModuleKey =
  | "products"
  | "pricing"
  | "purchases"
  | "sales"
  | "invoices"
  | "accounting"
  | "price-lists"
  | "users"
  | "roles"
  | "reports"
  | "knowledge"
  | "feedback"
  | "messages"
  | "dashboard"
  | "audit-logs"
  | "data-tables"
  | "bot-api-keys"
  | "suppliers"
  | "academy"
  | "hr"
  | "market-rates"
  | "persons"
  | "warehouse"
  | "asan-import"
  | "asan-export"
  | "product-videos"
  | "platform-releases";

export type Action = "view" | "create" | "update" | "delete";
export type ExtendedAction = Action | "approve" | "export" | "view_sensitive";

/**
 * The static PERMISSIONS matrix was REMOVED here in wave 6 (X-3, migration 485).
 *
 * It was a second permission table living beside the real one. It had diverged from live
 * `role_permissions` in 13 modules, and because `hasPermission` read it as its SOLE source, the
 * eight call sites that used it answered incorrectly for roles actually held by users — an
 * accountant was denied `products.update` and a salesperson was denied `pricing` publish, both of
 * which the backend permits. Those call sites moved to `hasPermissionEx` (X-2) and the matrix
 * then had no reader left.
 *
 * `hasPermission` went with it: its only source was the matrix, and it dereferenced
 * `PERMISSIONS[module][action]` with no guard, so it could not survive the matrix's removal.
 *
 * There is now exactly ONE permission source: the `role_permissions` table, read live through
 * `getCachedRolePermissions()`. Migration 485 filled its last three role x module gaps
 * (purchase_specialist::persons, site::persons, site::warehouse) so that "no row" can be read
 * as a genuine denial rather than as missing data.
 */

const ACTION_COLUMN: Record<ExtendedAction, keyof CachedRolePermissionRow> = {
  view: "can_view",
  create: "can_create",
  update: "can_update",
  delete: "can_delete",
  approve: "can_approve",
  export: "can_export",
  view_sensitive: "can_view_sensitive",
};

/**
 * Whether the permission answer is knowable yet.
 *
 * Callers that RENDER on the answer must consult this first. `hasPermissionEx` has to return a
 * boolean, so while the table is still loading it returns `false` — the safe direction, but not
 * a true one. Showing a refusal, or hiding a control, on the strength of that `false` is the
 * "flash of the wrong one" this readiness flag exists to prevent: hold instead, then answer once.
 *
 * `admin` is exempt because `hasPermissionEx` short-circuits on it without reading the table.
 */
export function rolePermissionsReady(roles: AppRole[] | string[] = []): boolean {
  if ((roles as string[]).includes("admin")) return true;
  return areRolePermissionsLoaded();
}

/**
 * The single permission check. Reads live `role_permissions` through the cache.
 *
 * There is NO static fallback any more (wave 6, X-3). Migration 485 closed the last three
 * role x module gaps, so the table now covers 7 roles x 28 modules with no holes and a missing
 * row is a real denial rather than missing data.
 *
 * A `false` from this function means either "denied" or "not loaded yet". Use
 * `rolePermissionsReady(roles)` to tell those apart before rendering on the result.
 */
export function hasPermissionEx(
  roles: AppRole[] | string[],
  module: ModuleKey | string,
  action: ExtendedAction,
): boolean {
  if ((roles as string[]).includes("admin")) return true;
  const rows = getCachedRolePermissions();
  const matched = rows.filter(
    (r) => (roles as string[]).includes(r.role_name) && r.module === module,
  );
  if (matched.length === 0) return false;
  const col = ACTION_COLUMN[action];
  return matched.some((r) => Boolean(r[col]));
}

export function hasAnyRole(roles: AppRole[], allowed: AppRole[]): boolean {
  return roles.some((r) => allowed.includes(r));
}
