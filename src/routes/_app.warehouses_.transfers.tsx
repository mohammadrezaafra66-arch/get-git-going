import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftRight, ArrowRight, Check, Loader2, Plus, Search, Trash2 } from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import { formatDateTimeFa, formatNumber } from "@/lib/i18n/formatters";
import { fetchWarehouses } from "@/lib/warehouses/queries";
import {
  addTransferItem,
  confirmTransfer,
  createTransfer,
  deleteTransfer,
  fetchTransferItems,
  fetchTransfers,
  removeTransferItem,
} from "@/lib/warehouses/transfers";

// Item 177 / 8.8 — inter-warehouse transfer documents.
export const Route = createFileRoute("/_app/warehouses_/transfers")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: TransfersPage,
});

function TransfersPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [fromWh, setFromWh] = useState("");
  const [toWh, setToWh] = useState("");
  const [note, setNote] = useState("");
  const [openTransferId, setOpenTransferId] = useState<string | null>(null);

  const warehousesQ = useQuery({
    queryKey: ["warehouse-options"],
    queryFn: () => fetchWarehouses(false),
    staleTime: 60_000,
  });

  const listQ = useQuery({
    queryKey: ["stock-transfers"],
    queryFn: () => fetchTransfers(100),
    staleTime: 15_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["stock-transfers"] });
    qc.invalidateQueries({ queryKey: ["transfer-items"] });
    qc.invalidateQueries({ queryKey: ["kardex"] });
  };

  const create = useMutation({
    mutationFn: () => createTransfer({ fromWarehouseId: fromWh, toWarehouseId: toWh, note }),
    onSuccess: (id) => {
      toast.success("سند انتقال ساخته شد. حالا کالاها را اضافه کنید.");
      setCreateOpen(false);
      setFromWh("");
      setToWh("");
      setNote("");
      setOpenTransferId(id);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "ساخت سند ناموفق بود."),
  });

  const confirm = useMutation({
    mutationFn: (id: string) => confirmTransfer(id),
    onSuccess: () => {
      toast.success("سند قطعی شد و موجودی دو انبار به‌روز شد.");
      invalidate();
    },
    // The DB refuses when the source warehouse is short; surface its Persian message.
    onError: (e: Error) => toast.error(e.message || "قطعی‌کردن ناموفق بود."),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteTransfer(id),
    onSuccess: () => {
      toast.success("سند پیش‌نویس حذف شد.");
      setOpenTransferId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "حذف ناموفق بود."),
  });

  const transfers = listQ.data ?? [];
  const warehouses = warehousesQ.data ?? [];

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/warehouses">
            <ArrowRight className="ml-2 h-4 w-4" /> بازگشت به انبارها
          </Link>
        </Button>
      </div>

      <PageHeader
        title="انتقال بین‌انباری"
        description="سند انتقال در حالت پیش‌نویس هیچ اثری روی موجودی ندارد. با «قطعی‌کردن»، موجودی مبدأ کم و مقصد زیاد می‌شود و دو ردیف کاردکس ثبت می‌گردد."
        actions={
          <Button onClick={() => setCreateOpen(true)} disabled={warehouses.length < 2}>
            <Plus className="ml-2 h-4 w-4" /> سند انتقال جدید
          </Button>
        }
      />

      {warehouses.length < 2 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-50 p-3 text-sm leading-6 dark:bg-amber-950/20">
          برای انتقال، حداقل دو انبار فعال لازم است.{" "}
          <Link to="/warehouses" className="text-primary underline">
            ساخت انبار
          </Link>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {listQ.isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری…
            </div>
          ) : listQ.isError ? (
            <div className="p-6 text-sm text-destructive">دریافت اسناد انتقال با خطا مواجه شد.</div>
          ) : transfers.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={ArrowLeftRight}
                title="سند انتقالی ثبت نشده"
                description="برای جابه‌جایی کالا بین دو انبار، یک سند انتقال بسازید."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">تاریخ</TableHead>
                    <TableHead className="text-right">از انبار</TableHead>
                    <TableHead className="text-right">به انبار</TableHead>
                    <TableHead className="text-right">تعداد کالا</TableHead>
                    <TableHead className="text-right">وضعیت</TableHead>
                    <TableHead className="text-right">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDateTimeFa(t.created_at)}
                      </TableCell>
                      <TableCell>{t.from_warehouse_name ?? "—"}</TableCell>
                      <TableCell>{t.to_warehouse_name ?? "—"}</TableCell>
                      <TableCell>{formatNumber(t.item_count)}</TableCell>
                      <TableCell>
                        {t.status === "confirmed" ? (
                          <Badge className="gap-1">
                            <Check className="h-3 w-3" /> قطعی
                          </Badge>
                        ) : (
                          <Badge variant="outline">پیش‌نویس</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setOpenTransferId(t.id)}
                          >
                            کالاها
                          </Button>
                          {t.status === "draft" && (
                            <>
                              <Button
                                size="sm"
                                disabled={confirm.isPending || t.item_count === 0}
                                onClick={() => confirm.mutate(t.id)}
                              >
                                قطعی‌کردن
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                disabled={remove.isPending}
                                onClick={() => remove.mutate(t.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
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

      {/* New transfer */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>سند انتقال جدید</DialogTitle>
            <DialogDescription>
              انبار مبدأ و مقصد را انتخاب کنید. سند به‌صورت پیش‌نویس ساخته می‌شود و تا قطعی‌کردن روی
              موجودی اثری ندارد.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>از انبار</Label>
              <Select value={fromWh} onValueChange={setFromWh}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب کنید" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>به انبار</Label>
              <Select value={toWh} onValueChange={setToWh}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب کنید" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses
                    .filter((w) => w.id !== fromWh)
                    .map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>توضیح</Label>
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              انصراف
            </Button>
            <Button
              disabled={!fromWh || !toWh || fromWh === toWh || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              ساخت سند
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TransferItemsDialog
        transferId={openTransferId}
        onClose={() => setOpenTransferId(null)}
        readOnly={transfers.find((t) => t.id === openTransferId)?.status === "confirmed"}
        onChanged={invalidate}
      />
    </div>
  );
}

function TransferItemsDialog({
  transferId,
  onClose,
  readOnly,
  onChanged,
}: {
  transferId: string | null;
  onClose: () => void;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string } | null>(null);
  const [qty, setQty] = useState("");
  const debouncedSearch = useDebounce(productSearch, 350);

  const itemsQ = useQuery({
    queryKey: ["transfer-items", transferId],
    enabled: !!transferId,
    queryFn: () => fetchTransferItems(transferId!),
  });

  const productsQ = useQuery({
    queryKey: ["transfer-product-search", debouncedSearch],
    enabled: debouncedSearch.trim().length >= 2 && !readOnly,
    queryFn: async () => {
      const safe = debouncedSearch.trim().replace(/[%_]/g, "");
      const { data, error } = await supabase
        .from("products")
        .select("id, name")
        .ilike("name", `%${safe}%`)
        .eq("is_active", true)
        .order("name")
        .limit(20);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["transfer-items", transferId] });
    onChanged();
  };

  const add = useMutation({
    mutationFn: () =>
      addTransferItem({
        transferId: transferId!,
        productId: selectedProduct!.id,
        quantity: Number(qty),
      }),
    onSuccess: () => {
      toast.success("کالا اضافه شد.");
      setSelectedProduct(null);
      setProductSearch("");
      setQty("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "افزودن کالا ناموفق بود."),
  });

  const del = useMutation({
    mutationFn: (itemId: string) => removeTransferItem(itemId),
    onSuccess: () => {
      toast.success("کالا حذف شد.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message || "حذف ناموفق بود."),
  });

  return (
    <Dialog
      open={!!transferId}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>کالاهای سند انتقال</DialogTitle>
          <DialogDescription>
            {readOnly
              ? "این سند قطعی شده است و کالاهایش قابل تغییر نیست."
              : "هر محصول یک بار در سند می‌آید. مقدار باید بزرگ‌تر از صفر باشد."}
          </DialogDescription>
        </DialogHeader>

        {!readOnly && (
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <div className="space-y-1">
              <Label>جستجوی محصول</Label>
              <div className="relative">
                <Search className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pr-8"
                  value={selectedProduct ? selectedProduct.name : productSearch}
                  onChange={(e) => {
                    setSelectedProduct(null);
                    setProductSearch(e.target.value);
                  }}
                  placeholder="حداقل ۲ کاراکتر"
                />
              </div>
            </div>

            {!selectedProduct && debouncedSearch.trim().length >= 2 && (
              <div className="max-h-40 divide-y overflow-y-auto rounded-md border bg-background">
                {productsQ.isLoading ? (
                  <div className="p-2 text-xs text-muted-foreground">در حال جستجو…</div>
                ) : (productsQ.data ?? []).length === 0 ? (
                  <div className="p-2 text-xs text-muted-foreground">محصولی پیدا نشد.</div>
                ) : (
                  (productsQ.data ?? []).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full p-2 text-right text-sm hover:bg-muted/50"
                      onClick={() => setSelectedProduct(p)}
                    >
                      {p.name}
                    </button>
                  ))
                )}
              </div>
            )}

            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label>مقدار</Label>
                <Input
                  type="number"
                  min={0}
                  step="1"
                  dir="ltr"
                  className="text-left"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </div>
              <Button
                disabled={!selectedProduct || Number(qty) <= 0 || add.isPending}
                onClick={() => add.mutate()}
              >
                {add.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                افزودن
              </Button>
            </div>
          </div>
        )}

        <div className="max-h-64 overflow-y-auto">
          {itemsQ.isLoading ? (
            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> در حال بارگذاری…
            </div>
          ) : (itemsQ.data ?? []).length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">هنوز کالایی اضافه نشده است.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">کالا</TableHead>
                  <TableHead className="text-right">مقدار</TableHead>
                  {!readOnly && <TableHead className="text-right"> </TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(itemsQ.data ?? []).map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>{it.product_name ?? "—"}</TableCell>
                    <TableCell>{formatNumber(it.quantity)}</TableCell>
                    {!readOnly && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={del.isPending}
                          onClick={() => del.mutate(it.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            بستن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
