import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { useCreatePurchaseRequest } from "@/hooks/purchase/usePurchase";
import { PURCHASE_UNIT_OPTIONS } from "@/lib/purchase/labels";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import { Card, CardContent } from "@/components/ui/card";

const schema = z.object({
  product_id: z.string().uuid({ message: "انتخاب محصول الزامی است" }),
  quantity: z
    .number({ message: "تعداد الزامی است" })
    .positive("تعداد باید بزرگ‌تر از صفر باشد"),
  unit: z.string().min(1, "واحد الزامی است"),
  expected_price: z
    .number({ message: "قیمت نامعتبر است" })
    .positive("قیمت باید مثبت باشد")
    .optional(),
  notes: z.string().max(500, "حداکثر ۵۰۰ کاراکتر").optional(),
});

type FormValues = z.infer<typeof schema>;

export function PurchaseRequestForm({
  inquiryId,
  defaultProductId,
  onSuccess,
}: {
  inquiryId?: string | null;
  defaultProductId?: string;
  onSuccess?: () => void;
}) {
  const [productOpen, setProductOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const debouncedSearch = useDebounce(productSearch, 300);
  const mutation = useCreatePurchaseRequest();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      product_id: defaultProductId ?? "",
      quantity: 1,
      unit: "عدد",
      expected_price: undefined,
      notes: "",
    },
    mode: "onBlur",
  });

  const { data: products = [], isFetching: productsLoading } = useQuery({
    queryKey: ["purchase-request-form-products", debouncedSearch],
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, name, sku")
        .eq("status", "active")
        .order("name", { ascending: true })
        .limit(20);
      const term = debouncedSearch.trim();
      if (term) q = q.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const { data: inquiry } = useQuery({
    queryKey: ["purchase-request-inquiry", inquiryId],
    queryFn: async () => {
      if (!inquiryId) return null;
      // `inquiries` هیچ ستون نامی ندارد. ستون‌های واقعی:
      //   id, product_id, group_id, requested_by, assigned_to, status,
      //   message_id, created_at, answered_at, closed_at
      // نام محصول از رابطهٔ `inquiries.product_id -> products(id)` می‌آید؛ آن ستون
      // NOT NULL است، پس `!inner` هیچ ردیفی را حذف نمی‌کند.
      //
      // نام مشتری حذف شد چون هیچ منبعی ندارد: تنها کلیدهای خارجیِ `inquiries` به
      // `products`، `messenger_groups` و `users` می‌روند — هیچ‌کدام مشتری نیستند.
      // نمایش «—» به‌جای آن، جای خالی را با چیزی که وجود ندارد پر می‌کرد.
      const { data, error } = await supabase
        .from("inquiries")
        .select("id, created_at, products!inner(name)")
        .eq("id", inquiryId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!inquiryId,
  });

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === form.watch("product_id")),
    [products, form.watch("product_id")],
  );

  const onSubmit = async (values: FormValues) => {
    await mutation.mutateAsync({
      product_id: values.product_id,
      quantity: values.quantity,
      unit: values.unit,
      inquiry_id: inquiryId ?? null,
      notes: values.notes ?? null,
      expected_price: values.expected_price ?? null,
    });
    form.reset({
      product_id: defaultProductId ?? "",
      quantity: 1,
      unit: "عدد",
      expected_price: undefined,
      notes: "",
    });
    setProductSearch("");
    onSuccess?.();
  };

  const errors = form.formState.errors;

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-4"
      dir="rtl"
    >
      {inquiry && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 text-xs space-y-1">
            <div className="font-medium">استعلام مرتبط</div>
            <div className="text-muted-foreground">
              {(inquiry as { products?: { name?: string } | null }).products?.name ?? "—"}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <Label>
          محصول <span className="text-destructive">*</span>
        </Label>
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
                : "جست‌وجو و انتخاب محصول..."}
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="نام یا کد محصول..."
                value={productSearch}
                onValueChange={setProductSearch}
              />
              <CommandList>
                {productsLoading && (
                  <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" /> جست‌وجو...
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
        {errors.product_id && (
          <p className="text-xs text-destructive">{errors.product_id.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="quantity">
            تعداد <span className="text-destructive">*</span>
          </Label>
          <Input
            id="quantity"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            {...form.register("quantity", { valueAsNumber: true })}
          />
          {errors.quantity && (
            <p className="text-xs text-destructive">{errors.quantity.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label>
            واحد <span className="text-destructive">*</span>
          </Label>
          <Select
            value={form.watch("unit")}
            onValueChange={(v) => form.setValue("unit", v, { shouldValidate: true })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PURCHASE_UNIT_OPTIONS.map((u) => (
                <SelectItem key={u} value={u}>
                  {u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="expected_price">قیمت تخمینی (اختیاری)</Label>
        <Input
          id="expected_price"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          placeholder="تومان"
          {...form.register("expected_price", {
            setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)),
          })}
        />
        {errors.expected_price && (
          <p className="text-xs text-destructive">{errors.expected_price.message}</p>
        )}
      </div>

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
        ثبت درخواست خرید
      </Button>
    </form>
  );
}