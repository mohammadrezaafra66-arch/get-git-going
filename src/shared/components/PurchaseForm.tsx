import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { toFaDigits, formatDateFa } from "@/lib/i18n/formatters";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const SUPPLIER_UNKNOWN = "__none__";

const schema = z.object({
  product_id: z.string().uuid({ message: "انتخاب محصول الزامی است" }),
  supplier_id: z.string().nullable(),
  payment_term_id: z.string().uuid({ message: "انتخاب زمان تسویه الزامی است" }),
  purchase_price: z
    .number({ message: "قیمت خرید الزامی است" })
    .positive("قیمت خرید باید مثبت باشد"),
  currency: z.enum(["toman", "usd", "aed"], { message: "ارز نامعتبر است" }),
  quantity: z
    .number({ message: "تعداد الزامی است" })
    .int("تعداد باید عدد صحیح باشد")
    .min(1, "تعداد باید حداقل ۱ باشد"),
  purchase_date: z.date({ message: "تاریخ خرید الزامی است" })
    .refine((d) => d.getTime() <= new Date().setHours(23, 59, 59, 999),
      { message: "تاریخ نمی‌تواند در آینده باشد" }),
  notes: z.string().max(500, "حداکثر ۵۰۰ کاراکتر").optional(),
});

type FormValues = z.infer<typeof schema>;

const CURRENCY_LABELS: Record<FormValues["currency"], string> = {
  toman: "تومان", usd: "دلار", aed: "درهم",
};

const defaultValues: FormValues = {
  product_id: "",
  supplier_id: null,
  payment_term_id: "",
  purchase_price: undefined as unknown as number,
  currency: "toman",
  quantity: 1,
  purchase_date: new Date(),
  notes: "",
};

export function PurchaseForm() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const debouncedSearch = useDebounce(productSearch, 300);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
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

  const { data: suppliers = [] } = useQuery({
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

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === form.watch("product_id")),
    [products, form.watch("product_id")],
  );

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!user?.id) throw new Error("کاربر شناسایی نشد");
      const supplierId = values.supplier_id && values.supplier_id !== SUPPLIER_UNKNOWN
        ? values.supplier_id : null;
      const lineTotal = Number(values.purchase_price) * Number(values.quantity);

      const { data: purchase, error: pErr } = await supabase
        .from("purchases")
        .insert({
          product_id: values.product_id,
          supplier_id: supplierId,
          purchase_price: values.purchase_price,
          currency: values.currency,
          quantity: values.quantity,
          purchase_date: format(values.purchase_date, "yyyy-MM-dd"),
          notes: values.notes || null,
          created_by: user.id,
          total_amount: lineTotal,
          status: "received",
        } as never)
        .select("id")
        .single();
      if (pErr) throw pErr;

      // Mirror as a purchase_items line so existing reports keep working
      const { error: iErr } = await supabase.from("purchase_items").insert({
        purchase_id: (purchase as { id: string }).id,
        product_id: values.product_id,
        quantity: values.quantity,
        unit_price: values.purchase_price,
        line_total: lineTotal,
      });
      if (iErr) throw iErr;

      return purchase;
    },
    onSuccess: () => {
      toast.success("خرید با موفقیت ثبت شد");
      form.reset(defaultValues);
      setProductSearch("");
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      toast.error(`ثبت خرید ناموفق بود: ${msg}`);
    },
  });

  const onValid = () => setConfirmOpen(true);
  const onConfirm = () => {
    setConfirmOpen(false);
    mutation.mutate(form.getValues());
  };

  const errors = form.formState.errors;
  const purchaseDate = form.watch("purchase_date");

  return (
    <form
      onSubmit={form.handleSubmit(onValid)}
      className="mx-auto w-full max-w-xl space-y-5"
      dir="rtl"
    >
      {/* محصول */}
      <div className="space-y-2">
        <Label>محصول <span className="text-destructive">*</span></Label>
        <Popover open={productOpen} onOpenChange={setProductOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              className={cn("w-full justify-between font-normal",
                !selectedProduct && "text-muted-foreground")}
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
                      <Check className={cn("ml-2 h-4 w-4",
                        p.id === form.watch("product_id") ? "opacity-100" : "opacity-0")} />
                      <span>{p.name}</span>
                      {p.sku && <span className="mr-2 text-xs text-muted-foreground">({p.sku})</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {errors.product_id && <p className="text-xs text-destructive">{errors.product_id.message}</p>}
      </div>

      {/* تأمین‌کننده */}
      <div className="space-y-2">
        <Label>تأمین‌کننده</Label>
        <Select
          value={form.watch("supplier_id") ?? SUPPLIER_UNKNOWN}
          onValueChange={(v) =>
            form.setValue("supplier_id", v === SUPPLIER_UNKNOWN ? null : v)
          }
        >
          <SelectTrigger><SelectValue placeholder="انتخاب تأمین‌کننده" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={SUPPLIER_UNKNOWN}>نامشخص</SelectItem>
            {suppliers.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* قیمت خرید */}
      <div className="space-y-2">
        <Label htmlFor="purchase_price">قیمت خرید <span className="text-destructive">*</span></Label>
        <Input
          id="purchase_price"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="مثلاً ۱۲۰۰۰۰"
          {...form.register("purchase_price", { valueAsNumber: true })}
        />
        {errors.purchase_price && <p className="text-xs text-destructive">{errors.purchase_price.message}</p>}
      </div>

      {/* ارز */}
      <div className="space-y-2">
        <Label>ارز <span className="text-destructive">*</span></Label>
        <Select
          value={form.watch("currency")}
          onValueChange={(v) => form.setValue("currency", v as FormValues["currency"], { shouldValidate: true })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(CURRENCY_LABELS) as Array<FormValues["currency"]>).map((c) => (
              <SelectItem key={c} value={c}>{CURRENCY_LABELS[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* تعداد */}
      <div className="space-y-2">
        <Label htmlFor="quantity">تعداد <span className="text-destructive">*</span></Label>
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

      {/* تاریخ خرید */}
      <div className="space-y-2">
        <Label>تاریخ خرید <span className="text-destructive">*</span></Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline"
              className={cn("w-full justify-start text-right font-normal",
                !purchaseDate && "text-muted-foreground")}>
              <CalendarIcon className="ml-2 h-4 w-4" />
              {purchaseDate ? toFaDigits(formatDateFa(purchaseDate)) : "انتخاب تاریخ"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={purchaseDate}
              onSelect={(d) => d && form.setValue("purchase_date", d, { shouldValidate: true })}
              disabled={(d) => d > new Date()}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        {errors.purchase_date && <p className="text-xs text-destructive">{errors.purchase_date.message}</p>}
      </div>

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

      <Button
        type="submit"
        className="w-full"
        disabled={mutation.isPending}
      >
        {mutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
        ثبت خرید
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