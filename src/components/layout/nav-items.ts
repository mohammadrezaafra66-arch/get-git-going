import { NAVIGATION_REGISTRY } from "@/lib/navigation/registry";
import type {
  NavigationEntry,
  NavigationGroupKey,
  NavigationSubgroupKey,
} from "@/lib/navigation/types";

export interface NavItem {
  to: string;
  label: string;
  icon: NavigationEntry["icon"];
  module: NavigationEntry["module"];
  group: NavigationGroupKey;
  /** Optional 2nd-level group label inside a top-level group. */
  subgroup?: NavigationSubgroupKey;
  /** When true, only admin/manager roles see this item even if module check passes. */
  adminOnly?: boolean;
}

export type SubgroupKey = NavigationSubgroupKey;

export const NAV_ITEMS: NavItem[] = NAVIGATION_REGISTRY.filter(
  (entry) => !entry.hiddenFromMenu,
).map((entry) => ({
  to: entry.route,
  label: entry.title,
  icon: entry.icon,
  module: entry.module,
  group: entry.group,
  subgroup: entry.subgroup,
  adminOnly: entry.adminOnly,
}));
export const GROUP_LABELS: Record<NavItem["group"], string> = {
  main: "داشبورد",
  "products-pricing": "محصولات و قیمت‌گذاری",
  purchasing: "خرید و تأمین‌کنندگان",
  "sales-customers": "فروش و مشتریان",
  finance: "مالی و حسابداری",
  operations: "عملیات داخلی",
  reports: "گزارش‌ها",
  "knowledge-comms": "دانش، آکادمی و ارتباطات",
  admin: "مدیریت سیستم",
};

export const SUBGROUP_LABELS: Record<SubgroupKey, string> = {
  "pp-catalog": "اطلاعات کالا",
  "pp-pricing": "قیمت‌گذاری",
  "pp-publish": "انتشار و لیست‌ها",
  "sc-sales": "فروش",
  "sc-customers": "مشتریان و اعتبار",
  "adm-users": "کاربران و دسترسی‌ها",
  "adm-settings": "تنظیمات",
  "adm-gamification": "مدیریت گیمیفیکیشن",
  "adm-tools": "ابزارها و یکپارچه‌سازی",
};

/**
 * SECTIONS — the parent group of the open page, made visible in the sidebar.
 *
 * WHY THIS LIVES HERE. `group` and `subgroup` have been on every registry entry since the
 * registry was written, and the Persian labels for all 9 groups and 9 subgroups have been in
 * this file just as long — but nothing imported this file, so nothing ever rendered them
 * (measured 2026-09-05: `docs/research/nav-active-state-20260905.md` F7/F8). Rather than start
 * a second grouping module beside the labels, the consumer is added next to them.
 *
 * WHY THE KEY IS `subgroup ?? group` AND NOT A TWO-LEVEL TREE. Grouping by `group` alone does
 * nothing for the module that needs it most: measured on this checkout, the `admin` primary
 * module holds 53 paths of which 50 share `group: "admin"` — one section of fifty is the flat
 * list it replaced. Those same 50 split cleanly by subgroup into 22/15/8/5. The top-level group
 * is already on screen as the module label above the list, so the most specific parent is the
 * one worth drawing.
 */
export interface NavigationSection {
  /** `subgroup` when the entry has one, otherwise `group`. */
  key: string;
  /** The Persian label already written for that key. */
  label: string;
  items: NavigationEntry[];
}

/**
 * Group items into sections, preserving the order they arrive in.
 *
 * Order is load-bearing: `itemsForModule()` returns items in the order declared in
 * `PRIMARY_MODULES.paths`, which is a deliberate editorial sequence. Sections therefore appear
 * in order of their first member, and items keep their relative order inside a section.
 */
export function buildNavigationSections(items: NavigationEntry[]): NavigationSection[] {
  const byKey = new Map<string, NavigationSection>();
  const order: string[] = [];
  for (const item of items) {
    const key = item.subgroup ?? item.group;
    let section = byKey.get(key);
    if (!section) {
      section = {
        key,
        label: item.subgroup ? SUBGROUP_LABELS[item.subgroup] : GROUP_LABELS[item.group],
        items: [],
      };
      byKey.set(key, section);
      order.push(key);
    }
    section.items.push(item);
  }
  return order.map((key) => byKey.get(key) as NavigationSection);
}

/**
 * Which section holds the open page, or null when none of them does.
 *
 * Matching is deliberately the SAME rule `AppSidebar.isItemActive` uses to highlight a row —
 * exact match or a `/`-delimited prefix — so a section cannot open around an item that is not
 * the one being highlighted. Longest route wins, because `/sales` and `/sales/customers` can
 * both prefix-match `/sales/customers/123` while sitting in different sections.
 *
 * Returning null is a real answer, not a failure: 28 pages resolve to a module that does not
 * list them (see the research note, F9/F10). The caller must not treat null as "section one".
 */
export function findActiveSectionKey(
  sections: NavigationSection[],
  pathname: string,
): string | null {
  let best: { key: string; length: number } | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      if (pathname === item.route || pathname.startsWith(item.route + "/")) {
        if (!best || item.route.length > best.length) {
          best = { key: section.key, length: item.route.length };
        }
      }
    }
  }
  return best?.key ?? null;
}
