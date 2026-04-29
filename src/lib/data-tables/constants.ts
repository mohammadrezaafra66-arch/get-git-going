export type DynamicColumnDataType =
  | "text" | "number" | "boolean" | "date" | "datetime" | "phone" | "tag" | "status";

export const DYNAMIC_COLUMN_DATA_TYPES: DynamicColumnDataType[] = [
  "text", "number", "boolean", "date", "datetime", "phone", "tag", "status",
];

export const DYNAMIC_COLUMN_DATA_TYPE_LABELS: Record<DynamicColumnDataType, string> = {
  text: "متن",
  number: "عدد",
  boolean: "بله/خیر",
  date: "تاریخ",
  datetime: "تاریخ و ساعت",
  phone: "شماره تماس",
  tag: "برچسب",
  status: "وضعیت",
};

export const DYNAMIC_TABLE_ROWS_PAGE_SIZE = 20;

export const SLUG_REGEX = /^[a-z0-9-]+$/;
export const COLUMN_KEY_REGEX = /^[a-z0-9_]+$/;

// --- Access level (RBAC) for dynamic tables ---
export type DynamicTableAccessLevel =
  | "all"
  | "manager_only"
  | "finance_only"
  | "admin_only"
  | "sales_only";

export const DYNAMIC_TABLE_ACCESS_LEVELS: DynamicTableAccessLevel[] = [
  "all",
  "manager_only",
  "finance_only",
  "admin_only",
  "sales_only",
];

export const DYNAMIC_TABLE_ACCESS_LEVEL_LABELS: Record<DynamicTableAccessLevel, string> = {
  all: "همه کاربران",
  manager_only: "فقط مدیران",
  finance_only: "مالی",
  admin_only: "فقط مدیر کل",
  sales_only: "فقط فروش",
};

export const DYNAMIC_TABLE_ACCESS_LEVEL_BADGE: Record<
  DynamicTableAccessLevel,
  { className: string }
> = {
  all: { className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  manager_only: { className: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30" },
  finance_only: { className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  admin_only: { className: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30" },
  sales_only: { className: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30" },
};

/** Client-side helper mirroring the DB's dyn_table_role_can_view function. */
export function canViewDynamicTable(roles: string[], level: DynamicTableAccessLevel): boolean {
  if (roles.includes("admin") || roles.includes("manager")) return true;
  if (level === "all") return true;
  if (level === "manager_only") return false; // already covered above
  if (level === "finance_only") return roles.includes("accountant");
  if (level === "admin_only") return false;
  if (level === "sales_only") return roles.includes("sales");
  return false;
}
