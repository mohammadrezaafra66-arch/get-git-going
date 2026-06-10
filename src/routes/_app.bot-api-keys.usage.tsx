import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { requirePermission } from "@/lib/rbac/route-guards";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useDebounce } from "@/hooks/use-debounce";
import { formatDateTimeFa } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/bot-api-keys/usage")({
  beforeLoad: async () => {
    await requirePermission("bot-api-keys", "view");
  },
  component: BotApiUsagePage,
});

const PAGE_SIZE = 50;

interface KeyOpt {
  id: string;
  name: string;
  key_prefix: string | null;
}
interface TableOpt {
  id: string;
  name: string;
}

interface UsageLog {
  id: number;
  api_key_id: string | null;
  table_id: string | null;
  endpoint: string;
  method: string;
  status_code: number;
  error_code: string | null;
  ip: string | null;
  request_size: number | null;
  response_count: number | null;
  created_at: string;
}

function BotApiUsagePage() {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const [keyId, setKeyId] = useState<string>("__all");
  const [tableId, setTableId] = useState<string>("__all");
  const [method, setMethod] = useState<string>("__all");
  const [statusFilter, setStatusFilter] = useState<string>("__all"); // all | success | client_error | server_error
  const [errorCode, setErrorCode] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const debErr = useDebounce(errorCode.trim(), 350);

  const keysQuery = useQuery({
    enabled: !!user,
    queryKey: ["bot-keys-options"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bot_api_keys")
        .select("id, name, key_prefix")
        .order("name");
      if (error) throw error;
      return (data ?? []) as KeyOpt[];
    },
  });

  const tablesQuery = useQuery({
    enabled: !!user,
    queryKey: ["bot-usage-tables"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dynamic_tables")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as TableOpt[];
    },
  });

  const keyMap = useMemo(() => {
    const m = new Map<string, KeyOpt>();
    (keysQuery.data ?? []).forEach((k) => m.set(k.id, k));
    return m;
  }, [keysQuery.data]);

  const tableMap = useMemo(() => {
    const m = new Map<string, TableOpt>();
    (tablesQuery.data ?? []).forEach((t) => m.set(t.id, t));
    return m;
  }, [tablesQuery.data]);

  const logsQuery = useQuery({
    enabled: !!user,
    queryKey: ["bot-usage-logs", { page, keyId, tableId, method, statusFilter, debErr, from, to }],
    staleTime: 5_000,
    queryFn: async () => {
      let q = supabase
        .from("bot_api_usage_logs")
        .select(
          "id, api_key_id, table_id, endpoint, method, status_code, error_code, ip, request_size, response_count, created_at",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (keyId !== "__all") q = q.eq("api_key_id", keyId);
      if (tableId !== "__all") q = q.eq("table_id", tableId);
      if (method !== "__all") q = q.eq("method", method);
      if (statusFilter === "success") q = q.lt("status_code", 400);
      else if (statusFilter === "client_error")
        q = q.gte("status_code", 400).lt("status_code", 500);
      else if (statusFilter === "server_error") q = q.gte("status_code", 500);
      if (debErr) q = q.eq("error_code", debErr);
      if (from) q = q.gte("created_at", new Date(from).toISOString());
      if (to) q = q.lte("created_at", new Date(to).toISOString());

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as UsageLog[], total: count ?? 0 };
    },
  });

  const suspiciousQuery = useQuery({
    enabled: !!user,
    queryKey: ["bot-suspicious-ips"],
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bot_suspicious_ips", { p_limit: 10 });
      if (error) throw error;
      return (data ?? []) as Array<{
        ip: string;
        failed_count: number;
        last_attempt_at: string;
        distinct_endpoints: number;
      }>;
    },
  });

  const errorKeysQuery = useQuery({
    enabled: !!user,
    queryKey: ["bot-error-keys-today"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("bot_key_stats_today");
      if (error) throw error;
      return (
        (data ?? []) as Array<{ api_key_id: string; requests_today: number; errors_today: number }>
      )
        .filter((r) => Number(r.errors_today) > 0)
        .sort((a, b) => Number(b.errors_today) - Number(a.errors_today))
        .slice(0, 10);
    },
  });

  const total = logsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetPage = () => setPage(0);

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Bot API Usage</h1>
      <PageHeader
        title="گزارش استفاده ربات‌ها"
        description="مشاهده و فیلتر درخواست‌های API ربات‌ها، خطاها و IPهای مشکوک"
        actions={
          <Button asChild variant="outline">
            <Link to="/bot-api-keys">
              <ArrowLeft className="ml-2 h-4 w-4" />
              بازگشت به کلیدها
            </Link>
          </Button>
        }
      />

      <div className="rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground leading-6">
        در این صفحه تمام درخواست‌های Bot API ثبت می‌شود؛ شامل درخواست‌های موفق، خطاها، کد خطا، کلید
        مصرف‌کننده، جدول هدف و IP درخواست‌دهنده. می‌توانید با فیلترها به‌سرعت درخواست‌های مشکوک یا
        پرتکرار را پیدا کنید.
      </div>

      {/* Suspicious IPs and error keys */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              IPهای مشکوک (۲۴ ساعت اخیر)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {suspiciousQuery.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (suspiciousQuery.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">موردی یافت نشد.</p>
            ) : (
              (suspiciousQuery.data ?? []).map((r) => (
                <div key={r.ip} className="flex items-center justify-between text-sm">
                  <span className="font-mono" dir="ltr">
                    {r.ip}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="destructive">{r.failed_count} خطا</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTimeFa(r.last_attempt_at)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              کلیدهای پرخطا (امروز)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {errorKeysQuery.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (errorKeysQuery.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">موردی یافت نشد.</p>
            ) : (
              (errorKeysQuery.data ?? []).map((r) => {
                const k = keyMap.get(r.api_key_id);
                return (
                  <div key={r.api_key_id} className="flex items-center justify-between text-sm">
                    <span className="truncate">{k?.name ?? r.api_key_id.slice(0, 8)}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">خطا: {Number(r.errors_today)}</Badge>
                      <Badge variant="outline">کل: {Number(r.requests_today)}</Badge>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">کلید</Label>
              <Select
                value={keyId}
                onValueChange={(v) => {
                  setKeyId(v);
                  resetPage();
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">همه کلیدها</SelectItem>
                  {(keysQuery.data ?? []).map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      {k.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">جدول</Label>
              <Select
                value={tableId}
                onValueChange={(v) => {
                  setTableId(v);
                  resetPage();
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">همه جداول</SelectItem>
                  {(tablesQuery.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">متد</Label>
              <Select
                value={method}
                onValueChange={(v) => {
                  setMethod(v);
                  resetPage();
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">همه</SelectItem>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">وضعیت</Label>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  resetPage();
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">همه</SelectItem>
                  <SelectItem value="success">موفق (۲xx/۳xx)</SelectItem>
                  <SelectItem value="client_error">خطای سمت کلاینت (۴xx)</SelectItem>
                  <SelectItem value="server_error">خطای سرور (۵xx)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">کد خطا</Label>
              <Input
                placeholder="مثلاً invalid_key"
                value={errorCode}
                onChange={(e) => {
                  setErrorCode(e.target.value);
                  resetPage();
                }}
                dir="ltr"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">از تاریخ</Label>
              <Input
                type="datetime-local"
                dir="ltr"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  resetPage();
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">تا تاریخ</Label>
              <Input
                type="datetime-local"
                dir="ltr"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  resetPage();
                }}
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setKeyId("__all");
                  setTableId("__all");
                  setMethod("__all");
                  setStatusFilter("__all");
                  setErrorCode("");
                  setFrom("");
                  setTo("");
                  resetPage();
                }}
              >
                پاک کردن فیلترها
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs table */}
      <Card>
        <CardContent className="p-0">
          {logsQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (logsQuery.data?.rows ?? []).length === 0 ? (
            <div className="py-10">
              <EmptyState
                icon={Activity}
                title="گزارشی یافت نشد"
                description="با تغییر فیلترها مجدداً جستجو کنید."
              />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {(logsQuery.data?.rows ?? []).map((r) => {
                const isErr = r.status_code >= 400;
                const k = r.api_key_id ? keyMap.get(r.api_key_id) : null;
                const t = r.table_id ? tableMap.get(r.table_id) : null;
                return (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    <Badge variant={isErr ? "destructive" : "secondary"}>{r.status_code}</Badge>
                    <Badge variant="outline">{r.method}</Badge>
                    <span
                      className="font-mono text-xs truncate max-w-[280px]"
                      dir="ltr"
                      title={r.endpoint}
                    >
                      {r.endpoint}
                    </span>
                    {r.error_code && (
                      <Badge variant="destructive" className="font-mono text-[10px]" dir="ltr">
                        {r.error_code}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      کلید: {k?.name ?? (r.api_key_id ? "—" : "بدون کلید")}
                    </span>
                    {t && <span className="text-xs text-muted-foreground">جدول: {t.name}</span>}
                    {r.ip && (
                      <span className="text-xs font-mono text-muted-foreground" dir="ltr">
                        {r.ip}
                      </span>
                    )}
                    <span className="ms-auto text-xs text-muted-foreground">
                      {formatDateTimeFa(r.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-border p-3">
            <span className="text-xs text-muted-foreground">
              مجموع: {total.toLocaleString("fa-IR")} — صفحه {(page + 1).toLocaleString("fa-IR")} از{" "}
              {totalPages.toLocaleString("fa-IR")}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
