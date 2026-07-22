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

export const NAV_ITEMS: NavItem[] = NAVIGATION_REGISTRY.map((entry) => ({
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
