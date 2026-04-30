import {
  LayoutDashboard, Package, DollarSign, ShoppingCart, ShoppingBag,
  FileText, ListOrdered, Users, ShieldCheck, BarChart3, BookOpen,
  MessageSquare, Mail, ScrollText, Database, KeyRound, UserSquare2, Factory, GraduationCap,
  CheckSquare, Workflow, Settings, Heart,
  Megaphone, Edit3, Monitor,
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
  { to: "/pricing/my-workbench", label: "کارگاه قیمت من", icon: Edit3,    module: "pricing",     group: "operations" },
  { to: "/pricing/amin-hozoor-board", label: "تابلوی قیمت امین حضور", icon: Monitor, module: "pricing", group: "operations" },
  { to: "/pricing/currencies", label: "ارزها", icon: DollarSign, module: "pricing", group: "operations" },
  { to: "/pricing/currency-sources", label: "منابع ارز", icon: DollarSign, module: "pricing", group: "operations" },
  { to: "/purchases",   label: "خرید",            icon: ShoppingBag,     module: "purchases",   group: "finance" },
  { to: "/suppliers",   label: "تأمین‌کنندگان",     icon: Factory,         module: "suppliers",   group: "finance" },
  { to: "/sales",       label: "فروش",            icon: ShoppingCart,    module: "sales",       group: "finance" },
  { to: "/sales/customers", label: "مشتریان",      icon: UserSquare2,    module: "sales",       group: "finance" },
  { to: "/sales/invoices",  label: "پیش‌فاکتورها", icon: FileText,       module: "invoices",    group: "finance" },
  { to: "/sales/credit-rules", label: "اعتبارسنجی", icon: ShieldCheck,    module: "sales",       group: "finance" },
  { to: "/sales/credit-customers", label: "وضعیت اعتبار مشتریان", icon: ShieldCheck, module: "sales", group: "finance" },
  { to: "/operations/tasks", label: "برد وظایف", icon: CheckSquare, module: "invoices", group: "operations" },
  { to: "/operations/daily-mood", label: "حال‌وهوای امروز", icon: Heart, module: "feedback", group: "operations" },
  { to: "/operations/daily-mood/admin", label: "مدیریت حال‌وهوا", icon: Heart, module: "hr", group: "operations" },
  { to: "/invoices",    label: "فاکتورها",        icon: FileText,        module: "invoices",    group: "finance" },
  { to: "/accounting/receipts", label: "فیش‌های واریزی", icon: FileText,  module: "invoices",    group: "finance" },
  { to: "/reports",     label: "گزارش‌ها",         icon: BarChart3,       module: "reports",     group: "finance" },
  { to: "/users",       label: "کاربران",          icon: Users,           module: "users",       group: "admin" },
  { to: "/users/pending", label: "کاربران در انتظار", icon: Users,        module: "users",       group: "admin" },
  { to: "/roles",       label: "نقش‌ها و دسترسی",  icon: ShieldCheck,     module: "roles",       group: "admin" },
  { to: "/admin/roles", label: "مجوزهای پویا",     icon: ShieldCheck,     module: "roles",       group: "admin" },
  { to: "/admin/workflow-stages", label: "مراحل گردش‌کار", icon: Workflow, module: "roles",   group: "admin" },
  { to: "/admin/settings", label: "تنظیمات فروشگاه", icon: Settings, module: "roles", group: "admin" },
  { to: "/admin/marketing-channels", label: "کانال‌های تبلیغاتی", icon: Megaphone, module: "roles", group: "admin" },
  { to: "/admin/waybill-fields", label: "فیلدهای سفارشی بیجک", icon: Settings, module: "roles", group: "admin" },
  { to: "/marketing/suggestions", label: "پیشنهادهای تبلیغاتی", icon: Megaphone, module: "reports", group: "operations" },
  { to: "/marketing/suggestions-history", label: "تاریخچه پیشنهادها", icon: ScrollText, module: "reports", group: "operations" },
  { to: "/audit-logs",  label: "گزارش حسابرسی",    icon: ScrollText,      module: "audit-logs",  group: "admin" },
  { to: "/knowledge",   label: "دانش سازمانی",    icon: BookOpen,        module: "knowledge",   group: "comms" },
  { to: "/academy",     label: "آکادمی",           icon: GraduationCap,   module: "academy",     group: "comms" },
  { to: "/messages",    label: "پیام‌ها",          icon: Mail,            module: "messages",    group: "comms" },
  { to: "/feedback",    label: "بازخورد",          icon: MessageSquare,   module: "feedback",    group: "comms" },
  { to: "/data-tables", label: "جداول داده پویا", icon: Database,        module: "data-tables", group: "comms" },
  { to: "/bot-api-keys", label: "کلیدهای API ربات", icon: KeyRound,      module: "bot-api-keys", group: "admin" },
];

export const GROUP_LABELS: Record<NavItem["group"], string> = {
  main: "اصلی", operations: "عملیات", finance: "مالی", admin: "مدیریت", comms: "ارتباطات",
};
