import {
  LayoutDashboard,
  Package,
  DollarSign,
  ShoppingCart,
  ShoppingBag,
  FileText,
  ListOrdered,
  Users,
  ShieldCheck,
  BarChart3,
  BookOpen,
  MessageSquare,
  ScrollText,
  Database,
  KeyRound,
  UserSquare2,
  Merge,
  Factory,
  GraduationCap,
  CheckSquare,
  CalendarClock,
  Workflow,
  Settings,
  Heart,
  Megaphone,
  Edit3,
  Monitor,
  TrendingUp,
  Trophy,
  Wallet,
  UserRound,
  Coins,
  Plus,
  Tag,
  Layers,
  Bookmark,
  Bell,
  Calculator,
  Sparkles,
  Banknote,
  AlertTriangle,
  Send,
  Share2,
  Receipt,
  CreditCard,
  BadgeCheck,
  LifeBuoy,
  FileCheck,
  ClipboardList,
  Plug,
  Upload,
  Download,
  Video,
  History,
  XCircle,
  Warehouse,
  ArrowLeftRight,
  ScrollText as ScrollTextIcon,
  PhoneOff,
} from "lucide-react";
import type { ModuleKey } from "@/lib/rbac/roles";
import type { AppRole } from "@/lib/rbac/roles";
import type { NavigationEntry, NavigationEntrySeed } from "./types";
import { resolveActiveModule } from "@/components/layout/primary-modules";

