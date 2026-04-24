import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ArrowRight, Loader2, Check } from "lucide-react";
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

function CurrencyRatesPage() {
  const { roles } = useAuth();
  const canWrite = hasAnyRole(roles, ["admin", "manager", "accountant"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["currency-rates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("currency_rates")
        .select("id, currency, rate_to_toman, source_name, effective_at, is_active, created_at")
        .order("effective_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

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

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
          ) : (data ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">نرخی ثبت نشده است.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">ارز</th>
                    <th className="p-3 font-medium">نرخ به تومان</th>
                    <th className="p-3 font-medium">منبع</th>
                    <th className="p-3 font-medium">تاریخ مؤثر</th>
                    <th className="p-3 font-medium">وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {(data ?? []).map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-3 font-medium">{CURRENCY_LABELS[r.currency as "usd" | "aed"]}</td>
                      <td className="p-3"><span className="font-semibold">{formatNumber(Number(r.rate_to_toman))}</span> <span className="text-xs text-muted-foreground">تومان</span></td>
                      <td className="p-3 text-xs text-muted-foreground">{r.source_name || "—"}</td>
                      <td className="p-3 text-xs text-muted-foreground">{formatDateTimeFa(r.effective_at)}</td>
                      <td className="p-3">
                        {r.is_active ? <Badge variant="default"><Check className="ms-1 h-3 w-3" />فعال</Badge> : <Badge variant="outline">غیرفعال</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <RateDialog open={open} onOpenChange={setOpen} onSaved={() => qc.invalidateQueries({ queryKey: ["currency-rates"] })} />
    </div>
  );
}

function RateDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [values, setValues] = useState<CurrencyRateFormValues>({ currency: "usd", rate_to_toman: 0, source_name: "", is_active: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const parsed = currencyRateSchema.safeParse(values);
    if (!parsed.success) {
      const f: Record<string, string> = {};
      for (const i of parsed.error.issues) f[i.path.join(".")] = i.message;
      setErrors(f); return;
    }
    setErrors({}); setLoading(true);
    try {
      const payload: any = {
        currency: parsed.data.currency,
        rate_to_toman: parsed.data.rate_to_toman,
        source_name: parsed.data.source_name || null,
        is_active: parsed.data.is_active,
      };
      const { error } = await supabase.from("currency_rates").insert(payload);
      if (error) throw error;
      toast.success("نرخ ارز ثبت شد");
      onSaved();
      onOpenChange(false);
      setValues({ currency: "usd", rate_to_toman: 0, source_name: "", is_active: true });
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
          <div className="flex items-center gap-2">
            <Switch checked={values.is_active} onCheckedChange={(v) => setValues((s) => ({ ...s, is_active: v }))} />
            <Label>فعال</Label>
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