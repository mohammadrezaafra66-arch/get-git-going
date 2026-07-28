import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { useUpdatePurchaseRequest, type PurchaseRequestRow } from "@/hooks/purchase/usePurchase";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const schema = z.object({
  product_id: z.string().uuid({ message: "انتخاب محصول الزامی است" }),
  quantity: z.number({ message: "تعداد الزامی است" }).positive("تعداد باید بزرگ‌تر از صفر باشد"),
  unit: z.string().min(1, "واحد الزامی است"),
  expected_price: z
    .number({ message: "قیمت نامعتبر است" })
    .positive("قیمت باید مثبت باشد")
    .optional(),
  notes: z.string().max(500, "حداکثر ۵۰۰ کاراکتر").optional(),
});

type FormValues = z.infer<typeof schema>;

/**
 * ویرایش درخواست خرید — فقط برای درخواست‌دهنده و فقط در وضعیت «در انتظار تأیید».
 *
 * وضعیت عمداً در این فرم نیست: تغییر وضعیت مسیر خودش را دارد
 * (PurchaseStatusActions) که گذارهای مجاز را رعایت می‌کند. سیاست RLS هم اجازه
 * نمی‌دهد درخواست‌دهنده وضعیت را از pending خارج کند (migration 219).
 */
export function PurchaseRequestEditDialog({
  request,
  open,
  onOpenChange,
}: {
  request: PurchaseRequestRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [productOpen, setProductOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const debouncedSearch = useDebounce(productSearch, 300);
  const mutation = useUpdatePurchaseRequest();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      product_id: request.product_id,
      quantity: Number(request.quantity),
      unit: request.unit,
      expected_price: request.expected_price ?? undefined,
      notes: request.notes ?? "",
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
    enabled: open,
  });

  const watchedProductId = form.watch("product_id");

  // محصول فعلی ممکن است در ۲۰ نتیجهٔ جست‌وجو نباشد؛ در آن صورت نام ذخیره‌شدهٔ
  // خود درخواست را نشان می‌دهیم تا دکمه خالی به نظر نرسد.
  const selectedLabel = useMemo(() => {
    const found = products.find((p) => p.id === watchedProductId);
    if (found) return `${found.name}${found.sku ? ` (${found.sku})` : ""}`;
    if (watchedProductId === request.product_id) return request.product_name;
    return null;
  }, [products, watchedProductId, request.product_id, request.product_name]);

  const onSubmit = async (values: FormValues) => {
    await mutation.mutateAsync({
      request_id: request.id,
      product_id: values.product_id,
      quantity: values.quantity,
      unit: values.unit,
      notes: values.notes ?? null,
      expected_price: values.expected_price ?? null,
    });
    onOpenChange(false);
  };

  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ویرایش درخواست خرید</DialogTitle>
          <DialogDescription>ویرایش فقط تا پیش از تأیید درخواست امکان‌پذیر است.</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                    !selectedLabel && "text-muted-foreground",
                  )}
                >
                  {selectedLabel ?? "جست‌وجو و انتخاب محصول..."}
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
                              p.id === watchedProductId ? "opacity-100" : "opacity-0",
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
              <Label htmlFor="edit_quantity">
                تعداد <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit_quantity"
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
            <Label htmlFor="edit_expected_price">قیمت تخمینی (اختیاری)</Label>
            <Input
              id="edit_expected_price"
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
            <Label htmlFor="edit_notes">توضیحات</Label>
            <Textarea
              id="edit_notes"
              rows={3}
              maxLength={500}
              placeholder="یادداشت اختیاری..."
              {...form.register("notes")}
            />
            {errors.notes && <p className="text-xs text-destructive">{errors.notes.message}</p>}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              انصراف
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              ذخیره تغییرات
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