const NAVIGATION_SEEDS = [
  // ۱) داشبورد
  { to: "/dashboard", label: "داشبورد", icon: LayoutDashboard, module: "dashboard", group: "main" },
  { to: "/notifications", label: "اعلان‌ها", icon: Bell, module: "messages", group: "main" },
  { to: "/popup-center", label: "مرکز پاپ‌آپ‌ها", icon: Bell, module: "dashboard", group: "main" },
  {
    to: "/collaboration",
    label: "ارتباطات همکاری",
    icon: MessageSquare,
    module: "messages",
    group: "main",
  },

  // ۲) محصولات و قیمت‌گذاری
  {
    to: "/products",
    label: "محصولات",
    icon: Package,
    module: "products",
    group: "products-pricing",
    subgroup: "pp-catalog",
  },
  {
    to: "/products/new",
    label: "افزودن محصول",
    icon: Plus,
    module: "products",
    group: "products-pricing",
    subgroup: "pp-catalog",
  },
  {
    to: "/products/categories",
    label: "دسته‌بندی‌ها",
    icon: Layers,
    module: "products",
    group: "products-pricing",
    subgroup: "pp-catalog",
  },
  {
    to: "/products/brands",
    label: "برندها",
    icon: Bookmark,
    module: "products",
    group: "products-pricing",
    subgroup: "pp-catalog",
  },
  {
    to: "/products/attributes",
    label: "ویژگی‌ها",
    icon: Tag,
    module: "products",
    group: "products-pricing",
    subgroup: "pp-catalog",
  },
  {
    to: "/products/labels",
    label: "برچسب‌ها",
    icon: Tag,
    module: "products",
    group: "products-pricing",
    subgroup: "pp-catalog",
  },
  {
    to: "/pricing/purchase-prices",
    label: "قیمت‌های خرید",
    icon: ShoppingBag,
    module: "pricing",
    group: "products-pricing",
    subgroup: "pp-pricing",
  },
  {
    to: "/pricing/rules",
    label: "قوانین قیمت‌گذاری",
    icon: Workflow,
    module: "pricing",
    group: "products-pricing",
    subgroup: "pp-pricing",
  },
  {
    to: "/pricing/sale-price-types",
    label: "نوع‌های قیمت فروش",
    icon: DollarSign,
    module: "pricing",
    group: "products-pricing",
    subgroup: "pp-pricing",
  },
  {
    to: "/pricing/quick-price",
    label: "قیمت سریع",
    icon: Sparkles,
    module: "pricing",
    group: "products-pricing",
    subgroup: "pp-pricing",
  },
  {
    to: "/pricing/calculator",
    label: "ماشین‌حساب قیمت",
    icon: Calculator,
    module: "pricing",
    group: "products-pricing",
    subgroup: "pp-pricing",
  },
  {
    to: "/pricing/my-workbench",
    label: "کارگاه قیمت من",
    icon: Edit3,
    module: "pricing",
    group: "products-pricing",
    subgroup: "pp-pricing",
  },
  {
    to: "/pricing/attention",
    label: "فرصت جبران",
    icon: LifeBuoy,
    module: "pricing",
    group: "products-pricing",
    subgroup: "pp-pricing",
  },
  {
    to: "/pricing/price-alerts",
    label: "هشدارهای قیمت",
    icon: AlertTriangle,
    module: "pricing",
    group: "products-pricing",
    subgroup: "pp-pricing",
  },
  {
    to: "/pricing/market-intelligence",
    label: "هوشمند بازار",
    icon: TrendingUp,
    module: "pricing",
    group: "products-pricing",
    subgroup: "pp-pricing",
  },
  {
    to: "/pricing/product-recommendations",
    label: "پیشنهاد محصولات",
    icon: Sparkles,
    module: "products",
    group: "products-pricing",
    subgroup: "pp-pricing",
    adminOnly: true,
  },
  {
    to: "/pricing/amin-hozoor-board",
    label: "تابلو قیمت زنده",
    icon: Monitor,
    module: "pricing",
    group: "products-pricing",
    subgroup: "pp-publish",
  },
  {
    to: "/pricing/live-price-list",
    label: "لیست قیمت زنده",
    icon: ListOrdered,
    module: "pricing",
    group: "products-pricing",
    subgroup: "pp-publish",
  },
  {
    to: "/pricing/sale-lists",
    label: "لیست قیمت فروش",
    icon: FileText,
    module: "pricing",
    group: "products-pricing",
    subgroup: "pp-publish",
  },
  // Phase 9.3 — same situation as /messages: the route exists with
  // requirePermission("price-lists", "view") and is already declared in
  // PRIMARY_MODULES.paths for the catalog module, but had no seed. Guard
  // unchanged.
  {
    to: "/price-lists",
    label: "لیست‌های قیمت",
    icon: ListOrdered,
    module: "price-lists",
    group: "products-pricing",
    subgroup: "pp-publish",
  },
  {
    to: "/pricing/recompute-prices",
    label: "انتشار دسته‌ای قیمت",
    icon: Sparkles,
    module: "pricing",
    group: "products-pricing",
    subgroup: "pp-publish",
    adminOnly: true,
  },

  // ۳) خرید و تأمین‌کنندگان
  {
    to: "/suppliers",
    label: "تأمین‌کنندگان",
    icon: Factory,
    module: "suppliers",
    group: "purchasing",
  },
  // P0/5 — «فضای خرید»: where a salesperson raises a purchase request and a
  // purchase specialist works the ones assigned to them. It was reachable only
  // from a card on /collaboration, so it appeared in no menu at all — for either
  // role. purchases:view is granted to sales and purchase_specialist precisely
  // for this page (see the note on `purchases` in lib/rbac/roles.ts).
  {
    to: "/purchase",
    label: "فضای خرید",
    icon: ClipboardList,
    module: "purchases",
    group: "purchasing",
  },
  {
    to: "/purchases",
    label: "پنل خرید",
    icon: ShoppingBag,
    module: "purchases",
    group: "purchasing",
  },
  // Phase 8 — چندانباره (۱۷۳–۱۷۹، ۱۸۳). ماژول `warehouse` در migration 209 seed شد.
  {
    to: "/warehouses",
    label: "انبارها",
    icon: Warehouse,
    module: "warehouse",
    group: "purchasing",
  },
  {
    to: "/warehouses/transfers",
    label: "انتقال بین‌انباری",
    icon: ArrowLeftRight,
    module: "warehouse",
    group: "purchasing",
  },
  {
    to: "/warehouses/kardex",
    label: "گزارش کاردکس",
    icon: ScrollTextIcon,
    module: "warehouse",
    group: "purchasing",
  },

  // ۴) فروش و مشتریان
  {
    to: "/sales",
    label: "جستجوی سریع فروش",
    icon: ShoppingCart,
    module: "sales",
    group: "sales-customers",
    subgroup: "sc-sales",
  },
  {
    to: "/sales/quotes",
    label: "پیش‌فاکتورها",
    icon: FileText,
    module: "invoices",
    group: "sales-customers",
    subgroup: "sc-sales",
  },
  // The /sales/invoices and /invoices seeds were removed 2026-08-08 together with their
  // routes, forms and the invoice_items/waybills/waybill_items tables (migration 323).
  // They were a dead parallel design: every one of those tables held 0 rows and the live
  // pre-invoice workflow is `sales_quotes` (/sales/quotes, 50 rows). /invoices was never
  // more than a "coming soon" placeholder. Both had already been hidden from the menus,
  // so this removes no link a user could see.
  // NOTE: the `invoices` TABLE itself is deliberately still in the database — see
  // docs/execution/nav-invoices-cleanup-mission-STATUS.md, phase 4, for the follow-up.
  // Item 152 — the salesperson's own list of refused pre-invoice attempts.
  {
    to: "/my-rejected-quotes",
    label: "درخواست‌های رد شدهٔ من",
    icon: XCircle,
    module: "sales",
    group: "sales-customers",
    subgroup: "sc-sales",
  },
  {
    // M5.1 — the product video chain. Its own module rather than `sales`, because migration 296
    // seeds `role_permissions` for it and the two must agree (the M3.3 lesson).
    to: "/sales/product-videos",
    label: "ویدئوی محصول",
    icon: Video,
    module: "product-videos",
    group: "sales-customers",
    subgroup: "sc-sales",
  },
  {
    to: "/sales/stock-alerts",
    label: "هشدار موجودی",
    icon: AlertTriangle,
    module: "sales",
    group: "sales-customers",
    subgroup: "sc-sales",
  },
  {
    // new-clusters-frontend — promotion nomination list + cancel RPC
    to: "/sales/promotion-nominations",
    label: "نامزدی تبلیغ",
    icon: Megaphone,
    module: "sales",
    group: "sales-customers",
    subgroup: "sc-sales",
  },
  {
    to: "/sales/customers",
    label: "مشتریان",
    icon: UserSquare2,
    module: "sales",
    group: "sales-customers",
    subgroup: "sc-customers",
  },
  {
    to: "/persons",
    label: "اشخاص",
    icon: UserSquare2,
    module: "persons",
    group: "sales-customers",
    subgroup: "sc-customers",
  },
  // A-6 (2026-09-04) — the standalone person importer was retired. Four person-import
  // surfaces existed and only /admin/asan-import was ever used (33 audit rows against 0
  // for the other three), so the enforcement added in migration 430 is written once
  // rather than four times. See docs/research/dual-identity-and-import-20260904.md D2.
  // Phase 8.1 — duplicate-person review queue (admin/manager only, matches person_merge).
  {
    to: "/persons/merge",
    label: "اشخاص تکراری",
    icon: Merge,
    module: "persons",
    group: "sales-customers",
    subgroup: "sc-customers",
  },
  {
    to: "/sales/credit-customers",
    label: "اعتبار مشتریان",
    icon: BadgeCheck,
    module: "sales",
    group: "sales-customers",
    subgroup: "sc-customers",
  },
  {
    to: "/sales/credit-rules",
    label: "قوانین اعتبار",
    icon: ShieldCheck,
    module: "sales",
    group: "sales-customers",
    subgroup: "sc-customers",
  },
  // The route already existed with a `sales/view` guard but was only reachable
  // from a button on /sales/customers.
  {
    to: "/sales/customers/credit-training",
    label: "آموزش اعتبار مشتریان",
    icon: GraduationCap,
    module: "sales",
    group: "sales-customers",
    subgroup: "sc-customers",
  },

  // ۵) مالی و حسابداری
  // UI-NAV.4 — همگی به ماژول جدید «accounting» منتقل شدند تا برای فروشنده/بیننده پنهان شوند.
  {
    to: "/accounting/documents",
    label: "دفتر اسناد",
    icon: FileText,
    module: "accounting",
    group: "finance",
  },
  {
    to: "/accounting/receipts",
    label: "فیش‌های واریزی",
    icon: Receipt,
    module: "accounting",
    group: "finance",
  },
  {
    to: "/accounting/receipts/training",
    label: "آموزش فیش‌های واریزی",
    icon: GraduationCap,
    module: "accounting",
    group: "finance",
  },
  {
    to: "/accounting/receivables",
    label: "مطالبات مشتریان",
    icon: Wallet,
    module: "accounting",
    group: "finance",
  },
  {
    to: "/accounting/payables",
    label: "بدهی تأمین‌کنندگان",
    icon: Wallet,
    module: "accounting",
    group: "finance",
  },
  {
    to: "/accounting/purchase-payments",
    label: "پرداخت خرید",
    icon: CreditCard,
    module: "accounting",
    group: "finance",
  },
  {
    to: "/accounting/bank-accounts",
    label: "حساب‌های بانکی",
    icon: Banknote,
    module: "accounting",
    group: "finance",
  },
  // Phase 9 — خزانه (۱۸۰/۱۸۱/۱۸۲).
  {
    // The single finance entry. Everything the finance section used to list is reached from
    // this page. It renders the hub with no search params and the ledger wizard with
    // `?branch=receipt|payment|dual`, so the same route serves both and old bookmarks resolve.
    to: "/accounting/receipts/create",
    label: "مرکز مالی",
    icon: Wallet,
    module: "accounting",
    group: "finance",
  },
  {
    to: "/accounting/treasury",
    label: "خزانه و ماندهٔ صندوق",
    icon: Wallet,
    module: "accounting",
    group: "finance",
  },
  {
    to: "/accounting/payment-vouchers",
    label: "اسناد پرداخت",
    icon: Receipt,
    module: "accounting",
    group: "finance",
  },
  {
    to: "/accounting/external-parties",
    label: "طرف‌های حساب",
    icon: UserSquare2,
    module: "accounting",
    group: "finance",
  },
  // Item 141 — the three legacy capital pages
  // (/accounting/customer-capital-allocations, /accounting/salesperson-capital-allocations,
  // /accounting/daily-capital) were removed from navigation. Their routes now
  // redirect to /accounting/dynamic-capital, which is the single official page.
  {
    to: "/accounting/dynamic-capital",
    label: "تخصیص سرمایه پویا",
    icon: Coins,
    module: "accounting",
    group: "finance",
  },
  {
    // Item 141/153 — lets the accountant enter salesperson scores (feeds the
    // capital-allocation chain). Guarded by requireAnyRole([admin,accountant]);
    // keeps the admin-only /users/$userId page untouched.
    to: "/accounting/salesperson-scoring",
    label: "امتیازدهی کارشناسان فروش",
    icon: Coins,
    module: "accounting",
    group: "finance",
  },
  // Formal handover from the ledger-mutual-settlement agent, recorded in
  // docs/execution/ledger-mutual-settlement-mission-COMPLETE.md: it built this page but
  // could not register it, because registry.ts / primary-modules.ts belong to this
  // mission this round. Without a seed it was reachable only by typing the URL — the
  // exact orphan-page defect phase 2 of this mission exists to remove.
  // Guard is requireAnyRole(["admin","accountant"]); ROLE_ALLOWLIST_BY_ROUTE mirrors it.
  {
    to: "/accounting/mutual-settlement",
    label: "تسویهٔ متقابل",
    icon: ArrowLeftRight,
    module: "accounting",
    group: "finance",
  },

  // ۶) عملیات داخلی
  {
    to: "/operations/tasks",
    label: "برد وظایف",
    icon: CheckSquare,
    module: "invoices",
    group: "operations",
  },
  {
    to: "/operations/daily-mood",
    label: "حال‌وهوای امروز",
    icon: Heart,
    module: "feedback",
    group: "operations",
  },
  {
    to: "/operations/daily-mood/admin",
    label: "مدیریت حال‌وهوا",
    icon: Heart,
    module: "hr",
    group: "operations",
    adminOnly: true,
  },
  {
    to: "/feedback",
    label: "بازخورد",
    icon: MessageSquare,
    module: "feedback",
    group: "operations",
  },
  {
    to: "/gamification",
    label: "داشبورد گیمیفیکیشن",
    icon: Trophy,
    module: "dashboard",
    group: "operations",
  },
  {
    to: "/gamification/leaderboard",
    label: "لیدربورد",
    icon: BarChart3,
    module: "dashboard",
    group: "operations",
  },
  {
    // new-clusters-frontend — employee league view (get_current_league / leaderboard)
    to: "/gamification/league",
    label: "لیگ",
    icon: Trophy,
    module: "dashboard",
    group: "operations",
  },
  {
    // Item 162 — KPI weighting page. Was reachable only from the hub; register it
    // in nav and keep it admin-only (matches the route's requireAnyRole(["admin"]) guard).
    to: "/gamification/settings",
    label: "تنظیمات وزن KPIها",
    icon: Settings,
    module: "dashboard",
    group: "operations",
    adminOnly: true,
  },

  // ۷) گزارش‌ها
  { to: "/reports", label: "گزارش‌ها", icon: BarChart3, module: "reports", group: "reports" },
  {
    to: "/audit-logs",
    label: "لاگ فعالیت‌ها",
    icon: ScrollText,
    module: "audit-logs",
    group: "reports",
    adminOnly: true,
  },
  {
    to: "/sales/quote-share-logs",
    label: "لاگ اشتراک‌گذاری پیش‌فاکتور",
    icon: Share2,
    module: "invoices",
    group: "reports",
  },
  { to: "/sales/send-queue", label: "صف ارسال", icon: Send, module: "invoices", group: "reports" },
  {
    to: "/marketing/suggestions",
    label: "پیشنهادهای تبلیغاتی",
    icon: Megaphone,
    module: "reports",
    group: "reports",
  },
  {
    to: "/marketing/suggestions-history",
    label: "تاریخچه پیشنهادها",
    icon: ScrollText,
    module: "reports",
    group: "reports",
  },
  {
    // Phase 10 (224) — the marketer's own daily checklist. Deliberately NOT
    // admin-gated and NOT module-restricted beyond "reports": every staff
    // member who can be assigned a recurring marketing task must be able to
    // reach their own list on a phone. RLS on `tasks` already limits it to
    // rows assigned to the caller.
    to: "/marketing/my-tasks",
    label: "وظایف بازاریابی من",
    icon: CheckSquare,
    module: "reports",
    group: "reports",
  },
  // ۸) دانش، آکادمی و ارتباطات
  {
    to: "/knowledge",
    label: "دانش سازمانی",
    icon: BookOpen,
    module: "knowledge",
    group: "knowledge-comms",
  },
  {
    to: "/academy",
    label: "آکادمی",
    icon: GraduationCap,
    module: "academy",
    group: "knowledge-comms",
  },
  {
    to: "/updates",
    label: "تغییرات و به‌روزرسانی‌ها",
    icon: History,
    module: "platform-releases",
    group: "knowledge-comms",
  },
  // Phase 9.3 — /messages already existed with requirePermission("messages",
  // "view") and was already listed in PRIMARY_MODULES.paths for the assistant
  // module, but had no navigation seed, so itemsForModule looked it up and
  // found nothing. The whole messenger was unreachable from the menu. Guard
  // unchanged; this only adds the missing entry.
  {
    to: "/messages",
    label: "پیام‌رسان",
    icon: MessageSquare,
    module: "messages",
    group: "knowledge-comms",
  },
  {
    // new-clusters-frontend — standalone inquiries + update_inquiry_status / tick_inquiries
    to: "/messages/inquiries",
    label: "استعلام‌ها",
    icon: ClipboardList,
    module: "messages",
    group: "knowledge-comms",
  },
  {
    to: "/data-tables",
    label: "جداول داده پویا",
    icon: Database,
    module: "data-tables",
    group: "knowledge-comms",
  },

  // ۹) مدیریت سیستم
  {
    to: "/users",
    label: "کاربران",
    icon: Users,
    module: "users",
    group: "admin",
    subgroup: "adm-users",
  },
  {
    to: "/users/pending",
    label: "کاربران در انتظار تأیید",
    icon: Users,
    module: "users",
    group: "admin",
    subgroup: "adm-users",
    adminOnly: true,
  },
  {
    to: "/roles",
    label: "نقش‌ها و دسترسی‌ها",
    icon: ShieldCheck,
    module: "roles",
    group: "admin",
    subgroup: "adm-users",
  },
  {
    to: "/admin/roles",
    label: "مجوزهای پویا",
    icon: ShieldCheck,
    module: "roles",
    group: "admin",
    subgroup: "adm-users",
    adminOnly: true,
  },
  {
    to: "/admin/profile-fields",
    label: "فیلدهای کاربر",
    icon: UserSquare2,
    module: "users",
    group: "admin",
    subgroup: "adm-users",
    adminOnly: true,
  },
  {
    to: "/admin/settings",
    label: "تنظیمات عمومی",
    icon: Settings,
    module: "roles",
    group: "admin",
    subgroup: "adm-settings",
    adminOnly: true,
  },
  {
    to: "/admin/platform-releases",
    label: "مدیریت به‌روزرسانی‌ها",
    icon: History,
    module: "platform-releases",
    group: "admin",
    subgroup: "adm-settings",
    allowedRoles: ["admin"],
  },
  {
    to: "/admin/penalties",
    label: "کارت‌های قرمز",
    icon: AlertTriangle,
    module: "roles",
    group: "admin",
    subgroup: "adm-settings",
    adminOnly: true,
  },
  {
    to: "/admin/audit",
    label: "لاگ فعالیت‌ها",
    icon: ClipboardList,
    module: "roles",
    group: "admin",
    subgroup: "adm-settings",
    adminOnly: true,
  },
  {
    // ASAN M3.2 — the phone collision review queue. Admin tools, not settings:
    // it is a worklist, not a configuration screen.
    to: "/admin/phone-collisions",
    label: "تداخل شماره تلفن",
    icon: PhoneOff,
    module: "roles",
    group: "admin",
    subgroup: "adm-tools",
    adminOnly: true,
  },
  {
    // ASAN M3.3 — the Asan person/product import workbench. Admin tools, not
    // settings: it is a job you run, not a configuration you set.
    //
    // Deliberately NOT `adminOnly`. That flag reads "admin or manager", which is
    // the wrong set here: the brief and migration 285's seed both say admin and
    // accountant. `adminOnly` would have hidden the page from the accountant it
    // is mainly built for while showing it to a manager the backend refuses.
    // The allowlist below is in ROLE_ALLOWLIST_BY_ROUTE.
    to: "/admin/asan-import",
    label: "ورود اطلاعات از آسان",
    icon: Upload,
    module: "asan-import",
    group: "admin",
    subgroup: "adm-tools",
  },
  {
    // ASAN M4.2 — the export side of the same bridge. Same access set as the import
    // workbench (admin + accountant) and the same reason for NOT using `adminOnly`:
    // that flag means "admin or manager", which is the wrong set here.
    to: "/admin/asan-export",
    label: "خروجی برای آسان",
    icon: Download,
    module: "asan-export",
    group: "admin",
    subgroup: "adm-tools",
  },
  {
    to: "/admin/purchase",
    label: "مدیریت خرید",
    icon: ShoppingCart,
    module: "roles",
    group: "admin",
    subgroup: "adm-tools",
    adminOnly: true,
  },
  {
    to: "/admin/documents",
    label: "مدیریت اسناد",
    icon: FileText,
    module: "roles",
    group: "admin",
    subgroup: "adm-tools",
    adminOnly: true,
  },
  {
    to: "/admin/delivery-receipts",
    label: "مدیریت رسیدها",
    icon: FileCheck,
    module: "roles",
    group: "admin",
    subgroup: "adm-tools",
    adminOnly: true,
  },
  {
    to: "/admin/workflow-settings",
    label: "تنظیمات گردش‌کار",
    icon: Settings,
    module: "roles",
    group: "admin",
    subgroup: "adm-settings",
    adminOnly: true,
  },
  {
    to: "/admin/marketing-channels",
    label: "کانال‌های تبلیغاتی",
    icon: Megaphone,
    module: "roles",
    group: "admin",
    subgroup: "adm-settings",
    adminOnly: true,
  },
  {
    // Phase 10 (224) — recurring template management.
    to: "/admin/marketing-task-templates",
    label: "قالب وظایف بازاریابی",
    icon: CalendarClock,
    module: "roles",
    group: "admin",
    subgroup: "adm-settings",
    adminOnly: true,
  },
  {
    to: "/admin/sales-reminders",
    label: "یادآوری‌های فروش",
    icon: MessageSquare,
    module: "roles",
    group: "admin",
    subgroup: "adm-settings",
    adminOnly: true,
  },
  {
    to: "/admin/payment-terms",
    label: "زمان‌های تسویه",
    icon: Wallet,
    module: "roles",
    group: "admin",
    subgroup: "adm-settings",
    adminOnly: true,
  },
  // Item 203 — the visitor registry feeds the picker on the quote form.
  {
    to: "/admin/visitors",
    label: "ویزیتورها",
    icon: UserRound,
    module: "roles",
    group: "admin",
    subgroup: "adm-settings",
    adminOnly: true,
  },
  // /admin/waybill-fields removed 2026-08-08 with migration 333. It configured custom
  // fields for waybills — a feature that no longer exists: waybills and waybill_items
  // were dropped by 323 and the invoices table they hung off by 332. Its table
  // waybill_custom_fields held 0 rows and nothing else read it.
  // NOTE: the component WaybillCustomFieldsInput SURVIVES and must not be deleted — despite
  // the name it is generic (custom field editor). The receipts create path is the
  // three-branch wizard; it does not render this input.
  {
    to: "/admin/receipt-fields",
    label: "فیلدهای فیش واریزی",
    icon: Settings,
    module: "roles",
    group: "admin",
    subgroup: "adm-settings",
    adminOnly: true,
  },
  {
    to: "/admin/recent-purchase-settings",
    label: "وضعیت موجودی پس از خرید",
    icon: Settings,
    module: "roles",
    group: "admin",
    subgroup: "adm-settings",
    adminOnly: true,
  },
  {
    to: "/admin/workflow-stages",
    label: "مراحل گردش‌کار",
    icon: Workflow,
    module: "roles",
    group: "admin",
    subgroup: "adm-settings",
    adminOnly: true,
  },
  {
    to: "/admin/validation-rules",
    label: "قوانین اعتبارسنجی",
    icon: ShieldCheck,
    module: "roles",
    group: "admin",
    subgroup: "adm-settings",
    adminOnly: true,
  },
  {
    to: "/pricing/currencies",
    label: "ارزها",
    icon: DollarSign,
    module: "pricing",
    group: "admin",
    subgroup: "adm-settings",
    adminOnly: true,
  },
  {
    to: "/pricing/currency-sources",
    label: "منابع ارز",
    icon: DollarSign,
    module: "pricing",
    group: "admin",
    subgroup: "adm-settings",
    adminOnly: true,
  },
  {
    to: "/pricing/currency-rates",
    label: "نرخ ارز",
    icon: DollarSign,
    module: "pricing",
    group: "admin",
    subgroup: "adm-settings",
    adminOnly: true,
  },
  {
    to: "/pricing/market-rates-workshop",
    label: "کارگاه نرخ ارز و طلا",
    icon: Coins,
    module: "market-rates",
    group: "admin",
    subgroup: "adm-settings",
    adminOnly: true,
  },
  {
    to: "/pricing/settlement-types",
    label: "انواع تسویه",
    icon: Wallet,
    module: "pricing",
    group: "admin",
    subgroup: "adm-settings",
    // Not adminOnly: that means admin OR manager, and it was the third of three layers that
    // disagreed about who owns this page. The route guard admits admin and accountant, and
    // migration 416 makes RLS say the same -- so the accountant who is meant to use the page
    // must be able to find it, and the manager who can no longer write must stop being sent
    // to a page requireAnyRole refuses them.
    allowedRoles: ["admin", "accountant"],
  },
  {
    to: "/pricing/shipping-rules",
    label: "قوانین ارسال",
    icon: Workflow,
    module: "pricing",
    group: "admin",
    subgroup: "adm-settings",
    adminOnly: true,
  },
  {
    to: "/pricing/change-reasons",
    label: "دلایل تغییر قیمت",
    icon: ScrollText,
    module: "pricing",
    group: "admin",
    subgroup: "adm-settings",
    adminOnly: true,
  },
  {
    to: "/pricing",
    label: "تنظیمات قیمت‌گذاری",
    icon: DollarSign,
    module: "pricing",
    group: "admin",
    subgroup: "adm-settings",
    adminOnly: true,
  },
  {
    to: "/admin/automation",
    label: "اتوماسیون فاز صفر",
    icon: Sparkles,
    module: "roles",
    group: "admin",
    subgroup: "adm-tools",
    adminOnly: true,
  },
  {
    to: "/bot-api-keys",
    label: "کلیدهای API ربات",
    icon: KeyRound,
    module: "bot-api-keys",
    group: "admin",
    subgroup: "adm-tools",
  },
  {
    to: "/admin/ai-providers",
    label: "ارائه‌دهندگان هوش مصنوعی",
    icon: Sparkles,
    module: "roles",
    group: "admin",
    subgroup: "adm-tools",
    adminOnly: true,
  },
  {
    // Was /integrations/didar until 2026-08-08. That page is now a redirect shim (see
    // the header of _app.integrations.didar.tsx); the seed points at the surviving
    // implementation so searching "دیدار" returns one result that works, not two of
    // which one bounces. `module` stays "bot-api-keys" for continuity with the old seed
    // — the guard is requireAdmin(), and admin short-circuits hasPermissionEx(), so the
    // module key does not gate this route; allowedRoles below is what makes the menu
    // entry match the guard exactly (adminOnly alone would also admit manager).
    to: "/operations/didar",
    label: "یکپارچه‌سازی دیدار",
    icon: Plug,
    module: "bot-api-keys",
    group: "admin",
    subgroup: "adm-tools",
    allowedRoles: ["admin"],
  },
  {
    to: "/market-matches",
    label: "بررسی تطبیق محصولات بازار",
    icon: BadgeCheck,
    module: "bot-api-keys",
    group: "admin",
    subgroup: "adm-tools",
    adminOnly: true,
  },
  {
    to: "/gamification/admin/kpi-rules",
    label: "قوانین امتیازدهی",
    icon: Trophy,
    module: "roles",
    group: "admin",
    subgroup: "adm-gamification",
    adminOnly: true,
  },
  {
    to: "/gamification/admin/achievements",
    label: "مدیریت مدال‌ها",
    icon: Trophy,
    module: "roles",
    group: "admin",
    subgroup: "adm-gamification",
    adminOnly: true,
  },
  {
    to: "/gamification/admin/missions",
    label: "مدیریت مأموریت‌ها",
    icon: Trophy,
    module: "roles",
    group: "admin",
    subgroup: "adm-gamification",
    adminOnly: true,
  },
  {
    to: "/gamification/admin/leagues",
    label: "مدیریت لیگ‌ها",
    icon: Trophy,
    module: "roles",
    group: "admin",
    subgroup: "adm-gamification",
    adminOnly: true,
  },
  {
    to: "/gamification/admin/rewards",
    label: "مدیریت پاداش‌ها",
    icon: Trophy,
    module: "roles",
    group: "admin",
    subgroup: "adm-gamification",
    adminOnly: true,
  },
  {
    to: "/gamification/admin/analytics",
    label: "تحلیل گیمیفیکیشن",
    icon: BarChart3,
    module: "roles",
    group: "admin",
    subgroup: "adm-gamification",
    adminOnly: true,
  },
  {
    to: "/gamification/admin/purchase-settings",
    label: "طلای زمان (خرید)",
    icon: Coins,
    module: "roles",
    group: "admin",
    subgroup: "adm-gamification",
    // No adminOnly: the route guard is requireAnyRole(admin, manager, accountant) and
    // adminOnly is AND-ed with allowedRoles (selectors.ts:35-36), so keeping it here
    // hid the page from the accountant the guard admits. Removed 2026-08-08;
    // ROLE_ALLOWLIST_BY_ROUTE already carries the exact guard.
  },
  // Item 132.1 — manual daily performance entry (admin/manager/accountant).
  {
    to: "/gamification/admin/manual-metrics",
    label: "ثبت دستی عملکرد روزانه",
    icon: Trophy,
    module: "roles",
    group: "admin",
    subgroup: "adm-gamification",
    // adminOnly removed 2026-08-08 — see /gamification/admin/purchase-settings above.
  },
  // Item 143 — in-page guide for the manual-metrics form.
  {
    to: "/gamification/admin/manual-metrics/guide",
    label: "راهنمای ثبت دستی عملکرد",
    icon: BookOpen,
    module: "roles",
    group: "admin",
    subgroup: "adm-gamification",
    // adminOnly removed 2026-08-08 — see /gamification/admin/purchase-settings above.
  },
] satisfies NavigationEntrySeed[];

