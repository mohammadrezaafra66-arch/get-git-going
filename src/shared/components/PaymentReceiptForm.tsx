import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { toFaDigits } from "@/lib/i18n/formatters";

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
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const BANKS = [
  "ملی", "ملت", "صادرات", "سپه", "تجارت", "رفاه", "مسکن",
  "کشاورزی", "پاسارگاد", "سامان", "پارسیان", "اقتصاد نوین", "آینده",
];

const today = new Date().toISOString().slice(0, 10);

const schema = z.object({
  customer_id: z.string().uuid("انتخاب مشتری الزامی است"),
  payer_name: z.string().trim().min(2, "حداقل ۲ کاراکتر").max(150, "حداکثر ۱۵۰ کاراکتر"),
  payer_phone: z.string().trim().max(30).optional().or(z.literal("")),
  payer_accounting_code: z.string().trim().max(50).optional().or(z.literal("")),
  receiver_name: z.string().trim().min(2, "حداقل ۲ کاراکتر").max(150, "حداکثر ۱۵۰ کاراکتر"),
  receiver_phone: z.string().trim().max(30).optional().or(z.literal("")),
  receiver_accounting_code: z.string().trim().max(50).optional().or(z.literal("")),
  amount: z.number({ message: "مبلغ الزامی است" }).positive("مبلغ باید مثبت باشد"),
  payment_date: z.string()
    .min(1, "تاریخ الزامی است")
    .refine((d) => d <= today, "تاریخ نمی‌تواند در آینده باشد"),
  payment_time: z.string().regex(/^\d{2}:\d{2}$/, "فرمت ساعت HH:MM"),
  tracking_number: z.string().trim().min(1, "شماره پیگیری الزامی است").max(100, "حداکثر ۱۰۰ کاراکتر"),
  bank_name: z.string().trim().max(100).optional().or(z.literal("")),
  receipt_image_url: z.string().trim().max(500).optional().or(z.literal("")),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

export function PaymentReceiptForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<FormValues | null>(null);
  const [duplicateCount, setDuplicateCount] = useState(0);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: "",
      payer_name: "",
      payer_phone: "",
      payer_accounting_code: "",
      receiver_name: "",
      receiver_phone: "",
      receiver_accounting_code: "",
      amount: undefined as unknown as number,
      payment_date: today,
      payment_time: new Date().toTimeString().slice(0, 5),
      tracking_number: "",
      bank_name: "",
      receipt_image_url: "",
      description: "",
    },
    mode: "onBlur",
  });

  const errors = form.formState.errors;

  // Customer search
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const debouncedCustomer = useDebounce(customerSearch, 350);

  const { data: customers = [] } = useQuery({
    queryKey: ["receipt-form-customers", debouncedCustomer],
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

  const mutation = useMutation({
    mutationFn: async (
      args: { values: FormValues; bypassDuplicate?: boolean },
    ) => {
      const { values, bypassDuplicate } = args;
      if (!user?.id) throw new Error("کاربر شناسایی نشد");

      // Duplicate check
      if (!bypassDuplicate) {
        let dq = supabase
          .from("payment_receipts")
          .select("id", { count: "exact", head: true })
          .eq("tracking_number", values.tracking_number)
          .eq("amount", values.amount)
          .eq("payment_date", values.payment_date)
          .neq("status", "rejected");
        if (values.bank_name) {
          dq = dq.eq("bank_name", values.bank_name);
        } else {
          dq = dq.is("bank_name", null);
        }
        const { count: dupCount, error: dupErr } = await dq;
        if (dupErr) throw dupErr;
        if ((dupCount ?? 0) > 0) {
          // Audit duplicate detection
          await supabase.from("audit_logs").insert({
            actor_id: user.id,
            entity_type: "payment_receipt",
            entity_id: values.tracking_number,
            action: "duplicate_receipt_warning",
            diff: {
              tracking_number: values.tracking_number,
              amount: values.amount,
              payment_date: values.payment_date,
              bank_name: values.bank_name || null,
              matches: dupCount,
            },
          } as never);
          return { duplicate: true as const, count: dupCount ?? 0 };
        }
      }

      const payload = {
        customer_id: values.customer_id,
        payer_name: values.payer_name,
        payer_phone: values.payer_phone || null,
        payer_accounting_code: values.payer_accounting_code || null,
        receiver_name: values.receiver_name,
        receiver_phone: values.receiver_phone || null,
        receiver_accounting_code: values.receiver_accounting_code || null,
        amount: values.amount,
        payment_date: values.payment_date,
        payment_time: values.payment_time,
        tracking_number: values.tracking_number,
        bank_name: values.bank_name || null,
        receipt_image_url: values.receipt_image_url || null,
        description: values.description || null,
        status: "pending_review" as const,
        created_by: user.id,
      };
      const { data, error } = await supabase
        .from("payment_receipts")
        .insert(payload as never)
        .select("id")
        .single();
      if (error) throw error;
      const receiptId = (data as { id: string }).id;

      // Audit log
      await supabase.from("audit_logs").insert({
        actor_id: user.id,
        entity_type: "payment_receipt",
        entity_id: receiptId,
        action: "payment_receipt_created",
        diff: {
          customer_id: values.customer_id,
          amount: values.amount,
          tracking_number: values.tracking_number,
          bank_name: values.bank_name || null,
          status: "pending_review",
        },
      } as never);

      return { duplicate: false as const, receiptId };
    },
    onSuccess: (result, vars) => {
      if (result.duplicate) {
        setPendingValues(vars.values);
        setDuplicateCount(result.count);
        setDuplicateOpen(true);
        return;
      }
      toast.success("فیش واریزی ثبت شد");
      queryClient.invalidateQueries({ queryKey: ["payment-receipts"] });
      navigate({ to: "/accounting/receipts" });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      toast.error(`ثبت فیش ناموفق بود: ${msg}`);
    },
  });

  return (
    <>
    <form
      onSubmit={form.handleSubmit((v) => mutation.mutate({ values: v }))}
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
                  className={cn(
                    "w-full justify-between font-normal",
                    !selectedCustomer && "text-muted-foreground",
                  )}
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
            {errors.customer_id && (
              <p className="text-xs text-destructive">{errors.customer_id.message}</p>
            )}
          </div>

          {/* اطلاعات واریزکننده */}
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <h3 className="text-sm font-semibold">اطلاعات واریزکننده</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>نام و نام‌خانوادگی <span className="text-destructive">*</span></Label>
                <Input {...form.register("payer_name")} />
                {errors.payer_name && (
                  <p className="text-xs text-destructive">{errors.payer_name.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>شماره موبایل</Label>
                <Input dir="ltr" {...form.register("payer_phone")} />
              </div>
              <div className="space-y-1">
                <Label>کد حسابداری</Label>
                <Input dir="ltr" {...form.register("payer_accounting_code")} />
              </div>
            </div>
          </div>

          {/* اطلاعات گیرنده */}
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <h3 className="text-sm font-semibold">اطلاعات گیرنده وجه</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>نام گیرنده <span className="text-destructive">*</span></Label>
                <Input {...form.register("receiver_name")} />
                {errors.receiver_name && (
                  <p className="text-xs text-destructive">{errors.receiver_name.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>شماره موبایل</Label>
                <Input dir="ltr" {...form.register("receiver_phone")} />
              </div>
              <div className="space-y-1">
                <Label>کد حسابداری</Label>
                <Input dir="ltr" {...form.register("receiver_accounting_code")} />
              </div>
            </div>
          </div>

          {/* جزئیات تراکنش */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>مبلغ (تومان) <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                step="1"
                {...form.register("amount", { valueAsNumber: true })}
              />
              {errors.amount && (
                <p className="text-xs text-destructive">{errors.amount.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>شماره پیگیری <span className="text-destructive">*</span></Label>
              <Input dir="ltr" {...form.register("tracking_number")} />
              {errors.tracking_number && (
                <p className="text-xs text-destructive">{errors.tracking_number.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>تاریخ واریز <span className="text-destructive">*</span></Label>
              <Input type="date" max={today} {...form.register("payment_date")} />
              {errors.payment_date && (
                <p className="text-xs text-destructive">{errors.payment_date.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>ساعت واریز <span className="text-destructive">*</span></Label>
              <Input type="time" {...form.register("payment_time")} />
              {errors.payment_time && (
                <p className="text-xs text-destructive">{errors.payment_time.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>بانک مقصد</Label>
              <Select
                value={form.watch("bank_name") || undefined}
                onValueChange={(v) => form.setValue("bank_name", v)}
              >
                <SelectTrigger><SelectValue placeholder="انتخاب بانک" /></SelectTrigger>
                <SelectContent>
                  {BANKS.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>تصویر فیش (URL)</Label>
              <Input dir="ltr" placeholder="https://..." {...form.register("receipt_image_url")} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>توضیحات</Label>
            <Textarea rows={3} {...form.register("description")} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate({ to: "/accounting/receipts" })}
          disabled={mutation.isPending}
        >
          انصراف
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          ثبت فیش
        </Button>
      </div>
    </form>

    <AlertDialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>احتمال ثبت فیش تکراری</AlertDialogTitle>
          <AlertDialogDescription>
            {`بر اساس شماره پیگیری، مبلغ، تاریخ و بانک، ${toFaDigits(String(duplicateCount))} فیش مشابه قبلاً ثبت شده است. آیا مطمئن هستید که می‌خواهید این فیش را ثبت کنید؟`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              setPendingValues(null);
              setDuplicateCount(0);
            }}
          >
            انصراف
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (pendingValues) {
                mutation.mutate({ values: pendingValues, bypassDuplicate: true });
              }
              setDuplicateOpen(false);
            }}
          >
            ادامه و ثبت
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
