import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sidebar, SidebarContent, SidebarHeader, SidebarFooter } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NAV_ITEMS, type NavItem } from "./nav-items";
import {
  PRIMARY_MODULES,
  resolveActiveModule,
  itemsForModule,
  type PrimaryModuleKey,
} from "./primary-modules";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermissionEx, ROLE_LABELS } from "@/lib/rbac/roles";
import { Sparkles, Search, Bell, HelpCircle, LogOut } from "lucide-react";
import type { AppRole } from "@/lib/rbac/roles";
import { normalizeSearchText } from "@/lib/i18n/search-normalizer";

// QUICK-ACCESS — role-aware shortcut paths. Items resolve against NAV_ITEMS so
// label/icon/module/adminOnly stay in sync with the main nav.
const QUICK_ACCESS_BY_ROLE: Partial<Record<AppRole, string[]>> = {
  admin: [
    "/dashboard",
    "/products",
    "/pricing/quick-price",
    "/pricing/sale-lists",
    "/reports",
    "/users",
  ],
  manager: [
    "/dashboard",
    "/products",
    "/pricing/quick-price",
    "/pricing/sale-lists",
    "/reports",
    "/users",
  ],
  sales: ["/sales", "/sales/quotes", "/pricing/sale-lists", "/sales/customers"],
  accountant: [
    "/accounting/receipts",
    "/accounting/receivables",
    "/accounting/payables",
    "/accounting/dynamic-capital",
  ],
  viewer: [],
};
const QUICK_ACCESS_LIMIT = 6;

