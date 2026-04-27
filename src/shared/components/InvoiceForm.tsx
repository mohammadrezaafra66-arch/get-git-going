import { useState, useMemo } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Loader2, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { toFaDigits, formatNumber } from "@/lib/i18n/formatters";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const itemSchema = z.object({
  product_id: z.string().uuid("انتخاب محصول الزامی است"),
  product_label: z.string().optional(),
  quantity: z.number({ message: "تعداد الزامی است" }).int().min(1, "حداقل ۱"),
  unit_price: z.number({ message: "قیمت الزامی است" }).positive("قیمت باید مثبت باشد"),
});

const schema = z.object({
  customer_id: z.string().uuid("انتخاب مشتری الزامی است"),
  sale_price_type_id: z.string().uuid("انتخاب نوع قیمت الزامی است"),
  notes: z.string().max(500).optional(),
  items: z.array(itemSchema).min(1, "حداقل یک قلم اضافه کنید"),
});

type FormValues = z.infer<typeof schema>;

export function InvoiceForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: "",
      sale_price_type_id: "",
      notes: "",
      items: [],
    },
    mode: "onBlur",
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedItems = form.watch("items");
  const totalAmount = useMemo(
    () => watchedItems.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0), 0),
    [watchedItems],
  );

  // Customer search
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const debouncedCustomer = useDebounce(customerSearch, 350);

  const { data: customers = [] } = useQuery({
    queryKey: ["invoice-form-customers", debouncedCustomer],
    queryFn: async () => {
      let q = supabase
        .from("customers")
        .select("id, name, phone")
        .order("name", { ascending: true })
        .limit(20);
      const term = debouncedCustomer.trim().replace(/[%_]/g, "");
      if (term) q = q.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const selectedCustomer = customers.find((c) => c.id === form.watch("customer_id"));

  // Sale price types
  const { data: priceTypes = [] } = useQuery({
    queryKey: ["invoice-form-price-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_price_types")
        .select("id, title, code")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!user?.id) throw new Error("کاربر شناسایی نشد");
      const total = values.items.reduce((s, it) => s + it.quantity * it.unit_price, 0);

      const { data: inv, error: iErr } = await supabase
        .from("invoices")
        .insert({
          customer_id: values.customer_id,
          sale_price_type_id: values.sale_price_type_id,
          type: "pre_invoice",
          status: "draft",
          total_amount: total,
          subtotal: total,
          notes: values.notes || null,
          created_by: user.id,
        } as never)
        .select("id")
        .single();
      if (iErr) throw iErr;

      const invoiceId = (inv as { id: string }).id;
      const itemsPayload = values.items.map((it) => ({
        invoice_id: invoiceId,
        product_id: it.product_id,
        quantity: it.quantity,
        unit_price: it.unit_price,
        line_total: it.quantity * it.unit_price,
      }));
      const { error: itErr } = await supabase.from("invoice_items").insert(itemsPayload as never);
      if (itErr) throw itErr;

      return invoiceId;
    },
    onSuccess: () => {
      toast.success("پیش‌فاکتور ذخیره شد");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      navigate({ to: "/sales/invoices" });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      toast.error(`ثبت ناموفق بود: ${msg}`);
    },
  });

  const errors = form.formState.errors;
  const salePriceTypeId = form.watch("sale_price_type_id");

  return (
    <form
      onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
      className="space-y-6"
      dir="rtl"
    >
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* مشتری */}
          <div className="space-y-2">
            <Label>مشتری <span className="text-destructive">*</span></Label>
            <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  className={cn("w-full justify-between font-normal",
                    !selectedCustomer && "text-muted-foreground")}
                >
                  {selectedCustomer
                    ? `${selectedCustomer.name}${selectedCustomer.phone ? ` (${toFaDigits(selectedCustomer.phone)})` : ""}`
                    : "جستجو و انتخاب مشتری..."}
                  <ChevronsUpDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="نام یا تلفن مشتری..."
                    value={customerSearch}
                    onValueChange={setCustomerSearch}
                  />
                  <CommandList>
                    <CommandEmpty>مشتری یافت نشد</CommandEmpty>
                    <CommandGroup>
                      {customers.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.id}
                          onSelect={() => {
                            form.setValue("customer_id", c.id, { shouldValidate: true });
                            setCustomerOpen(false);
                          }}
                        >
                          <Check className={cn("ml-2 h-4 w-4",
                            c.id === form.watch("customer_id") ? "opacity-100" : "opacity-0")} />
                          <span>{c.name}</span>
                          {c.phone && (
                            <span className="mr-2 text-xs text-muted-foreground" dir="ltr">
                              {toFaDigits(c.phone)}
                            </span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {errors.customer_id && <p className="text-xs text-destructive">{errors.customer_id.message}</p>}
          </div>

          {/* نوع قیمت */}
          <div className="space-y-2">
            <Label>نوع قیمت فروش <span className="text-destructive">*</span></Label>
            <Select
              value={form.watch("sale_price_type_id")}
              onValueChange={(v) => form.setValue("sale_price_type_id", v, { shouldValidate: true })}
            >
              <SelectTrigger><SelectValue placeholder="انتخاب نوع قیمت" /></SelectTrigger>
              <SelectContent>
                {priceTypes.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.sale_price_type_id && (
              <p className="text-xs text-destructive">{errors.sale_price_type_id.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* اقلام */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">اقلام پیش‌فاکتور</h3>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                append({
                  product_id: "",
                  product_label: "",
                  quantity: 1,
                  unit_price: 0,
                })
              }
            >
              <Plus className="ml-1 h-4 w-4" /> افزودن قلم
            </Button>
          </div>

          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              هنوز قلمی اضافه نشده است
            </p>
          )}

          <div className="space-y-3">
            {fields.map((field, idx) => (
              <ItemRow
                key={field.id}
                index={idx}
                form={form}
                update={update}
                remove={remove}
                salePriceTypeId={salePriceTypeId}
              />
            ))}
          </div>

          {errors.items && !Array.isArray(errors.items) && (
            <p className="text-xs text-destructive">{(errors.items as { message?: string }).message}</p>
          )}

          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">جمع کل</span>
            <span className="text-lg font-bold">{formatNumber(totalAmount)} ریال</span>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Label htmlFor="notes">توضیحات</Label>
        <Textarea id="notes" rows={3} maxLength={500} {...form.register("notes")} />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={mutation.isPending} className="flex-1">
          {mutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          ذخیره پیش‌فاکتور
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate({ to: "/sales/invoices" })}
        >
          انصراف
        </Button>
      </div>
    </form>
  );
}

