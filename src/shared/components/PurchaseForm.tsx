import { useState, useMemo, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronsUpDown, Loader2, Coins, Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import { safeRandomUUID } from "@/lib/utils/safe-uuid";
import {
  useCreatePurchase,
  purchaseErrorMessage,
  type CreatePurchaseResult,
} from "@/hooks/purchase/useCreatePurchase";
import { cn } from "@/lib/utils";
import { toFaDigits, formatDateFa } from "@/lib/i18n/formatters";
import { CURRENCY_LABELS as PRICING_CURRENCY_LABELS } from "@/lib/pricing/constants";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { JalaliDateInput } from "@/shared/components/JalaliDateInput";
import { WarehouseSelect } from "@/components/warehouses/WarehouseSelect";
import { PersonModal } from "@/components/persons/PersonModal";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const SUPPLIER_UNKNOWN = "__none__";

const schema = z.object({
  product_id: z.string().uuid({ message: "انتخاب محصول الزامی است" }),
  supplier_id: z.string().nullable(),
  payment_term_id: z.string().uuid({ message: "انتخاب زمان تسویه الزامی است" }),
  purchase_price: z
    .number({ message: "قیمت خرید الزامی است" })
    .positive("قیمت خرید باید مثبت باشد"),
  currency: z.enum(["toman", "usd", "aed", "usd_us"], { message: "ارز نامعتبر است" }),
  quantity: z
    .number({ message: "تعداد الزامی است" })
    .int("تعداد باید عدد صحیح باشد")
    .min(1, "تعداد باید حداقل ۱ باشد"),
  purchase_date: z
    .date({ message: "تاریخ خرید الزامی است" })
    .refine((d) => d.getTime() <= new Date().setHours(23, 59, 59, 999), {
      message: "تاریخ نمی‌تواند در آینده باشد",
    }),
  notes: z.string().max(500, "حداکثر ۵۰۰ کاراکتر").optional(),
  cash_price: z
    .number({ message: "قیمت نقدی نامعتبر است" })
    .positive("قیمت نقدی باید مثبت باشد")
    .optional(),
  // Item 173 — destination warehouse. null = default warehouse.
  warehouse_id: z.string().uuid().nullable().optional(),
});

type FormValues = z.infer<typeof schema>;

const defaultValues: FormValues = {
  product_id: "",
  supplier_id: null,
  payment_term_id: "",
  purchase_price: undefined as unknown as number,
  currency: "toman",
  quantity: 1,
  purchase_date: new Date(),
  notes: "",
  cash_price: undefined,
  warehouse_id: null,
};

/**
 * Issue 219 / C3 — the form is reused inside the purchase-request drawer.
 *
 * Only the props the drawer genuinely needs are exposed. Nothing here turns
 * PurchaseForm into a general-purpose component: with no props it renders and
 * behaves exactly as /purchases/create always has.
 */
export type PurchaseFormRequestContext = {
  requestId: string;
  productName: string;
  requestedQuantity: number;
  suppliedQuantity: number;
  remainingQuantity: number;
  unit?: string | null;
};

export type PurchaseFormProps = {
  initialValues?: Partial<FormValues>;
  /** Fields the caller has fixed. Only product_id is honoured today. */
  lockedFields?: ReadonlyArray<keyof FormValues>;
  requestContext?: PurchaseFormRequestContext;
  submitLabel?: string;
  onSuccess?: (result: CreatePurchaseResult) => void;
};

export function PurchaseForm({
  initialValues,
  lockedFields,
  requestContext,
  submitLabel,
  onSuccess,
}: PurchaseFormProps = {}) {
  // `user` and `queryClient` are no longer needed here: created_by is taken
  // from auth.uid() inside the RPC (never trusted from the client), and the
  // purchases cache is invalidated by useCreatePurchase.
  const productLocked = !!lockedFields?.includes("product_id");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [personModalOpen, setPersonModalOpen] = useState(false);
  // A supplier created inline that we still owe a selection to. See the effect
  // below — we cannot select it until it exists among the rendered <SelectItem>s.
  const [pendingSupplierId, setPendingSupplierId] = useState<string | null>(null);
  const [productOpen, setProductOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const debouncedSearch = useDebounce(productSearch, 300);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...defaultValues, ...initialValues },
    mode: "onBlur",
  });

  const { data: products = [], isFetching: productsLoading } = useQuery({
    queryKey: ["purchase-form-products", debouncedSearch],
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, name, sku")
        .eq("status", "active")
        .order("name", { ascending: true })
        .limit(20);
      if (debouncedSearch.trim()) {
        q = q.or(`name.ilike.%${debouncedSearch}%,sku.ilike.%${debouncedSearch}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: suppliers = [], refetch: refetchSuppliers } = useQuery({
    queryKey: ["purchase-form-suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  /**
   * Select a supplier created inline, but only once it is actually in the list.
   *
   * Awaiting refetchSuppliers() and calling setValue() straight afterwards does
   * not work: the await resolves when the DATA arrives, which is before React
   * has re-rendered the <SelectItem>s. Radix Select falls back to its
   * placeholder when `value` matches no rendered item and does not re-resolve
   * once the item appears, so the selection was silently lost.
   *
   * This effect runs after the commit that renders the new item, so by the time
   * setValue fires the option exists and the trigger shows the supplier's name.
   */
  useEffect(() => {
    if (!pendingSupplierId) return;
    if (!suppliers.some((s) => s.id === pendingSupplierId)) return;
    form.setValue("supplier_id", pendingSupplierId, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setPendingSupplierId(null);
  }, [pendingSupplierId, suppliers, form]);

  const { data: paymentTerms = [] } = useQuery({
    queryKey: ["purchase-form-payment-terms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_terms")
        .select("id, name, days")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === form.watch("product_id")),
    [products, form.watch("product_id")],
  );

  /**
   * Issue 219 / C2 — submission moved to the central RPC.
   *
   * This used to be two independent inserts (purchases, then purchase_items).
   * They were not in a transaction, so a failure on the second left a purchase
   * document with no line and therefore no stock movement — the inventory
   * trigger hangs off purchase_items. public.create_purchase does both in one
   * transaction, validates server-side and is idempotent.
   *
   * The form itself is unchanged: same fields, same zod schema, same layout.
   */
  const mutation = useCreatePurchase();

  /**
   * Idempotency key for the CURRENT attempt.
   *
   * Minted when the user opens the confirmation dialog and kept until the
   * purchase actually succeeds, so a retry after a dropped response reuses it
   * and the backend returns the original document instead of creating a second.
   * Cleared on success, so the next purchase is a genuinely new operation.
   */
  const idempotencyKeyRef = useRef<string | null>(null);

  const onValid = () => {
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = safeRandomUUID();
    setConfirmOpen(true);
  };

  const onConfirm = () => {
    setConfirmOpen(false);
    const values = form.getValues();
    const supplierId =
      values.supplier_id && values.supplier_id !== SUPPLIER_UNKNOWN ? values.supplier_id : null;

    mutation.mutate(
      {
        product_id: values.product_id,
        payment_term_id: values.payment_term_id,
        purchase_price: values.purchase_price,
        currency: values.currency,
        quantity: values.quantity,
        purchase_date: format(values.purchase_date, "yyyy-MM-dd"),
        supplier_id: supplierId,
        cash_price: values.cash_price ?? null,
        // Item 173 — the purchase_items trigger reads this to decide which
        // warehouse receives the goods; null falls back to the default.
        warehouse_id: values.warehouse_id ?? null,
        notes: values.notes || null,
        // Allocation is left to the backend: it caps at the remaining quantity,
        // so a prefill can never cause an accidental over-allocation.
        request_id: requestContext?.requestId ?? null,
        idempotency_key: idempotencyKeyRef.current,
      },
      {
        onSuccess: (result) => {
          // An idempotent replay is still a success from the operator's point of
          // view — the document exists. Saying "registered again" would read as
          // a second document having been created.
          toast.success("خرید با موفقیت ثبت شد");
          idempotencyKeyRef.current = null;
          if (onSuccess) {
            // The drawer owns what happens next (close, refresh, show summary).
            // Resetting here would blank the form behind a closing panel.
            onSuccess(result);
          } else {
            form.reset(defaultValues);
            setProductSearch("");
          }
        },
        onError: (err: unknown) => {
          // The key is deliberately NOT cleared: a retry of this same attempt
          // must reuse it so the backend can deduplicate. Form values are left
          // untouched so the operator does not retype anything.
          toast.error(purchaseErrorMessage(err));
        },
      },
    );
  };

  const errors = form.formState.errors;
  const purchaseDate = form.watch("purchase_date");

  return (
    <form
      onSubmit={form.handleSubmit(onValid)}
      className="mx-auto w-full max-w-xl space-y-5"
      dir="rtl"
    >
      {/* خلاصهٔ درخواست — فقط در مسیر «درخواست خرید» */}
      {requestContext && (
        <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="font-medium">{requestContext.productName}</div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <div className="text-muted-foreground">درخواست‌شده</div>
              <div className="font-medium text-foreground">
                {toFaDigits(String(requestContext.requestedQuantity))} {requestContext.unit ?? ""}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">تأمین‌شده</div>
              <div className="font-medium text-foreground">
                {toFaDigits(String(requestContext.suppliedQuantity))}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">باقی‌مانده</div>
              <div className="font-medium text-amber-600 dark:text-amber-400">
                {toFaDigits(String(requestContext.remainingQuantity))}
              </div>
            </div>
          </div>
          {/*
            The unit is shown for guidance only. `purchases` has no unit column,
            so nothing is converted — the buyer must enter the quantity in the
            same unit the request used.
          */}
          {requestContext.unit && (
            <p className="text-[11px] text-muted-foreground">
              واحد درخواست: {requestContext.unit} — تعداد را در همین واحد وارد کنید.
            </p>
          )}
        </div>
      )}

      {/* محصول */}
      <div className="space-y-2">
        <Label>
          محصول <span className="text-destructive">*</span>
        </Label>
        {productLocked ? (
          /*
            Locked to the request's product. The backend enforces the same rule
            (PRODUCT_MISMATCH), so this is a convenience, not the guarantee.
          */
          <div
            data-testid="locked-product"
            className="flex h-10 w-full items-center rounded-md border bg-muted/50 px-3 text-sm text-muted-foreground"
          >
            {requestContext?.productName ?? selectedProduct?.name ?? "—"}
          </div>
        ) : (
          <Popover open={productOpen} onOpenChange={setProductOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                className={cn(
                  "w-full justify-between font-normal",
                  !selectedProduct && "text-muted-foreground",
                )}
              >
                {selectedProduct
                  ? `${selectedProduct.name}${selectedProduct.sku ? ` (${selectedProduct.sku})` : ""}`
                  : "جستجو و انتخاب محصول..."}
                <ChevronsUpDown className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="جستجو نام یا کد محصول..."
                  value={productSearch}
                  onValueChange={setProductSearch}
                />
                <CommandList>
                  {productsLoading && (
                    <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال جستجو...
                    </div>
                  )}
                  <CommandEmpty>محصولی یافت نشد</CommandEmpty>
                  <CommandGroup>
                    {products.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={p.id}
                        onSelect={() => {
                          form.setValue("product_id", p.id, { shouldValidate: true });
                          setProductOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "ml-2 h-4 w-4",
                            p.id === form.watch("product_id") ? "opacity-100" : "opacity-0",
                          )}
                        />
                        <span>{p.name}</span>
                        {p.sku && (
                          <span className="mr-2 text-xs text-muted-foreground">({p.sku})</span>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
        {errors.product_id && (
          <p className="text-xs text-destructive">{errors.product_id.message}</p>
        )}
      </div>

      {/* تأمین‌کننده */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>تأمین‌کننده</Label>
          {/*
            Item 229 — inline creation. Before this, a purchase from a supplier
            that did not exist yet forced the user to abandon the form, go to
            /suppliers, create the row, and start over. person_create_inline
            writes the person AND the suppliers row in one transaction, so the
            new supplier is selectable here immediately.
          */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPersonModalOpen(true)}
          >
            <Plus className="ml-1 h-3 w-3" />
            تأمین‌کنندهٔ جدید
          </Button>
        </div>
        <Select
          value={form.watch("supplier_id") ?? SUPPLIER_UNKNOWN}
          onValueChange={(v) => form.setValue("supplier_id", v === SUPPLIER_UNKNOWN ? null : v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="انتخاب تأمین‌کننده" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SUPPLIER_UNKNOWN}>نامشخص</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <PersonModal
        open={personModalOpen}
        onOpenChange={setPersonModalOpen}
        context="supplier"
        onSuccess={async (result) => {
          // Record the intent, then refresh the list. The effect above performs
          // the actual selection once the new supplier is rendered as an option
          // — selecting here would race the render and silently no-op.
          if (result.legacy_id) {
            setPendingSupplierId(result.legacy_id);
          }
          await refetchSuppliers();
        }}
      />

      {/* زمان تسویه */}
      <div className="space-y-2">
        <Label>
          زمان تسویه <span className="text-destructive">*</span>
        </Label>
        <Select
          value={form.watch("payment_term_id") || undefined}
          onValueChange={(v) => form.setValue("payment_term_id", v, { shouldValidate: true })}
        >
          <SelectTrigger>
            <SelectValue placeholder="انتخاب زمان تسویه" />
          </SelectTrigger>
          <SelectContent>
            {paymentTerms.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                هیچ زمان تسویه‌ای تعریف نشده است
              </div>
            ) : (
              paymentTerms.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                  {t.days != null ? ` (${toFaDigits(String(t.days))} روز)` : ""}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        {errors.payment_term_id && (
          <p className="text-xs text-destructive">{errors.payment_term_id.message}</p>
        )}
      </div>

      {/* قیمت خرید */}
      <div className="space-y-2">
        <Label htmlFor="purchase_price">
          قیمت خرید <span className="text-destructive">*</span>
        </Label>
        <Input
          id="purchase_price"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="مثلاً ۱۲۰۰۰۰"
          {...form.register("purchase_price", { valueAsNumber: true })}
        />
        {errors.purchase_price && (
          <p className="text-xs text-destructive">{errors.purchase_price.message}</p>
        )}
      </div>

      {/* قیمت نقدی همان تأمین‌کننده — مبنای امتیازدهی طلای زمان */}
      <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <Label htmlFor="cash_price" className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-amber-500" />
          قیمت نقدی همین تأمین‌کننده در همین لحظه
          <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
            امتیازآور
          </span>
        </Label>
        <Input
          id="cash_price"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="اگر همین حالا نقد می‌دادیم چقدر می‌شد؟"
          {...form.register("cash_price", {
            setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)),
          })}
        />
        <p className="text-[11px] leading-5 text-muted-foreground">
          هرچه قیمت با مهلت به قیمت نقدی نزدیک‌تر باشد و مهلت تسویه طولانی‌تر، امتیاز شما در
          گیمیفیکیشن «طلای زمان» بیشتر می‌شود.
        </p>
        {errors.cash_price && (
          <p className="text-xs text-destructive">{errors.cash_price.message}</p>
        )}
      </div>

      {/* ارز */}
      <div className="space-y-2">
        <Label>
          ارز <span className="text-destructive">*</span>
        </Label>
        <Select
          value={form.watch("currency")}
          onValueChange={(v) =>
            form.setValue("currency", v as FormValues["currency"], { shouldValidate: true })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(PRICING_CURRENCY_LABELS) as Array<FormValues["currency"]>).map((c) => (
              <SelectItem key={c} value={c}>
                {PRICING_CURRENCY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* تعداد */}
      <div className="space-y-2">
        <Label htmlFor="quantity">
          تعداد <span className="text-destructive">*</span>
        </Label>
        <Input
          id="quantity"
          type="number"
          step="1"
          min="1"
          inputMode="numeric"
          {...form.register("quantity", { valueAsNumber: true })}
        />
        {errors.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
      </div>

      {/* تاریخ خرید (شمسی) */}
      <div className="space-y-2">
        <Label>
          تاریخ خرید <span className="text-destructive">*</span>
        </Label>
        <JalaliDateInput
          value={purchaseDate ? format(purchaseDate, "yyyy-MM-dd") : ""}
          onChange={(iso: string) => {
            if (!iso) return;
            const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
            if (!m) return;
            const d = new Date(+m[1], +m[2] - 1, +m[3]);
            form.setValue("purchase_date", d, { shouldValidate: true });
          }}
          max={format(new Date(), "yyyy-MM-dd")}
          invalid={!!errors.purchase_date}
        />
        {errors.purchase_date && (
          <p className="text-xs text-destructive">{errors.purchase_date.message}</p>
        )}
      </div>

      {/* انبار مقصد (۱۷۳) — اگر انباری تعریف نشده باشد، رندر نمی‌شود. */}
      <WarehouseSelect
        label="انبار مقصد"
        value={form.watch("warehouse_id") ?? null}
        onChange={(id) => form.setValue("warehouse_id", id, { shouldDirty: true })}
        hint="کالای این خرید به همین انبار اضافه می‌شود و یک ردیف کاردکس «ورود» ثبت می‌گردد."
      />

      {/* توضیحات */}
      <div className="space-y-2">
        <Label htmlFor="notes">توضیحات</Label>
        <Textarea
          id="notes"
          rows={3}
          maxLength={500}
          placeholder="یادداشت اختیاری..."
          {...form.register("notes")}
        />
        {errors.notes && <p className="text-xs text-destructive">{errors.notes.message}</p>}
      </div>

      <Button type="submit" className="w-full" disabled={mutation.isPending}>
        {mutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
        {submitLabel ?? "ثبت خرید"}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأیید ثبت خرید</AlertDialogTitle>
            <AlertDialogDescription>آیا از ثبت این خرید اطمینان دارید؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirm}>تأیید و ثبت</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
