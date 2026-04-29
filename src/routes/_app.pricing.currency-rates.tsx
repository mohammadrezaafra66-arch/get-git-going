import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ArrowRight, Loader2, Check, Power, ChevronRight, ChevronLeft } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { currencyRateSchema, type CurrencyRateFormValues } from "@/lib/pricing/schemas";
import { CURRENCY_LABELS } from "@/lib/pricing/constants";
import { formatNumber, formatDateTimeFa } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/pricing/currency-rates")({
  beforeLoad: async () => { await requirePermission("pricing", "view"); },
  component: CurrencyRatesPage,
});

const PAGE_SIZE = 20;
type CurrencyFilter = "all" | "usd" | "aed";

function CurrencyRatesPage() {
  const { roles } = useAuth();
  const canWrite = hasAnyRole(roles, ["admin", "manager", "accountant"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<CurrencyFilter>("all");
  const [page, setPage] = useState(0);

  const latest = useQuery({
    queryKey: ["currency-rates", "latest"],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const [usd, aed] = await Promise.all([
        supabase.from("currency_rates").select("rate_to_toman, effective_at, source_name").eq("currency", "usd").eq("is_active", true).lte("effective_at", nowIso).order("effective_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("currency_rates").select("rate_to_toman, effective_at, source_name").eq("currency", "aed").eq("is_active", true).lte("effective_at", nowIso).order("effective_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      return { usd: usd.data, aed: aed.data };
    },
    staleTime: 30_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["currency-rates", "list", filter, page],
    queryFn: async () => {
      let q = supabase
        .from("currency_rates")
        .select("id, currency, rate_to_toman, source_name, effective_at, is_active, created_at", { count: "exact" })
        .order("effective_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (filter !== "all") q = q.eq("currency", filter);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["currency-rates"] });
    qc.invalidateQueries({ queryKey: ["pricing-overview"] });
  };

  const toggleActive = async (id: string, current: boolean) => {
    if (!canWrite) return;
    if (current && !confirm("نرخ انتخاب‌شده غیرفعال شود؟")) return;
    const { error } = await supabase.from("currency_rates").update({ is_active: !current }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(current ? "نرخ غیرفعال شد" : "نرخ فعال شد");
    refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="نرخ ارز"
        description="ثبت نرخ روز دلار و درهم — مبنای محاسبه قیمت محصولات وارداتی"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/pricing"><ArrowRight className="ms-1 h-4 w-4" />بازگشت</Link>
            </Button>
            {canWrite && (
              <Button size="sm" onClick={() => setOpen(true)}><Plus className="ms-1 h-4 w-4" />ثبت نرخ جدید</Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <LatestCard label="آخرین نرخ دلار" data={latest.data?.usd} loading={latest.isLoading} />
        <LatestCard label="آخرین نرخ درهم" data={latest.data?.aed} loading={latest.isLoading} />
      </div>

      <Card>
        <CardContent className="flex flex-col items-stretch gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">فیلتر ارز:</Label>
            <Select value={filter} onValueChange={(v) => { setFilter(v as CurrencyFilter); setPage(0); }}>
              <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem>
                <SelectItem value="usd">دلار</SelectItem>
                <SelectItem value="aed">درهم</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-muted-foreground">مجموع: {formatNumber(total)} ردیف</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">نرخی ثبت نشده است.</div>
          ) : (
            <>
              {/* Mobile cards */}
              <ul className="divide-y md:hidden">
                {rows.map((r) => (
                  <li key={r.id} className="space-y-1 p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{CURRENCY_LABELS[r.currency as "usd" | "aed"]}</span>
                      {r.is_active ? <Badge variant="default"><Check className="ms-1 h-3 w-3" />فعال</Badge> : <Badge variant="outline">غیرفعال</Badge>}
                    </div>
                    <div className="text-sm"><span className="font-semibold">{formatNumber(Number(r.rate_to_toman))}</span> <span className="text-xs text-muted-foreground">تومان</span></div>
                    <div className="text-xs text-muted-foreground">{r.source_name || "بدون منبع"} · {formatDateTimeFa(r.effective_at)}</div>
                    {canWrite && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => toggleActive(r.id, r.is_active)}>
                        <Power className={`ms-1 h-3 w-3 ${r.is_active ? "text-destructive" : ""}`} />{r.is_active ? "غیرفعال‌سازی" : "فعال‌سازی"}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">ارز</th>
                    <th className="p-3 font-medium">نرخ به تومان</th>
                    <th className="p-3 font-medium">منبع</th>
                    <th className="p-3 font-medium">تاریخ مؤثر</th>
                    <th className="p-3 font-medium">وضعیت</th>
                    <th className="p-3 font-medium">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-3 font-medium">{CURRENCY_LABELS[r.currency as "usd" | "aed"]}</td>
                      <td className="p-3"><span className="font-semibold">{formatNumber(Number(r.rate_to_toman))}</span> <span className="text-xs text-muted-foreground">تومان</span></td>
                      <td className="p-3 text-xs text-muted-foreground">{r.source_name || "—"}</td>
                      <td className="p-3 text-xs text-muted-foreground">{formatDateTimeFa(r.effective_at)}</td>
                      <td className="p-3">
                        {r.is_active ? <Badge variant="default"><Check className="ms-1 h-3 w-3" />فعال</Badge> : <Badge variant="outline">غیرفعال</Badge>}
                      </td>
                      <td className="p-3">
                        {canWrite && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => toggleActive(r.id, r.is_active)}>
                            <Power className={`ms-1 h-3 w-3 ${r.is_active ? "text-destructive" : ""}`} />{r.is_active ? "غیرفعال" : "فعال"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">صفحه {formatNumber(page + 1)} از {formatNumber(totalPages)}</div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronRight className="h-4 w-4" />قبلی
          </Button>
          <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
            بعدی<ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <RateDialog open={open} onOpenChange={setOpen} onSaved={refresh} />
    </div>
  );
}

function LatestCard({ label, data, loading }: { label: string; data: { rate_to_toman: number; effective_at: string; source_name: string | null } | null | undefined; loading: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-bold">
          {loading ? "..." : data ? <>{formatNumber(Number(data.rate_to_toman))} <span className="text-sm font-normal text-muted-foreground">تومان</span></> : "—"}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {data ? <>{data.source_name || "بدون منبع"} · {formatDateTimeFa(data.effective_at)}</> : "ثبت نشده"}
        </div>
      </CardContent>
    </Card>
  );
}

function RateDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [values, setValues] = useState<CurrencyRateFormValues>({ currency: "usd", rate_to_toman: 0, source_name: "", effective_at: "", is_active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [deactivatePrev, setDeactivatePrev] = useState(true);

  const submit = async () => {
    const parsed = currencyRateSchema.safeParse(values);
    if (!parsed.success) {
      const f: Record<string, string> = {};
      for (const i of parsed.error.issues) f[i.path.join(".")] = i.message;
      setErrors(f); return;
    }
    setErrors({}); setLoading(true);
    try {
      // Optionally deactivate previous active rates for the same currency
      if (deactivatePrev && parsed.data.is_active) {
        await supabase
          .from("currency_rates")
          .update({ is_active: false })
          .eq("currency", parsed.data.currency)
          .eq("is_active", true);
      }
      const payload: any = {
        currency: parsed.data.currency,
        rate_to_toman: parsed.data.rate_to_toman,
        source_name: parsed.data.source_name || null,
        is_active: parsed.data.is_active,
      };
      if (parsed.data.effective_at) payload.effective_at = parsed.data.effective_at;
      const { error } = await supabase.from("currency_rates").insert(payload);
      if (error) throw error;
      toast.success("نرخ ارز ثبت شد");
      onSaved();
      onOpenChange(false);
      setValues({ currency: "usd", rate_to_toman: 0, source_name: "", effective_at: "", is_active: true });
    } catch (e: any) {
      toast.error(e?.message ?? "خطا در ثبت نرخ");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>ثبت نرخ ارز جدید</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>ارز *</Label>
            <Select value={values.currency} onValueChange={(v) => setValues((s) => ({ ...s, currency: v as "usd" | "aed" }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="usd">دلار</SelectItem>
                <SelectItem value="aed">درهم</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>نرخ به تومان *</Label>
            <Input type="number" inputMode="numeric" dir="ltr" value={values.rate_to_toman || ""} onChange={(e) => setValues((s) => ({ ...s, rate_to_toman: Number(e.target.value) }))} />
            {errors.rate_to_toman && <p className="mt-1 text-xs text-destructive">{errors.rate_to_toman}</p>}
          </div>
          <div>
            <Label>منبع نرخ</Label>
            <Input value={values.source_name ?? ""} onChange={(e) => setValues((s) => ({ ...s, source_name: e.target.value }))} placeholder="مثلاً: بازار آزاد، تجارت‌نیوز و …" />
          </div>
          <div>
            <Label>تاریخ مؤثر</Label>
            <Input type="datetime-local" dir="ltr" value={values.effective_at ?? ""} onChange={(e) => setValues((s) => ({ ...s, effective_at: e.target.value }))} />
            <p className="mt-1 text-[11px] text-muted-foreground">اگر خالی بماند، زمان ثبت در نظر گرفته می‌شود.</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={values.is_active} onCheckedChange={(v) => setValues((s) => ({ ...s, is_active: v }))} />
            <Label>فعال</Label>
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
            <Switch checked={deactivatePrev} onCheckedChange={setDeactivatePrev} />
            <Label className="text-xs">غیرفعال‌سازی خودکار نرخ‌های فعال قبلی همین ارز</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button onClick={submit} disabled={loading}>{loading && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}ذخیره</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}