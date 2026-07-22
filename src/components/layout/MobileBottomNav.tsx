import { Link, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Package,
  FileText,
  Mail,
  Menu,
  ShoppingCart,
  ListOrdered,
  Receipt,
  Wallet,
  Coins,
  Sparkles,
  BarChart3,
  Bell,
} from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermissionEx, type ModuleKey, type AppRole } from "@/lib/rbac/roles";

type ShortcutItem = { to: string; label: string; icon: typeof LayoutDashboard; module: ModuleKey };

const SHORTCUTS_BY_ROLE: Partial<Record<AppRole, ShortcutItem[]>> = {
  admin: [
    { to: "/dashboard", label: "خانه", icon: LayoutDashboard, module: "dashboard" },
    { to: "/products", label: "محصولات", icon: Package, module: "products" },
    { to: "/pricing/quick-price", label: "قیمت سریع", icon: Sparkles, module: "pricing" },
    { to: "/reports", label: "گزارش‌ها", icon: BarChart3, module: "reports" },
  ],
  manager: [
    { to: "/dashboard", label: "خانه", icon: LayoutDashboard, module: "dashboard" },
    { to: "/products", label: "محصولات", icon: Package, module: "products" },
    { to: "/pricing/quick-price", label: "قیمت سریع", icon: Sparkles, module: "pricing" },
    { to: "/reports", label: "گزارش‌ها", icon: BarChart3, module: "reports" },
  ],
  sales: [
    { to: "/dashboard", label: "خانه", icon: LayoutDashboard, module: "dashboard" },
    { to: "/sales", label: "فروش", icon: ShoppingCart, module: "sales" },
    { to: "/sales/quotes", label: "پیش‌فاکتور", icon: FileText, module: "invoices" },
    { to: "/pricing/sale-lists", label: "لیست فروش", icon: ListOrdered, module: "pricing" },
  ],
  accountant: [
    { to: "/dashboard", label: "خانه", icon: LayoutDashboard, module: "dashboard" },
    { to: "/accounting/receipts", label: "فیش‌ها", icon: Receipt, module: "accounting" },
    { to: "/accounting/receivables", label: "مطالبات", icon: Wallet, module: "accounting" },
    { to: "/accounting/dynamic-capital", label: "سرمایه", icon: Coins, module: "accounting" },
  ],
  viewer: [
    { to: "/dashboard", label: "خانه", icon: LayoutDashboard, module: "dashboard" },
    { to: "/notifications", label: "اعلان‌ها", icon: Bell, module: "messages" },
    { to: "/messages", label: "پیام‌ها", icon: Mail, module: "messages" },
  ],
};

const MAX_SHORTCUTS = 4;

export function MobileBottomNav() {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();
  const { roles } = useAuth();

  // Merge shortcut lists across roles, dedupe by `to`, keep insertion order.
  const merged: ShortcutItem[] = [];
  const seen = new Set<string>();
  for (const r of roles) {
    for (const it of SHORTCUTS_BY_ROLE[r] ?? []) {
      if (!seen.has(it.to) && hasPermissionEx(roles, it.module, "view")) {
        seen.add(it.to);
        merged.push(it);
        if (merged.length >= MAX_SHORTCUTS) break;
      }
    }
    if (merged.length >= MAX_SHORTCUTS) break;
  }
  const visible = merged;
  const cols = visible.length + 1;
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 grid border-t border-border bg-background/95 backdrop-blur md:hidden"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {visible.map((it) => {
        const active = location.pathname.startsWith(it.to);
        return (
          <Link
            key={it.to}
            to={it.to}
            className={`flex flex-col items-center gap-1 py-2 text-[10px] ${active ? "text-primary" : "text-muted-foreground"}`}
          >
            <it.icon className="h-5 w-5" />
            <span>{it.label}</span>
          </Link>
        );
      })}
      <button
        onClick={() => setOpenMobile(true)}
        className="flex flex-col items-center gap-1 py-2 text-[10px] text-muted-foreground"
      >
        <Menu className="h-5 w-5" />
        <span>منو</span>
      </button>
    </nav>
  );
}
