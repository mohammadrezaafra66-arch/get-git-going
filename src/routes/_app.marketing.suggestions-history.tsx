import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { PersianDatePicker } from "@/components/common/PersianDatePicker";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { formatDateFa } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/marketing/suggestions-history")({
  component: SuggestionsHistoryPage,
});

const PAGE_SIZE = 20;

type Channel = { id: string; name: string };

interface LogRow {
  id: number;
  actor_id: string | null;
  created_at: string;
  diff: {
    product_id?: string;
    product_name?: string;
    channel_id?: string;
    channel_name?: string;
    score?: number;
  } | null;
}

function SuggestionsHistoryPage() {
  const { roles } = useAuth();
  const allowed = roles.includes("admin") || roles.includes("manager");

  const [fromInput, setFromInput] = useState<string>("");
  const [toInput, setToInput] = useState<string>("");
  const [channelId, setChannelId] = useState<string>("__all__");
  const [page, setPage] = useState(0);

  const fromDate = useDebounce(fromInput, 400);
  const toDate = useDebounce(toInput, 400);

  const channelsQuery = useQuery({
    queryKey: ["marketing-channels", "active"],
    enabled: allowed,
    staleTime: 60_000,
    queryFn: async (): Promise<Channel[]> => {
      const { data, error } = await supabase
        .from("marketing_channels")
        .select("id,name")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Channel[];
    },
  });

  const filters = useMemo(
    () => ({ fromDate, toDate, channelId, page }),
    [fromDate, toDate, channelId, page],
  );

  const logsQuery = useQuery({
    queryKey: ["promotion-suggestion-history", filters],
    enabled: allowed,
    staleTime: 15_000,
    queryFn: async () => {
      let q = supabase
        .from("audit_logs")
        .select("id, actor_id, created_at, diff", { count: "exact" })
        .eq("action", "promotion_suggestion_used")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (fromDate) q = q.gte("created_at", new Date(fromDate).toISOString());
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        q = q.lte("created_at", end.toISOString());
      }
      if (channelId !== "__all__") {
        q = q.contains("diff", { channel_id: channelId });
      }

      const { data, error, count } = await q;
      if (error) throw error;
      const rows = (data ?? []) as LogRow[];

      const ids = Array.from(new Set(rows.map((r) => r.actor_id).filter(Boolean) as string[]));
      const names = new Map<string, string>();
      if (ids.length) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", ids);
        for (const p of profiles ?? []) names.set(p.id, p.full_name ?? p.id.slice(0, 8));
      }
      return { rows, count: count ?? 0, names };
    },
  });

  if (!allowed) return <Navigate to="/unauthorized" />;

  const data = logsQuery.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  return (
    <div dir="rtl" className="space-y-4">
      <PageHeader
        title="تاریخچه پیشنهادهای تبلیغاتی"
        description="رخدادهای ثبت‌شده هنگام علامت‌گذاری پیشنهادها به‌عنوان استفاده‌شده."
      />

      <div className="flex flex-col gap-3 rounded-md border bg-card p-4 md:flex-row md:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="from">از تاریخ</Label>
          <PersianDatePicker
            value={fromInput || null}
            onChange={(v) => {
              setPage(0);
              setFromInput(v ?? "");
            }}
            placeholder="از تاریخ"
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="to">تا تاریخ</Label>
          <PersianDatePicker
            value={toInput || null}
            onChange={(v) => {
              setPage(0);
              setToInput(v ?? "");
            }}
            placeholder="تا تاریخ"
          />
        </div>
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="channel">کانال</Label>
          <Select
            value={channelId}
            onValueChange={(v) => {
              setPage(0);
              setChannelId(v);
            }}
          >
            <SelectTrigger id="channel">
              <SelectValue placeholder="همه کانال‌ها" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">همه کانال‌ها</SelectItem>
              {(channelsQuery.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">تاریخ</TableHead>
              <TableHead className="text-right">محصول</TableHead>
              <TableHead className="text-right">کانال</TableHead>
              <TableHead className="text-right">امتیاز</TableHead>
              <TableHead className="text-right">کاربر</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logsQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : logsQuery.isError ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-destructive">
                  خطا در بارگذاری تاریخچه
                </TableCell>
              </TableRow>
            ) : !data || data.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  رخدادی یافت نشد.
                </TableCell>
              </TableRow>
            ) : (
              data.rows.map((r) => {
                const d = r.diff ?? {};
                const score = typeof d.score === "number" ? d.score : Number(d.score ?? 0);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDateFa(r.created_at)}
                    </TableCell>
                    <TableCell className="font-medium">{d.product_name ?? "—"}</TableCell>
                    <TableCell>{d.channel_name ?? "—"}</TableCell>
                    <TableCell className="font-bold">
                      {Number.isFinite(score)
                        ? score.toLocaleString("fa-IR", { maximumFractionDigits: 2 })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {r.actor_id ? (
                        (data.names.get(r.actor_id) ?? r.actor_id.slice(0, 8))
                      ) : (
                        <span className="text-muted-foreground">سیستم</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.count > PAGE_SIZE ? (
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            صفحه {(page + 1).toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")} —
            مجموع {data.count.toLocaleString("fa-IR")}
          </div>
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
      ) : null}
    </div>
  );
}
