import {
  LayoutDashboard,
  Sparkles,
  Package,
  ShoppingCart,
  Wallet,
  BarChart3,
  Settings,
} from "lucide-react";
import type { NavigationEntry } from "@/lib/navigation/types";

export type PrimaryModuleKey =
  | "dashboard"
  | "assistant"
  | "catalog"
  | "sales"
  | "finance"
  | "analytics"
  | "admin";

export interface PrimaryModule {
  key: PrimaryModuleKey;
  label: string;
  icon: typeof LayoutDashboard;
  /** Default route when the module icon is clicked (must be a real path in NAV_ITEMS or a known route). */
  defaultTo?: string;
  /** Ordered list of NAV_ITEMS `to` paths to surface in this module's submenu. */
  paths: string[];
}

/**
 * Exactly 7 primary modules. No fallback module is permitted. Every
 * user-facing route in NAV_ITEMS must be mapped intentionally into one of
 * these 7. RBAC filtering happens downstream against NAV_ITEMS.
 */
export const PRIMARY_MODULES: PrimaryModule[] = [
  {
    key: "dashboard",
    label: "داشبورد",
    icon: LayoutDashboard,
    defaultTo: "/dashboard",
    paths: ["/dashboard", "/notifications", "/operations/tasks", "/operations/daily-mood"],
  },
  {
    key: "assistant",
    label: "دستیار",
    icon: Sparkles,
    defaultTo: "/pricing/market-intelligence",
    paths: [
      "/pricing/market-intelligence",
      "/pricing/product-recommendations",
      "/pricing/price-alerts",
      "/marketing/suggestions",
      "/marketing/suggestions-history",
      "/marketing/my-tasks",
      "/messages",
      "/knowledge",
      "/academy",
    ],
  },
  {
    key: "catalog",
    label: "کالا",
    icon: Package,
    defaultTo: "/products",
    paths: [
      "/products",
      "/products/new",
      "/products/categories",
      "/products/brands",
      "/products/attributes",
      "/products/labels",
      "/pricing/purchase-prices",
      "/pricing/quick-price",
      "/pricing/calculator",
      "/pricing/my-workbench",
      "/pricing/sale-lists",
      "/price-lists",
      "/pricing/amin-hozoor-board",
      "/pricing/rules",
      "/pricing/sale-price-types",
      "/pricing/recompute-prices",
      "/suppliers",
      "/purchases",
    ],
  },
  {
    key: "sales",
    label: "فروش",
    icon: ShoppingCart,
    defaultTo: "/sales",
    paths: [
      "/sales",
      "/sales/customers",
      "/persons",
      "/sales/quotes",
      "/sales/invoices",
      "/invoices",
      "/sales/stock-alerts",
      "/sales/credit-customers",
      "/sales/credit-rules",
      "/sales/customers/credit-training",
      "/sales/send-queue",
    ],
  },
  {
    key: "finance",
    label: "مالی",
    icon: Wallet,
    defaultTo: "/accounting/receipts",
    paths: [
      "/accounting/receipts",
      "/accounting/receipts/training",
      "/accounting/receivables",
      "/accounting/payables",
      "/accounting/purchase-payments",
      "/accounting/bank-accounts",
      "/accounting/external-parties",
      // Item 141 — legacy capital paths dropped; dynamic-capital is official.
      "/accounting/dynamic-capital",
    ],
  },
  {
    key: "analytics",
    label: "تحلیل",
    icon: BarChart3,
    defaultTo: "/reports",
    paths: [
      "/reports",
      "/sales/quote-share-logs",
      "/gamification",
      "/gamification/leaderboard",
      "/gamification/admin/analytics",
      "/audit-logs",
      "/data-tables",
    ],
  },
  {
    key: "admin",
    label: "مدیریت",
    icon: Settings,
    defaultTo: "/users",
    paths: [
      "/users",
      "/users/pending",
      "/roles",
      "/admin/roles",
      "/admin/profile-fields",
      "/admin/settings",
      "/admin/marketing-channels",
      "/admin/marketing-task-templates",
      "/admin/payment-terms",
      "/admin/waybill-fields",
      "/admin/receipt-fields",
      "/admin/recent-purchase-settings",
      "/admin/workflow-stages",
      "/admin/validation-rules",
      "/admin/ai-providers",
      "/pricing/currencies",
      "/pricing/currency-sources",
      "/pricing/currency-rates",
      "/pricing/market-rates-workshop",
      "/pricing/settlement-types",
      "/pricing/shipping-rules",
      "/pricing/change-reasons",
      "/pricing",
      "/bot-api-keys",
      "/market-matches",
      "/operations/daily-mood/admin",
      "/feedback",
    ],
  },
];

/**
 * Resolve a primary module from a pathname by checking which module's paths
 * contains the longest matching prefix. Falls back to "dashboard".
 */
export function resolveActiveModule(pathname: string): PrimaryModuleKey {
  let best: { key: PrimaryModuleKey; len: number } | null = null;
  for (const m of PRIMARY_MODULES) {
    for (const p of m.paths) {
      if (pathname === p || pathname.startsWith(p + "/")) {
        if (!best || p.length > best.len) best = { key: m.key, len: p.length };
      }
    }
  }
  return best?.key ?? "dashboard";
}

/**
 * Filter NAV_ITEMS to those belonging to a given primary module, preserving
 * the order declared in PRIMARY_MODULES.paths.
 */
export function itemsForModule(
  moduleKey: PrimaryModuleKey,
  visibleItems: NavigationEntry[],
): NavigationEntry[] {
  const m = PRIMARY_MODULES.find((x) => x.key === moduleKey);
  if (!m) return [];
  const byPath = new Map(visibleItems.map((i) => [i.route, i] as const));
  const out: NavigationEntry[] = [];
  for (const p of m.paths) {
    const it = byPath.get(p);
    if (it) out.push(it);
  }
  return out;
}
