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

// --- Formula / computed columns ---
export const ALLOWED_FORMULA_KEYS = [
  "latest_purchase_price_toman",
  "min_sale_price",
  "latest_batch_average_price",
  "price_gap_to_market_avg",
  "price_gap_percent_to_market_avg",
] as const;

export type DynamicFormulaKey = typeof ALLOWED_FORMULA_KEYS[number];

export const FORMULA_KEY_LABELS: Record<DynamicFormulaKey, string> = {
  latest_purchase_price_toman: "آخرین قیمت خرید (تومان) از داده افراکالا",
  min_sale_price: "حداقل قیمت فروش از داده افراکالا",
  latest_batch_average_price: "میانگین قیمت در آخرین دسته استخراج",
  price_gap_to_market_avg: "اختلاف قیمت فروش با میانگین آخرین استخراج",
  price_gap_percent_to_market_avg: "درصد اختلاف قیمت فروش با میانگین آخرین استخراج",
};

/** Slug of the seeded Torob/Purchista extracted-data table. */
export const TOROB_PURCHISTA_SLUG = "torob-purchista-extracted-data";

/** Refresh interval for the Torob/Purchista live data table (ms). */
export const TOROB_PURCHISTA_REFETCH_MS = 7000;

// --- Observatory (Product Price Observatory) ---

/** Slug of the seeded Product Price Observatory table. */
export const OBSERVATORY_SLUG = "afrakala-product-price-observatory";

/** Refresh interval for the Observatory table (ms). */
export const OBSERVATORY_REFETCH_MS = 10000;

/**
 * Observatory columns that must stay read-only in the UI.
 * Includes both DB-level computed columns and read-time placeholder columns
 * (DB is_computed=false but populated by `_obs_compute_row_values`).
 */
export const OBSERVATORY_READONLY_KEYS: ReadonlySet<string> = new Set([
  // identity / system
  "afrakala_product_id",
  "product_name",
  "sku",
  "brand_name",
  "category_name",
  "product_labels",
  // product system fields (synced from internal products)
  "model",
  "color",
  "capacity",
  "stock_status",
  "internal_price_updated_at",
  // computed (DB)
  "afrakala_purchase_price_toman",
  "afrakala_min_sale_price",
  "price_gap_to_market_avg",
  "price_gap_percent_to_market_avg",
  // read-time placeholders (computed by _obs_compute_row_values)
  "market_avg_price_toman",
  "price_gap_to_market_min",
  "competitive_price_status",
  "sales_opportunity_score",
  "sales_priority_rank",
  "suggested_sales_message",
]);

/** Persian labels and variants for the observatory competitive_price_status column. */
export const OBSERVATORY_STATUS_META: Record<
  string,
  { label: string; className: string }
> = {
  below_market: {
    label: "پایین‌تر از بازار",
    className:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  near_market: {
    label: "نزدیک به بازار",
    className:
      "bg-muted text-foreground/80 border-border",
  },
  above_market: {
    label: "بالاتر از بازار",
    className:
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  unknown: {
    label: "نامشخص",
    className: "bg-muted/60 text-muted-foreground border-border",
  },
};

/** Score tier label (0..100) for sales_opportunity_score. */
export function getObservatoryScoreTier(score: number): {
  label: string;
  className: string;
} {
  if (score >= 80)
    return {
      label: "فرصت عالی",
      className:
        "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    };
  if (score >= 60)
    return {
      label: "فرصت خوب",
      className:
        "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    };
  if (score >= 40)
    return {
      label: "متوسط",
      className: "bg-muted text-foreground/80 border-border",
    };
  return {
    label: "ضعیف",
    className:
      "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  };
}

// --- Access level (RBAC) for dynamic tables ---
export type DynamicTableAccessLevel =
  | "all"
  | "manager_only"
  | "finance_only"
  | "admin_only"
  | "sales_only"
  | "custom";

export const DYNAMIC_TABLE_ACCESS_LEVELS: DynamicTableAccessLevel[] = [
  "all",
  "manager_only",
  "finance_only",
  "admin_only",
  "sales_only",
  "custom",
];

export const DYNAMIC_TABLE_ACCESS_LEVEL_LABELS: Record<DynamicTableAccessLevel, string> = {
  all: "همه کاربران",
  manager_only: "فقط مدیران",
  finance_only: "مالی",
  admin_only: "فقط مدیر کل",
  sales_only: "فقط فروش",
  custom: "سفارشی",
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
  custom: { className: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30" },
};

/** Client-side helper mirroring the DB's dyn_table_role_can_view function. */
export function canViewDynamicTable(
  roles: string[],
  level: DynamicTableAccessLevel,
  allowedRoles: string[] = [],
): boolean {
  if (roles.includes("admin") || roles.includes("manager")) return true;
  if (level === "all") return true;
  if (level === "manager_only") return false; // already covered above
  if (level === "finance_only") return roles.includes("accountant");
  if (level === "admin_only") return false;
  if (level === "sales_only") return roles.includes("sales");
  if (level === "custom") return allowedRoles.some((r) => roles.includes(r));
  return false;
}

/** Roles selectable for the custom access level. */
export const SELECTABLE_ROLES: { value: string; label: string }[] = [
  { value: "admin", label: "مدیر کل" },
  { value: "manager", label: "مدیر" },
  { value: "accountant", label: "حسابدار" },
  { value: "sales", label: "فروش" },
  { value: "viewer", label: "مشاهده‌گر" },
];
