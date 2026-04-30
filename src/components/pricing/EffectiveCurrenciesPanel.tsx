import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronDown, ChevronUp, Loader2, Save, X, AlertTriangle, CheckCircle2, Coins,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import {
  fetchEffectiveCurrencies,
  saveCurrencyRateAndRecompute,
  type EffectiveCurrency,
  type RecomputeSummary,
} from "@/lib/pricing/effective-currencies";
import { formatNumber, formatDateTimeFa } from "@/lib/i18n/formatters";

/**
 * کارت جانبی collapsible برای ویرایش سریع نرخ ارزهای مؤثر.
 * فقط ارزهایی نشان داده می‌شوند که حداقل یک محصول active+موجود/محدود با آن ارز وجود دارد.
 * RBAC: فقط admin/manager/accountant می‌توانند نرخ را ویرایش کنند.
 */
export function EffectiveCurrenciesPanel() {
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const canEdit = hasAnyRole(roles, ["admin", "manager", "accountant"]);

  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftRate, setDraftRate] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [lastResults, setLastResults] = useState<{
    code: string;
    results: RecomputeSummary[];
  } | null>(null);

  const q = useQuery({
    queryKey: ["effective-currencies"],
    queryFn: fetchEffectiveCurrencies,
    staleTime: 30_000,
  });

  const startEdit = (c: EffectiveCurrency) => {
    setEditing(c.code);
    setDraftRate(c.latest_rate ? String(c.latest_rate) : "");
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraftRate("");
  };

  const handleSave = async (c: EffectiveCurrency) => {
    const num = Number(draftRate.replace(/,/g, ""));
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("نرخ باید عددی مثبت باشد.");
      return;
    }
    if (!user?.id) {
      toast.error("کاربر شناسایی نشد.");
      return;
    }
    setSaving(true);
    try {
      const { results } = await saveCurrencyRateAndRecompute({
        currency: c.code,
        newRate: num,
        actorId: user.id,
      });
      setLastResults({ code: c.code, results });
      setEditing(null);
      setDraftRate("");
      toast.success(`نرخ ${c.title} با موفقیت ثبت شد و ${results.filter((r) => !r.error).length} قیمت بازمحاسبه شد.`);
      qc.invalidateQueries({ queryKey: ["effective-currencies"] });
      qc.invalidateQueries({ queryKey: ["currency-rates"] });
      qc.invalidateQueries({ queryKey: ["my-workbench"] });
      qc.invalidateQueries({ queryKey: ["live-price-list"] });
    } catch (e) {
      toast.error(`خطا در ثبت نرخ: ${(e as Error)?.message ?? "نامشخص"}`);
    } finally {
      setSaving(false);
    }
  };

  const items = q.data ?? [];

  return (
    <Card className="border-primary/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 p-4 text-right hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">نرخ ارزهای مؤثر</span>
          {items.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {items.length} ارز
            </Badge>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <CardContent className="pt-0 pb-4 space-y-3">
          {q.isLoading && (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin ml-2" />
              در حال بارگذاری ارزها...
            </div>
          )}

          {!q.isLoading && items.length === 0 && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              هیچ ارز مؤثری وجود ندارد. (محصول فعال موجود/محدود با ارز خارجی ثبت نشده است.)
            </div>
          )}

          {items.map((c) => {
            const isEditing = editing === c.code;
            return (
              <div
                key={c.code}
                className="flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{c.title}</span>
                    <Badge variant="outline" className="text-xs uppercase">
                      {c.code}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {c.affected_products_count} محصول
                    </Badge>
                  </div>
                  {c.latest_rate_at && (
                    <span className="text-xs text-muted-foreground">
                      آخرین به‌روزرسانی: {formatDateTimeFa(c.latest_rate_at)}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {isEditing ? (
                    <>
                      <Input
                        type="number"
                        value={draftRate}
                        onChange={(e) => setDraftRate(e.target.value)}
                        className="h-8 w-32 text-sm"
                        min={0}
                        step="0.01"
                        disabled={saving}
                        placeholder="نرخ به تومان"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSave(c)}
                        disabled={saving}
                        className="h-8"
                      >
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        <span className="mr-1">ثبت</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={cancelEdit}
                        disabled={saving}
                        className="h-8"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-mono">
                        {c.latest_rate ? formatNumber(c.latest_rate) : "—"}
                        <span className="text-xs text-muted-foreground mr-1">تومان</span>
                      </span>
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(c)}
                          className="h-8"
                        >
                          ویرایش
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {lastResults && (
            <div className="mt-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">
                  نتیجه بازمحاسبه برای {lastResults.code.toUpperCase()}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                {lastResults.results.filter((r) => !r.error).length} قیمت بازمحاسبه شد
                {lastResults.results.some((r) => r.error) && (
                  <span className="text-amber-600 mr-2">
                    <AlertTriangle className="inline h-3 w-3 mr-1" />
                    {lastResults.results.filter((r) => r.error).length} خطا
                  </span>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {lastResults.results.slice(0, 20).map((r, i) => (
                  <div key={i} className="text-xs flex items-center justify-between gap-2 py-0.5">
                    <span className="truncate flex-1">
                      {r.product_name} ({r.sale_price_type_title})
                    </span>
                    {r.error ? (
                      <span className="text-destructive">{r.error}</span>
                    ) : (
                      <span className="font-mono">
                        {r.old_price ? formatNumber(r.old_price) : "—"} → {formatNumber(r.new_price)}
                        {r.change_pct !== null && (
                          <span className={`mr-1 ${r.change_pct > 0 ? "text-green-600" : r.change_pct < 0 ? "text-destructive" : ""}`}>
                            ({r.change_pct > 0 ? "+" : ""}{r.change_pct}%)
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                ))}
                {lastResults.results.length > 20 && (
                  <div className="text-xs text-muted-foreground text-center pt-1">
                    ...و {lastResults.results.length - 20} مورد دیگر
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}