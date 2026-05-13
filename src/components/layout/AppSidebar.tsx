import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  NAV_ITEMS, GROUP_LABELS, SUBGROUP_LABELS, type NavItem, type SubgroupKey,
} from "./nav-items";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermissionEx } from "@/lib/rbac/roles";
import { Sparkles, ChevronDown, Zap } from "lucide-react";
import type { AppRole } from "@/lib/rbac/roles";

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

// QUICK-ACCESS — role-aware shortcut paths. Items resolve against NAV_ITEMS so
// label/icon/module/adminOnly stay in sync with the main nav.
const QUICK_ACCESS_BY_ROLE: Partial<Record<AppRole, string[]>> = {
  admin: [
    "/dashboard", "/products", "/pricing/quick-price",
    "/pricing/sale-lists", "/reports", "/users",
  ],
  manager: [
    "/dashboard", "/products", "/pricing/quick-price",
    "/pricing/sale-lists", "/reports", "/users",
  ],
  sales: [
    "/sales", "/sales/quotes", "/pricing/sale-lists", "/sales/customers",
  ],
  accountant: [
    "/accounting/receipts", "/accounting/receivables",
    "/accounting/payables", "/accounting/daily-capital",
  ],
  viewer: [],
};
const QUICK_ACCESS_LIMIT = 6;

const SIDEBAR_OPEN_GROUPS_KEY = "afrakala.sidebar.openGroups.v1";
type GroupKey = NavItem["group"];

