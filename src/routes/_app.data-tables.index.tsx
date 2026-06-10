import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Database, Plus, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { requirePermission } from "@/lib/rbac/route-guards";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDateTimeFa, toFaDigits } from "@/lib/i18n/formatters";
import {
  DYNAMIC_TABLE_ACCESS_LEVEL_BADGE,
  DYNAMIC_TABLE_ACCESS_LEVEL_LABELS,
  type DynamicTableAccessLevel,
  SELECTABLE_ROLES,
} from "@/lib/data-tables/constants";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const Route = createFileRoute("/_app/data-tables/")({
  beforeLoad: async () => { await requirePermission("data-tables", "view"); },
  component: DataTablesHub,
});

function DataTablesHub() {
  const { user, roles } = useAuth();
  const canCreate = (roles ?? []).includes("admin") || (roles ?? []).includes("manager");
  const listQuery = useQuery({
    enabled: !!user,
    queryKey: ["dynamic-tables-hub", roles?.join(",") ?? ""],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dynamic_tables")
        .select("id, name, slug, description, is_active, created_at, access_level, allowed_roles")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const ids = (data ?? []).map((t) => t.id as string);
      let counts: Record<string, number> = {};
      if (ids.length) {
        const cr = await supabase
          .from("dynamic_table_columns")
          .select("table_id")
          .in("table_id", ids);
        if (cr.error) throw cr.error;
        for (const row of cr.data ?? []) {
          const k = row.table_id as string;
          counts[k] = (counts[k] ?? 0) + 1;
        }
      }
      return (data ?? []).map((t) => ({ ...t, columns_count: counts[t.id as string] ?? 0 }));
    },
  });

  const items = listQuery.data ?? [];

  return (
    <TooltipProvider><div className="space-y-6">
      <PageHeader
        title="جداول داده پویا"
        description="مدیریت جداول قابل تنظیم برای استفاده در ربات‌ها و کمپین‌ها"
        actions={
          canCreate ? (
            <Button asChild>
              <Link to="/data-tables/new"><Plus className="ml-2 h-4 w-4" />جدول جدید</Link>
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span><Button disabled><Plus className="ml-2 h-4 w-4" />جدول جدید</Button></span>
              </TooltipTrigger>
              <TooltipContent>شما دسترسی انجام این عملیات را ندارید</TooltipContent>
            </Tooltip>
          )
        }
      />

      {listQuery.isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Database}
          title={canCreate ? "هنوز جدولی ساخته نشده" : "بدون دسترسی"}
          description={canCreate
            ? "برای شروع یک جدول داده پویا بسازید."
            : "شما به هیچ جدول پویایی دسترسی ندارید."}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {items.map((t) => (
            <Card key={t.id as string} className="hover:border-primary/50 transition-colors">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground truncate">{t.name}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{t.slug}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={t.is_active ? "default" : "secondary"}>
                      {t.is_active ? "فعال" : "غیرفعال"}
                    </Badge>
                    {(() => {
                      const lvl = ((t as { access_level?: string }).access_level ?? "all") as DynamicTableAccessLevel;
                      const cls = DYNAMIC_TABLE_ACCESS_LEVEL_BADGE[lvl]?.className ?? "";
                      const allowed = (((t as { allowed_roles?: unknown }).allowed_roles ?? []) as string[]) || [];
                      return (
                        <>
                          <Badge variant="outline" className={cls}>
                            {DYNAMIC_TABLE_ACCESS_LEVEL_LABELS[lvl] ?? lvl}
                          </Badge>
                          {lvl === "custom" && allowed.length > 0 && (
                            <span className="text-[10px] text-muted-foreground text-left max-w-[160px] truncate" title={allowed.join("، ")}>
                              {allowed.map((r) => SELECTABLE_ROLES.find((x) => x.value === r)?.label ?? r).join("، ")}
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
                {t.description && <p className="text-sm text-muted-foreground line-clamp-2">{t.description}</p>}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{toFaDigits(String(t.columns_count))} ستون</span>
                  <span>{formatDateTimeFa(t.created_at as string)}</span>
                </div>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link to="/data-tables/$tableId" params={{ tableId: t.id as string }}>مشاهده و مدیریت</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div></TooltipProvider>
  );
}
