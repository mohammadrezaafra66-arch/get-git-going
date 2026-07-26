import { useState, useMemo, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
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
import { toFaDigits, formatNumber, formatDateFa } from "@/lib/i18n/formatters";
import { AdvancePaymentSection } from "@/shared/components/AdvancePaymentSection";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, ShieldCheck } from "lucide-react";
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

/**
 * Release held credit when a credit pre-invoice is cancelled/rejected.
 * Wired here for future cancel button integration (F-9 prep).
 */
export async function releaseInvoiceCredit(params: {
  customerId: string;
  amount: number;
  invoiceId: string;
  userId: string;
}) {
  const { error } = await supabase.rpc("release_credit", {
    p_customer_id: params.customerId,
    p_amount: params.amount,
    p_invoice_id: params.invoiceId,
    p_user_id: params.userId,
  });
  if (error) throw new Error(error.message || "آزادسازی اعتبار با خطا مواجه شد");
}

const itemSchema = z.object({
  product_id: z.string().uuid("انتخاب محصول الزامی است"),
  product_label: z.string().optional(),
  quantity: z.number({ message: "تعداد الزامی است" }).int().min(1, "حداقل ۱"),
  unit_price: z.number({ message: "قیمت الزامی است" }).positive("قیمت باید مثبت باشد"),
});

const schema = z.object({
  customer_id: z.string().uuid("انتخاب مشتری الزامی است"),
  sale_price_type_id: z.string().uuid("انتخاب نوع قیمت الزامی است"),
  settlement_type_id: z.string().uuid().nullable().optional(),
  invoice_type: z.enum(["pre_invoice", "advance_payment"]),
  notes: z.string().max(500).optional(),
  items: z.array(itemSchema).min(1, "حداقل یک قلم اضافه کنید"),
  deposit_amount: z.number().positive().nullable().optional(),
  commitment_confirmed: z.boolean().optional(),
});

type FormValues = z.infer<typeof schema>;

interface InvoiceFormProps {
  /** Optional initial values for edit mode (advance payment fields). */
  initialAdvance?: {
    deposit_amount: number | null;
    commitment_confirmed: boolean;
  };
}

