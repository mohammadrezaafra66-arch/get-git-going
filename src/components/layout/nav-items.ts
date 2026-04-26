import {
  LayoutDashboard, Package, DollarSign, ShoppingCart, ShoppingBag,
  FileText, ListOrdered, Users, ShieldCheck, BarChart3, BookOpen,
  MessageSquare, Mail, ScrollText, Database, KeyRound,
} from "lucide-react";
import type { ModuleKey } from "@/lib/rbac/roles";

export interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  module: ModuleKey;
  group: "main" | "operations" | "finance" | "admin" | "comms";
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard",   label: "داشبورد",          icon: LayoutDashboard, module: "dashboard",   group: "main" },
  { to: "/products",    label: "محصولات",          icon: Package,         module: "products",    group: "operations" },
  { to: "/price-lists", label: "لیست‌های قیمت",    icon: ListOrdered,     module: "price-lists", group: "operations" },
  { to: "/pricing",     label: "قیمت‌گذاری",       icon: DollarSign,      module: "pricing",     group: "operations" },
  { to: "/purchases",   label: "خرید",            icon: ShoppingBag,     module: "purchases",   group: "finance" },
  { to: "/sales",       label: "فروش",            icon: ShoppingCart,    module: "sales",       group: "finance" },
  { to: "/invoices",    label: "فاکتورها",        icon: FileText,        module: "invoices",    group: "finance" },
  { to: "/reports",     label: "گزارش‌ها",         icon: BarChart3,       module: "reports",     group: "finance" },
  { to: "/users",       label: "کاربران",          icon: Users,           module: "users",       group: "admin" },
  { to: "/roles",       label: "نقش‌ها و دسترسی",  icon: ShieldCheck,     module: "roles",       group: "admin" },
  { to: "/audit-logs",  label: "گزارش حسابرسی",    icon: ScrollText,      module: "audit-logs",  group: "admin" },
  { to: "/knowledge",   label: "دانش سازمانی",    icon: BookOpen,        module: "knowledge",   group: "comms" },
  { to: "/messages",    label: "پیام‌ها",          icon: Mail,            module: "messages",    group: "comms" },
  { to: "/feedback",    label: "بازخورد",          icon: MessageSquare,   module: "feedback",    group: "comms" },
  { to: "/data-tables", label: "جداول داده پویا", icon: Database,        module: "data-tables", group: "comms" },
  { to: "/bot-api-keys", label: "کلیدهای API ربات", icon: KeyRound,      module: "bot-api-keys", group: "admin" },
];

export const GROUP_LABELS: Record<NavItem["group"], string> = {
  main: "اصلی", operations: "عملیات", finance: "مالی", admin: "مدیریت", comms: "ارتباطات",
};
