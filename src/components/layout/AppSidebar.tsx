import { Link, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { NAV_ITEMS, GROUP_LABELS, type NavItem } from "./nav-items";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermissionEx } from "@/lib/rbac/roles";
import { Sparkles } from "lucide-react";

const GROUPS: NavItem["group"][] = [
  "main",
  "sales",
  "pricing",
  "operations",
  "finance",
  "gamification",
  "gamification-admin",
  "comms",
  "admin",
];

export function AppSidebar() {
  const { roles } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();
  const isAdmin = roles.includes("admin");
  const isManager = roles.includes("manager");
  const canSeeAdminOnly = isAdmin || isManager;
  const visible = NAV_ITEMS.filter((i) => {
    if (i.adminOnly && !canSeeAdminOnly) return false;
    return hasPermissionEx(roles, i.module, "view");
  });
  const { data: pendingCount } = useQuery({
    queryKey: ["pending-users-count"],
    enabled: isAdmin,
    queryFn: async () => {
      const { count } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (!isAdmin) return;
    const ch = supabase
      .channel("sidebar-pending-users")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => { qc.invalidateQueries({ queryKey: ["pending-users-count"] }); }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isAdmin, qc]);

  return (
    <Sidebar side="right" collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="truncate text-sm font-bold text-sidebar-foreground">دستیار افراکالا</span>
            <span className="truncate text-xs text-sidebar-foreground/70">سامانه مدیریت یکپارچه</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {GROUPS.map((g) => {
          const items = visible.filter((i) => i.group === g);
          if (!items.length) return null;
          return (
            <SidebarGroup key={g}>
              <SidebarGroupLabel>{GROUP_LABELS[g]}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
                    const showBadge = item.to === "/users" && isAdmin && (pendingCount ?? 0) > 0;
                    return (
                      <SidebarMenuItem key={item.to}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                          <Link to={item.to}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.label}</span>
                            {showBadge && (
                              <span className="mr-auto rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                                {pendingCount}
                              </span>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="px-2 py-2 text-[10px] text-sidebar-foreground/60">نسخه ۱.۰.۰ — فاز پایه</div>
      </SidebarFooter>
    </Sidebar>
  );
}