function loadSavedOpenGroups(): Partial<Record<GroupKey, boolean>> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SIDEBAR_OPEN_GROUPS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Partial<Record<GroupKey, boolean>> = {};
    for (const g of GROUPS) {
      const v = (parsed as Record<string, unknown>)[g];
      if (typeof v === "boolean") out[g] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function AppSidebar() {
  const { roles } = useAuth();
  const location = useLocation();
  const qc = useQueryClient();
  const [savedOpenGroups, setSavedOpenGroups] = useState<Partial<Record<GroupKey, boolean>>>(
    () => loadSavedOpenGroups(),
  );

  const handleGroupOpenChange = (g: GroupKey, open: boolean) => {
    setSavedOpenGroups((prev) => {
      const next = { ...prev, [g]: open };
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(SIDEBAR_OPEN_GROUPS_KEY, JSON.stringify(next));
        } catch {
          /* ignore quota / disabled storage */
        }
      }
      return next;
    });
  };
  const isAdmin = roles.includes("admin");
  const isManager = roles.includes("manager");
  const isAccountant = roles.includes("accountant");
  const canSeeAdminOnly = isAdmin || isManager;
  const canSeePricingQueue = isAdmin || isManager || isAccountant;
  const visible = useMemo(
    () =>
      NAV_ITEMS.filter((i) => {
        if (i.adminOnly && !canSeeAdminOnly) return false;
        return hasPermissionEx(roles, i.module, "view");
      }),
    [roles, canSeeAdminOnly],
  );

  // QUICK-ACCESS — merge per-role shortcut paths, dedupe, restrict to items the
  // user can actually see, and cap at QUICK_ACCESS_LIMIT.
  const quickAccess = useMemo(() => {
    const seen = new Set<string>();
    const paths: string[] = [];
    for (const r of roles) {
      for (const p of QUICK_ACCESS_BY_ROLE[r] ?? []) {
        if (!seen.has(p)) {
          seen.add(p);
          paths.push(p);
        }
      }
    }
    const byPath = new Map(visible.map((i) => [i.to, i] as const));
    const items: NavItem[] = [];
    for (const p of paths) {
      const it = byPath.get(p);
      if (it) items.push(it);
      if (items.length >= QUICK_ACCESS_LIMIT) break;
    }
    return items;
  }, [roles, visible]);
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

  const isItemActive = (to: string) =>
    location.pathname === to || location.pathname.startsWith(to + "/");

  const renderItem = (item: NavItem) => {
    const active = isItemActive(item.to);
    const showBadge = item.to === "/users" && isAdmin && (pendingCount ?? 0) > 0;
    const showPricingBadge =
      item.to === "/pricing/recompute-prices" && pricingAlertVariant !== null;
    return (
      <SidebarMenuItem key={item.to}>
        <SidebarMenuButton
          asChild
          isActive={active}
          tooltip={item.label}
          className="relative h-9 gap-2.5 rounded-lg transition-colors data-[active=true]:bg-sidebar-accent/70 data-[active=true]:text-sidebar-primary data-[active=true]:font-semibold data-[active=true]:shadow-sm data-[active=true]:before:absolute data-[active=true]:before:inset-y-1.5 data-[active=true]:before:right-0 data-[active=true]:before:w-[3px] data-[active=true]:before:rounded-l-full data-[active=true]:before:bg-sidebar-primary [&>a>svg]:data-[active=true]:text-sidebar-primary"
        >
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
                  pricingAlertVariant === "alert" ? "bg-destructive" : "bg-amber-500"
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
  };

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
        {quickAccess.length > 0 && (
          <SidebarGroup className="pb-1">
            <SidebarGroupLabel className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-primary/80">
              <Zap className="h-3 w-3" />
              <span>دسترسی سریع</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="grid grid-cols-2 gap-1 group-data-[collapsible=icon]:grid-cols-1">
                {quickAccess.map((item) => {
                  const active = isItemActive(item.to);
                  return (
                    <SidebarMenuItem key={`qa-${item.to}`}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.label}
                        size="sm"
                        className="h-8 rounded-md border border-sidebar-border/50 bg-sidebar-accent/20 text-xs hover:bg-sidebar-accent/60 data-[active=true]:border-sidebar-primary/40 data-[active=true]:bg-sidebar-accent/70 data-[active=true]:text-sidebar-primary"
                      >
                        <Link to={item.to}>
                          <item.icon className="h-3.5 w-3.5" />
                          <span className="truncate">{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {GROUPS.map((g) => {
          const items = visible.filter((i) => i.group === g);
          if (!items.length) return null;
          const groupActive = items.some((i) => isItemActive(i.to));

          // Group items into subgroups (preserving order). Items without subgroup go first.
          const flatItems = items.filter((i) => !i.subgroup);
          const subgroupOrder: SubgroupKey[] = [];
          const bySubgroup = new Map<SubgroupKey, NavItem[]>();
          for (const it of items) {
            if (!it.subgroup) continue;
            if (!bySubgroup.has(it.subgroup)) {
              bySubgroup.set(it.subgroup, []);
              subgroupOrder.push(it.subgroup);
            }
            bySubgroup.get(it.subgroup)!.push(it);
          }
          const hasSubgroups = subgroupOrder.length > 0;

          // "main" group is always flat — no collapse.
          if (g === "main") {
            return (
              <SidebarGroup key={g} className="pb-1">
                <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/55">
                  {GROUP_LABELS[g]}
                </SidebarGroupLabel>
                <SidebarGroupContent className="space-y-0.5">
                  <SidebarMenu>{items.map(renderItem)}</SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }

          return (
            <Collapsible
              key={g}
              open={groupActive || savedOpenGroups[g] === true}
              onOpenChange={(open) => handleGroupOpenChange(g, open)}
              className="group/collapsible"
            >
          <SidebarGroup className="pb-1">
                <CollapsibleTrigger asChild>
                  <SidebarGroupLabel
                className={`flex cursor-pointer items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider transition-colors hover:text-sidebar-foreground ${groupActive ? "text-sidebar-foreground" : "text-sidebar-foreground/55"}`}
                  >
                    <span>{GROUP_LABELS[g]}</span>
                    <ChevronDown className="h-4 w-4 transition-transform group-data-[state=closed]/collapsible:-rotate-90" />
                  </SidebarGroupLabel>
                </CollapsibleTrigger>
                <CollapsibleContent>
              <SidebarGroupContent className="space-y-0.5">
                    {flatItems.length > 0 && (
                      <SidebarMenu>{flatItems.map(renderItem)}</SidebarMenu>
                    )}
                    {hasSubgroups &&
                      subgroupOrder.map((sg) => {
                        const sgItems = bySubgroup.get(sg)!;
                        const sgActive = sgItems.some((i) => isItemActive(i.to));
                        return (
                          <Collapsible
                            key={sg}
                            defaultOpen={sgActive}
                        className="group/sub mt-1.5"
                          >
                            <CollapsibleTrigger asChild>
                              <button
                                type="button"
                            className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-xs font-medium tracking-wide transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-foreground ${sgActive ? "text-sidebar-foreground" : "text-sidebar-foreground/60"}`}
                              >
                                <span>{SUBGROUP_LABELS[sg]}</span>
                                <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=closed]/sub:-rotate-90" />
                              </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                          <SidebarMenu className="mr-2 border-r border-sidebar-border/50 pr-1.5">
                                {sgItems.map(renderItem)}
                              </SidebarMenu>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                  </SidebarGroupContent>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="px-2 py-2 text-[10px] text-sidebar-foreground/60">نسخه ۱.۰.۰ — فاز پایه</div>
      </SidebarFooter>
    </Sidebar>
  );
}
