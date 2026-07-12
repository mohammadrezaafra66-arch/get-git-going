import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ClipboardList, Eye } from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import { formatJalaliDateTime } from "@/lib/messenger/format";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { JalaliDateInput } from "@/shared/components/JalaliDateInput";

export const Route = createFileRoute("/_app/admin/audit")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: AuditPage,
});

const PAGE_SIZE = 50;

const ENTITY_TYPES: { value: string; label: string }[] = [
  { value: "all", label: "همه" },
  { value: "penalty", label: "جریمه" },
  { value: "document", label: "سند" },
  { value: "messenger_group", label: "گروه پیام‌رسان" },
  { value: "workflow_setting", label: "تنظیمات گردش‌کار" },
  { value: "delivery_receipt", label: "رسید تحویل" },
  { value: "purchase_request", label: "درخواست خرید" },
  { value: "gamification_kpi", label: "KPI گیمیفیکیشن" },
];

interface AuditRow {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  actor_id: string | null;
  diff: unknown;
  created_at: string;
}

interface AuditRowWithActor extends AuditRow {
  actor_name: string | null;
}

function actionVariant(action: string): {
  variant: "default" | "secondary" | "destructive" | "outline";
  className?: string;
} {
  const a = action.toLowerCase();
  if (a === "created") return { variant: "default", className: "bg-emerald-600 hover:bg-emerald-600" };
  if (a === "updated" || a === "status_changed")
    return { variant: "default", className: "bg-sky-600 hover:bg-sky-600" };
  if (a === "deactivated" || a === "rejected") return { variant: "destructive" };
  if (a === "accepted" || a === "confirmed")
    return { variant: "default", className: "bg-emerald-800 hover:bg-emerald-800" };
  return { variant: "secondary" };
}

function AuditPage() {
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState<string>("all");
  const [fromIso, setFromIso] = useState<string>("");
  const [toIso, setToIso] = useState<string>("");
  const [page, setPage] = useState(0);

  const debouncedSearch = useDebounce(search.trim(), 300);

  const queryKey = useMemo(
    () => ["admin-audit-logs", entityType, fromIso, toIso, page] as const,
    [entityType, fromIso, toIso, page],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: async (): Promise<AuditRowWithActor[]> => {
      let q = supabase
        .from("audit_logs")
        .select("id, entity_type, entity_id, action, actor_id, diff, created_at")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (entityType !== "all") q = q.eq("entity_type", entityType);
      if (fromIso) q = q.gte("created_at", `${fromIso}T00:00:00`);
      if (toIso) q = q.lte("created_at", `${toIso}T23:59:59`);

      const { data: logs, error } = await q;
      if (error) throw error;
      const rows = (logs ?? []) as AuditRow[];

      const actorIds = Array.from(
        new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x)),
      );
      let profilesMap = new Map<string, string>();
      if (actorIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", actorIds);
        profilesMap = new Map(
          (profs ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? ""]),
        );
      }

      return rows.map((r) => ({
        ...r,
        actor_name: r.actor_id ? (profilesMap.get(r.actor_id) ?? null) : null,
      }));
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const filtered = useMemo<AuditRowWithActor[]>(() => {
    const rows = data ?? [];
    if (!debouncedSearch) return rows;
    const term = debouncedSearch.toLowerCase();
    return rows.filter((r) => (r.actor_name ?? "").toLowerCase().includes(term));
  }, [data, debouncedSearch]);

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="لاگ فعالیت‌های سیستم"
        description="نمایش رویدادهای ثبت‌شده در audit_logs با امکان فیلتر"
      />

      {/* Filters */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-3 md:grid-cols-4">
          <Input
            placeholder="جست‌وجو نام کاربر…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
          <Select
            value={entityType}
            onValueChange={(v) => {
              setEntityType(v);
              setPage(0);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="نوع رویداد" />
            </SelectTrigger>
            <SelectContent>
              {ENTITY_TYPES.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <JalaliDateInput
            value={fromIso || null}
            onChange={(iso) => {
              setFromIso(iso);
              setPage(0);
            }}
            placeholder="از تاریخ"
          />
          <JalaliDateInput
            value={toIso || null}
            onChange={(iso) => {
              setToIso(iso);
              setPage(0);
            }}
            placeholder="تا تاریخ"
          />
        </CardContent>
      </Card>

      {isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            در حال بارگذاری…
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            رویدادی یافت نشد.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">زمان</th>
                      <th className="p-3 font-medium">کاربر</th>
                      <th className="p-3 font-medium">رویداد</th>
                      <th className="p-3 font-medium">موجودیت</th>
                      <th className="p-3 font-medium">جزئیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => {
                      const av = actionVariant(r.action);
                      return (
                        <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-3 text-xs text-muted-foreground">
                            {formatJalaliDateTime(r.created_at)}
                          </td>
                          <td className="p-3">{r.actor_name ?? "—"}</td>
                          <td className="p-3">
                            <Badge variant={av.variant} className={av.className}>
                              {r.action}
                            </Badge>
                          </td>
                          <td className="p-3 text-xs">
                            <div className="font-medium text-foreground">{r.entity_type}</div>
                            <div className="text-muted-foreground" dir="ltr">
                              {r.entity_id}
                            </div>
                          </td>
                          <td className="p-3">
                            <DiffPopover diff={r.diff} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Mobile */}
          <div className="space-y-2 md:hidden">
            {filtered.map((r) => {
              const av = actionVariant(r.action);
              return (
                <Card key={r.id}>
                  <CardContent className="space-y-2 p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">
                        {formatJalaliDateTime(r.created_at)}
                      </span>
                      <Badge variant={av.variant} className={av.className}>
                        {r.action}
                      </Badge>
                    </div>
                    <div>کاربر: {r.actor_name ?? "—"}</div>
                    <div>
                      موجودیت: <span className="font-medium">{r.entity_type}</span>{" "}
                      <span className="text-muted-foreground" dir="ltr">
                        {r.entity_id}
                      </span>
                    </div>
                    <DiffPopover diff={r.diff} />
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm">
            <div className="text-muted-foreground">
              صفحه {(page + 1).toLocaleString("fa-IR")}
              {isFetching && <span className="ms-2 text-xs">در حال به‌روزرسانی…</span>}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronRight className="h-4 w-4" />
                قبلی
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={(data?.length ?? 0) < PAGE_SIZE}
                onClick={() => setPage((p) => p + 1)}
              >
                بعدی
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <ClipboardList className="h-3.5 w-3.5" />
        فقط رویدادهای ثبت‌شده در جدول audit_logs نمایش داده می‌شود.
      </p>
    </div>
  );
}

function DiffPopover({ diff }: { diff: unknown }) {
  if (diff == null) return <span className="text-xs text-muted-foreground">—</span>;
  let text: string;
  try {
    text = JSON.stringify(diff, null, 2);
  } catch {
    text = String(diff);
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
          <Eye className="h-3.5 w-3.5" />
          مشاهده
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 max-w-[90vw]" dir="ltr">
        <pre className="max-h-40 overflow-auto text-xs">{text}</pre>
      </PopoverContent>
    </Popover>
  );
}
