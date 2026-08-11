import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Check, ChevronsUpDown, Star, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole, hasPermissionEx } from "@/lib/rbac/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type TrustLevel = "low" | "medium" | "high";

interface ProductSupplierRow {
  id: string;
  supplier_id: string;
  /** Item 235 (Phase 7.1) — the unified person behind this supplier link. */
  supplier_person_id: string | null;
  is_primary: boolean;
  notes: string | null;
  supplier: {
    id: string;
    name: string;
    contact_name: string | null;
    phone: string | null;
    city: string | null;
    trust_level: TrustLevel | null;
    status: "pending" | "active" | "rejected";
  } | null;
}

function trustBadge(level: TrustLevel | null) {
  if (level === "high")
    return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">بالا</Badge>;
  if (level === "low")
    return (
      <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">
        پایین
      </Badge>
    );
  return <Badge className="bg-amber-500 text-white hover:bg-amber-500">متوسط</Badge>;
}

export function ProductSupplierManager({ productId }: { productId: string }) {
  const { roles } = useAuth();
  const canManage = hasAnyRole(roles, ["admin", "accountant", "manager"]);
  const canSeeContact = hasPermissionEx(roles, "suppliers", "view_sensitive");
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [deleteRow, setDeleteRow] = useState<ProductSupplierRow | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["product-suppliers", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_suppliers")
        .select(
          "id, supplier_id, supplier_person_id, is_primary, notes, supplier:suppliers(id,name,contact_name,phone,city,trust_level,status)",
        )
        .eq("product_id", productId)
        .order("is_primary", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProductSupplierRow[];
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase.from("product_suppliers").delete().eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("اتصال تأمین‌کننده حذف شد");
      qc.invalidateQueries({ queryKey: ["product-suppliers", productId] });
      setDeleteRow(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در حذف اتصال"),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">تأمین‌کنندگان</CardTitle>
        {canManage && (
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="ms-1 h-4 w-4" />
            افزودن تأمین‌کننده
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">در حال بارگذاری...</div>
        ) : !rows || rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            هیچ تأمین‌کننده‌ای برای این محصول ثبت نشده است.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 ps-2 text-start">نام</th>
                    {canSeeContact && <th className="py-2 text-start">شخص تماس</th>}
                    {canSeeContact && <th className="py-2 text-start">تلفن</th>}
                    <th className="py-2 text-start">شهر</th>
                    <th className="py-2 text-start">سطح اعتماد</th>
                    <th className="py-2 text-start">وضعیت</th>
                    {canManage && <th className="py-2 pe-2 text-end">عملیات</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 ps-2">
                        <div className="flex items-center gap-2">
                          {r.supplier ? (
                            <Link
                              to="/suppliers/$supplierId"
                              params={{ supplierId: r.supplier.id }}
                              className="font-medium text-primary hover:underline"
                            >
                              {r.supplier.name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {/* Phase 7.5 — the supplier link still goes to the
                              supplier page; this exposes the unified person
                              behind it without replacing that navigation. */}
                          {r.supplier_person_id && (
                            <Link
                              to="/persons/$personId/edit"
                              params={{ personId: r.supplier_person_id }}
                              title="پروندهٔ شخص"
                              aria-label="پروندهٔ شخص"
                              className="text-muted-foreground hover:text-primary"
                            >
                              <UserRound className="h-3.5 w-3.5" />
                            </Link>
                          )}
                          {r.is_primary && (
                            <Badge className="bg-primary text-primary-foreground hover:bg-primary">
                              <Star className="ms-1 h-3 w-3" />
                              اصلی
                            </Badge>
                          )}
                        </div>
                      </td>
                      {canSeeContact && <td className="py-2">{r.supplier?.contact_name ?? "—"}</td>}
                      {canSeeContact && (
                        <td className="py-2 font-mono text-xs">{r.supplier?.phone ?? "—"}</td>
                      )}
                      <td className="py-2">{r.supplier?.city ?? "—"}</td>
                      <td className="py-2">{trustBadge(r.supplier?.trust_level ?? null)}</td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {r.supplier?.status === "active"
                          ? "فعال"
                          : r.supplier?.status === "rejected"
                            ? "رد شده"
                            : "در انتظار"}
                      </td>
                      {canManage && (
                        <td className="py-2 pe-2 text-end">
                          <Button variant="ghost" size="sm" onClick={() => setDeleteRow(r)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="space-y-2 md:hidden">
              {rows.map((r) => (
                <div key={r.id} className="rounded-md border bg-background p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      {r.supplier ? (
                        <Link
                          to="/suppliers/$supplierId"
                          params={{ supplierId: r.supplier.id }}
                          className="font-medium text-primary hover:underline"
                        >
                          {r.supplier.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        {r.is_primary && (
                          <Badge className="bg-primary text-primary-foreground hover:bg-primary">
                            <Star className="ms-1 h-3 w-3" />
                            اصلی
                          </Badge>
                        )}
                        {trustBadge(r.supplier?.trust_level ?? null)}
                      </div>
                    </div>
                    {canManage && (
                      <Button variant="ghost" size="sm" onClick={() => setDeleteRow(r)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    {canSeeContact && (
                      <>
                        <div>
                          <span className="text-muted-foreground">تماس:</span>{" "}
                          {r.supplier?.contact_name ?? "—"}
                        </div>
                        <div className="font-mono">
                          <span className="text-muted-foreground">تلفن:</span>{" "}
                          {r.supplier?.phone ?? "—"}
                        </div>
                      </>
                    )}
                    <div>
                      <span className="text-muted-foreground">شهر:</span> {r.supplier?.city ?? "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>

      {canManage && (
        <AddSupplierDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          productId={productId}
          existingSupplierIds={(rows ?? []).map((r) => r.supplier_id)}
          existingPrimary={(rows ?? []).find((r) => r.is_primary) ?? null}
        />
      )}

      <AlertDialog open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف اتصال تأمین‌کننده</AlertDialogTitle>
            <AlertDialogDescription>
              آیا از حذف اتصال این تأمین‌کننده اطمینان دارید؟ این عملیات قابل بازگشت نیست.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteRow && removeMutation.mutate(deleteRow.id)}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function AddSupplierDialog({
  open,
  onOpenChange,
  productId,
  existingSupplierIds,
  existingPrimary,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productId: string;
  existingSupplierIds: string[];
  existingPrimary: ProductSupplierRow | null;
}) {
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [isPrimary, setIsPrimary] = useState(false);
  const [notes, setNotes] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: suppliers, isLoading: loadingSuppliers } = useQuery({
    queryKey: ["suppliers-active-picker", search],
    queryFn: async () => {
      let q = supabase
        .from("suppliers")
        .select("id, name, city")
        .eq("status", "active")
        .order("name", { ascending: true })
        .limit(50);
      if (search.trim()) q = q.ilike("name", `%${search.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const availableSuppliers = useMemo(
    () => (suppliers ?? []).filter((s) => !existingSupplierIds.includes(s.id)),
    [suppliers, existingSupplierIds],
  );

  const selectedSupplier = useMemo(
    () => (suppliers ?? []).find((s) => s.id === supplierId) ?? null,
    [suppliers, supplierId],
  );

  const reset = () => {
    setSupplierId(null);
    setIsPrimary(false);
    setNotes("");
    setSearch("");
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!supplierId) throw new Error("انتخاب تأمین‌کننده الزامی است");
      if (notes.length > 200) throw new Error("یادداشت حداکثر ۲۰۰ کاراکتر");

      // If marking as primary and an existing primary exists, unset it first.
      if (isPrimary && existingPrimary) {
        const { error: e1 } = await supabase
          .from("product_suppliers")
          .update({ is_primary: false })
          .eq("id", existingPrimary.id);
        if (e1) throw e1;
      }

      const { error } = await supabase.from("product_suppliers").insert({
        product_id: productId,
        supplier_id: supplierId,
        is_primary: isPrimary,
        notes: notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تأمین‌کننده افزوده شد");
      qc.invalidateQueries({ queryKey: ["product-suppliers", productId] });
      onOpenChange(false);
      reset();
    },
    onError: (e: any) => toast.error(e?.message ?? "خطا در افزودن تأمین‌کننده"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>افزودن تأمین‌کننده به محصول</DialogTitle>
          <DialogDescription>یک تأمین‌کننده فعال را انتخاب کنید.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>تأمین‌کننده</Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between">
                  {selectedSupplier ? selectedSupplier.name : "انتخاب تأمین‌کننده..."}
                  <ChevronsUpDown className="ms-2 h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="جستجوی نام..."
                    value={search}
                    onValueChange={setSearch}
                  />
                  <CommandList>
                    {loadingSuppliers ? (
                      <div className="py-4 text-center text-sm text-muted-foreground">
                        در حال بارگذاری...
                      </div>
                    ) : availableSuppliers.length === 0 ? (
                      <CommandEmpty>تأمین‌کننده‌ای یافت نشد.</CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {availableSuppliers.map((s) => (
                          <CommandItem
                            key={s.id}
                            value={s.id}
                            onSelect={() => {
                              setSupplierId(s.id);
                              setPickerOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "ms-2 h-4 w-4",
                                supplierId === s.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span>{s.name}</span>
                            {s.city && (
                              <span className="ms-2 text-xs text-muted-foreground">{s.city}</span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="is-primary"
              checked={isPrimary}
              onCheckedChange={(v) => setIsPrimary(v === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="is-primary" className="cursor-pointer">
                تأمین‌کننده اصلی
              </Label>
              {isPrimary && existingPrimary && (
                <p className="text-xs text-amber-600">
                  «{existingPrimary.supplier?.name}» اکنون به‌عنوان اصلی ثبت شده. با تأیید، جایگزین
                  خواهد شد.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>یادداشت (اختیاری)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={200}
              placeholder="حداکثر ۲۰۰ کاراکتر"
              rows={3}
            />
            <div className="text-end text-xs text-muted-foreground">{notes.length}/۲۰۰</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            انصراف
          </Button>
          <Button
            onClick={() => addMutation.mutate()}
            disabled={!supplierId || addMutation.isPending}
          >
            {addMutation.isPending && <Loader2 className="ms-1 h-4 w-4 animate-spin" />}افزودن
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
