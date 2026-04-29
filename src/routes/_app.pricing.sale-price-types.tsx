import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ArrowRight, Loader2, Pencil, Power, RefreshCw } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { fetchSalePriceTypes } from "@/lib/pricing/queries";
import { salePriceTypeSchema, type SalePriceTypeFormValues } from "@/lib/pricing/schemas";
import { formatNumber } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/pricing/sale-price-types")({
  beforeLoad: async () => { await requirePermission("pricing", "view"); },
  component: SalePriceTypesPage,
});

type SPT = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

function SalePriceTypesPage() {
  const { roles } = useAuth();
  const canWrite = hasAnyRole(roles, ["admin", "manager"]);
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SPT | null>(null);

  const listQ = useQuery({
    queryKey: ["sale-price-types", "list"],
    queryFn: () => fetchSalePriceTypes(false),
  });

  const rows = (listQ.data ?? []) as SPT[];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["sale-price-types"] });
    qc.invalidateQueries({ queryKey: ["pricing-overview"] });
  };

  const toggle = async (r: SPT) => {
    if (!canWrite) return;
    if (r.is_active && !confirm(`نوع قیمت "${r.title}" غیرفعال شود؟`)) return;
    const { error } = await supabase
      .from("sale_price_types")
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success(r.is_active ? "غیرفعال شد" : "فعال شد");
    refresh();
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="انواع قیمت فروش"
        description="تعریف انواع مختلف قیمت فروش (نقدی، چکی، همکار، ...) برای استفاده در قوانین قیمت‌گذاری"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/pricing"><ArrowRight className="ms-1 h-4 w-4" />بازگشت</Link>
            </Button>
            {canWrite && (
              <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}>
                <Plus className="ms-1 h-4 w-4" />نوع جدید
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardContent className="p-0">
          {listQ.isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">نوعی ثبت نشده است.</div>
          ) : (
            <>
              {/* موبایل */}
              <ul className="divide-y md:hidden">
                {rows.map((r) => (
                  <li key={r.id} className="space-y-1.5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{r.title}</div>
                        <div className="text-[11px] text-muted-foreground" dir="ltr">{r.code}</div>
                      </div>
                      {r.is_active ? <Badge>فعال</Badge> : <Badge variant="outline">غیرفعال</Badge>}
                    </div>
                    {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                    <div className="text-[11px] text-muted-foreground">ترتیب: {formatNumber(r.sort_order)}</div>
                    {canWrite && (
                      <div className="flex gap-1 pt-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs"
                          onClick={() => { setEditing(r); setOpen(true); }}>
                          <Pencil className="ms-1 h-3 w-3" />ویرایش
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => toggle(r)}>
                          <Power className="ms-1 h-3 w-3" />{r.is_active ? "غیرفعال‌سازی" : "فعال‌سازی"}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {/* دسکتاپ */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50 text-right text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">عنوان</th>
                      <th className="p-3 font-medium">کد</th>
                      <th className="p-3 font-medium">توضیحات</th>
                      <th className="p-3 font-medium">ترتیب</th>
                      <th className="p-3 font-medium">وضعیت</th>
                      <th className="p-3 font-medium">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="p-3 font-medium">{r.title}</td>
                        <td className="p-3 text-xs text-muted-foreground" dir="ltr">{r.code}</td>
                        <td className="p-3 text-xs text-muted-foreground">{r.description ?? "—"}</td>
                        <td className="p-3 text-xs">{formatNumber(r.sort_order)}</td>
                        <td className="p-3">
                          {r.is_active ? <Badge>فعال</Badge> : <Badge variant="outline">غیرفعال</Badge>}
                        </td>
                        <td className="p-3">
                          {canWrite && (
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8"
                                onClick={() => { setEditing(r); setOpen(true); }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggle(r)}>
                                <Power className={`h-4 w-4 ${r.is_active ? "text-destructive" : ""}`} />
                              </Button>
                            </div>
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

      <SaleTypeDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSaved={refresh}
      />
    </div>
  );
}

function SaleTypeDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: SPT | null;
  onSaved: () => void;
}) {
  const empty: SalePriceTypeFormValues = {
    code: "", title: "", description: "", sort_order: 100, is_active: true,
  };
  const [values, setValues] = useState<SalePriceTypeFormValues>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [previewCode, setPreviewCode] = useState<string>("");

  const fetchPreviewCode = async () => {
    const { data, error } = await supabase.rpc("generate_sale_price_type_code");
    if (!error && typeof data === "string") setPreviewCode(data);
  };

  const handleOpenChange = (v: boolean) => {
    if (v) {
      setValues(editing ? {
        code: editing.code,
        title: editing.title,
        description: editing.description ?? "",
        sort_order: editing.sort_order,
        is_active: editing.is_active,
      } : empty);
      setErrors({});
      setPreviewCode("");
      if (!editing) void fetchPreviewCode();
    }
    onOpenChange(v);
  };

  const submit = async () => {
    const parsed = salePriceTypeSchema.safeParse(values);
    if (!parsed.success) {
      const f: Record<string, string> = {};
      for (const i of parsed.error.issues) f[i.path.join(".")] = i.message;
      setErrors(f);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const d = parsed.data;
      const trimmedCode = (d.code ?? "").trim();
      const basePayload = {
        title: d.title,
        description: d.description || null,
        sort_order: d.sort_order,
        is_active: d.is_active,
      };
      if (editing) {
        if (!trimmedCode) {
          setErrors({ code: "کد الزامی است" });
          setLoading(false);
          return;
        }
        const { error } = await supabase
          .from("sale_price_types")
          .update({ ...basePayload, code: trimmedCode })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("به‌روزرسانی شد");
      } else {
        const insertPayload = trimmedCode
          ? { ...basePayload, code: trimmedCode }
          : (basePayload as typeof basePayload & { code: string });
        const { error } = await supabase.from("sale_price_types").insert(insertPayload);
        if (error) throw error;
        toast.success("ثبت شد");
      }
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ذخیره");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "ویرایش نوع قیمت فروش" : "نوع قیمت فروش جدید"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>عنوان *</Label>
            <Input value={values.title}
              onChange={(e) => setValues((s) => ({ ...s, title: e.target.value }))} />
            {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title}</p>}
          </div>
          <div>
            <Label>کد یکتا *</Label>
            <div className="flex gap-2">
              <Input
                value={values.code ?? ""}
                dir="ltr"
                placeholder={editing ? "" : (previewCode || "به‌صورت خودکار تولید می‌شود")}
                onChange={(e) => setValues((s) => ({ ...s, code: e.target.value }))}
              />
              {!editing && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={fetchPreviewCode}
                  title="تولید مجدد پیشنهاد کد"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
            </div>
            {!editing && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {previewCode
                  ? `پیشنهاد سیستم: ${previewCode} — در صورت خالی گذاشتن، همین کد ثبت می‌شود.`
                  : "در صورت خالی گذاشتن، کد یکتا به‌صورت خودکار تولید می‌شود."}
              </p>
            )}
            {errors.code && <p className="mt-1 text-xs text-destructive">{errors.code}</p>}
          </div>
          <div>
            <Label>توضیحات</Label>
            <Textarea rows={2} value={values.description ?? ""}
              onChange={(e) => setValues((s) => ({ ...s, description: e.target.value }))} />
          </div>
          <div>
            <Label>ترتیب نمایش</Label>
            <Input type="number" dir="ltr" value={values.sort_order}
              onChange={(e) => setValues((s) => ({ ...s, sort_order: Number(e.target.value) }))} />
            <p className="mt-1 text-[11px] text-muted-foreground">عدد کوچکتر = بالاتر</p>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={values.is_active}
              onCheckedChange={(v) => setValues((s) => ({ ...s, is_active: v }))} />
            <Label>فعال</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>انصراف</Button>
          <Button onClick={submit} disabled={loading}>
            {loading && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}ذخیره
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}