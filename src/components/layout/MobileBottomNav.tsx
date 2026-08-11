import { Link, useLocation } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { AppRole } from "@/lib/rbac/roles";
import { getNavigationEntryByRoute, isNavigationEntryVisible } from "@/lib/navigation/selectors";
import type { NavigationEntry } from "@/lib/navigation/types";

type ShortcutItem = { to: string; label: string };
type ResolvedShortcutItem = ShortcutItem & { entry: NavigationEntry };

const SHORTCUTS_BY_ROLE: Partial<Record<AppRole, ShortcutItem[]>> = {
  admin: [
    { to: "/dashboard", label: "خانه" },
    { to: "/products", label: "محصولات" },
    { to: "/pricing/quick-price", label: "قیمت سریع" },
    { to: "/reports", label: "گزارش‌ها" },
  ],
  manager: [
    { to: "/dashboard", label: "خانه" },
    { to: "/products", label: "محصولات" },
    { to: "/pricing/quick-price", label: "قیمت سریع" },
    { to: "/reports", label: "گزارش‌ها" },
  ],
  sales: [
    { to: "/dashboard", label: "خانه" },
    { to: "/sales", label: "فروش" },
    { to: "/sales/quotes", label: "پیش‌فاکتور" },
    { to: "/pricing/sale-lists", label: "لیست فروش" },
  ],
  accountant: [
    { to: "/dashboard", label: "خانه" },
    { to: "/accounting/receipts", label: "فیش‌ها" },
    { to: "/accounting/receivables", label: "مطالبات" },
    { to: "/accounting/dynamic-capital", label: "سرمایه" },
  ],
  viewer: [
    { to: "/dashboard", label: "خانه" },
    { to: "/notifications", label: "اعلان‌ها" },
    { to: "/messages", label: "پیام‌ها" },
  ],
  // P0/5 — the owner's primary mobile role. NOT /purchases/create: purchases.create
  // is admin/manager only, so that shortcut would land the user on a page the route
  // guard refuses. /purchase is their actual workspace and only resolves because of
  // the registry seed added alongside this — getNavigationEntryByRoute drops any
  // shortcut it cannot resolve, silently.
  purchase_specialist: [
    { to: "/dashboard", label: "خانه" },
    { to: "/purchase", label: "فضای خرید" },
    { to: "/products", label: "محصولات" },
    { to: "/messages", label: "پیام‌ها" },
  ],
};

const MAX_SHORTCUTS = 4;

export function MobileBottomNav() {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();
  const { roles } = useAuth();

  // Merge shortcut lists across roles, dedupe by `to`, keep insertion order.
  const merged: ResolvedShortcutItem[] = [];
  const seen = new Set<string>();
  for (const r of roles) {
    for (const it of SHORTCUTS_BY_ROLE[r] ?? []) {
      const entry = getNavigationEntryByRoute(it.to);
      if (entry && !seen.has(it.to) && isNavigationEntryVisible(entry, roles)) {
        seen.add(it.to);
        merged.push({ ...it, entry });
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
            <it.entry.icon className="h-5 w-5" />
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