// PRIMARY_MODULE_PATHS removed 2026-08-08. It was a 103-line second copy of the
// route->module mapping held in PRIMARY_MODULES (src/components/layout/primary-modules.ts)
// but was never actually consumed by the sidebar renderer: the sidebar reads only
// PRIMARY_MODULES (itemsForModule() -> primary-modules.ts). The dead copy fed
// entry.primaryModule, whose only two readers are getNavigationEntriesByModule()
// (zero call sites) and resolveNavigationMetadata().module (NavigationBreadcrumbs
// reads only .breadcrumbs) -- so editing it changed nothing on screen, and it had
// already silently drifted on eight routes. Traced in
// docs/audits/system-wide-wiring-audit.md (section الف-۱). entry.primaryModule is now
// derived from PRIMARY_MODULES via resolveActiveModule(), so there is exactly one
// list to edit. For the last revision that still contained it, see commit 4cdee087.

const MOBILE_PRIORITIES: Record<string, number> = {
  "/dashboard": 1,
  "/products": 2,
  "/pricing/quick-price": 3,
  "/reports": 4,
  "/sales": 2,
  "/sales/quotes": 3,
  "/pricing/sale-lists": 4,
  "/accounting/receipts": 2,
  "/accounting/receivables": 3,
  "/accounting/dynamic-capital": 4,
  "/notifications": 2,
  "/messages": 3,
};