/* ---------------- Item row ---------------- */

interface ItemRowProps {
  index: number;
  form: ReturnType<typeof useForm<FormValues>>;
  update: (i: number, v: FormValues["items"][number]) => void;
  remove: (i: number) => void;
  salePriceTypeId: string;
}

function ItemRow({ index, form, remove, salePriceTypeId }: ItemRowProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 350);

  const { data: products = [] } = useQuery({
    queryKey: ["invoice-form-products", debounced],
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, name, sku")
        .eq("status", "active")
        .order("name", { ascending: true })
        .limit(20);
      const term = debounced.trim().replace(/[%_]/g, "");
      if (term) q = q.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const productId = form.watch(`items.${index}.product_id`);
  const productLabel = form.watch(`items.${index}.product_label`);
  const qty = form.watch(`items.${index}.quantity`) || 0;
  const price = form.watch(`items.${index}.unit_price`) || 0;

  // Auto-fetch latest sale price when product+priceType selected
  useQuery({
    queryKey: ["sale-price", productId, salePriceTypeId],
    enabled: !!productId && !!salePriceTypeId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_product_sale_price", {
        _product_id: productId,
        _sale_price_type_id: salePriceTypeId,
      });
      if (error) throw error;
      const n = Number(data);
      if (!Number.isNaN(n) && n > 0) {
        const current = form.getValues(`items.${index}.unit_price`);
        if (!current || current === 0) {
          form.setValue(`items.${index}.unit_price`, n, { shouldValidate: true });
        }
      }
      return data;
    },
  });

  const errors = form.formState.errors.items?.[index];

  return (
    <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-2">
          <Label className="text-xs">محصول</Label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                role="combobox"
                className={cn("w-full justify-between font-normal",
                  !productId && "text-muted-foreground")}
              >
                {productLabel || "انتخاب محصول..."}
                <ChevronsUpDown className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput placeholder="نام یا کد محصول..." value={search} onValueChange={setSearch} />
                <CommandList>
                  <CommandEmpty>محصولی یافت نشد</CommandEmpty>
                  <CommandGroup>
                    {products.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={p.id}
                        onSelect={() => {
                          form.setValue(`items.${index}.product_id`, p.id, { shouldValidate: true });
                          form.setValue(`items.${index}.product_label`,
                            `${p.name}${p.sku ? ` (${p.sku})` : ""}`);
                          // reset price so the RPC effect can populate it
                          form.setValue(`items.${index}.unit_price`, 0);
                          setOpen(false);
                        }}
                      >
                        <Check className={cn("ml-2 h-4 w-4",
                          p.id === productId ? "opacity-100" : "opacity-0")} />
                        <span>{p.name}</span>
                        {p.sku && <span className="mr-2 text-xs text-muted-foreground">({p.sku})</span>}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {errors?.product_id && <p className="text-xs text-destructive">{errors.product_id.message}</p>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => remove(index)}
          aria-label="حذف"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">تعداد</Label>
          <Input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            {...form.register(`items.${index}.quantity`, { valueAsNumber: true })}
          />
          {errors?.quantity && <p className="text-xs text-destructive">{errors.quantity.message}</p>}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">قیمت واحد</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            {...form.register(`items.${index}.unit_price`, { valueAsNumber: true })}
          />
          {errors?.unit_price && <p className="text-xs text-destructive">{errors.unit_price.message}</p>}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">جمع ردیف</Label>
          <div className="h-9 flex items-center px-3 rounded-md border bg-background text-sm">
            {formatNumber(qty * price)}
          </div>
        </div>
      </div>
    </div>
  );
}