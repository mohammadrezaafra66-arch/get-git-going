import {
  LayoutDashboard, Package, DollarSign, ShoppingCart, ShoppingBag,
  FileText, ListOrdered, Users, ShieldCheck, BarChart3, BookOpen,
  MessageSquare, Mail, ScrollText, Database, KeyRound, UserSquare2, Factory, GraduationCap,
  CheckSquare, Workflow, Settings, Heart,
  Megaphone, Edit3, Monitor, TrendingUp, Trophy, Wallet, Coins,
  Plus, Tag, Layers, Bookmark, Bell, Calculator, Sparkles, Banknote,
  AlertTriangle, Send, Share2, Receipt, CreditCard, BadgeCheck,
} from "lucide-react";
import type { ModuleKey } from "@/lib/rbac/roles";

export interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  module: ModuleKey;
  group:
    | "main"
    | "products-pricing"
    | "purchasing"
    | "sales"
    | "finance"
    | "customers"
    | "operations"
    | "reports"
    | "comms"
    | "gamification"
    | "gamification-admin"
    | "admin";
  /** When true, only admin/manager roles see this item even if module check passes. */
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  // ۱) داشبورد
  { to: "/dashboard", label: "داشبورد", icon: LayoutDashboard, module: "dashboard", group: "main" },
  { to: "/notifications", label: "اعلان‌ها", icon: Bell, module: "messages", group: "main" },

  // ۲) محصولات و قیمت‌گذاری
  { to: "/products", label: "محصولات", icon: Package, module: "products", group: "products-pricing" },
  { to: "/products/new", label: "افزودن محصول", icon: Plus, module: "products", group: "products-pricing" },
  { to: "/products/categories", label: "دسته‌بندی‌ها", icon: Layers, module: "products", group: "products-pricing" },
  { to: "/products/brands", label: "برندها", icon: Bookmark, module: "products", group: "products-pricing" },
  { to: "/products/attributes", label: "ویژگی‌ها", icon: Tag, module: "products", group: "products-pricing" },
  { to: "/products/labels", label: "برچسب‌ها", icon: Tag, module: "products", group: "products-pricing" },
  { to: "/pricing/purchase-prices", label: "قیمت‌های خرید", icon: ShoppingBag, module: "pricing", group: "products-pricing" },
  { to: "/pricing/rules", label: "قوانین قیمت‌گذاری", icon: Workflow, module: "pricing", group: "products-pricing" },
  { to: "/pricing/sale-price-types", label: "نوع‌های قیمت فروش", icon: DollarSign, module: "pricing", group: "products-pricing" },
  { to: "/pricing/amin-hozoor-board", label: "تابلو قیمت زنده", icon: Monitor, module: "pricing", group: "products-pricing" },
  { to: "/price-lists", label: "لیست قیمت زنده", icon: ListOrdered, module: "price-lists", group: "products-pricing" },
  { to: "/pricing/sale-lists", label: "لیست قیمت فروش", icon: FileText, module: "pricing", group: "products-pricing" },
  { to: "/pricing/quick-price", label: "قیمت سریع", icon: Sparkles, module: "pricing", group: "products-pricing" },
  { to: "/pricing/calculator", label: "ماشین‌حساب قیمت", icon: Calculator, module: "pricing", group: "products-pricing" },
  { to: "/pricing/my-workbench", label: "کارگاه قیمت من", icon: Edit3, module: "pricing", group: "products-pricing" },
  { to: "/pricing/recompute-prices", label: "انتشار دسته‌ای قیمت", icon: Sparkles, module: "pricing", group: "products-pricing", adminOnly: true },
  { to: "/pricing/price-alerts", label: "هشدارهای قیمت", icon: AlertTriangle, module: "pricing", group: "products-pricing" },
  { to: "/pricing/market-intelligence", label: "هوشمند بازار", icon: TrendingUp, module: "pricing", group: "products-pricing" },
  { to: "/pricing/product-recommendations", label: "پیشنهاد محصولات", icon: Sparkles, module: "products", group: "products-pricing", adminOnly: true },

  // ۳) خرید و تأمین‌کنندگان
  { to: "/suppliers", label: "تأمین‌کنندگان", icon: Factory, module: "suppliers", group: "purchasing" },
  { to: "/purchases", label: "پنل خرید", icon: ShoppingBag, module: "purchases", group: "purchasing" },

  // ۴) فروش
  { to: "/sales", label: "فروش", icon: ShoppingCart, module: "sales", group: "sales" },
  { to: "/sales/quotes", label: "پیش‌فاکتورها", icon: FileText, module: "invoices", group: "sales" },
  { to: "/sales/invoices", label: "فاکتورهای فروش", icon: Receipt, module: "invoices", group: "sales" },
  { to: "/invoices", label: "فاکتورها", icon: FileText, module: "invoices", group: "sales" },
  { to: "/sales/stock-alerts", label: "هشدار موجودی", icon: AlertTriangle, module: "sales", group: "sales" },

  // ۵) مالی و حسابداری
  { to: "/accounting/receipts", label: "فیش‌های واریزی", icon: Receipt, module: "invoices", group: "finance" },
  { to: "/accounting/receivables", label: "مطالبات مشتریان", icon: Wallet, module: "invoices", group: "finance" },
  { to: "/accounting/payables", label: "بدهی تأمین‌کنندگان", icon: Wallet, module: "invoices", group: "finance" },
  { to: "/accounting/purchase-payments", label: "پرداخت خرید", icon: CreditCard, module: "invoices", group: "finance" },
  { to: "/accounting/bank-accounts", label: "حساب‌های بانکی", icon: Banknote, module: "invoices", group: "finance" },
  { to: "/accounting/external-parties", label: "طرف‌های حساب", icon: UserSquare2, module: "invoices", group: "finance" },
  { to: "/accounting/customer-capital-allocations", label: "تخصیص سرمایه مشتریان", icon: Wallet, module: "invoices", group: "finance" },
  { to: "/accounting/salesperson-capital-allocations", label: "تخصیص سرمایه فروشندگان", icon: Wallet, module: "invoices", group: "finance" },
  { to: "/accounting/daily-capital", label: "سرمایه روز", icon: Coins, module: "invoices", group: "finance" },

  // ۶) مشتریان و اعتبار
  { to: "/sales/customers", label: "مشتریان", icon: UserSquare2, module: "sales", group: "customers" },
  { to: "/sales/credit-customers", label: "اعتبار مشتریان", icon: BadgeCheck, module: "sales", group: "customers" },
  { to: "/sales/credit-rules", label: "قوانین اعتبار", icon: ShieldCheck, module: "sales", group: "customers" },

  // ۷) عملیات داخلی
  { to: "/operations/tasks", label: "برد وظایف", icon: CheckSquare, module: "invoices", group: "operations" },
  { to: "/operations/daily-mood", label: "حال‌وهوای امروز", icon: Heart, module: "feedback", group: "operations" },
  { to: "/operations/daily-mood/admin", label: "مدیریت حال‌وهوا", icon: Heart, module: "hr", group: "operations", adminOnly: true },
  { to: "/messages", label: "پیام‌ها", icon: Mail, module: "messages", group: "operations" },
  { to: "/feedback", label: "بازخورد", icon: MessageSquare, module: "feedback", group: "operations" },

  // ۸) گزارش‌ها
  { to: "/reports", label: "گزارش‌ها", icon: BarChart3, module: "reports", group: "reports" },
  { to: "/audit-logs", label: "لاگ فعالیت‌ها", icon: ScrollText, module: "audit-logs", group: "reports", adminOnly: true },
  { to: "/sales/quote-share-logs", label: "لاگ اشتراک‌گذاری پیش‌فاکتور", icon: Share2, module: "invoices", group: "reports" },
  { to: "/sales/send-queue", label: "صف ارسال", icon: Send, module: "invoices", group: "reports" },
  { to: "/marketing/suggestions", label: "پیشنهادهای تبلیغاتی", icon: Megaphone, module: "reports", group: "reports" },
  { to: "/marketing/suggestions-history", label: "تاریخچه پیشنهادها", icon: ScrollText, module: "reports", group: "reports" },

  // ۹) دانش و ارتباطات
  { to: "/knowledge", label: "دانش سازمانی", icon: BookOpen, module: "knowledge", group: "comms" },
  { to: "/academy", label: "آکادمی", icon: GraduationCap, module: "academy", group: "comms" },
  { to: "/data-tables", label: "جداول داده پویا", icon: Database, module: "data-tables", group: "comms" },

  // ۱۰) گیمیفیکیشن
  { to: "/gamification", label: "داشبورد گیمیفیکیشن", icon: Trophy, module: "dashboard", group: "gamification" },
  { to: "/gamification/leaderboard", label: "لیدربورد", icon: BarChart3, module: "dashboard", group: "gamification" },

  // ۱۱) مدیریت گیمیفیکیشن (admin/manager only)
  { to: "/gamification/admin/kpi-rules", label: "قوانین امتیازدهی", icon: Trophy, module: "roles", group: "gamification-admin", adminOnly: true },
  { to: "/gamification/admin/achievements", label: "مدیریت مدال‌ها", icon: Trophy, module: "roles", group: "gamification-admin", adminOnly: true },
  { to: "/gamification/admin/missions", label: "مدیریت مأموریت‌ها", icon: Trophy, module: "roles", group: "gamification-admin", adminOnly: true },
  { to: "/gamification/admin/leagues", label: "مدیریت لیگ‌ها", icon: Trophy, module: "roles", group: "gamification-admin", adminOnly: true },
  { to: "/gamification/admin/rewards", label: "مدیریت پاداش‌ها", icon: Trophy, module: "roles", group: "gamification-admin", adminOnly: true },
  { to: "/gamification/admin/analytics", label: "تحلیل گیمیفیکیشن", icon: BarChart3, module: "roles", group: "gamification-admin", adminOnly: true },
  { to: "/gamification/admin/purchase-settings", label: "طلای زمان (خرید)", icon: Coins, module: "roles", group: "gamification-admin", adminOnly: true },

  // ۱۲) مدیریت سیستم
  { to: "/users", label: "کاربران", icon: Users, module: "users", group: "admin" },
  { to: "/users/pending", label: "کاربران در انتظار تأیید", icon: Users, module: "users", group: "admin", adminOnly: true },
  { to: "/roles", label: "نقش‌ها و دسترسی‌ها", icon: ShieldCheck, module: "roles", group: "admin" },
  { to: "/admin/roles", label: "مجوزهای پویا", icon: ShieldCheck, module: "roles", group: "admin", adminOnly: true },
  { to: "/admin/settings", label: "تنظیمات عمومی", icon: Settings, module: "roles", group: "admin", adminOnly: true },
  { to: "/admin/profile-fields", label: "فیلدهای کاربر", icon: UserSquare2, module: "users", group: "admin", adminOnly: true },
  { to: "/admin/marketing-channels", label: "کانال‌های تبلیغاتی", icon: Megaphone, module: "roles", group: "admin", adminOnly: true },
  { to: "/admin/payment-terms", label: "زمان‌های تسویه", icon: Wallet, module: "roles", group: "admin", adminOnly: true },
  { to: "/admin/waybill-fields", label: "فیلدهای بیجک", icon: Settings, module: "roles", group: "admin", adminOnly: true },
  { to: "/admin/receipt-fields", label: "فیلدهای فیش واریزی", icon: Settings, module: "roles", group: "admin", adminOnly: true },
  { to: "/admin/recent-purchase-settings", label: "وضعیت موجودی پس از خرید", icon: Settings, module: "roles", group: "admin", adminOnly: true },
  { to: "/admin/workflow-stages", label: "مراحل گردش‌کار", icon: Workflow, module: "roles", group: "admin", adminOnly: true },
  { to: "/admin/validation-rules", label: "قوانین اعتبارسنجی", icon: ShieldCheck, module: "roles", group: "admin", adminOnly: true },
  { to: "/pricing/currencies", label: "ارزها", icon: DollarSign, module: "pricing", group: "admin", adminOnly: true },
  { to: "/pricing/currency-sources", label: "منابع ارز", icon: DollarSign, module: "pricing", group: "admin", adminOnly: true },
  { to: "/pricing/currency-rates", label: "نرخ ارز", icon: DollarSign, module: "pricing", group: "admin", adminOnly: true },
  { to: "/pricing/market-rates-workshop", label: "کارگاه نرخ ارز و طلا", icon: Coins, module: "market-rates", group: "admin", adminOnly: true },
  { to: "/pricing/settlement-types", label: "انواع تسویه", icon: Wallet, module: "pricing", group: "admin", adminOnly: true },
  { to: "/pricing/shipping-rules", label: "قوانین ارسال", icon: Workflow, module: "pricing", group: "admin", adminOnly: true },
  { to: "/pricing/change-reasons", label: "دلایل تغییر قیمت", icon: ScrollText, module: "pricing", group: "admin", adminOnly: true },
  { to: "/pricing", label: "تنظیمات قیمت‌گذاری", icon: DollarSign, module: "pricing", group: "admin", adminOnly: true },
  { to: "/bot-api-keys", label: "کلیدهای API ربات", icon: KeyRound, module: "bot-api-keys", group: "admin", adminOnly: true },
];

export const GROUP_LABELS: Record<NavItem["group"], string> = {
  main: "داشبورد",
  "products-pricing": "محصولات و قیمت‌گذاری",
  purchasing: "خرید و تأمین‌کنندگان",
  sales: "فروش",
  finance: "مالی و حسابداری",
  customers: "مشتریان و اعتبار",
  operations: "عملیات داخلی",
  reports: "گزارش‌ها",
  comms: "دانش و ارتباطات",
  gamification: "گیمیفیکیشن",
  "gamification-admin": "مدیریت گیمیفیکیشن",
  admin: "مدیریت سیستم",
};