const PRIMARY_ROLE_ROUTES: Partial<Record<string, AppRole[]>> = {
  "/dashboard": ["admin", "manager", "viewer"],
  "/sales": ["sales"],
  "/accounting/receipts": ["accountant"],
};

const KEYWORDS_BY_ROUTE: Record<string, string[]> = {
  "/sales": ["sales quick search", "jostoju sari forush", "search", "forush", "jostoju"],
  "/sales/search": ["sales quick search", "jostoju sari forush", "search", "forush", "jostoju"],
  "/accounting/receipts": ["receipt", "payment", "fish", "resid", "pardakht"],
  "/accounting/receivables": ["receivable", "debt", "motalebat", "bedehi"],
  "/accounting/dynamic-capital": ["capital", "credit", "sarmaye", "etebar"],
  "/sales/credit-customers": ["credit", "etebar", "customer"],
  "/sales/credit-rules": ["credit", "rules", "etebar", "ghanun"],
  "/pricing/sale-lists": ["price list", "excel", "gheymat", "list"],
  "/pricing/quick-price": ["quick price", "gheymat", "sari"],
  "/pricing/recompute-prices": ["queue", "publish", "price", "saf", "enteshar", "gheymat"],
  "/products": ["product", "catalog", "kala", "mahsool"],
  "/users": ["users", "accounts", "karbar", "access"],
  "/users/pending": ["approval", "pending", "taeed", "entezar"],
  "/knowledge": ["knowledge", "docs", "danesh", "document"],
  "/updates": ["updates", "changelog", "release", "بروزرسانی", "تغییرات"],
};