export function InvoiceForm({ initialAdvance }: InvoiceFormProps = {}) {
  const { user, roles } = useAuth();
  const canChooseInvoiceType =
    roles.includes("admin") || roles.includes("manager") || roles.includes("sales");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // Lock the commitment checkbox if it was already confirmed previously (edit mode).
  const commitmentLocked = !!initialAdvance?.commitment_confirmed;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: "",
      sale_price_type_id: "",
      settlement_type_id: null,
      invoice_type: "pre_invoice",
      notes: "",
      items: [],
      deposit_amount: initialAdvance?.deposit_amount ?? null,
      commitment_confirmed: initialAdvance?.commitment_confirmed ?? false,
    },
    mode: "onBlur",
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedItems = form.watch("items");
  const totalAmount = useMemo(
    () =>
      watchedItems.reduce(
        (s, it) => s + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
        0,
      ),
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

  // Real-time credit balance for selected customer (via secure RPC)
  const customerId = form.watch("customer_id");
  const { data: creditInfo } = useQuery({
    queryKey: ["invoice-credit-info", customerId],
    enabled: !!customerId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_customer_dynamic_credit", {
        p_customer_id: customerId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row ?? null;
    },
  });

  const availableCredit = Number(
    (creditInfo as { available_credit?: number } | null)?.available_credit ?? 0,
  );
  const heldCredit = Number((creditInfo as { held_credit?: number } | null)?.held_credit ?? 0);
  const outstanding = Number(
    (creditInfo as { outstanding_balance?: number } | null)?.outstanding_balance ?? 0,
  );
  const hasOverdue = Boolean(
    (creditInfo as { has_overdue?: boolean } | null)?.has_overdue ?? false,
  );
  const overdueSince =
    (creditInfo as { overdue_since?: string | null } | null)?.overdue_since ?? null;
  const settlementScore = Number(
    (creditInfo as { settlement_score?: number } | null)?.settlement_score ?? 0,
  );
  const exceedsLimit = availableCredit > 0 && totalAmount > availableCredit;
  const invoiceType = form.watch("invoice_type");

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

  // Default to the first active price type if the user hasn't picked one yet.
  useEffect(() => {
    const cur = form.getValues("sale_price_type_id");
    if (!cur && priceTypes.length > 0) {
      form.setValue("sale_price_type_id", priceTypes[0].id, { shouldValidate: false });
    }
  }, [priceTypes, form]);

  // Settlement types (active only, sorted)
  const { data: settlementTypes = [] } = useQuery({
    queryKey: ["invoice-form-settlement-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settlement_types")
        .select("id, title, code, sort_order, days")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("title", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const settlementTypeId = form.watch("settlement_type_id") ?? null;
  const selectedSettlement = useMemo(
    () => settlementTypes.find((s) => s.id === settlementTypeId) ?? null,
    [settlementTypes, settlementTypeId],
  );
  const settlementDays = selectedSettlement?.days ?? null;
  const settlementDueDatePreview = useMemo(() => {
    if (settlementDays == null) return null;
    const d = new Date();
    d.setDate(d.getDate() + settlementDays);
    return d.toISOString().slice(0, 10);
  }, [settlementDays]);

  // Price/settlement compatibility validation via RPC
  const { data: settlementValidation } = useQuery({
    queryKey: ["price-settlement-compat", form.watch("sale_price_type_id"), settlementTypeId],
    enabled: !!form.watch("sale_price_type_id") && !!settlementTypeId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("validate_price_settlement_compatibility", {
        p_sale_price_type_id: form.getValues("sale_price_type_id"),
        p_settlement_type_id: settlementTypeId as string,
      });
      if (error) throw error;
      return data as { valid: boolean; message?: string; reason?: string } | null;
    },
    staleTime: 30_000,
  });
  const settlementInvalid =
    !!settlementValidation && settlementValidation.valid === false;
  const settlementErrorMsg = settlementInvalid
    ? settlementValidation?.message || "نوع تسویه انتخاب‌شده با نوع قیمت سازگار نیست."
    : null;

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!user?.id) throw new Error("کاربر شناسایی نشد");
      const total = values.items.reduce((s, it) => s + it.quantity * it.unit_price, 0);

      // ===== Price bounds pre-flight (per item) =====
      // Re-check via RPC to avoid stale client cache; trigger is final defense.
      for (const it of values.items) {
        const { data: bData, error: bErr } = await supabase.rpc("get_product_price_bounds", {
          _product_id: it.product_id,
          _sale_price_type_id: values.sale_price_type_id,
        });
        if (bErr) throw bErr;
        const b = (Array.isArray(bData) ? bData[0] : bData) as {
          min_price: number | null;
          max_price: number | null;
          cap_price: number | null;
          selected_price: number | null;
          has_any: boolean;
        } | null;
        const label = it.product_label || "محصول";
        if (!b || !b.has_any) {
          throw new Error(`برای «${label}» هنوز قیمت فروشی ثبت نشده — ابتدا قیمت‌گذاری کنید.`);
        }
        if (b.min_price != null && it.unit_price < Number(b.min_price)) {
          throw new Error(
            `قیمت «${label}» (${formatNumber(it.unit_price)}) از کمترین قیمت فروش ثبت‌شده (${formatNumber(Number(b.min_price))}) کمتر است.`,
          );
        }
        if (b.selected_price != null && it.unit_price < Number(b.selected_price)) {
          throw new Error(
            `قیمت «${label}» (${formatNumber(it.unit_price)}) از قیمت قانون نوع قیمت انتخاب‌شده (${formatNumber(Number(b.selected_price))}) کمتر است.`,
          );
        }
        if (b.cap_price != null && it.unit_price > Number(b.cap_price)) {
          throw new Error(
            `قیمت «${label}» (${formatNumber(it.unit_price)}) بیش از سقف مجاز (${formatNumber(Number(b.cap_price))} = ۱.۰۵×بالاترین قیمت) است.`,
          );
        }
      }

      // Phase 21.4: Overdue blocker — backend trigger هم enforce می‌کند، این فقط UX است.
      const willCommit =
        values.invoice_type === "pre_invoice" ||
        (values.invoice_type === "advance_payment" && !!values.commitment_confirmed);
      if (willCommit) {
        const { data: ovd, error: ovdErr } = await supabase.rpc("can_issue_customer_invoice", {
          p_customer_id: values.customer_id,
        });
        if (ovdErr) throw ovdErr;
        const ovRow = Array.isArray(ovd) ? ovd[0] : ovd;
        if (ovRow && (ovRow as { can_issue?: boolean }).can_issue === false) {
          const amt = Number((ovRow as { overdue_amount?: number }).overdue_amount ?? 0);
          const cnt = Number((ovRow as { overdue_count?: number }).overdue_count ?? 0);
          const oldest = (ovRow as { oldest_due_date?: string | null }).oldest_due_date ?? null;
          // audit ثبت بلاک از طریق RPC امن (Phase 21.4C). جلوگیری از insert مستقیم/جعلی توسط frontend.
          await supabase.rpc("log_invoice_issuance_blocked_overdue", {
            p_customer_id: values.customer_id,
            p_overdue_amount: amt,
            p_overdue_count: cnt,
            p_oldest_due_date: (oldest ?? null) as unknown as string,
            p_invoice_type: values.invoice_type,
            p_commitment_confirmed: !!values.commitment_confirmed,
          });
          throw new Error(
            `این مشتری دارای مانده معوق است و تا زمان تسویه، امکان صدور فاکتور یا پیش‌فاکتور جدید ندارد. مبلغ معوق: ${amt.toLocaleString("fa-IR")} تومان، تعداد فاکتور معوق: ${cnt}${oldest ? `، قدیمی‌ترین سررسید: ${oldest}` : ""}. مشاهده گزارش: /accounting/receivables`,
          );
        }
      }

      // Credit pre-flight check for credit pre-invoices only (real-time balance)
      if (values.invoice_type === "pre_invoice") {
        const { data: cc, error: ccErr } = await supabase.rpc("get_customer_dynamic_credit", {
          p_customer_id: values.customer_id,
        });
        if (ccErr) throw ccErr;
        const row = Array.isArray(cc) ? cc[0] : cc;
        const avail = Number((row as { available_credit?: number } | null)?.available_credit ?? 0);
        if (avail < total) {
          await supabase.from("audit_logs").insert({
            actor_id: user.id,
            entity_type: "invoice",
            entity_id: values.customer_id,
            action: "credit_limit_blocked",
            diff: {
              customer_id: values.customer_id,
              total_amount: total,
              available_credit: avail,
            },
          } as never);
          throw new Error(
            "اعتبار مشتری برای این مبلغ کافی نیست. لطفاً از پیش‌فاکتور پیش‌واریزی استفاده کنید.",
          );
        }
      }

      // Advance-payment validation
      let depositAmt: number | null = null;
      let commitment = false;
      if (values.invoice_type === "advance_payment") {
        depositAmt = Number(values.deposit_amount ?? 0);
        commitment = !!values.commitment_confirmed;
        const minRequired = Math.ceil(total * 0.3);
        if (!depositAmt || depositAmt <= 0) {
          throw new Error("مبلغ بیعانه الزامی است");
        }
        if (depositAmt < minRequired) {
          throw new Error(
            `مبلغ بیعانه باید حداقل ۳۰٪ مبلغ کل (${minRequired.toLocaleString("fa-IR")} تومان) باشد`,
          );
        }
        if (!commitment) {
          throw new Error("تأیید تعهد فروشنده الزامی است");
        }
      }

      // Phase 22.2C: Capital allocation pre-flight for capital-committing invoices
      // (pre_invoice OR advance_payment with commitment_confirmed)
      const capitalCommitting =
        values.invoice_type === "pre_invoice" ||
        (values.invoice_type === "advance_payment" && !!values.commitment_confirmed);
      if (capitalCommitting) {
        const { data: capChk, error: capChkErr } = await supabase.rpc(
          "can_use_customer_capital_allocation",
          { p_customer_id: values.customer_id, p_amount: total },
        );
        if (capChkErr) {
          throw new Error("برای فروش حساب‌باز، سرمایه روز و تخصیص سرمایه فعال لازم است.");
        }
        const capRow = Array.isArray(capChk) ? capChk[0] : capChk;
        if (!capRow || (capRow as { can_use?: boolean }).can_use !== true) {
          const reason = (capRow as { reason?: string } | null)?.reason ?? "";
          throw new Error(
            `سهم سرمایه تخصیص‌یافته برای این مشتری/فروشنده کافی نیست.${reason ? ` (${reason})` : ""}`,
          );
        }
      }

      const { data: inv, error: iErr } = await supabase
        .from("invoices")
        .insert({
          customer_id: values.customer_id,
          sale_price_type_id: values.sale_price_type_id,
          settlement_type_id: values.settlement_type_id ?? null,
          type: "pre_invoice",
          invoice_type: values.invoice_type,
          issued_by: user.id,
          status: "draft",
          total_amount: total,
          subtotal: total,
          notes: values.notes || null,
          created_by: user.id,
          deposit_amount: depositAmt,
          commitment_confirmed: commitment,
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

      // Hold credit for credit pre-invoices (race-safe via FOR UPDATE inside RPC)
      if (values.invoice_type === "pre_invoice") {
        const { error: holdErr } = await supabase.rpc("hold_credit", {
          p_customer_id: values.customer_id,
          p_amount: total,
          p_invoice_id: invoiceId,
          p_user_id: user.id,
        });
        if (holdErr) {
          // Roll back invoice if hold fails (e.g. concurrent overuse)
          await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
          await supabase.from("invoices").delete().eq("id", invoiceId);
          throw new Error(holdErr.message || "ثبت اعتبار با خطا مواجه شد");
        }
      }

      // Phase 22.2C: Hold capital allocation for capital-committing invoices.
      // Runs AFTER hold_credit. On failure, release credit (if held) then drop invoice/items.
      if (capitalCommitting) {
        const { error: capHoldErr } = await supabase.rpc("hold_capital_allocation", {
          p_customer_id: values.customer_id,
          p_amount: total,
          p_invoice_id: invoiceId,
          p_user_id: user.id,
        });
        if (capHoldErr) {
          if (values.invoice_type === "pre_invoice") {
            await supabase.rpc("release_credit", {
              p_customer_id: values.customer_id,
              p_amount: total,
              p_invoice_id: invoiceId,
              p_user_id: user.id,
            });
          }
          await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);
          await supabase.from("invoices").delete().eq("id", invoiceId);
          throw new Error(capHoldErr.message || "ثبت سهم سرمایه با خطا مواجه شد");
        }
      }

      // Audit log for advance payment issuance
      if (values.invoice_type === "advance_payment") {
        await supabase.from("audit_logs").insert({
          actor_id: user.id,
          entity_type: "invoice",
          entity_id: invoiceId,
          action: "advance_payment_issued",
          diff: {
            invoice_id: invoiceId,
            customer_id: values.customer_id,
            issued_by: user.id,
            issued_by_name: user.email ?? null,
            total_amount: total,
            deposit_amount: depositAmt,
            commitment_confirmed: commitment,
            issued_at: new Date().toISOString(),
          },
        } as never);
      }

      return invoiceId;
    },
    onSuccess: () => {
      toast.success("پیش‌فاکتور ذخیره شد");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-credit-info"] });
      navigate({ to: "/sales/invoices" });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      if (msg.includes("CUSTOMER_OVERDUE")) {
        toast.error("این مشتری مانده معوق دارد. صدور فاکتور امکان‌پذیر نیست.");
      } else {
        toast.error(`ثبت ناموفق بود: ${msg}`);
      }
    },
  });

  const errors = form.formState.errors;
  const salePriceTypeId = form.watch("sale_price_type_id");

  return (
    <form
      onSubmit={form.handleSubmit(
        (v) => {
          setSubmitAttempted(true);
          mutation.mutate(v);
        },
        () => setSubmitAttempted(true),
      )}
      className="space-y-6"
      dir="rtl"
    >
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* مشتری */}
          <div className="space-y-2">
            <Label>
              مشتری <span className="text-destructive">*</span>
            </Label>
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
                          <Check
                            className={cn(
                              "ml-2 h-4 w-4",
                              c.id === form.watch("customer_id") ? "opacity-100" : "opacity-0",
                            )}
                          />
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

          {/* Credit info (real-time via get_customer_credit) */}
          {selectedCustomer && creditInfo && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <ShieldCheck className="h-4 w-4" />
                وضعیت اعتباری مشتری (لحظه‌ای)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <span className="text-muted-foreground">اعتبار قابل استفاده: </span>
                  <span className="font-semibold">{formatNumber(availableCredit)} تومان</span>
                </div>
                <div>
                  <span className="text-muted-foreground">بدهی جاری: </span>
                  <span className="font-semibold">{formatNumber(outstanding)} تومان</span>
                </div>
                {heldCredit > 0 && (
                  <div>
                    <span className="text-muted-foreground">اعتبار مسدودشده: </span>
                    <span className="font-semibold">{formatNumber(heldCredit)} تومان</span>
                  </div>
                )}
              </div>
            </div>
          )}
          {exceedsLimit && (
            <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/30">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-900 dark:text-amber-200">
                مبلغ فاکتور ({formatNumber(totalAmount)} تومان) به همراه بدهی جاری از سقف اعتبار
                مشتری فراتر می‌رود.
              </AlertDescription>
            </Alert>
          )}
          {selectedCustomer && hasOverdue && (
            <Alert className="border-destructive bg-destructive/10">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-destructive font-medium">
                ⛔ این مشتری مانده معوق دارد — صدور فاکتور غیرمجاز است
                {overdueSince && (
                  <span className="block text-xs mt-1 font-normal">
                    معوق از: {toFaDigits(overdueSince)}
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}
          {selectedCustomer && !hasOverdue && settlementScore < -20 && (
            <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/30">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-900 dark:text-amber-200">
                ⚠️ امتیاز تسویه این مشتری منفی است ({toFaDigits(settlementScore)})
              </AlertDescription>
            </Alert>
          )}

          {/* نوع قیمت */}
          <div className="space-y-2">
            <Label>
              نوع قیمت فروش <span className="text-destructive">*</span>
            </Label>
            <Select
              value={form.watch("sale_price_type_id")}
              onValueChange={(v) =>
                form.setValue("sale_price_type_id", v, { shouldValidate: true })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="انتخاب نوع قیمت" />
              </SelectTrigger>
              <SelectContent>
                {priceTypes.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.sale_price_type_id && (
              <p className="text-xs text-destructive">{errors.sale_price_type_id.message}</p>
            )}
          </div>

          {/* نوع پیش‌فاکتور */}
          {canChooseInvoiceType && (
            <div className="space-y-2">
              <Label>
                نوع پیش‌فاکتور <span className="text-destructive">*</span>
              </Label>
              <Select
                value={invoiceType}
                onValueChange={(v) =>
                  form.setValue("invoice_type", v as "pre_invoice" | "advance_payment", {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pre_invoice">پیش‌فاکتور اعتباری</SelectItem>
                  <SelectItem value="advance_payment">پیش‌فاکتور پیش‌واریزی (نقدی)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {invoiceType === "advance_payment" && (
            <AdvancePaymentSection
              totalAmount={totalAmount}
              depositAmount={form.watch("deposit_amount") ?? null}
              onDepositChange={(v) => form.setValue("deposit_amount", v, { shouldValidate: true })}
              commitmentConfirmed={!!form.watch("commitment_confirmed")}
              onCommitmentChange={(v) =>
                form.setValue("commitment_confirmed", v, { shouldValidate: true })
              }
              commitmentLocked={commitmentLocked}
              showErrors={submitAttempted}
            />
          )}

          {/* نوع تسویه */}
          <div className="space-y-2">
            <Label>
              نوع تسویه
              {settlementDays != null && settlementDays > 0 && (
                <span className="mr-1 text-xs text-muted-foreground">
                  ({toFaDigits(settlementDays)} روزه)
                </span>
              )}
            </Label>
            <Select
              value={form.watch("settlement_type_id") ?? "__none"}
              onValueChange={(v) =>
                form.setValue("settlement_type_id", v === "__none" ? null : v, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="انتخاب نوع تسویه (اختیاری)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">—</SelectItem>
                {settlementTypes.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title}
                    {s.days > 0 ? ` (${toFaDigits(s.days)} روزه)` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {settlementDueDatePreview && (
              <p className="text-sm text-muted-foreground">
                تاریخ تسویه: {formatDateFa(settlementDueDatePreview)}
              </p>
            )}
            {settlementErrorMsg && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{settlementErrorMsg}</AlertDescription>
              </Alert>
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
                remove={remove}
                salePriceTypeId={salePriceTypeId}
                priceTypes={priceTypes}
                onChangeSalePriceType={(id) =>
                  form.setValue("sale_price_type_id", id, { shouldValidate: true })
                }
              />
            ))}
          </div>

          {errors.items && !Array.isArray(errors.items) && (
            <p className="text-xs text-destructive">
              {(errors.items as { message?: string }).message}
            </p>
          )}

          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">جمع کل</span>
            <span className="text-lg font-bold">{formatNumber(totalAmount)} تومان</span>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Label htmlFor="notes">توضیحات</Label>
        <Textarea id="notes" rows={3} maxLength={500} {...form.register("notes")} />
      </div>

      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={mutation.isPending || hasOverdue || settlementInvalid}
          className="flex-1"
          onClick={() => {
            if (settlementInvalid && settlementErrorMsg) {
              toast.error(settlementErrorMsg);
            }
          }}
        >
          {mutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
          ذخیره پیش‌فاکتور
        </Button>
        <Button type="button" variant="outline" onClick={() => navigate({ to: "/sales/invoices" })}>
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
  remove: (i: number) => void;
  salePriceTypeId: string;
  priceTypes: Array<{ id: string; title: string; code: string | null }>;
  onChangeSalePriceType: (id: string) => void;
}

function ItemRow({
  index,
  form,
  remove,
  salePriceTypeId,
  priceTypes,
  onChangeSalePriceType,
}: ItemRowProps) {
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

  // Bounds for price validation (floor + 5% cap)
  const { data: bounds } = useQuery({
    queryKey: ["price-bounds", productId, salePriceTypeId],
    enabled: !!productId && !!salePriceTypeId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_product_price_bounds", {
        _product_id: productId,
        _sale_price_type_id: salePriceTypeId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as {
        min_price: number | null;
        max_price: number | null;
        cap_price: number | null;
        selected_price: number | null;
        has_any: boolean;
      } | null;
    },
  });

  // Compute violation (if any) for current price
  let priceViolation: string | null = null;
  if (bounds && productId && salePriceTypeId && price > 0) {
    if (!bounds.has_any) {
      priceViolation = "برای این محصول هیچ قیمت فروشی ثبت نشده — ابتدا قیمت‌گذاری کنید.";
    } else if (bounds.min_price != null && price < Number(bounds.min_price)) {
      priceViolation = `کمتر از کف مجاز (${formatNumber(Number(bounds.min_price))}) است.`;
    } else if (bounds.selected_price != null && price < Number(bounds.selected_price)) {
      priceViolation = `کمتر از قیمت قانون نوع قیمت انتخاب‌شده (${formatNumber(Number(bounds.selected_price))}) است.`;
    } else if (bounds.cap_price != null && price > Number(bounds.cap_price)) {
      priceViolation = `بیش از سقف مجاز (${formatNumber(Number(bounds.cap_price))} = ۱.۰۵×بالاترین قیمت) است.`;
    }
  }

  const errors = form.formState.errors.items?.[index];

  // همه قیمت‌های فعال محصول (برای نمایش و انتخاب نوع قیمت)
  const { data: productPrices = [] } = useQuery({
    queryKey: ["invoice-form-item-prices", productId],
    enabled: !!productId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("product_computed_prices_public")
        .select("sale_price_type_id, rounded_sale_price")
        .eq("product_id", productId);
      if (error) throw error;
      const map = new Map<string, number>();
      for (const r of (data ?? []) as Array<{
        sale_price_type_id: string;
        rounded_sale_price: number | string;
      }>) {
        const n = Number(r.rounded_sale_price);
        if (Number.isFinite(n) && n > 0) map.set(r.sale_price_type_id, n);
      }
      return priceTypes
        .filter((t) => map.has(t.id))
        .map((t) => ({ id: t.id, title: t.title, price: map.get(t.id)! }));
    },
  });

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
                className={cn(
                  "w-full justify-between font-normal",
                  !productId && "text-muted-foreground",
                )}
              >
                {productLabel || "انتخاب محصول..."}
                <ChevronsUpDown className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="نام یا کد محصول..."
                  value={search}
                  onValueChange={setSearch}
                />
                <CommandList>
                  <CommandEmpty>محصولی یافت نشد</CommandEmpty>
                  <CommandGroup>
                    {products.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={p.id}
                        onSelect={() => {
                          form.setValue(`items.${index}.product_id`, p.id, {
                            shouldValidate: true,
                          });
                          form.setValue(
                            `items.${index}.product_label`,
                            `${p.name}${p.sku ? ` (${p.sku})` : ""}`,
                          );
                          // reset price so the RPC effect can populate it
                          form.setValue(`items.${index}.unit_price`, 0);
                          setOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "ml-2 h-4 w-4",
                            p.id === productId ? "opacity-100" : "opacity-0",
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
          {errors?.product_id && (
            <p className="text-xs text-destructive">{errors.product_id.message}</p>
          )}
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

      {productId && productPrices.length > 0 && (
        <div className="space-y-1">
          <Label className="text-xs">انواع قیمت این محصول</Label>
          <div className="flex flex-wrap gap-1.5">
            {productPrices.map((p) => {
              const active = p.id === salePriceTypeId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChangeSalePriceType(p.id);
                    form.setValue(`items.${index}.unit_price`, p.price, { shouldValidate: true });
                  }}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition",
                    active
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border bg-background hover:bg-accent",
                  )}
                >
                  <span>{p.title}</span>
                  <span className="mx-1 text-muted-foreground">·</span>
                  <span className="tabular-nums">{formatNumber(p.price)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

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
          {errors?.quantity && (
            <p className="text-xs text-destructive">{errors.quantity.message}</p>
          )}
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
          {errors?.unit_price && (
            <p className="text-xs text-destructive">{errors.unit_price.message}</p>
          )}
          {priceViolation && <p className="text-xs text-destructive">{priceViolation}</p>}
          {bounds && bounds.has_any && (
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              کف: {formatNumber(Number(bounds.min_price ?? 0))}
              {bounds.selected_price != null && (
                <> — کف نوع قیمت: {formatNumber(Number(bounds.selected_price))}</>
              )}
              {bounds.cap_price != null && (
                <> — سقف ۱.۰۵×: {formatNumber(Number(bounds.cap_price))}</>
              )}
            </p>
          )}
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
