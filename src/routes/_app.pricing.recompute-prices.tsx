import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Loader2, CheckCircle2, AlertCircle, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { publishAllProductsPrices, type PublishProductResult } from "@/lib/pricing/publish-prices";
import { formatNumber } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/pricing/recompute-prices")({
  beforeLoad: async () => { await requirePermission("pricing", "update"); },
  component: RecomputePricesPage,
});

function RecomputePricesPage() {
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<PublishProductResult[]>([]);
  const [summary, setSummary] = useState<{ written: number; failed: number } | null>(null);

  const { data: counts } = useQuery({
    queryKey: ["recompute-eligible-count", onlyAvailable],
    queryFn: async () => {
      let qAll = supabase.from("products").select("id", { count: "exact", head: true });
      let qElig = supabase.from("products").select("id", { count: "exact", head: true });
      if (onlyAvailable) {
        qElig = qElig.eq("status", "active").in("stock_status", ["available", "limited"]);
      }
      const [a, e] = await Promise.all([qAll, qElig]);
      return { all: a.count ?? 0, eligible: e.count ?? 0 };
    },
  });

  async function handleRun() {
    setRunning(true);
    setResults([]);
    setSummary(null);
    setProgress({ done: 0, total: 0 });
    try {
      const collected: PublishProductResult[] = [];
      const res = await publishAllProductsPrices({
        onlyActiveAvailable: onlyAvailable,
        onProgress: (done, total, last) => {
          collected.push(last);
          setProgress({ done, total });
          setResults([...collected]);
        },
      });
      setSummary({ written: res.total_prices_written, failed: res.total_failed });
      toast.success(`${res.total_prices_written} قیمت ذخیره شد` + (res.total_failed ? ` — ${res.total_failed} خطا` : ""));
    } catch (e: any) {
      toast.error(e?.message ?? "خطا در اجرا");
    } finally {
      setRunning(false);
    }
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="انتشار قیمت فروش (دسته‌ای)"
        description="برای همهٔ محصولات واجد شرایط، قیمت فروش با همهٔ نوع‌قیمت‌های فعال محاسبه و در سیستم ذخیره می‌شود تا در /sales/search و سایر صفحات دیده شود."
      />

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="only-available"
                checked={onlyAvailable}
                onCheckedChange={(v) => setOnlyAvailable(Boolean(v))}
                disabled={running}
              />
              <Label htmlFor="only-available" className="cursor-pointer text-sm">
                فقط محصولات فعال و موجود
              </Label>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ListChecks className="h-4 w-4" />
              واجد شرایط: <strong className="text-foreground">{formatNumber(counts?.eligible ?? 0)}</strong>
              {" "}از کل{" "}
              <strong className="text-foreground">{formatNumber(counts?.all ?? 0)}</strong>
            </div>
            <Button onClick={handleRun} disabled={running} className="ms-auto">
              {running ? <Loader2 className="ms-1 h-4 w-4 animate-spin" /> : <Sparkles className="ms-1 h-4 w-4" />}
              شروع محاسبه و انتشار
            </Button>
          </div>

          {running && (
            <div className="space-y-1">
              <Progress value={pct} />
              <div className="text-xs text-muted-foreground">
                {progress.done} از {progress.total} محصول ({pct}%)
              </div>
            </div>
          )}

          {summary && !running && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-sm text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="ms-1 inline h-4 w-4" />
              {summary.written} قیمت ذخیره شد · {summary.failed} خطا
            </div>
          )}
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="max-h-[60vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/60 text-xs">
                  <tr>
                    <th className="p-2 text-start">محصول</th>
                    <th className="p-2 text-start">SKU</th>
                    <th className="p-2">موفق</th>
                    <th className="p-2">خطا</th>
                    <th className="p-2 text-start">جزئیات خطا</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => {
                    const errs = r.results.filter((x) => !x.ok);
                    return (
                      <tr key={`${r.product_id}-${i}`} className="border-t border-border">
                        <td className="p-2">{r.product_name}</td>
                        <td className="p-2 text-xs text-muted-foreground">{r.sku ?? "—"}</td>
                        <td className="p-2 text-center text-emerald-600">{r.succeeded}</td>
                        <td className="p-2 text-center text-destructive">{r.failed}</td>
                        <td className="p-2 text-xs text-muted-foreground">
                          {errs.length === 0 ? "—" : (
                            <ul className="space-y-0.5">
                              {errs.map((e, j) => (
                                <li key={j} className="flex items-start gap-1">
                                  <AlertCircle className="mt-0.5 h-3 w-3 flex-shrink-0 text-destructive" />
                                  <span>{e.sale_price_type_title || "—"}: {e.error}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}