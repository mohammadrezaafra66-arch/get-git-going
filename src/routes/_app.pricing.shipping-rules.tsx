import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ArrowRight, Loader2, Pencil, Trash2 } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { shippingRuleSchema, type ShippingRuleFormValues } from "@/lib/pricing/schemas";
import { SHIPPING_COST_TYPE_LABELS } from "@/lib/pricing/constants";
import { fetchCategoriesLite } from "@/lib/products/queries";
import { formatNumber } from "@/lib/i18n/formatters";
import { PRODUCT_TYPE_LABELS } from "@/lib/products/constants";

export const Route = createFileRoute("/_app/pricing/shipping-rules")({
  beforeLoad: async () => { await requirePermission("pricing", "view"); },
  component: ShippingRulesPage,
});

interface SRule {
  id: string; title: string; cost_type: "fixed" | "percent"; cost_value: number;
  product_type: "iranian" | "foreign" | null; category_id: string | null;
  min_purchase_price: number | null; max_purchase_price: number | null;
  is_active: boolean; priority: number;
}

function ShippingRulesPage() {
  const { roles } = useAuth();
  const canWrite = hasAnyRole(roles, ["admin", "manager"]);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SRule | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["shipping-rules"],
    queryFn: async (): Promise<SRule[]> => {
      const { data, error } = await supabase
        .from("shipping_cost_rules")
        .select("id, title, cost_type, cost_value, product_type, category_id, min_purchase_price, max_purchase_price, is_active, priority")
        .order("priority", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SRule[];
    },
  });

  const remove = async (r: SRule) => {
    if (!confirm(`حذف قانون "${r.title}"؟`)) return;
    const { error } = await supabase.from("shipping_cost_rules").delete().eq("id", r.id);
    if (error) toast.error(error.message);
    else { toast.success("حذف شد"); qc.invalidateQueries({ queryKey: ["shipping-rules"] }); }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="قوانین هزینه حمل"
        description="تعریف هزینه حمل بر اساس نوع کالا، دسته و بازه قیمت خرید"
        actions={
          <>
            <Button asChild variant="outline" size="sm"><Link to="/pricing"><ArrowRight className="ms-1 h-4 w-4" />بازگشت</Link></Button>
            {canWrite && <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="ms-1 h-4 w-4" />قانون جدید</Button>}
          </>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
          ) : (data ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">قانون حملی ثبت نشده.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                  <tr>
                    <th className="p-3">عنوان</th>
                    <th className="p-3">نوع</th>
                    <th className="p-3">مقدار</th>
                    <th className="p-3">نوع کالا</th>
                    <th className="p-3">اولویت</th>
                    <th className="p-3">وضعیت</th>
                    <th className="p-3">عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {(data ?? []).map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="p-3 font-medium">{r.title}</td>
                      <td className="p-3 text-xs">{SHIPPING_COST_TYPE_LABELS[r.cost_type]}</td>
                      <td className="p-3">{r.cost_type === "percent" ? `%${formatNumber(Number(r.cost_value))}` : `${formatNumber(Number(r.cost_value))} ت`}</td>
                      <td className="p-3 text-xs">{r.product_type ? PRODUCT_TYPE_LABELS[r.product_type] : "همه"}</td>
                      <td className="p-3 text-xs">{formatNumber(r.priority)}</td>
                      <td className="p-3">{r.is_active ? <Badge>فعال</Badge> : <Badge variant="outline">غیرفعال</Badge>}</td>
                      <td className="p-3">
                        {canWrite && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <SRuleDialog open={open} onOpenChange={setOpen} editing={editing}
        onSaved={() => qc.invalidateQueries({ queryKey: ["shipping-rules"] })} />
    </div>
  );
}

function SRuleDialog({ open, onOpenChange, editing, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: SRule | null; onSaved: () => void;
}) {
  const [values, setValues] = useState<ShippingRuleFormValues>({
    title: "", cost_type: "fixed", cost_value: 0, product_type: null, category_id: null,
    min_purchase_price: null, max_purchase_price: null, priority: 100, is_active: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const { data: categories } = useQuery({ queryKey: ["categories-lite"], queryFn: fetchCategoriesLite });

  const handleOpenChange = (v: boolean) => {
    if (v) {
      setValues(editing ? {
        title: editing.title, cost_type: editing.cost_type, cost_value: Number(editing.cost_value),
        product_type: editing.product_type, category_id: editing.category_id,
        min_purchase_price: editing.min_purchase_price, max_purchase_price: editing.max_purchase_price,
        priority: editing.priority, is_active: editing.is_active,
      } : { title: "", cost_type: "fixed", cost_value: 0, product_type: null, category_id: null, min_purchase_price: null, max_purchase_price: null, priority: 100, is_active: true });
      setErrors({});
    }
    onOpenChange(v);
  };

  const submit = async () => {
    const parsed = shippingRuleSchema.safeParse(values);
    if (!parsed.success) {
      const f: Record<string, string> = {};
      for (const i of parsed.error.issues) f[i.path.join(".")] = i.message;
      setErrors(f); return;
    }
    setErrors({}); setLoading(true);
    try {
      const payload: any = { ...parsed.data };
      if (editing) {
        const { error } = await supabase.from("shipping_cost_rules").update(payload).eq("id", editing.id);
        if (error) throw error; toast.success("به‌روزرسانی شد");
      } else {
        const { error } = await supabase.from("shipping_cost_rules").insert(payload);
        if (error) throw error; toast.success("ثبت شد");
      }
      onSaved(); onOpenChange(false);
    } catch (e: any) { toast.error(e?.message ?? "خطا"); } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "ویرایش قانون حمل" : "قانون حمل جدید"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>عنوان *</Label>
            <Input value={values.title} onChange={(e) => setValues((s) => ({ ...s, title: e.target.value }))} />
            {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title}</p>}
          </div>
          <div>
            <Label>نوع هزینه *</Label>
            <Select value={values.cost_type} onValueChange={(v) => setValues((s) => ({ ...s, cost_type: v as "fixed" | "percent" }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">مبلغ ثابت</SelectItem>
                <SelectItem value="percent">درصد قیمت خرید</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>مقدار *</Label>
            <Input type="number" inputMode="numeric" dir="ltr" value={values.cost_value || ""} onChange={(e) => setValues((s) => ({ ...s, cost_value: Number(e.target.value) }))} />
          </div>
          <div>
            <Label>نوع کالا</Label>
            <Select value={values.product_type ?? "all"} onValueChange={(v) => setValues((s) => ({ ...s, product_type: v === "all" ? null : (v as "iranian" | "foreign") }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem>
                <SelectItem value="iranian">ایرانی</SelectItem>
                <SelectItem value="foreign">خارجی</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>دسته‌بندی</Label>
            <Select value={values.category_id ?? "all"} onValueChange={(v) => setValues((s) => ({ ...s, category_id: v === "all" ? null : v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه</SelectItem>
                {(categories ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>حداقل قیمت خرید (ت)</Label>
            <Input type="number" inputMode="numeric" dir="ltr" value={values.min_purchase_price ?? ""} onChange={(e) => setValues((s) => ({ ...s, min_purchase_price: e.target.value === "" ? null : Number(e.target.value) }))} />
          </div>
          <div>
            <Label>حداکثر قیمت خرید (ت)</Label>
            <Input type="number" inputMode="numeric" dir="ltr" value={values.max_purchase_price ?? ""} onChange={(e) => setValues((s) => ({ ...s, max_purchase_price: e.target.value === "" ? null : Number(e.target.value) }))} />
            {errors.max_purchase_price && <p className="mt-1 text-xs text-destructive">{errors.max_purchase_price}</p>}
          </div>
          <div>
            <Label>اولویت</Label>
            <Input type="number" dir="ltr" value={values.priority} onChange={(e) => setValues((s) => ({ ...s, priority: Number(e.target.value) }))} />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
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