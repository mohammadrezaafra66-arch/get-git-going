import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, Package, FileText, Mail, Menu } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermissionEx, type ModuleKey } from "@/lib/rbac/roles";

const ITEMS: Array<{ to: string; label: string; icon: typeof LayoutDashboard; module: ModuleKey }> = [
  { to: "/dashboard", label: "داشبورد", icon: LayoutDashboard, module: "dashboard" },
  { to: "/products", label: "محصولات", icon: Package, module: "products" },
  { to: "/invoices", label: "فاکتور", icon: FileText, module: "invoices" },
  { to: "/messages", label: "پیام", icon: Mail, module: "messages" },
];

export function MobileBottomNav() {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();
  const { roles } = useAuth();
  const visible = ITEMS.filter((it) => hasPermissionEx(roles, it.module, "view"));
  const cols = visible.length + 1;
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 grid border-t border-border bg-background/95 backdrop-blur md:hidden"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {visible.map((it) => {
        const active = location.pathname.startsWith(it.to);
        return (
          <Link key={it.to} to={it.to}
            className={`flex flex-col items-center gap-1 py-2 text-[10px] ${active ? "text-primary" : "text-muted-foreground"}`}>
            <it.icon className="h-5 w-5" /><span>{it.label}</span>
          </Link>
        );
      })}
      <button onClick={() => setOpenMobile(true)} className="flex flex-col items-center gap-1 py-2 text-[10px] text-muted-foreground">
        <Menu className="h-5 w-5" /><span>منو</span>
      </button>
    </nav>
  );
}
