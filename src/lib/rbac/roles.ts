import { getCachedRolePermissions } from "./permissions-cache";
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
  | "warehouse";

export type Action = "view" | "create" | "update" | "delete";
export type ExtendedAction = Action | "approve" | "export" | "view_sensitive";

/** ماتریس دسترسی نقش-محور. */
export const PERMISSIONS: Record<ModuleKey, Record<Action, AppRole[]>> = {
  dashboard: { view: ALL_ROLES, create: [], update: [], delete: [] },
  products: {
    view: ALL_ROLES,
    create: ["admin", "manager"],
    update: ["admin", "manager"],
    delete: ["admin"],
  },
  pricing: {
    view: ["admin", "manager", "accountant"],
    create: ["admin", "manager", "accountant"],
    update: ["admin", "manager", "accountant"],
    delete: ["admin"],
  },
  purchases: {
    view: ["admin", "manager", "accountant", "viewer"],
    create: ["admin", "manager"],
    update: ["admin", "manager"],
    delete: ["admin"],
  },
  sales: {
    view: ALL_ROLES,
    create: ["admin", "manager", "sales"],
    update: ["admin", "manager", "sales"],
    delete: ["admin"],
  },
  invoices: {
    view: ALL_ROLES,
    create: ["admin", "manager", "sales"],
    update: ["admin", "manager", "sales"],
    delete: ["admin"],
  },
  "price-lists": {
    view: ALL_ROLES,
    create: ["admin", "manager"],
    update: ["admin", "manager"],
    delete: ["admin"],
  },
  users: { view: ["admin"], create: ["admin"], update: ["admin"], delete: ["admin"] },
  roles: { view: ["admin"], create: ["admin"], update: ["admin"], delete: ["admin"] },
  reports: { view: ALL_ROLES, create: [], update: [], delete: [] },
  knowledge: {
    view: ALL_ROLES,
    create: ["admin", "manager"],
    update: ["admin", "manager"],
    delete: ["admin"],
  },
  feedback: { view: ALL_ROLES, create: ALL_ROLES, update: ["admin", "manager"], delete: ["admin"] },
  messages: { view: ALL_ROLES, create: ALL_ROLES, update: ALL_ROLES, delete: ["admin"] },
  "audit-logs": { view: ["admin"], create: [], update: [], delete: [] },
  "data-tables": {
    view: ["admin", "manager", "accountant", "viewer"],
    create: ["admin", "manager"],
    update: ["admin", "manager"],
    delete: ["admin"],
  },
  "bot-api-keys": {
    view: ["admin", "manager"],
    create: ["admin", "manager"],
    update: ["admin", "manager"],
    delete: ["admin", "manager"],
  },
  suppliers: {
    view: ["admin", "manager", "accountant"],
    create: ["admin", "accountant"],
    update: ["admin", "accountant"],
    delete: ["admin"],
  },
  academy: {
    view: ALL_ROLES,
    create: ["admin", "manager"],
    update: ["admin", "manager"],
    delete: ["admin", "manager"],
  },
  hr: {
    view: ["admin", "manager"],
    create: ALL_ROLES,
    update: ["admin", "manager"],
    delete: ["admin"],
  },
  "market-rates": {
    view: ["admin", "manager", "accountant", "sales"],
    create: ["admin", "manager", "accountant"],
    update: ["admin", "manager", "accountant"],
    delete: ["admin"],
  },
  // S15 — ماژول «اشخاص» (پرونده‌ی یکپارچه شخص حقیقی/حقوقی).
  // اقدامات extended (approve/export/view_sensitive) از طریق role_permissions
  // به‌صورت پویا کنترل می‌شوند؛ اینجا فقط چهار اقدام پایه تعریف می‌شود.
  persons: {
    view: ALL_ROLES,
    create: ["admin", "manager"],
    update: ["admin", "manager"],
    delete: ["admin"],
  },
  // Phase 8 — mirrors the warehouse RLS policies and the role_permissions seed
  // in migration 209: operational roles read, admin/manager manage.
  warehouse: {
    view: ["admin", "manager", "accountant", "sales", "purchase_specialist"],
    create: ["admin", "manager"],
    update: ["admin", "manager"],
    delete: ["admin", "manager"],
  },
  // UI-NAV.4 — ماژول جداگانه برای منوهای «مالی و حسابداری».
  // فروشنده/بیننده دسترسی پیش‌فرض ندارند تا منوهای مالی برایشان پنهان شود.
  // route guard های مربوطه از قبل با requireAnyRole(["admin","manager","accountant"]) محدود شده‌اند.
  accounting: {
    view: ["admin", "manager", "accountant"],
    create: ["admin", "manager", "accountant"],
    update: ["admin", "manager", "accountant"],
    delete: ["admin"],
  },
};

export function hasPermission(roles: AppRole[], module: ModuleKey, action: Action): boolean {
  if (roles.includes("admin")) return true;
  return PERMISSIONS[module][action].some((r) => roles.includes(r));
}

/**
 * Dynamic permission check that consults the cached `role_permissions` table when available.
 * If no DB row exists for the role+module, falls back to the static PERMISSIONS matrix
 * (only for the four standard actions). For extended actions (approve/export/view_sensitive)
 * the static fallback returns true only for admin/manager (sensible safe default).
 */
const SENSITIVE_FALLBACK: AppRole[] = ["admin", "manager", "accountant"];
const APPROVE_FALLBACK: AppRole[] = ["admin", "manager"];
const EXPORT_FALLBACK: AppRole[] = ["admin", "manager", "accountant"];

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
  if (matched.length > 0) {
    const col =
      action === "view"
        ? "can_view"
        : action === "create"
          ? "can_create"
          : action === "update"
            ? "can_update"
            : action === "delete"
              ? "can_delete"
              : action === "approve"
                ? "can_approve"
                : action === "export"
                  ? "can_export"
                  : "can_view_sensitive";
    return matched.some((r) => Boolean((r as any)[col]));
  }
  // Fallback to static
  if (action === "view" || action === "create" || action === "update" || action === "delete") {
    return (
      PERMISSIONS[module as ModuleKey]?.[action]?.some((r) => (roles as string[]).includes(r)) ??
      false
    );
  }
  const fb =
    action === "approve"
      ? APPROVE_FALLBACK
      : action === "export"
        ? EXPORT_FALLBACK
        : SENSITIVE_FALLBACK;
  return fb.some((r) => (roles as string[]).includes(r));
}

export function hasAnyRole(roles: AppRole[], allowed: AppRole[]): boolean {
  return roles.some((r) => allowed.includes(r));
}