const BADGE_SOURCE_BY_ROUTE: Record<string, NavigationEntry["badgeSource"]> = {
  "/users": { id: "pending-users" },
  "/pricing/recompute-prices": { id: "pricing-recompute-queue" },
};

const ACTION_BY_ROUTE: Partial<Record<string, NavigationEntry["permission"]["action"]>> = {
  "/products/new": "create",
  "/pricing/purchase-prices": "create",
  "/pricing/recompute-prices": "update",
};

// Every entry here must mirror the route's real beforeLoad guard. A menu link that
// is wider than its guard sends the user to /unauthorized; one that is narrower
// hides a page the user is allowed to open. The seven entries added 2026-08-08 were
// all of the second kind or worse — they were verified one by one against the
// `requireAnyRole(...)` / `requirePermission(...)` call in each route file while
// wiring the 38 unreachable pages into PRIMARY_MODULES.
const ROLE_ALLOWLIST_BY_ROUTE: Record<string, AppRole[]> = {
  "/accounting/dynamic-capital": ["admin", "accountant"],
  // _app.accounting.treasury.tsx / .payment-vouchers.tsx — requireAnyRole(admin,
  // manager, accountant). Pinned explicitly rather than left to the `accounting`
  // module permission, which today has zero role_permissions rows and so resolves
  // through the static fallback.
  "/accounting/payment-vouchers": ["admin", "manager", "accountant"],
  // Mirrors _app.accounting.receipts.create.tsx:17 — requireAnyRole(["admin","accountant","manager"]).
  "/accounting/receipts/create": ["admin", "manager", "accountant"],
  "/accounting/treasury": ["admin", "manager", "accountant"],
  // _app.accounting.salesperson-scoring.tsx — requireAnyRole(admin, accountant):
  // narrower than accounting:view, so manager must not see the link.
  "/accounting/salesperson-scoring": ["admin", "accountant"],
  // _app.accounting.mutual-settlement.tsx — requireAnyRole(admin, accountant), same
  // reasoning: narrower than the accounting module permission.
  "/accounting/mutual-settlement": ["admin", "accountant"],
  "/sales/product-videos": ["admin", "manager", "sales", "accountant"],
  // _app.gamification.settings.tsx — requireAnyRole(admin). The seed's adminOnly
  // flag alone means admin OR manager (selectors.ts:35), which is wider than the guard.
  "/gamification/settings": ["admin"],
  // Warehouse pages: warehouse:view is granted to five roles, but the routes guard
  // themselves far more tightly. Without these three the whole warehouse section
  // would appear for sales/accountant and then bounce them.
  "/warehouses": ["admin", "manager"],
  "/warehouses/kardex": ["admin", "manager", "accountant", "purchase_specialist"],
  "/warehouses/transfers": ["admin", "manager"],
  "/admin/asan-export": ["admin", "accountant"],
  "/admin/asan-import": ["admin", "accountant"],
  "/admin/audit": ["admin", "manager"],
  "/admin/automation": ["admin", "manager"],
  "/admin/delivery-receipts": ["admin", "manager"],
  "/admin/documents": ["admin", "manager"],
  "/admin/penalties": ["admin", "manager"],
  "/admin/profile-fields": ["admin"],
  "/admin/purchase": ["admin", "manager"],
  "/admin/recent-purchase-settings": ["admin"],
  "/admin/roles": ["admin"],
  "/admin/sales-reminders": ["admin", "manager"],
  "/admin/settings": ["admin"],
  "/admin/platform-releases": ["admin"],
  "/admin/ai-providers": ["admin"],
  "/admin/validation-rules": ["admin"],
  "/admin/workflow-settings": ["admin", "manager"],
  "/audit-logs": ["admin"],
  "/gamification/admin/achievements": ["admin", "manager"],
  "/gamification/admin/analytics": ["admin", "manager"],
  "/gamification/admin/kpi-rules": ["admin", "manager"],
  "/gamification/admin/leagues": ["admin", "manager"],
  "/gamification/admin/manual-metrics": ["admin", "manager", "accountant"],
  "/gamification/admin/manual-metrics/guide": ["admin", "manager", "accountant"],
  "/gamification/admin/missions": ["admin", "manager"],
  "/gamification/admin/purchase-settings": ["admin", "manager", "accountant"],
  "/gamification/admin/rewards": ["admin", "manager"],
  "/persons/merge": ["admin", "manager"],
  "/pricing/market-intelligence": ["admin", "manager", "accountant"],
  "/pricing/product-recommendations": ["admin", "manager"],
  "/roles": ["admin"],
  "/sales/credit-rules": ["admin", "accountant"],
  "/sales/promotion-nominations": ["sales", "admin", "manager"],
  "/messages/inquiries": [
    "admin",
    "manager",
    "sales",
    "accountant",
    "viewer",
    "purchase_specialist",
  ],
  "/gamification/league": ["admin", "manager", "sales", "accountant", "viewer"],
  "/users": ["admin"],
};

