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
 *
 * THIS IS THE ONLY ROUTE->MODULE LIST. Until 2026-08-08 a second copy lived in
 * src/lib/navigation/registry.ts as PRIMARY_MODULE_PATHS; it rendered nothing and
 * had drifted on eight routes, so it was deleted and registry.ts now derives
 * entry.primaryModule from this list via resolveActiveModule(). A route that is not
 * listed here is reachable only through search -- it will never appear in the sidebar,
 * because itemsForModule() below matches paths exactly, not by prefix.
 */
export const PRIMARY_MODULES: PrimaryModule[] = [
  {
    key: "dashboard",
    label: "داشبورد",
    icon: LayoutDashboard,
    defaultTo: "/dashboard",
    paths: [
      "/dashboard",
      "/notifications",
      "/popup-center",
      "/collaboration",
      "/operations/tasks",
      "/operations/daily-mood",
    ],
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
      "/messages/inquiries",
      "/knowledge",
      "/academy",
      "/updates",
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
      "/pricing/attention",
      "/pricing/sale-lists",
      "/pricing/live-price-list",
      "/pricing/amin-hozoor-board",
      "/pricing/rules",
      "/pricing/sale-price-types",
      "/pricing/recompute-prices",
      "/suppliers",
      "/purchase",
      "/purchases",
      // C-3 (unwired wave 1) — AI purchase advisor, next to the purchase space it advises on.
      "/operations/purchase-advisor",
      "/warehouses",
      "/warehouses/transfers",
      "/warehouses/kardex",
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
      "/persons/merge",
      "/sales/quotes",
      "/my-rejected-quotes",
      "/sales/product-videos",
      "/sales/stock-alerts",
      "/sales/promotion-nominations",
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
    defaultTo: "/accounting/receipts/create",
    // The finance section is one entry: مرکز مالی. Everything that used to be listed here is
    // reached from that page instead.
    //
    // This list is the ONLY thing that changed. Removing a path from it takes the item out of
    // the sidebar and touches nothing else: `itemsForModule` receives an already
    // role-filtered list and simply picks the paths named here, so no route, guard, registry
    // entry or permission was altered. Every removed route still resolves — a direct link or
    // an existing bookmark works exactly as before.
    //
    // `hiddenFromMenu` was deliberately NOT used for this. That flag lives inside
    // `isNavigationEntryVisible`, which the hub also calls, so setting it would have hidden
    // these destinations from the hub as well — the opposite of the intent.
    paths: ["/accounting/receipts/create"],
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
      "/gamification/league",
      // C-4 (unwired wave 1) — sits next to /gamification/league because it is the
      // same audience: the employee's own progress, not an admin screen.
      "/gamification/achievements",
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
      "/admin/platform-releases",
      "/admin/marketing-channels",
      "/admin/marketing-task-templates",
      "/admin/payment-terms",
      "/admin/visitors",
      "/admin/receipt-fields",
      "/admin/recent-purchase-settings",
      "/admin/workflow-stages",
      "/admin/workflow-settings",
      "/admin/validation-rules",
      "/admin/sales-reminders",
      "/admin/penalties",
      "/admin/audit",
      "/admin/ai-providers",
      "/admin/asan-import",
      "/admin/asan-export",
      "/admin/purchase",
      "/admin/documents",
      "/admin/delivery-receipts",
      "/admin/automation",
      "/admin/phone-collisions",
      "/admin/persons-cleanup",
      "/gamification/settings",
      "/gamification/admin/kpi-rules",
      "/gamification/admin/achievements",
      "/gamification/admin/missions",
      "/gamification/admin/leagues",
      "/gamification/admin/rewards",
      "/gamification/admin/purchase-settings",
      "/gamification/admin/manual-metrics",
      "/gamification/admin/manual-metrics/guide",
      "/pricing/currencies",
      "/pricing/currency-sources",
      "/pricing/currency-rates",
      "/pricing/market-rates-workshop",
      "/pricing/settlement-types",
      "/pricing/shipping-rules",
      "/pricing/change-reasons",
      "/pricing",
      "/bot-api-keys",
      // C-1, C-2, C-7 (unwired wave 1) — three admin pages that existed but were in
      // no module list, so itemsForModule() (exact match, not prefix) never rendered them.
      "/api-keys",
      "/presence",
      "/admin/system-health",
      "/operations/didar",
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
