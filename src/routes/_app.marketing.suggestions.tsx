import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { markPromotionSuggestionUsed } from "@/lib/marketing/promotion-suggestions.functions";
import { PageHeader } from "@/components/common/PageHeader";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";

export const Route = createFileRoute("/_app/marketing/suggestions")({
  component: PromotionSuggestionsPage,
});

type Suggestion = {
  product_id: string;
  product_name: string;
  sku: string | null;
  stock_status: string | null;
  channel_id: string;
  channel_name: string;
  label_weight_sum: number;
  channel_weight: number;
  stock_factor: number;
  recency_factor: number;
  score: number;
  qty_90d: number;
  daily_quota: number | null;
  used_today: number;
  remaining_today: number | null;
  // DB-D two-lane columns (present when the DB-D migration is applied)
  market_score?: number | null;
  sales_nomination_boost?: number | null;
  final_score?: number | null;
  nomination_count?: number | null;
  last_nominated_at?: string | null;
};

type Channel = { id: string; name: string };

const STOCK_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  available: { label: "موجود", variant: "default" },
  limited: { label: "محدود", variant: "secondary" },
  unknown: { label: "نامشخص", variant: "outline" },
  unavailable: { label: "ناموجود", variant: "destructive" },
};

function fmt(n: number, digits = 2) {
  const v = Number(n ?? 0);
  return v.toLocaleString("fa-IR", { maximumFractionDigits: digits });
}

