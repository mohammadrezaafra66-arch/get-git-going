import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, ArrowRight, Pencil, Power } from "lucide-react";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { hasAnyRole, type AppRole } from "@/lib/rbac/roles";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber } from "@/lib/i18n/formatters";
import {
  SettlementTypeForm,
  type SettlementTypeFormValues,
} from "@/shared/components/SettlementTypeForm";

export const ALLOWED: AppRole[] = ["admin", "accountant"];

export const Route = createFileRoute("/_app/pricing/settlement-types")({
  beforeLoad: async () => {
    // Phase 6.7 — same SSR redirect bug as /sales/quotes/new.
    await requireAnyRole(ALLOWED);
  },
  component: SettlementTypesPage,
});

type SettlementType = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  days: number;
};

function SettlementTypesPage() {
  const { roles } = useAuth();
  const canWrite = hasAnyRole(roles, ALLOWED);
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SettlementType | null>(null);
  const [saving, setSaving] = useState(false);

  const listQ = useQuery({
    queryKey: ["settlement-types", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settlement_types")
        .select("id, code, title, description, is_active, sort_order, days")
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SettlementType[];
    },
  });

  const rows = listQ.data ?? [];

  const refresh = () => qc.invalidateQueries({ queryKey: ["settlement-types"] });

  const toggleActive = async (r: SettlementType) => {
    if (!canWrite) return;
    if (r.is_active && !confirm(`نوع تسویه "${r.title}" غیرفعال شود؟`)) return;
    const { error } = await supabase
      .from("settlement_types")
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(r.is_active ? "غیرفعال شد" : "فعال شد");
    refresh();
  };

  const handleSubmit = async (values: SettlementTypeFormValues) => {
    setSaving(true);
    try {
      const payload = {
        code: values.code,
        title: values.title,
        description: values.description || null,
        days: values.days,
        sort_order: values.sort_order,
        is_active: values.is_active,
      };
      if (editing) {
        const { error } = await supabase
          .from("settlement_types")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("به‌روزرسانی شد");
      } else {
        const { error } = await supabase.from("settlement_types").insert(payload);
        if (error) throw error;
        toast.success("ثبت شد");
      }
      refresh();
      setOpen(false);
      setEditing(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "خطا در ذخیره");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="انواع تسویه"
        description="مدیریت روش‌های تسویه (نقدی، چکی، همکار، ...) برای استفاده در فاکتورها و قوانین قیمت‌گذاری"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/pricing">
                <ArrowRight className="ms-1 h-4 w-4" />
                بازگشت
              </Link>
            </Button>
            {canWrite && (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <Plus className="ms-1 h-4 w-4" />
                نوع تسویه جدید
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
            <div className="p-6 text-center text-sm text-muted-foreground">
              نوع تسویه‌ای ثبت نشده است.
            </div>
          ) : (
            <>
              {/* موبایل */}
              <ul className="divide-y md:hidden">
                {rows.map((r) => (
                  <li key={r.id} className="space-y-1.5 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{r.title}</div>
                        <div className="text-[11px] text-muted-foreground" dir="ltr">
                          {r.code}
                        </div>
                      </div>
                      {r.is_active ? <Badge>فعال</Badge> : <Badge variant="outline">غیرفعال</Badge>}
                    </div>
                    {r.description && (
                      <p className="text-xs text-muted-foreground">{r.description}</p>
                    )}
                    <div className="text-[11px] text-muted-foreground">
                      مهلت تسویه: {r.days > 0 ? `${formatNumber(r.days)} روز` : "نقدی"} · ترتیب:{" "}
                      {formatNumber(r.sort_order)}
                    </div>
                    {canWrite && (
                      <div className="flex gap-1 pt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => {
                            setEditing(r);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="ms-1 h-3 w-3" />
                          ویرایش
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => toggleActive(r)}
                        >
                          <Power className="ms-1 h-3 w-3" />
                          {r.is_active ? "غیرفعال‌سازی" : "فعال‌سازی"}
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
                      <th className="p-3 font-medium">مهلت تسویه</th>
                      <th className="p-3 font-medium">ترتیب</th>
                      <th className="p-3 font-medium">وضعیت</th>
                      <th className="p-3 font-medium">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="p-3 font-medium">{r.title}</td>
                        <td className="p-3 text-xs text-muted-foreground" dir="ltr">
                          {r.code}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {r.description ?? "—"}
                        </td>
                        <td className="p-3 text-xs">
                          {r.days > 0 ? `${formatNumber(r.days)} روز` : "نقدی"}
                        </td>
                        <td className="p-3 text-xs">{formatNumber(r.sort_order)}</td>
                        <td className="p-3">
                          {r.is_active ? (
                            <Badge>فعال</Badge>
                          ) : (
                            <Badge variant="outline">غیرفعال</Badge>
                          )}
                        </td>
                        <td className="p-3">
                          {canWrite && (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  setEditing(r);
                                  setOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => toggleActive(r)}
                              >
                                <Power
                                  className={`h-4 w-4 ${r.is_active ? "text-destructive" : ""}`}
                                />
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

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "ویرایش نوع تسویه" : "نوع تسویه جدید"}</DialogTitle>
          </DialogHeader>
          <SettlementTypeForm
            initial={editing ?? undefined}
            isEdit={!!editing}
            loading={saving}
            onSubmit={handleSubmit}
            onCancel={() => {
              setOpen(false);
              setEditing(null);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
