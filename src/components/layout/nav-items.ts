import {
  LayoutDashboard, Package, DollarSign, ShoppingCart, ShoppingBag,
  FileText, ListOrdered, Users, ShieldCheck, BarChart3, BookOpen,
  MessageSquare, Mail, ScrollText, Database, KeyRound, UserSquare2, Factory, GraduationCap,
  CheckSquare, Workflow, Settings, Heart,
  Megaphone, Edit3, Monitor, TrendingUp, Trophy, Wallet,
} from "lucide-react";
import type { ModuleKey } from "@/lib/rbac/roles";

export interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  module: ModuleKey;
  group:
    | "main"
    | "sales"
    | "pricing"
    | "operations"
    | "finance"
    | "gamification"
    | "gamification-admin"
    | "comms"
    | "admin";
  /** When true, only admin/manager roles see this item even if module check passes. */
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  // اصلی
  { to: "/dashboard", label: "داشبورد", icon: LayoutDashboard, module: "dashboard", group: "main" },

  // فروش و CRM
  { to: "/sales", label: "فروش", icon: ShoppingCart, module: "sales", group: "sales" },
  { to: "/sales/customers", label: "مشتریان", icon: UserSquare2, module: "sales", group: "sales" },
  { to: "/sales/invoices", label: "پیش‌فاکتورها", icon: FileText, module: "invoices", group: "sales" },
  { to: "/invoices", label: "فاکتورها", icon: FileText, module: "invoices", group: "sales" },
  { to: "/sales/credit-rules", label: "اعتبارسنجی", icon: ShieldCheck, module: "sales", group: "sales" },
  { to: "/sales/credit-customers", label: "اعتبار مشتریان", icon: ShieldCheck, module: "sales", group: "sales" },

  // قیمت‌گذاری
  { to: "/price-lists", label: "لیست قیمت زنده", icon: ListOrdered, module: "price-lists", group: "pricing" },
  { to: "/pricing/my-workbench", label: "کارگاه قیمت", icon: Edit3, module: "pricing", group: "pricing" },
  { to: "/pricing/amin-hozoor-board", label: "تابلوی امین حضور", icon: Monitor, module: "pricing", group: "pricing" },
  { to: "/pricing/market-intelligence", label: "هوشمند بازار", icon: TrendingUp, module: "pricing", group: "pricing" },
  { to: "/pricing", label: "تنظیمات قیمت", icon: DollarSign, module: "pricing", group: "pricing" },
  { to: "/pricing/currencies", label: "ارزها", icon: DollarSign, module: "pricing", group: "pricing" },
  { to: "/pricing/currency-sources", label: "منابع ارز", icon: DollarSign, module: "pricing", group: "pricing" },

  // عملیات و خرید
  { to: "/products", label: "محصولات", icon: Package, module: "products", group: "operations" },
  { to: "/purchases", label: "خرید", icon: ShoppingBag, module: "purchases", group: "operations" },
  { to: "/suppliers", label: "تأمین‌کنندگان", icon: Factory, module: "suppliers", group: "operations" },
  { to: "/operations/tasks", label: "برد وظایف", icon: CheckSquare, module: "invoices", group: "operations" },
  { to: "/operations/daily-mood", label: "حال‌وهوای امروز", icon: Heart, module: "feedback", group: "operations" },
  { to: "/operations/daily-mood/admin", label: "مدیریت حال‌وهوا", icon: Heart, module: "hr", group: "operations" },
  { to: "/marketing/suggestions", label: "پیشنهادهای تبلیغاتی", icon: Megaphone, module: "reports", group: "operations" },
  { to: "/marketing/suggestions-history", label: "تاریخچه پیشنهادها", icon: ScrollText, module: "reports", group: "operations" },

  // مالی
  { to: "/accounting/receipts", label: "فیش‌های واریزی", icon: FileText, module: "invoices", group: "finance" },
  { to: "/accounting/bank-accounts", label: "حساب‌های بانکی", icon: DollarSign, module: "invoices", group: "finance" },
  { to: "/accounting/external-parties", label: "طرف‌های حساب", icon: UserSquare2, module: "invoices", group: "finance" },
  { to: "/reports", label: "گزارش‌ها", icon: BarChart3, module: "reports", group: "finance" },

  // گیمیفیکیشن
  { to: "/gamification", label: "داشبورد گیمیفیکیشن", icon: Trophy, module: "dashboard", group: "gamification" },
  { to: "/gamification/leaderboard", label: "لیدربورد", icon: BarChart3, module: "dashboard", group: "gamification" },

  // مدیریت گیمیفیکیشن (admin/manager only)
  { to: "/gamification/admin/kpi-rules", label: "قوانین امتیازدهی", icon: Trophy, module: "roles", group: "gamification-admin", adminOnly: true },
  { to: "/gamification/admin/achievements", label: "مدیریت مدال‌ها", icon: Trophy, module: "roles", group: "gamification-admin", adminOnly: true },
  { to: "/gamification/admin/missions", label: "مدیریت مأموریت‌ها", icon: Trophy, module: "roles", group: "gamification-admin", adminOnly: true },
  { to: "/gamification/admin/leagues", label: "مدیریت لیگ‌ها", icon: Trophy, module: "roles", group: "gamification-admin", adminOnly: true },
  { to: "/gamification/admin/rewards", label: "مدیریت پاداش‌ها", icon: Trophy, module: "roles", group: "gamification-admin", adminOnly: true },
  { to: "/gamification/admin/analytics", label: "تحلیل گیمیفیکیشن", icon: BarChart3, module: "roles", group: "gamification-admin", adminOnly: true },

  // ارتباطات
  { to: "/knowledge", label: "دانش سازمانی", icon: BookOpen, module: "knowledge", group: "comms" },
  { to: "/academy", label: "آکادمی", icon: GraduationCap, module: "academy", group: "comms" },
  { to: "/messages", label: "پیام‌ها", icon: Mail, module: "messages", group: "comms" },
  { to: "/feedback", label: "بازخورد", icon: MessageSquare, module: "feedback", group: "comms" },
  { to: "/data-tables", label: "جداول داده پویا", icon: Database, module: "data-tables", group: "comms" },

  // مدیریت سیستم
  { to: "/users", label: "کاربران", icon: Users, module: "users", group: "admin" },
  { to: "/roles", label: "نقش‌ها و دسترسی", icon: ShieldCheck, module: "roles", group: "admin" },
  { to: "/admin/roles", label: "مجوزهای پویا", icon: ShieldCheck, module: "roles", group: "admin" },
  { to: "/admin/profile-fields", label: "فیلدهای کاربر", icon: UserSquare2, module: "users", group: "admin" },
  { to: "/admin/workflow-stages", label: "مراحل گردش‌کار", icon: Workflow, module: "roles", group: "admin" },
  { to: "/admin/settings", label: "تنظیمات فروشگاه", icon: Settings, module: "roles", group: "admin" },
  { to: "/admin/marketing-channels", label: "کانال‌های تبلیغاتی", icon: Megaphone, module: "roles", group: "admin" },
  { to: "/admin/payment-terms", label: "زمان‌های تسویه", icon: Wallet, module: "roles", group: "admin" },
  { to: "/admin/waybill-fields", label: "فیلدهای بیجک", icon: Settings, module: "roles", group: "admin" },
  { to: "/admin/receipt-fields", label: "فیلدهای فیش واریزی", icon: Settings, module: "roles", group: "admin" },
  { to: "/audit-logs", label: "Audit Logs", icon: ScrollText, module: "audit-logs", group: "admin" },
  { to: "/bot-api-keys", label: "کلیدهای API ربات", icon: KeyRound, module: "bot-api-keys", group: "admin" },
];

export const GROUP_LABELS: Record<NavItem["group"], string> = {
  main: "اصلی",
  sales: "فروش و CRM",
  pricing: "قیمت‌گذاری",
  operations: "عملیات",
  finance: "مالی",
  gamification: "گیمیفیکیشن",
  "gamification-admin": "مدیریت گیمیفیکیشن",
  comms: "ارتباطات",
  admin: "مدیریت سیستم",
};
