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
  "products-pricing",
  "purchasing",
  "sales-customers",
  "finance",
  "operations",
  "reports",
  "knowledge-comms",
  "admin",
];

export function AppSidebar() {
  const { roles } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();
  const isAdmin = roles.includes("admin");
  const isManager = roles.includes("manager");
  const isAccountant = roles.includes("accountant");
  const canSeeAdminOnly = isAdmin || isManager;
  const canSeePricingQueue = isAdmin || isManager || isAccountant;
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

  // PRICE-RT.4 — small queue alert badge (admin/manager/accountant only).
  const { data: pricingQueueHealth } = useQuery({
    queryKey: ["sidebar-pricing-queue-summary"],
    enabled: canSeePricingQueue,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_pricing_recompute_queue_summary")
        .select("pending_count, failed_count, oldest_pending_at")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const failedCount = Number(pricingQueueHealth?.failed_count ?? 0);
  const pendingPricing = Number(pricingQueueHealth?.pending_count ?? 0);
  const oldestPendingAt = pricingQueueHealth?.oldest_pending_at as string | null | undefined;
  const oldestPendingMs = oldestPendingAt ? Date.now() - new Date(oldestPendingAt).getTime() : 0;
  const pricingAlertVariant: "alert" | "warning" | null =
    !canSeePricingQueue
      ? null
      : failedCount > 0
        ? "alert"
        : pendingPricing > 100 || oldestPendingMs > 10 * 60 * 1000
          ? "warning"
          : null;

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
                    const showPricingBadge =
                      item.to === "/pricing/recompute-prices" && pricingAlertVariant !== null;
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
                            {showPricingBadge && (
                              <span
                                className={`mr-auto rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${
                                  pricingAlertVariant === "alert"
                                    ? "bg-destructive"
                                    : "bg-amber-500"
                                }`}
                                title={
                                  pricingAlertVariant === "alert"
                                    ? `${failedCount} مورد ناموفق در صف قیمت`
                                    : `${pendingPricing} مورد در انتظار در صف قیمت`
                                }
                              >
                                {pricingAlertVariant === "alert" ? failedCount : pendingPricing}
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