function idFromRoute(route: string): string {
  return (
    route
      .replace(/^\/+/, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "dashboard"
  );
}

function routeKeywords(seed: NavigationEntrySeed): string[] {
  const routeParts = seed.to.split(/[/-]+/).filter(Boolean);
  return Array.from(new Set([seed.label, ...routeParts, ...(KEYWORDS_BY_ROUTE[seed.to] ?? [])]));
}

function toNavigationEntry(seed: NavigationEntrySeed): NavigationEntry {
  const id = idFromRoute(seed.to);
  return {
    id,
    title: seed.label,
    route: seed.to,
    module: seed.module,
    primaryModule: resolveActiveModule(seed.to),
    group: seed.group,
    subgroup: seed.subgroup,
    description: "Open " + seed.label,
    keywords: routeKeywords(seed),
    icon: seed.icon,
    permission: { module: seed.module, action: ACTION_BY_ROUTE[seed.to] ?? "view" },
    adminOnly: seed.adminOnly,
    allowedRoles: seed.allowedRoles ?? ROLE_ALLOWLIST_BY_ROUTE[seed.to],
    hiddenFromMenu: seed.hiddenFromMenu,
    pinnable: !seed.hiddenFromMenu,
    primaryForRoles: PRIMARY_ROLE_ROUTES[seed.to] ?? [],
    badgeSource: BADGE_SOURCE_BY_ROUTE[seed.to],
    breadcrumb: { title: seed.label },
    mobileVisible: MOBILE_PRIORITIES[seed.to] !== undefined,
    mobilePriority: MOBILE_PRIORITIES[seed.to],
    recentEligible: !seed.to.includes("/pending") && !seed.to.includes("/admin/audit"),
    analyticsKey: "nav." + id,
  };
}

export const NAVIGATION_REGISTRY = NAVIGATION_SEEDS.map(toNavigationEntry);

const ids = new Set<string>();
const routes = new Set<string>();
for (const entry of NAVIGATION_REGISTRY) {
  if (ids.has(entry.id)) throw new Error("Duplicate navigation id: " + entry.id);
  if (routes.has(entry.route)) throw new Error("Duplicate navigation route: " + entry.route);
  ids.add(entry.id);
  routes.add(entry.route);
}
