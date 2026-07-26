import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  Loader2,
  Pencil,
  Plus,
  ScrollText,
  Star,
  Trash2,
  Warehouse as WarehouseIcon,
} from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toFaDigits } from "@/lib/i18n/formatters";
import {
  createWarehouse,
  deleteWarehouse,
  fetchWarehouses,
  getWarehouseDeleteBlockers,
  updateWarehouse,
  type Warehouse,
} from "@/lib/warehouses/queries";

// Item 176 / 8.6 — warehouse management. Guard matches the RLS write policy.
export const Route = createFileRoute("/_app/warehouses")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: WarehousesPage,
});

type FormState = {
  id: string | null;
  name: string;
  code: string;
  notes: string;
  is_active: boolean;
  is_default: boolean;
};

const EMPTY_FORM: FormState = {
  id: null,
  name: "",
  code: "",
  notes: "",
  is_active: true,
  is_default: false,
};

function WarehousesPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);

  const listQ = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => fetchWarehouses(true),
    staleTime: 30_000,
  });

  const blockersQ = useQuery({
    queryKey: ["warehouse-delete-blockers", deleteTarget?.id],
    enabled: !!deleteTarget,
    queryFn: () => getWarehouseDeleteBlockers(deleteTarget!.id),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["warehouses"] });
    qc.invalidateQueries({ queryKey: ["warehouse-options"] });
  };

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      if (!f.name.trim()) throw new Error("نام انبار الزامی است.");
      if (f.id) {
        await updateWarehouse(f.id, {
          name: f.name,
          code: f.code,
          notes: f.notes,
          is_active: f.is_active,
          is_default: f.is_default,
        });
      } else {
        await createWarehouse({
          name: f.name,
          code: f.code,
          notes: f.notes,
          is_default: f.is_default,
        });
      }
    },
    onSuccess: () => {
      toast.success("انبار ذخیره شد.");
      setForm(null);
      invalidate();
    },
    onError: (e: Error) => {
      // uq_warehouses_single_default / warehouses_code_key surface as duplicates.
      if (/uq_warehouses_single_default/i.test(e.message)) {
        toast.error("یک انبار پیش‌فرض از قبل وجود دارد. اول آن را از حالت پیش‌فرض دربیاورید.");
      } else if (/warehouses_code_key|duplicate key/i.test(e.message)) {
        toast.error("کد انبار تکراری است.");
      } else {
        toast.error(e.message || "ذخیره ناموفق بود.");
      }
    },
  });

  const setDefault = useMutation({
    mutationFn: async (target: Warehouse) => {
      // Only one row may carry is_default, so clear the current one first.
      const current = (listQ.data ?? []).find((w) => w.is_default && w.id !== target.id);
      if (current) await updateWarehouse(current.id, { is_default: false });
      await updateWarehouse(target.id, { is_default: true, is_active: true });
    },
    onSuccess: () => {
      toast.success("انبار پیش‌فرض تغییر کرد.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "تغییر انبار پیش‌فرض ناموفق بود."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteWarehouse(id),
    onSuccess: () => {
      toast.success("انبار حذف شد.");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => {
      if (/violates foreign key|RESTRICT/i.test(e.message)) {
        toast.error("این انبار سابقه دارد و قابل حذف نیست. آن را غیرفعال کنید.");
      } else {
        toast.error(e.message || "حذف ناموفق بود.");
      }
    },
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => updateWarehouse(id, { is_active: false, is_default: false }),
    onSuccess: () => {
      toast.success("انبار غیرفعال شد.");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "غیرفعال‌سازی ناموفق بود."),
  });

  const warehouses = listQ.data ?? [];
  const blockers = blockersQ.data;
  const hasHistory = !!blockers && (blockers.movements > 0 || blockers.transfers > 0);
  const hasStock = !!blockers && blockers.stockQuantity > 0;
  const deletable = !!blockers && !hasHistory && !hasStock;

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        title="انبارها"
        description="ساخت، ویرایش و حذف انبار. انبار پیش‌فرض برای اسنادی استفاده می‌شود که انبارشان مشخص نشده است."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/warehouses/kardex">
                <ScrollText className="ml-2 h-4 w-4" /> گزارش کاردکس
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/warehouses/transfers">
                <ArrowLeftRight className="ml-2 h-4 w-4" /> انتقال بین‌انباری
              </Link>
            </Button>
            <Button onClick={() => setForm({ ...EMPTY_FORM })}>
              <Plus className="ml-2 h-4 w-4" /> انبار جدید
            </Button>
          </div>
        }
      />

      {warehouses.length > 0 && !warehouses.some((w) => w.is_default) && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm leading-6 dark:bg-amber-950/20">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            هیچ انبار پیش‌فرضی تعیین نشده است. تا وقتی انبار پیش‌فرض نداشته باشید، خرید و قطعی‌کردن
            پیش‌فاکتورِ بدون انبارِ مشخص، موجودی را کم و زیاد نمی‌کند.
          </span>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {listQ.isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری…
            </div>
          ) : listQ.isError ? (
            <div className="p-6 text-sm text-destructive">
              دریافت فهرست انبارها با خطا مواجه شد.
            </div>
          ) : warehouses.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={WarehouseIcon}
                title="هنوز انباری نساخته‌اید"
                description="برای فعال شدن موجودی عددی، کسر هنگام قطعی و گزارش کاردکس، اولین انبار را بسازید و آن را پیش‌فرض کنید."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">نام</TableHead>
                    <TableHead className="text-right">کد</TableHead>
                    <TableHead className="text-right">وضعیت</TableHead>
                    <TableHead className="text-right">پیش‌فرض</TableHead>
                    <TableHead className="text-right">توضیحات</TableHead>
                    <TableHead className="text-right">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {warehouses.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="font-medium">{w.name}</TableCell>
                      <TableCell className="font-mono">
                        {w.code ? toFaDigits(w.code) : "—"}
                      </TableCell>
                      <TableCell>
                        {w.is_active ? (
                          <Badge variant="secondary">فعال</Badge>
                        ) : (
                          <Badge variant="outline">غیرفعال</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {w.is_default ? (
                          <Badge className="gap-1">
                            <Star className="h-3 w-3" /> پیش‌فرض
                          </Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={setDefault.isPending || !w.is_active}
                            onClick={() => setDefault.mutate(w)}
                          >
                            تعیین به‌عنوان پیش‌فرض
                          </Button>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[16rem] truncate text-muted-foreground">
                        {w.notes || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setForm({
                                id: w.id,
                                name: w.name,
                                code: w.code ?? "",
                                notes: w.notes ?? "",
                                is_active: w.is_active,
                                is_default: w.is_default,
                              })
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setDeleteTarget(w)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / edit */}
      <Dialog
        open={form !== null}
        onOpenChange={(o) => {
          if (!o) setForm(null);
        }}
      >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? "ویرایش انبار" : "انبار جدید"}</DialogTitle>
            <DialogDescription>
              نام انبار الزامی است. کد انبار اختیاری ولی در صورت ورود باید یکتا باشد.
            </DialogDescription>
          </DialogHeader>

          {form && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>
                  نام انبار <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="مثلاً انبار مرکزی"
                />
              </div>
              <div className="space-y-1">
                <Label>کد انبار</Label>
                <Input
                  dir="ltr"
                  className="text-left font-mono"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="WH-C"
                />
              </div>
              <div className="space-y-1">
                <Label>توضیحات</Label>
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
                <span>انبار پیش‌فرض</span>
                <Switch
                  checked={form.is_default}
                  onCheckedChange={(v) => setForm({ ...form, is_default: !!v })}
                />
              </label>
              {form.id && (
                <label className="flex cursor-pointer items-center justify-between gap-2 text-sm">
                  <span>فعال</span>
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(v) => setForm({ ...form, is_active: !!v })}
                  />
                </label>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setForm(null)} disabled={save.isPending}>
              انصراف
            </Button>
            <Button onClick={() => form && save.mutate(form)} disabled={save.isPending}>
              {save.isPending ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="ml-2 h-4 w-4" />
              )}
              ذخیره
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete — protected: FKs are ON DELETE RESTRICT, so offer deactivation. */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>حذف انبار «{deleteTarget?.name}»</DialogTitle>
            <DialogDescription>
              انباری که موجودی یا سابقهٔ حرکت دارد حذف نمی‌شود، چون کاردکس آن سند حسابرسی است.
            </DialogDescription>
          </DialogHeader>

          {blockersQ.isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> در حال بررسی وابستگی‌ها…
            </div>
          ) : blockers ? (
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant={hasStock ? "destructive" : "secondary"}>
                  موجودی: {toFaDigits(String(blockers.stockQuantity))}
                </Badge>
                <Badge variant={blockers.movements > 0 ? "destructive" : "secondary"}>
                  حرکت کاردکس: {toFaDigits(String(blockers.movements))}
                </Badge>
                <Badge variant={blockers.transfers > 0 ? "destructive" : "secondary"}>
                  سند انتقال: {toFaDigits(String(blockers.transfers))}
                </Badge>
              </div>
              {deletable ? (
                <p className="text-muted-foreground">
                  این انبار خالی است و سابقه‌ای ندارد، پس حذف آن بی‌خطر است.
                </p>
              ) : (
                <p className="text-amber-700 dark:text-amber-400">
                  حذف ممکن نیست. پیشنهاد: انبار را «غیرفعال» کنید تا از فهرست انتخاب خارج شود ولی
                  سابقه‌اش حفظ بماند.
                </p>
              )}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              انصراف
            </Button>
            {deleteTarget && !deletable && (
              <Button
                variant="outline"
                disabled={deactivate.isPending}
                onClick={() => deactivate.mutate(deleteTarget.id)}
              >
                {deactivate.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                غیرفعال کن
              </Button>
            )}
            {deleteTarget && deletable && (
              <Button
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate(deleteTarget.id)}
              >
                {remove.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                حذف قطعی
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
