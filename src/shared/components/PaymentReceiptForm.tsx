import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  ReceiptDocumentPicker,
  uploadReceiptDocuments,
} from "@/components/accounting/PaymentReceiptDocuments";
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

/* ------------- Party (payer/receiver) lookup helper ------------- */

type PartyMatch = {
  id: string;
  name: string;
  phone: string | null;
  accounting_code: string | null;
};

function PartyLookup({
  label,
  onPick,
}: {
  label: string;
  onPick: (m: PartyMatch) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 350);

  const { data: matches = [], isFetching } = useQuery<PartyMatch[]>({
    queryKey: ["party-lookup", debounced],
    enabled: open && debounced.trim().length >= 2,
    staleTime: 30_000,
    queryFn: async () => {
      const term = debounced.trim().replace(/[%_]/g, "");
      if (!term) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, accounting_code")
        .or(
          `name.ilike.%${term}%,phone.ilike.%${term}%,accounting_code.ilike.%${term}%`,
        )
        .order("name", { ascending: true })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as PartyMatch[];
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="کد حسابداری، نام یا موبایل..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {debounced.trim().length < 2
                ? "حداقل ۲ کاراکتر وارد کنید"
                : isFetching
                  ? "در حال جستجو..."
                  : "موردی پیدا نشد"}
            </CommandEmpty>
            <CommandGroup>
              {matches.map((m) => (
                <CommandItem
                  key={m.id}
                  value={m.id}
                  onSelect={() => {
                    onPick(m);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <div className="flex w-full flex-col">
                    <span className="text-sm font-medium">{m.name}</span>
                    <span className="text-xs text-muted-foreground" dir="ltr">
                      {m.accounting_code ? toFaDigits(m.accounting_code) : "—"}
                      {m.phone ? ` • ${toFaDigits(m.phone)}` : ""}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const BANKS = [
  "ملی", "ملت", "صادرات", "سپه", "تجارت", "رفاه", "مسکن",
  "کشاورزی", "پاسارگاد", "سامان", "پارسیان", "اقتصاد نوین", "آینده",
];

const DOCUMENT_CHANNELS: { value: string; label: string }[] = [
  { value: "card_to_card", label: "کارت به کارت" },
  { value: "paya", label: "پایا" },
  { value: "pol", label: "پل" },
  { value: "satna", label: "ساتنا" },
  { value: "cash", label: "نقدی" },
  { value: "other", label: "سایر" },
];

const today = new Date().toISOString().slice(0, 10);

/* ------------- Security warnings evaluator ------------- */

function evaluateSecurityWarnings(values: {
  payment_date: string;
  tracking_number: string;
  document_channel: string;
  payer_name_on_receipt?: string;
  has_perforation: boolean;
  is_typed_receipt: boolean;
}): string[] {
  const warnings: string[] = [];
  if (values.payment_date && values.payment_date !== today) {
    warnings.push("تاریخ فیش مربوط به امروز نیست.");
  }
  if (!values.tracking_number || values.tracking_number.trim().length === 0) {
    warnings.push("شماره پیگیری ثبت نشده است.");
  }
  if (values.document_channel === "pol") {
    warnings.push("انتقال از طریق پل انجام شده است؛ نیازمند بررسی بیشتر.");
  }
  if (!values.payer_name_on_receipt || values.payer_name_on_receipt.trim().length === 0) {
    warnings.push("نام واریزکننده روی فیش مشخص نیست.");
  }
  if (!values.has_perforation) {
    warnings.push("فیش پرفراژ ندارد.");
  }
  if (values.is_typed_receipt) {
    warnings.push("فیش تایپی است؛ نیازمند بررسی بیشتر.");
  }
  return warnings;
}

const schema = z.object({
  customer_id: z.string().uuid("انتخاب مشتری الزامی است"),
  receipt_type: z.enum(["payment", "prepayment"]),
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
  source_bank: z.string().trim().max(100).optional().or(z.literal("")),
  destination_bank: z.string().trim().max(100).optional().or(z.literal("")),
  payer_name_on_receipt: z.string().trim().max(150).optional().or(z.literal("")),
  receiver_name_on_receipt: z.string().trim().max(150).optional().or(z.literal("")),
  has_perforation: z.boolean(),
  receipt_time: z
    .string()
    .trim()
    .regex(/^\d{2}:\d{2}$/, "فرمت ساعت HH:MM")
    .optional()
    .or(z.literal("")),
  document_channel: z.union([
    z.enum(["card_to_card","paya","pol","satna","cash","other"]),
    z.literal(""),
  ]),
  is_typed_receipt: z.boolean(),
  receipt_image_url: z.string().trim().max(500).optional().or(z.literal("")),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

type InvoiceOption = {
  id: string;
  number: string | null;
  total_amount: number;
  paid_so_far: number;
  remaining: number;
};

type InvoiceAllocation = {
  invoice_id: string;
  number: string | null;
  total_amount: number;
  remaining: number;
  amount: number;
};

export function PaymentReceiptForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<
    { values: FormValues; allocations: InvoiceAllocation[] } | null
  >(null);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [pendingWarnings, setPendingWarnings] = useState<string[]>([]);
  const [pendingWarningContext, setPendingWarningContext] = useState<
    { values: FormValues; allocations: InvoiceAllocation[] } | null
  >(null);
  const [allocations, setAllocations] = useState<InvoiceAllocation[]>([]);
  const [invoicePickerOpen, setInvoicePickerOpen] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: "",
      receipt_type: "payment",
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
      source_bank: "",
      destination_bank: "",
      payer_name_on_receipt: "",
      receiver_name_on_receipt: "",
      has_perforation: false,
      receipt_time: "",
      document_channel: "",
      is_typed_receipt: false,
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
  const watchedCustomerId = form.watch("customer_id");
  const watchedReceiptType = form.watch("receipt_type");
  const watchedAmount = form.watch("amount") || 0;

  // Reset allocations when customer or receipt type changes (skip first render)
  const allocResetKey = `${watchedCustomerId}|${watchedReceiptType}`;
  const prevAllocResetKey = useRef(allocResetKey);
  useEffect(() => {
    if (prevAllocResetKey.current !== allocResetKey) {
      prevAllocResetKey.current = allocResetKey;
      setAllocations([]);
    }
  }, [allocResetKey]);

  // Open invoices for the selected customer
  const { data: customerInvoices = [] } = useQuery<InvoiceOption[]>({
    queryKey: ["receipt-form-invoices", watchedCustomerId],
    enabled: !!watchedCustomerId && watchedReceiptType === "payment",
    queryFn: async () => {
      const { data: invs, error } = await supabase
        .from("invoices")
        .select("id, number, total_amount, status")
        .eq("customer_id", watchedCustomerId)
        .eq("type", "pre_invoice")
        .in("status", ["draft", "final", "partially_paid"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const list = (invs ?? []) as Array<{ id: string; number: string | null; total_amount: number; status: string }>;
      if (list.length === 0) return [];

      const ids = list.map((i) => i.id);
      const { data: links, error: linkErr } = await supabase
        .from("payment_receipt_links")
        .select("invoice_id, amount, receipt:payment_receipts!inner(status)")
        .in("invoice_id", ids);
      if (linkErr) throw linkErr;
      const paidMap = new Map<string, number>();
      for (const l of (links ?? []) as Array<{ invoice_id: string; amount: number; receipt: { status: string } | null }>) {
        if (l.receipt?.status === "approved") {
          paidMap.set(l.invoice_id, (paidMap.get(l.invoice_id) ?? 0) + Number(l.amount));
        }
      }
      return list.map((i) => {
        const paid = paidMap.get(i.id) ?? 0;
        return {
          id: i.id,
          number: i.number,
          total_amount: Number(i.total_amount),
          paid_so_far: paid,
          remaining: Math.max(0, Number(i.total_amount) - paid),
        };
      });
    },
    staleTime: 30_000,
  });

  const totalAllocated = allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const overAllocated = totalAllocated > watchedAmount;
  const allocationDiff = watchedAmount - totalAllocated;

  const addAllocation = (inv: InvoiceOption) => {
    if (allocations.some((a) => a.invoice_id === inv.id)) return;
    const remainingForReceipt = Math.max(0, watchedAmount - totalAllocated);
    const suggested = Math.min(inv.remaining, remainingForReceipt || inv.remaining);
    setAllocations((prev) => [
      ...prev,
      {
        invoice_id: inv.id,
        number: inv.number,
        total_amount: inv.total_amount,
        remaining: inv.remaining,
        amount: suggested,
      },
    ]);
    setInvoicePickerOpen(false);
  };

  const removeAllocation = (invoiceId: string) => {
    setAllocations((prev) => prev.filter((a) => a.invoice_id !== invoiceId));
  };

  const setAllocationAmount = (invoiceId: string, amount: number) => {
    setAllocations((prev) =>
      prev.map((a) => (a.invoice_id === invoiceId ? { ...a, amount } : a)),
    );
  };

  const mutation = useMutation({
    mutationFn: async (
      args: {
        values: FormValues;
        allocations: InvoiceAllocation[];
        bypassDuplicate?: boolean;
        securityWarnings?: string[];
      },
    ) => {
      const { values, allocations: allocs, bypassDuplicate, securityWarnings = [] } = args;
      if (!user?.id) throw new Error("کاربر شناسایی نشد");

      // Front-end allocation validation (server has no constraint)
      if (values.receipt_type === "payment") {
        if (allocs.length === 0) {
          throw new Error("حداقل یک پیش‌فاکتور برای اتصال انتخاب کنید");
        }
        const sum = allocs.reduce((s, a) => s + Number(a.amount), 0);
        if (sum <= 0) throw new Error("مبلغ تخصیص نامعتبر است");
        if (sum - values.amount > 0.001) {
          throw new Error("مجموع تخصیص بیشتر از مبلغ فیش است");
        }
        for (const a of allocs) {
          if (Number(a.amount) <= 0) throw new Error("مبلغ تخصیص باید مثبت باشد");
          if (Number(a.amount) - a.remaining > 0.001) {
            throw new Error(`مبلغ تخصیص از مانده پیش‌فاکتور ${a.number ?? ""} بیشتر است`);
          }
        }
      }

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
        receipt_type: values.receipt_type,
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
        source_bank: values.source_bank || null,
        destination_bank: values.destination_bank || null,
        payer_name_on_receipt: values.payer_name_on_receipt || null,
        receiver_name_on_receipt: values.receiver_name_on_receipt || null,
        has_perforation: values.has_perforation,
        receipt_time: values.receipt_time || null,
        document_channel: values.document_channel || null,
        is_typed_receipt: values.is_typed_receipt,
        receipt_image_url: values.receipt_image_url || null,
        description: values.description || null,
        security_warnings: securityWarnings,
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

      // Insert links if payment type
      if (values.receipt_type === "payment" && allocs.length > 0) {
        const linkRows = allocs.map((a) => ({
          receipt_id: receiptId,
          invoice_id: a.invoice_id,
          amount: Number(a.amount),
        }));
        const { error: linkErr } = await supabase
          .from("payment_receipt_links")
          .insert(linkRows as never);
        if (linkErr) {
          // Rollback the receipt
          await supabase.from("payment_receipts").delete().eq("id", receiptId);
          throw new Error(`اتصال به پیش‌فاکتور ناموفق: ${linkErr.message}`);
        }
      }

      // Audit log
      await supabase.from("audit_logs").insert({
        actor_id: user.id,
        entity_type: "payment_receipt",
        entity_id: receiptId,
        action: "payment_receipt_created",
        diff: {
          customer_id: values.customer_id,
          receipt_type: values.receipt_type,
          amount: values.amount,
          tracking_number: values.tracking_number,
          bank_name: values.bank_name || null,
          status: "pending_review",
          linked_invoices: values.receipt_type === "payment"
            ? allocs.map((a) => ({ invoice_id: a.invoice_id, amount: Number(a.amount) }))
            : [],
        },
      } as never);

      // Audit: security warnings confirmed
      if (securityWarnings.length > 0) {
        await supabase.from("audit_logs").insert({
          actor_id: user.id,
          entity_type: "payment_receipt",
          entity_id: receiptId,
          action: "receipt_security_warning_confirmed",
          diff: { warnings: securityWarnings },
        } as never);
      }

      // Upload attached documents (best-effort; per-file errors are toasted)
      if (stagedFiles.length > 0) {
        const result = await uploadReceiptDocuments(receiptId, user.id, stagedFiles);
        if (result.uploaded > 0) {
          toast.success(`${toFaDigits(String(result.uploaded))} مستند پیوست شد`);
        }
      }

      return { duplicate: false as const, receiptId };
    },
    onSuccess: (result, vars) => {
      if (result.duplicate) {
        setPendingValues({ values: vars.values, allocations: vars.allocations });
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
      onSubmit={form.handleSubmit((v) => {
        const warnings = evaluateSecurityWarnings({
          payment_date: v.payment_date,
          tracking_number: v.tracking_number,
          document_channel: v.document_channel,
          payer_name_on_receipt: v.payer_name_on_receipt,
          has_perforation: v.has_perforation,
          is_typed_receipt: v.is_typed_receipt,
        });
        if (warnings.length > 0) {
          setPendingWarnings(warnings);
          setPendingWarningContext({ values: v, allocations });
          setWarningsOpen(true);
          return;
        }
        mutation.mutate({ values: v, allocations, securityWarnings: [] });
      })}
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

          {/* نوع فیش */}
          <div className="space-y-2">
            <Label>نوع فیش <span className="text-destructive">*</span></Label>
            <Select
              value={watchedReceiptType}
              onValueChange={(v) => form.setValue("receipt_type", v as "payment" | "prepayment", { shouldValidate: true })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="payment">پرداخت بدهی / پیش‌فاکتور</SelectItem>
                <SelectItem value="prepayment">پیش واریز: اعتبار مثبت</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {watchedReceiptType === "payment"
                ? "این فیش به یک یا چند پیش‌فاکتور مشتری متصل می‌شود."
                : "برای پیش‌واریز، نیازی به انتخاب پیش‌فاکتور نیست. این مبلغ به‌عنوان اعتبار مثبت مشتری ثبت می‌شود."}
            </p>
          </div>

          {/* اتصال به پیش‌فاکتورها */}
          {watchedReceiptType === "payment" && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">اتصال به پیش‌فاکتورها</h3>
                <Popover open={invoicePickerOpen} onOpenChange={setInvoicePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!watchedCustomerId}
                    >
                      <Plus className="ml-1 h-4 w-4" />
                      افزودن پیش‌فاکتور
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="end">
                    <Command>
                      <CommandInput placeholder="جستجو شماره فاکتور..." />
                      <CommandList>
                        <CommandEmpty>پیش‌فاکتور بازی یافت نشد</CommandEmpty>
                        <CommandGroup>
                          {customerInvoices
                            .filter((i) => !allocations.some((a) => a.invoice_id === i.id))
                            .map((inv) => (
                              <CommandItem
                                key={inv.id}
                                value={`${inv.number ?? ""} ${inv.id}`}
                                onSelect={() => addAllocation(inv)}
                              >
                                <div className="flex w-full items-center justify-between gap-2">
                                  <span dir="ltr" className="text-sm">
                                    {toFaDigits(inv.number ?? inv.id.slice(0, 8))}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    مانده: {formatNumber(inv.remaining)}
                                  </span>
                                </div>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {!watchedCustomerId && (
                <p className="text-xs text-muted-foreground">
                  ابتدا مشتری را انتخاب کنید.
                </p>
              )}

              {watchedCustomerId && allocations.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  هنوز پیش‌فاکتوری انتخاب نشده است.
                </p>
              )}

              {allocations.length > 0 && (
                <div className="space-y-2">
                  {allocations.map((a) => (
                    <div
                      key={a.invoice_id}
                      className="flex flex-col gap-2 rounded-md border bg-background p-2 sm:flex-row sm:items-center"
                    >
                      <div className="flex-1 space-y-0.5">
                        <div className="text-sm font-medium" dir="ltr">
                          {toFaDigits(a.number ?? a.invoice_id.slice(0, 8))}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          مبلغ کل: {formatNumber(a.total_amount)} • مانده: {formatNumber(a.remaining)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={a.remaining}
                          value={a.amount || ""}
                          onChange={(e) =>
                            setAllocationAmount(a.invoice_id, Number(e.target.value) || 0)
                          }
                          className="w-36"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeAllocation(a.invoice_id)}
                          aria-label="حذف"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
                    <span>
                      مجموع تخصیص: <strong>{formatNumber(totalAllocated)}</strong> از {formatNumber(watchedAmount)}
                    </span>
                    {overAllocated ? (
                      <span className="text-destructive">
                        مازاد: {formatNumber(totalAllocated - watchedAmount)}
                      </span>
                    ) : allocationDiff > 0 ? (
                      <span className="text-muted-foreground">
                        باقی‌مانده: {formatNumber(allocationDiff)}
                      </span>
                    ) : (
                      <span className="text-primary">برابر</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* اطلاعات واریزکننده */}
          <div className="space-y-3 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">اطلاعات واریزکننده</h3>
              <PartyLookup
                label="جستجو و تکمیل خودکار"
                onPick={(m) => {
                  form.setValue("payer_name", m.name, { shouldValidate: true });
                  form.setValue("payer_phone", m.phone ?? "", { shouldValidate: true });
                  form.setValue("payer_accounting_code", m.accounting_code ?? "", { shouldValidate: true });
                }}
              />
            </div>
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
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">اطلاعات گیرنده وجه</h3>
              <PartyLookup
                label="جستجو و تکمیل خودکار"
                onPick={(m) => {
                  form.setValue("receiver_name", m.name, { shouldValidate: true });
                  form.setValue("receiver_phone", m.phone ?? "", { shouldValidate: true });
                  form.setValue("receiver_accounting_code", m.accounting_code ?? "", { shouldValidate: true });
                }}
              />
            </div>
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

          </div>

          <div className="space-y-1">
            <Label>توضیحات</Label>
            <Textarea rows={3} {...form.register("description")} />
          </div>

          {/* اطلاعات استخراج‌شده از فیش (قابل ویرایش دستی) */}
          <div className="space-y-3 rounded-md border bg-muted/20 p-3">
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">اطلاعات استخراج‌شده از فیش</h3>
              <p className="text-xs text-muted-foreground">
                این فیلدها در آینده می‌توانند به‌صورت خودکار از تصویر فیش استخراج شوند. در حال حاضر به‌صورت دستی توسط حسابدار قابل ویرایش هستند.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>بانک مبدا</Label>
                <Input {...form.register("source_bank")} placeholder="مثلاً ملت" />
              </div>

              <div className="space-y-1">
                <Label>بانک مقصد (روی فیش)</Label>
                <Input {...form.register("destination_bank")} placeholder="مثلاً ملی" />
              </div>

              <div className="space-y-1">
                <Label>نام واریزکننده روی فیش</Label>
                <Input {...form.register("payer_name_on_receipt")} />
              </div>

              <div className="space-y-1">
                <Label>نام گیرنده روی فیش</Label>
                <Input {...form.register("receiver_name_on_receipt")} />
              </div>

              <div className="space-y-1">
                <Label>روش انتقال</Label>
                <Select
                  value={form.watch("document_channel") || undefined}
                  onValueChange={(v) =>
                    form.setValue(
                      "document_channel",
                      v as "card_to_card" | "paya" | "pol" | "satna" | "cash" | "other",
                      { shouldDirty: true },
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب کنید" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_CHANNELS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch("has_perforation")}
                    onCheckedChange={(c) =>
                      form.setValue("has_perforation", c === true, { shouldDirty: true })
                    }
                  />
                  پرفراژ دارد؟
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.watch("is_typed_receipt")}
                    onCheckedChange={(c) =>
                      form.setValue("is_typed_receipt", c === true, { shouldDirty: true })
                    }
                  />
                  فیش تایپی است؟
                </label>
              </div>
            </div>
          </div>

          <ReceiptDocumentPicker
            files={stagedFiles}
            onChange={setStagedFiles}
            disabled={mutation.isPending}
          />
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
        <Button
          type="submit"
          disabled={
            mutation.isPending ||
            (watchedReceiptType === "payment" && (allocations.length === 0 || overAllocated))
          }
        >
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
                mutation.mutate({
                  values: pendingValues.values,
                  allocations: pendingValues.allocations,
                  bypassDuplicate: true,
                });
              }
              setDuplicateOpen(false);
            }}
          >
            ادامه و ثبت
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog open={warningsOpen} onOpenChange={setWarningsOpen}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>هشدارهای امنیتی فیش</AlertDialogTitle>
          <AlertDialogDescription>
            موارد زیر پیش از ثبت فیش نیاز به بررسی دارند:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="list-disc space-y-1 pr-6 text-sm text-foreground">
          {pendingWarnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              setPendingWarnings([]);
              setPendingWarningContext(null);
            }}
          >
            بازگشت و اصلاح
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (pendingWarningContext) {
                mutation.mutate({
                  values: pendingWarningContext.values,
                  allocations: pendingWarningContext.allocations,
                  securityWarnings: pendingWarnings,
                });
              }
              setWarningsOpen(false);
            }}
          >
            ثبت با تأیید حسابدار
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
