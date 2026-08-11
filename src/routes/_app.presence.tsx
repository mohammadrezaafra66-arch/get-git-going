import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Clock } from "lucide-react";

export const Route = createFileRoute("/_app/presence")({
  component: PresencePage,
});

interface PresenceRow {
  id: string;
  user_id: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  date: string;
  total_minutes: number | null;
  notes: string | null;
}

const PAGE_SIZE = 50;

function toIsoStart(d: string) {
  return new Date(`${d}T00:00:00`).toISOString();
}
function toIsoEnd(d: string) {
  return new Date(`${d}T23:59:59.999`).toISOString();
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoIso(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function formatMinutes(min: number | null) {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString("fa-IR");
}

function PresencePage() {
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("manager");

  const [from, setFrom] = useState(daysAgoIso(30));
  const [to, setTo] = useState(todayIso());
  const [userFilter, setUserFilter] = useState<string>("__me__");
  const [page, setPage] = useState(0);

  // Admin: load users list for filter
  const usersQuery = useQuery({
    enabled: isAdmin,
    queryKey: ["presence-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .order("full_name", { ascending: true })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const effectiveUserId = useMemo(() => {
    if (!isAdmin) return user?.id ?? null;
    if (userFilter === "__all__") return null;
    if (userFilter === "__me__") return user?.id ?? null;
    return userFilter;
  }, [isAdmin, userFilter, user?.id]);

  const logsQuery = useQuery({
    enabled: !!user,
    queryKey: ["presence-logs", from, to, effectiveUserId, page],
    queryFn: async () => {
      let q = supabase
        .from("presence_logs")
        .select("id, user_id, clock_in_at, clock_out_at, date, total_minutes, notes", {
          count: "exact",
        })
        .gte("clock_in_at", toIsoStart(from))
        .lte("clock_in_at", toIsoEnd(to))
        .order("clock_in_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (effectiveUserId) q = q.eq("user_id", effectiveUserId);
      const { data, error, count } = await q;
      if (error) throw error;
      const rows = (data ?? []) as PresenceRow[];

      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      const names = new Map<string, string>();
      if (ids.length && isAdmin) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        for (const p of profiles ?? [])
          names.set(p.id, p.full_name ?? p.id.slice(0, 8));
      }
      const totalMinutes = rows.reduce(
        (sum, r) => sum + (r.total_minutes ?? 0),
        0,
      );
      return { rows, names, count: count ?? 0, totalMinutes };
    },
  });

  const rows = logsQuery.data?.rows ?? [];
  const totalPages = Math.max(
    1,
    Math.ceil((logsQuery.data?.count ?? 0) / PAGE_SIZE),
  );

  return (
    <div dir="rtl" className="space-y-6">
      <PageHeader
        title="گزارش حضور و غیاب"
        description="مشاهده لاگ ورود و خروج کاربران"
      />

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label>از تاریخ</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>تا تاریخ</Label>
              <Input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            {isAdmin && (
              <div className="space-y-1 sm:col-span-2 lg:col-span-2">
                <Label>کاربر</Label>
                <Select
                  value={userFilter}
                  onValueChange={(v) => {
                    setUserFilter(v);
                    setPage(0);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__me__">فقط من</SelectItem>
                    <SelectItem value="__all__">همه کاربران</SelectItem>
                    {(usersQuery.data ?? []).map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name ?? u.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {logsQuery.isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              در حال بارگذاری...
            </div>
          ) : logsQuery.error ? (
            <div className="py-10 text-center text-sm text-destructive">
              خطا در بارگذاری اطلاعات
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <Clock className="h-6 w-6 opacity-60" />
              رکوردی در این بازه یافت نشد
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right">تاریخ</th>
                    {isAdmin && <th className="p-3 text-right">کاربر</th>}
                    <th className="p-3 text-right">ورود</th>
                    <th className="p-3 text-right">خروج</th>
                    <th className="p-3 text-right">مدت</th>
                    <th className="p-3 text-right">یادداشت</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="p-3">{formatDate(r.date)}</td>
                      {isAdmin && (
                        <td className="p-3">
                          {logsQuery.data?.names.get(r.user_id) ??
                            r.user_id.slice(0, 8)}
                        </td>
                      )}
                      <td className="p-3">{formatTime(r.clock_in_at)}</td>
                      <td className="p-3">{formatTime(r.clock_out_at)}</td>
                      <td className="p-3 font-mono">
                        {formatMinutes(r.total_minutes)}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {r.notes ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30">
                  <tr>
                    <td className="p-3 font-medium" colSpan={isAdmin ? 4 : 3}>
                      جمع کل ساعات (این صفحه)
                    </td>
                    <td className="p-3 font-mono font-medium">
                      {formatMinutes(logsQuery.data?.totalMinutes ?? 0)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            صفحه {page + 1} از {totalPages} — مجموع: {logsQuery.data?.count ?? 0}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              قبلی
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              بعدی
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}