function PromotionSuggestionsPage() {
  const { user, roles, initialized, loading, profile, profileLoading, rolesLoading, authError } =
    useAuth();
  const markUsedFn = useServerFn(markPromotionSuggestionUsed);
  const authPending =
    !initialized || loading || profileLoading || rolesLoading || (!!user && !profile && !authError);
  const authReady = initialized && !loading && !profileLoading && !rolesLoading && !!user;
  const allowed =
    roles.includes("admin") || roles.includes("manager") || roles.includes("accountant");
  const canQuery = authReady && allowed;
  const queryClient = useQueryClient();

  const [channelId, setChannelId] = useState<string>("__all__");
  const [minScoreInput, setMinScoreInput] = useState<string>("0");
  const debouncedMinScore = useDebounce(minScoreInput, 400);
  const [usedKeys, setUsedKeys] = useState<Record<string, boolean>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const channelsQuery = useQuery({
    queryKey: ["marketing-channels", "active"],
    enabled: canQuery,
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

  const minScore = useMemo(() => {
    const n = Number(debouncedMinScore);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [debouncedMinScore]);

  const suggestionsQuery = useQuery({
    queryKey: ["promotion-suggestions", channelId, minScore],
    enabled: canQuery,
    staleTime: 30_000,
    queryFn: async (): Promise<Suggestion[]> => {
      const args: { _channel_id?: string; _min_score?: number; _limit?: number } = {
        _min_score: minScore,
        _limit: 200,
      };
      if (channelId !== "__all__") args._channel_id = channelId;
      // (supabase as any): the two-lane columns are not in generated types yet.
      const { data, error } = await (supabase as any).rpc("compute_promotion_scores", args);
      if (error) throw error;
      return (data ?? []) as Suggestion[];
    },
  });

  useEffect(() => {
    setUsedKeys({});
  }, [channelId, minScore]);

  if (authPending) {
    return (
      <div
        dir="rtl"
        className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground"
      >
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          در حال آماده‌سازی دسترسی‌ها...
        </span>
      </div>
    );
  }

  if (!allowed) return <Navigate to="/unauthorized" />;

  const markAsUsed = async (s: Suggestion) => {
    const key = `${s.product_id}:${s.channel_id}`;
    if (!user?.id) {
      toast.error("ابتدا وارد شوید");
      return;
    }
    setBusyKey(key);
    try {
      const result = await markUsedFn({
        data: {
          product_id: s.product_id,
          channel_id: s.channel_id,
          score: Number(s.score),
          label_weight_sum: Number(s.label_weight_sum),
          channel_weight: Number(s.channel_weight),
          stock_factor: Number(s.stock_factor),
          recency_factor: Number(s.recency_factor),
          qty_90d: Number(s.qty_90d),
        },
      });
      if (!result.ok) {
        if (result.reason === "quota_exhausted") {
          toast.error("سهمیه روزانه این کانال تمام شده است");
        } else {
          toast.error("خطا در ثبت");
        }
        return;
      }
      setUsedKeys((m) => ({ ...m, [key]: true }));
      toast.success("به‌عنوان استفاده‌شده ثبت شد");
      void queryClient.invalidateQueries({ queryKey: ["promotion-suggestions"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ثبت");
    } finally {
      setBusyKey(null);
    }
  };

  const rows = suggestionsQuery.data ?? [];

  return (
    <div dir="rtl" className="space-y-4">
      <PageHeader
        title="پیشنهادهای تبلیغاتی"
        description="پیشنهاد محصولات برای تبلیغ در هر کانال بر اساس وزن برچسب‌ها، وزن کانال، موجودی و فروش اخیر."
      />

      <div className="flex flex-col gap-3 rounded-md border bg-card p-4 md:flex-row md:items-end">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="channel">کانال تبلیغاتی</Label>
          <Select value={channelId} onValueChange={setChannelId}>
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
        <div className="w-full space-y-1.5 md:w-56">
          <Label htmlFor="min-score">حداقل امتیاز</Label>
          <Input
            id="min-score"
            type="number"
            min={0}
            step="0.01"
            value={minScoreInput}
            onChange={(e) => setMinScoreInput(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="text-sm text-muted-foreground md:pb-2">
          {suggestionsQuery.isFetching ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> در حال بارگذاری…
            </span>
          ) : (
            <span>{fmt(rows.length, 0)} پیشنهاد</span>
          )}
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">محصول</TableHead>
              <TableHead className="text-right">کانال</TableHead>
              <TableHead className="text-right">وزن برچسب‌ها</TableHead>
              <TableHead className="text-right">وزن کانال</TableHead>
              <TableHead className="text-right">موجودی</TableHead>
              <TableHead className="text-right">فروش ۹۰ روز</TableHead>
              <TableHead className="text-right">امتیاز بازار</TableHead>
              <TableHead className="text-right">بوست فروش</TableHead>
              <TableHead className="text-right">امتیاز نهایی</TableHead>
              <TableHead className="text-right">سهمیه امروز</TableHead>
              <TableHead className="text-right">عمل</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suggestionsQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : suggestionsQuery.isError ? (
              <TableRow>
                <TableCell colSpan={11} className="py-10 text-center text-destructive">
                  خطا در بارگذاری پیشنهادها
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-10 text-center text-muted-foreground">
                  پیشنهادی یافت نشد. مطمئن شوید برچسب‌ها وزن‌دار و کانال‌ها فعال هستند.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((s) => {
                const key = `${s.product_id}:${s.channel_id}`;
                const used = !!usedKeys[key];
                const stock =
                  STOCK_BADGE[String(s.stock_status ?? "unknown")] ?? STOCK_BADGE.unknown;
                const unlimited = s.daily_quota === null || Number(s.daily_quota) === 0;
                const remaining = unlimited ? null : Number(s.remaining_today ?? 0);
                const exhausted = !unlimited && remaining !== null && remaining <= 0;
                return (
                  <TableRow key={key}>
                    <TableCell>
                      <div className="font-medium">{s.product_name}</div>
                      {s.sku ? <div className="text-xs text-muted-foreground">{s.sku}</div> : null}
                    </TableCell>
                    <TableCell>{s.channel_name}</TableCell>
                    <TableCell>{fmt(s.label_weight_sum, 0)}</TableCell>
                    <TableCell>{fmt(s.channel_weight, 0)}</TableCell>
                    <TableCell>
                      <Badge variant={stock.variant}>{stock.label}</Badge>
                    </TableCell>
                    <TableCell>{fmt(s.qty_90d, 0)}</TableCell>
                    <TableCell>{fmt(Number(s.market_score ?? s.score), 2)}</TableCell>
                    <TableCell>
                      {(() => {
                        const boost = Number(s.sales_nomination_boost ?? 0);
                        const count = Number(s.nomination_count ?? 0);
                        if (boost <= 0 && count <= 0) {
                          return <span className="text-muted-foreground">—</span>;
                        }
                        const tip =
                          `${fmt(count, 0)} نامزدی` +
                          (s.last_nominated_at
                            ? ` — آخرین: ${new Date(s.last_nominated_at).toLocaleString("fa-IR")}`
                            : "");
                        return (
                          <Badge variant="secondary" title={tip}>
                            +{fmt(boost, 2)}
                            {count > 0 ? ` (${fmt(count, 0)})` : ""}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="font-bold">
                      {fmt(Number(s.final_score ?? s.score), 2)}
                    </TableCell>
                    <TableCell>
                      {unlimited ? (
                        <Badge variant="outline">نامحدود</Badge>
                      ) : (
                        <Badge variant={exhausted ? "destructive" : "secondary"}>
                          {fmt(Number(s.used_today ?? 0), 0)} / {fmt(Number(s.daily_quota ?? 0), 0)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={used ? "secondary" : "outline"}
                        disabled={used || busyKey === key || exhausted}
                        title={exhausted ? "سهمیه روزانه این کانال تمام شده است" : undefined}
                        onClick={() => markAsUsed(s)}
                      >
                        {busyKey === key ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : used ? (
                          <>
                            <CheckCircle2 className="ms-1 h-3.5 w-3.5" />
                            ثبت شد
                          </>
                        ) : (
                          "ثبت به‌عنوان استفاده‌شده"
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
