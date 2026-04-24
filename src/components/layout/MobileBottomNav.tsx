import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, Package, FileText, Mail, Menu } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

const ITEMS = [
  { to: "/dashboard", label: "داشبورد", icon: LayoutDashboard },
  { to: "/products", label: "محصولات", icon: Package },
  { to: "/invoices", label: "فاکتور", icon: FileText },
  { to: "/messages", label: "پیام", icon: Mail },
];

export function MobileBottomNav() {
  const location = useLocation();
  const { setOpenMobile } = useSidebar();
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t border-border bg-background/95 backdrop-blur md:hidden">
      {ITEMS.map((it) => {
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