export function AppSidebar() {
  const { roles, user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [activeModule, setActiveModule] = useState<PrimaryModuleKey>(() =>
    resolveActiveModule(location.pathname),
  );

  // Keep active module in sync with current route.
  useEffect(() => {
    setActiveModule(resolveActiveModule(location.pathname));
  }, [location.pathname]);

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
  // Per-module visible item count — drives empty-state and module-button enable.
  const moduleCounts = useMemo(() => {
    const out: Partial<Record<PrimaryModuleKey, number>> = {};
    for (const m of PRIMARY_MODULES) {
      out[m.key] = itemsForModule(m.key, visible).length;
    }
    return out;
  }, [visible]);

  const submenuItems = useMemo(
    () => itemsForModule(activeModule, visible),
    [activeModule, visible],
  );

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

  // SIDEBAR-SEARCH — match against permission-filtered `visible` items only.
  const normalizedQuery = normalizeSearchText(searchQuery).toLowerCase();
  const isSearching = normalizedQuery.length > 0;
  const searchResults = useMemo(() => {
    if (!isSearching) return [] as NavItem[];
    return visible.filter((i) =>
      normalizeSearchText(i.label).toLowerCase().includes(normalizedQuery),
    );
  }, [isSearching, normalizedQuery, visible]);
  // KBD-NAV — reset highlight when query or results change.
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery, searchResults.length]);
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
    refetchInterval: 120_000,
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
  const pricingAlertVariant: "alert" | "warning" | null = !canSeePricingQueue
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
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        qc.invalidateQueries({ queryKey: ["pending-users-count"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [isAdmin, qc]);

  const isItemActive = (to: string) =>
    location.pathname === to || location.pathname.startsWith(to + "/");

  const renderItem = (item: NavItem, index?: number) => {
    const active = isItemActive(item.to);
    const isHighlighted =
      isSearching && typeof index === "number" && index === highlightedIndex;
    const showBadge = item.to === "/users" && isAdmin && (pendingCount ?? 0) > 0;
    const showPricingBadge =
      item.to === "/pricing/recompute-prices" && pricingAlertVariant !== null;
    return (
      <Link
        key={item.to}
        to={item.to}
        aria-current={active ? "page" : undefined}
        onMouseEnter={
          isSearching && typeof index === "number"
            ? () => setHighlightedIndex(index)
            : undefined
        }
        className={`group relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors
          ${
            active
              ? "bg-sidebar-accent/70 font-semibold text-sidebar-primary shadow-sm"
              : "text-sidebar-foreground/85 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
          } ${isHighlighted ? "ring-1 ring-sidebar-primary/60 bg-sidebar-accent/50" : ""}`}
      >
        {active && (
          <span className="absolute inset-y-1.5 right-0 w-[3px] rounded-l-full bg-sidebar-primary" />
        )}
        <item.icon
          className={`h-4 w-4 ${active ? "text-sidebar-primary" : "text-sidebar-foreground/65"}`}
        />
        <span className="truncate">{item.label}</span>
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
    );
  };

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();
  const roleLabel = roles.map((r) => ROLE_LABELS[r]).join("، ") || "بدون نقش";
  const activeModuleMeta = PRIMARY_MODULES.find((m) => m.key === activeModule);
  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <TooltipProvider delayDuration={120}>
      <Sidebar side="right" collapsible="icon" className="border-l-0">
        <SidebarHeader className="border-b border-sidebar-border p-0">
          <div className="flex items-center gap-2 px-3 py-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <Sparkles className="h-[18px] w-[18px]" />
            </div>
            <div className="flex flex-col overflow-hidden group-data-[collapsible=icon]:hidden">
              <span className="truncate text-[13px] font-bold leading-tight text-sidebar-foreground">
                افراکالا
              </span>
              <span className="truncate text-[10.5px] text-sidebar-foreground/65">
                دستیار هوشمند کسب‌وکار
              </span>
            </div>
          </div>
          {/* Global search */}
          <div className="border-t border-sidebar-border/60 px-2 py-2 group-data-[collapsible=icon]:hidden">
            <div className="relative">
              <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sidebar-foreground/50" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (!isSearching) {
                    if (e.key === "Escape") setSearchQuery("");
                    return;
                  }
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setHighlightedIndex((i) =>
                      searchResults.length === 0
                        ? 0
                        : Math.min(i + 1, searchResults.length - 1),
                    );
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHighlightedIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const target = searchResults[highlightedIndex];
                    if (target) {
                      navigate({ to: target.to });
                      setSearchQuery("");
                    }
                  } else if (e.key === "Escape") {
                    setSearchQuery("");
                  }
                }}
                placeholder="جستجوی سریع..."
                aria-label="جستجوی سریع"
                className="h-8 w-full rounded-md border border-sidebar-border/60 bg-sidebar-accent/25 pr-8 pl-12 text-xs text-sidebar-foreground placeholder:text-sidebar-foreground/50 outline-none focus:border-sidebar-primary/50 focus:bg-sidebar-accent/40"
              />
              <kbd className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded border border-sidebar-border/60 bg-sidebar-accent/40 px-1.5 py-0.5 font-mono text-[9px] text-sidebar-foreground/60">
                Ctrl K
              </kbd>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="flex flex-row gap-0 overflow-hidden p-0">
          {/* RAIL — 7 primary module icons */}
          <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-l border-sidebar-border/60 bg-sidebar/40 py-2 group-data-[collapsible=icon]:border-l-0">
            {PRIMARY_MODULES.map((m) => {
              const count = moduleCounts[m.key] ?? 0;
              const isActive = activeModule === m.key;
              const disabled = count === 0;
              return (
                <Tooltip key={m.key}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={m.label}
                      aria-current={isActive ? "page" : undefined}
                      disabled={disabled}
                      onClick={() => {
                        setActiveModule(m.key);
                        if (m.defaultTo && visible.some((i) => i.to === m.defaultTo)) {
                          navigate({ to: m.defaultTo });
                        }
                      }}
                      className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-all
                      ${disabled ? "cursor-not-allowed opacity-30" : "hover:bg-sidebar-accent/50"}
                      ${
                        isActive
                          ? "bg-sidebar-accent text-sidebar-primary shadow-sm ring-1 ring-sidebar-primary/30"
                          : "text-sidebar-foreground/70"
                      }`}
                    >
                      {isActive && (
                        <span className="absolute inset-y-2 right-0 w-[3px] rounded-l-full bg-sidebar-primary" />
                      )}
                      <m.icon className="h-[18px] w-[18px]" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="left" sideOffset={6} className="text-xs">
                    {m.label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {/* SUBMENU PANEL — only the active module's items, or search results */}
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto py-2 pl-2 group-data-[collapsible=icon]:hidden">
            {isSearching ? (
              <>
                <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/55">
                  نتایج جستجو
                </div>
                <div className="flex flex-col gap-0.5">
                  {searchResults.length > 0 ? (
                    searchResults.map((it, idx) => renderItem(it, idx))
                  ) : (
                    <div className="px-3 py-4 text-center text-xs text-sidebar-foreground/60">
                      موردی یافت نشد
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/55">
                  {activeModuleMeta && (
                    <>
                      <activeModuleMeta.icon className="h-3.5 w-3.5" />
                      <span>{activeModuleMeta.label}</span>
                    </>
                  )}
                </div>
                <div className="flex flex-col gap-0.5">
                  {submenuItems.length > 0 ? (
                    submenuItems.map(renderItem)
                  ) : (
                    <div className="px-3 py-4 text-center text-xs text-sidebar-foreground/60">
                      موردی برای نمایش وجود ندارد
                    </div>
                  )}
                </div>

                {/* Quick access at the bottom of dashboard module only */}
                {activeModule === "dashboard" && quickAccess.length > 0 && (
                  <>
                    <div className="mt-4 px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-primary/80">
                      دسترسی سریع
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      {quickAccess.map((item) => {
                        const active = isItemActive(item.to);
                        return (
                          <Link
                            key={`qa-${item.to}`}
                            to={item.to}
                            className={`flex h-8 items-center gap-1.5 truncate rounded-md border px-2 text-[11px] transition-colors ${
                              active
                                ? "border-sidebar-primary/40 bg-sidebar-accent/70 text-sidebar-primary"
                                : "border-sidebar-border/50 bg-sidebar-accent/20 text-sidebar-foreground/80 hover:bg-sidebar-accent/50"
                            }`}
                          >
                            <item.icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-2">
          <div className="flex flex-col gap-1 group-data-[collapsible=icon]:hidden">
            <div className="flex items-center gap-1">
              <Link
                to="/notifications"
                className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
              >
                <Bell className="h-3.5 w-3.5" />
                <span>اعلان‌ها</span>
              </Link>
              <Link
                to="/knowledge"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent/40 hover:text-sidebar-foreground"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                <span>راهنما</span>
              </Link>
            </div>
            <div className="mt-1 flex items-center gap-2 rounded-md border border-sidebar-border/60 bg-sidebar-accent/20 px-2 py-1.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20 text-[10px] font-bold text-sidebar-primary">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-semibold text-sidebar-foreground">
                  {user?.email ?? "کاربر"}
                </div>
                <div className="truncate text-[10px] text-sidebar-foreground/60">{roleLabel}</div>
              </div>
              <button
                type="button"
                aria-label="خروج"
                onClick={handleSignOut}
                className="rounded-md p-1 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent/50 hover:text-destructive"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="hidden flex-col items-center gap-1 group-data-[collapsible=icon]:flex">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to="/notifications"
                  aria-label="اعلان‌ها"
                  className="flex h-9 w-9 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/40"
                >
                  <Bell className="h-4 w-4" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                اعلان‌ها
              </TooltipContent>
            </Tooltip>
          </div>
        </SidebarFooter>
      </Sidebar>
    </TooltipProvider>
  );
}
