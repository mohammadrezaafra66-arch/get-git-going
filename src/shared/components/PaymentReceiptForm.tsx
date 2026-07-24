import { useState, useEffect, useRef, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Check, ChevronsUpDown, Plus, Trash2, Sparkles } from "lucide-react";
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
import { extractReceiptFromBytes } from "@/lib/receipt-ocr-bytes.functions";
import { parseReceiptText } from "@/lib/accounting/receipt-extraction";
import {
  RECEIPT_TYPES,
  RECEIPT_TYPE_FA,
  RECEIPT_TYPE_HINT_FA,
  requiresInvoiceLinks,
  type ReceiptType,
} from "@/lib/receipts/receipt-types";
import { parseDateToGregorianIso, isoToJalaliDisplay } from "@/lib/i18n/jalali";
import { JalaliDateInput } from "@/shared/components/JalaliDateInput";
import {
  WaybillCustomFieldsInput,
  validateCustomData,
  type CustomFieldDef,
  type CustomData,
} from "@/shared/components/WaybillCustomFieldsInput";
import {
  evaluateReceiptSecurityWarnings,
  type ReceiptSecurityWarning,
} from "@/lib/accounting/receipt-security";
import {
  fetchValidationRules,
  evaluateRules,
  splitViolations,
  type RuleViolation,
} from "@/lib/validation/rules";
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

/* ------------- Party (payer/receiver) lookup helper ------------- */

type PartyMatch = {
  id: string;
  name: string;
  phone: string | null;
  accounting_code: string | null;
};

function PartyLookup({ label, onPick }: { label: string; onPick: (m: PartyMatch) => void }) {
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
        .or(`name.ilike.%${term}%,phone.ilike.%${term}%,accounting_code.ilike.%${term}%`)
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

const DOCUMENT_CHANNELS: { value: string; label: string }[] = [
  { value: "card_to_card", label: "کارت به کارت" },
  { value: "paya", label: "پایا" },
  { value: "pol", label: "پل" },
  { value: "satna", label: "ساتنا" },
  { value: "cash", label: "نقدی" },
  { value: "other", label: "سایر" },
];

const today = new Date().toISOString().slice(0, 10);

/* ------------- Security warnings evaluator (shared) ------------- */

function evaluateFormWarnings(values: {
  payment_date: string;
  tracking_number: string;
  amount?: number;
  document_channel: string;
  payer_name_on_receipt?: string;
  has_perforation: boolean;
  is_typed_receipt: boolean;
}): ReceiptSecurityWarning[] {
  return evaluateReceiptSecurityWarnings({
    payment_date: values.payment_date,
    tracking_number: values.tracking_number,
    amount: values.amount,
    document_channel: values.document_channel,
    payer_name_on_receipt: values.payer_name_on_receipt,
    has_perforation: values.has_perforation,
    is_typed_receipt: values.is_typed_receipt,
  });
}

const schema = z
  .object({
    customer_id: z.string().uuid("انتخاب مشتری الزامی است"),
    receipt_type: z.enum(RECEIPT_TYPES),
    payer_name: z.string().trim().min(2, "حداقل ۲ کاراکتر").max(150, "حداکثر ۱۵۰ کاراکتر"),
    payer_phone: z.string().trim().max(30).optional().or(z.literal("")),
    payer_accounting_code: z.string().trim().max(50).optional().or(z.literal("")),
    receiver_name: z.string().trim().min(2, "حداقل ۲ کاراکتر").max(150, "حداکثر ۱۵۰ کاراکتر"),
    receiver_phone: z.string().trim().max(30).optional().or(z.literal("")),
    receiver_accounting_code: z.string().trim().max(50).optional().or(z.literal("")),
    beneficiary_accounting_code: z.string().trim().max(50).optional().or(z.literal("")),
    amount: z
      .number({ message: "مبلغ الزامی است" })
      .positive("مبلغ باید مثبت باشد")
      .max(1e12, "مبلغ نامعتبر است (حداکثر ۱۰۰۰ میلیارد تومان)"),
    payment_date: z
      .string()
      .min(1, "تاریخ الزامی است")
      .refine((d) => d <= today, "تاریخ نمی‌تواند در آینده باشد"),
    payment_time: z.string().regex(/^\d{2}:\d{2}$/, "فرمت ساعت HH:MM"),
    tracking_number: z
      .string()
      .trim()
      .min(1, "شماره پیگیری الزامی است")
      .max(100, "حداکثر ۱۰۰ کاراکتر"),
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
      z.enum(["card_to_card", "paya", "pol", "satna", "cash", "other"]),
      z.literal(""),
    ]),
    is_typed_receipt: z.boolean(),
    receipt_image_url: z.string().trim().max(500).optional().or(z.literal("")),
    description: z.string().trim().max(1000).optional().or(z.literal("")),
    source_bank_account_id: z.string().uuid().optional().or(z.literal("")),
    destination_bank_account_id: z.string().uuid().optional().or(z.literal("")),
    receiver_party_id: z.string().uuid().optional().or(z.literal("")),
  })
  .refine((v) => Boolean(v.destination_bank_account_id) !== Boolean(v.receiver_party_id), {
    message: "گیرنده باید دقیقاً یکی باشد: «بانک ما» یا «طرف خارجی» (نه هر دو، نه هیچ‌کدام).",
    path: ["receiver_party_id"],
  });

type FormValues = z.infer<typeof schema>;

type InvoiceOption = {
  id: string;
  number: string | null;
  total_amount: number;
  paid_so_far: number;
  remaining: number;
  issue_date: string | null;
  due_date: string | null;
};

type InvoiceAllocation = {
  quote_id: string;
  number: string | null;
  total_amount: number;
  remaining: number;
  amount: number;
  suggestion?: {
    confidence: "high" | "medium" | "low";
    reason: string;
  };
};

export function PaymentReceiptForm() {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<{
    values: FormValues;
    allocations: InvoiceAllocation[];
  } | null>(null);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [pendingWarnings, setPendingWarnings] = useState<ReceiptSecurityWarning[]>([]);
  const [pendingRuleWarnings, setPendingRuleWarnings] = useState<RuleViolation[]>([]);
  const [blockingViolations, setBlockingViolations] = useState<RuleViolation[]>([]);
  const [blockingOpen, setBlockingOpen] = useState(false);
  const [pendingWarningContext, setPendingWarningContext] = useState<{
    values: FormValues;
    allocations: InvoiceAllocation[];
  } | null>(null);
  const [allocations, setAllocations] = useState<InvoiceAllocation[]>([]);
  const [invoicePickerOpen, setInvoicePickerOpen] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [customData, setCustomData] = useState<CustomData>({});
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({});
  const [autoFilling, setAutoFilling] = useState(false);
  const autoExtractedRef = useRef<Set<string>>(new Set());

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: "",
      receipt_type: "invoice_payment",
      payer_name: "",
      payer_phone: "",
      payer_accounting_code: "",
      receiver_name: "",
      receiver_phone: "",
      receiver_accounting_code: "",
      beneficiary_accounting_code: "",
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
      source_bank_account_id: "",
      destination_bank_account_id: "",
      receiver_party_id: "",
    },
    mode: "onBlur",
  });

  const errors = form.formState.errors;

  /* ---- Auto-extract & autofill on new file pick (admin/accountant only) ---- */
  useEffect(() => {
    let cancelled = false;
    async function processNew() {
      const fresh = stagedFiles.filter(
        (f) => !autoExtractedRef.current.has(`${f.name}|${f.size}|${f.lastModified}`),
      );
      if (fresh.length === 0) return;
      for (const f of fresh) {
        autoExtractedRef.current.add(`${f.name}|${f.size}|${f.lastModified}`);
      }
      setAutoFilling(true);
      try {
        for (const file of fresh) {
          // Read as base64
          const buf = await file.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let bin = "";
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          const b64 = btoa(bin);
          let ocr;
          try {
            const token = session?.access_token;
            if (!token) {
              toast.error("برای استخراج خودکار باید وارد شده باشید.");
              continue;
            }
            ocr = await extractReceiptFromBytes({
              data: {
                file_name: file.name,
                mime: file.type || "application/octet-stream",
                base64: b64,
              },
              headers: { Authorization: `Bearer ${token}` },
            });
          } catch (err) {
            let msg = "خطای ناشناخته";
            if (err instanceof Response) {
              try {
                msg = await err.text();
              } catch {
                /* noop */
              }
            } else if (err instanceof Error) {
              msg = err.message;
            }
            toast.error(`استخراج خودکار «${file.name}» ناموفق: ${msg.slice(0, 200)}`);
            continue;
          }
          if (cancelled) return;
          // SH-RA.2B-UI: explicit message when server reports OCR disabled.
          if (
            ocr &&
            (ocr as { disabled?: boolean; reason?: string }).disabled === true &&
            (ocr as { reason?: string }).reason === "ocr_disabled"
          ) {
            toast.info("OCR در دسترس نیست، لطفاً دستی وارد کنید.");
            continue;
          }
          if (!ocr || !ocr.raw_text || !ocr.raw_text.trim()) {
            const warnings = ocr?.warnings ?? [];
            if (warnings.length > 0) {
              toast.info(warnings[0]);
            }
            continue;
          }
          const parsed = parseReceiptText(ocr.raw_text);
          const filled: string[] = [];

          // Only fill empty fields to avoid overriding manual edits.
          // گارد اضافی: مبالغ غیرمنطقی (مثل شماره کارت تشخیص داده‌شده اشتباه) را نادیده بگیر.
          if (
            parsed.amount != null &&
            parsed.amount > 0 &&
            parsed.amount <= 1e12 &&
            !form.getValues("amount")
          ) {
            form.setValue("amount", parsed.amount, { shouldValidate: true, shouldDirty: true });
            filled.push("مبلغ");
          }
          if (parsed.tracking_number && !form.getValues("tracking_number")) {
            form.setValue("tracking_number", parsed.tracking_number, {
              shouldValidate: true,
              shouldDirty: true,
            });
            filled.push("شماره پیگیری");
          }
          if (parsed.receipt_date) {
            const iso = parseDateToGregorianIso(parsed.receipt_date);
            if (iso && iso <= today && !form.getValues("payment_date")) {
              form.setValue("payment_date", iso, { shouldValidate: true, shouldDirty: true });
              filled.push("تاریخ واریز");
            }
          }
          if (parsed.receipt_time && !form.getValues("payment_time")) {
            const tm = /^(\d{1,2}):(\d{2})/.exec(parsed.receipt_time);
            if (tm) {
              const hh = tm[1].padStart(2, "0");
              form.setValue("payment_time", `${hh}:${tm[2]}`, { shouldDirty: true });
              form.setValue("receipt_time", `${hh}:${tm[2]}`, { shouldDirty: true });
              filled.push("ساعت");
            }
          }
          if (parsed.source_bank && !form.getValues("source_bank")) {
            form.setValue("source_bank", parsed.source_bank, { shouldDirty: true });
            filled.push("بانک مبدأ");
          }
          if (parsed.destination_bank && !form.getValues("destination_bank")) {
            form.setValue("destination_bank", parsed.destination_bank, { shouldDirty: true });
            filled.push("بانک مقصد");
          }
          if (parsed.payer_name_on_receipt && !form.getValues("payer_name_on_receipt")) {
            form.setValue("payer_name_on_receipt", parsed.payer_name_on_receipt, {
              shouldDirty: true,
            });
          }
          if (parsed.receiver_name_on_receipt && !form.getValues("receiver_name_on_receipt")) {
            form.setValue("receiver_name_on_receipt", parsed.receiver_name_on_receipt, {
              shouldDirty: true,
            });
          }
          if (
            parsed.document_channel &&
            parsed.document_channel !== "unknown" &&
            !form.getValues("document_channel")
          ) {
            form.setValue("document_channel", parsed.document_channel, { shouldDirty: true });
          }

          if (filled.length > 0) {
            toast.success(`به‌صورت خودکار از فیش پر شد: ${filled.join("، ")}`);
          } else {
            toast.info("استخراج انجام شد ولی فیلد قابل اطمینانی پیدا نشد؛ لطفاً دستی پر کنید.");
          }
        }
      } finally {
        if (!cancelled) setAutoFilling(false);
      }
    }
    processNew();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stagedFiles]);

  // Customer search
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const debouncedCustomer = useDebounce(customerSearch, 350);

  // Validation rules for receipt scope
  const { data: receiptRules = [] } = useQuery({
    queryKey: ["validation-rules", "receipt"],
    queryFn: () => fetchValidationRules("receipt"),
    staleTime: 5 * 60_000,
  });
  const { data: journalRules = [] } = useQuery({
    queryKey: ["validation-rules", "journal_entry"],
    queryFn: () => fetchValidationRules("journal_entry"),
    staleTime: 5 * 60_000,
  });

  // Resolve party by accounting code (autofill name/phone)
  async function resolveByAccountingCode(code: string): Promise<{
    name?: string;
    phone?: string | null;
    valid: boolean;
  }> {
    const c = code.trim();
    if (!c) return { valid: false };
    const { data: cust } = await supabase
      .from("customers")
      .select("id, name, phone")
      .eq("accounting_code" as never, c as never)
      .maybeSingle();
    if (cust)
      return {
        name: (cust as { name: string }).name,
        phone: (cust as { phone: string | null }).phone,
        valid: true,
      };
    const { data: ext } = await supabase
      .from("external_parties")
      .select("id, full_name, phone")
      .eq("accounting_code" as never, c as never)
      .maybeSingle();
    if (ext)
      return {
        name: (ext as { full_name: string }).full_name,
        phone: (ext as { phone: string | null }).phone,
        valid: true,
      };
    return { valid: false };
  }

  async function handlePayerCodeBlur() {
    const code = (form.getValues("payer_accounting_code") || "").trim();
    if (!code) return;
    const r = await resolveByAccountingCode(code);
    if (r.valid) {
      if (!form.getValues("payer_name") && r.name)
        form.setValue("payer_name", r.name, { shouldValidate: true });
      if (!form.getValues("payer_phone") && r.phone)
        form.setValue("payer_phone", r.phone, { shouldValidate: true });
      toast.success(`واریزکننده شناسایی شد: ${r.name}`);
    }
  }
  async function handleReceiverCodeBlur() {
    const code = (form.getValues("receiver_accounting_code") || "").trim();
    if (!code) return;
    const r = await resolveByAccountingCode(code);
    if (r.valid) {
      if (!form.getValues("receiver_name") && r.name)
        form.setValue("receiver_name", r.name, { shouldValidate: true });
      if (!form.getValues("receiver_phone") && r.phone)
        form.setValue("receiver_phone", r.phone, { shouldValidate: true });
      toast.success(`گیرنده شناسایی شد: ${r.name}`);
    }
  }

  const [beneficiaryName, setBeneficiaryName] = useState<string>("");
  async function handleBeneficiaryCodeBlur() {
    const code = (form.getValues("beneficiary_accounting_code") || "").trim();
    if (!code) {
      setBeneficiaryName("");
      return;
    }
    const r = await resolveByAccountingCode(code);
    if (r.valid && r.name) {
      setBeneficiaryName(r.name);
      toast.success(`ذینفع شناسایی شد: ${r.name}`);
    } else {
      setBeneficiaryName("");
      toast.warning("کد آسان ذینفع پیدا نشد. می‌توانید همچنان ثبت کنید.");
    }
  }

  async function buildValidCodesSet(values: FormValues): Promise<Set<string>> {
    const codes = [values.payer_accounting_code, values.receiver_accounting_code]
      .map((c) => (c || "").trim())
      .filter(Boolean);
    if (codes.length === 0) return new Set();
    const set = new Set<string>();
    const { data: cs } = await supabase
      .from("customers")
      .select("accounting_code")
      .in("accounting_code" as never, codes as never);
    (cs ?? []).forEach((r) => {
      const c = (r as { accounting_code: string | null }).accounting_code;
      if (c) set.add(c);
    });
    const { data: ex } = await supabase
      .from("external_parties")
      .select("accounting_code")
      .in("accounting_code" as never, codes as never);
    (ex ?? []).forEach((r) => {
      const c = (r as { accounting_code: string | null }).accounting_code;
      if (c) set.add(c);
    });
    return set;
  }

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
    enabled: !!watchedCustomerId && requiresInvoiceLinks(watchedReceiptType),
    queryFn: async () => {
      const { data: qs, error } = await supabase
        .from("sales_quotes")
        .select("id, quote_number, final_amount, status, created_at, expires_at")
        .eq("customer_id" as never, watchedCustomerId)
        .eq("status", "accepted")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const list = (qs ?? []) as Array<{
        id: string;
        quote_number: string | null;
        final_amount: number;
        status: string;
        created_at: string | null;
        expires_at: string | null;
      }>;
      if (list.length === 0) return [];

      const ids = list.map((q) => q.id);
      const { data: links, error: linkErr } = await supabase
        .from("payment_receipt_links")
        .select("quote_id, amount, receipt:payment_receipts!inner(status)")
        .in("quote_id" as never, ids);
      if (linkErr) throw linkErr;
      const paidMap = new Map<string, number>();
      for (const l of (links ?? []) as unknown as Array<{
        quote_id: string;
        amount: number;
        receipt: { status: string } | null;
      }>) {
        if (l.receipt?.status === "approved") {
          paidMap.set(l.quote_id, (paidMap.get(l.quote_id) ?? 0) + Number(l.amount));
        }
      }
      // Only accepted quotes with a remaining balance > 0 are allocatable.
      return list
        .map((q) => {
          const paid = paidMap.get(q.id) ?? 0;
          return {
            id: q.id,
            number: q.quote_number,
            total_amount: Number(q.final_amount),
            paid_so_far: paid,
            remaining: Math.max(0, Number(q.final_amount) - paid),
            issue_date: q.created_at ?? null,
            due_date: q.expires_at ?? null,
          };
        })
        .filter((o) => o.remaining > 0.001);
    },
    staleTime: 30_000,
  });

  const totalAllocated = allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const overAllocated = totalAllocated > watchedAmount;
  const allocationDiff = watchedAmount - totalAllocated;

  const addAllocation = (
    inv: InvoiceOption,
    opts?: { amount?: number; suggestion?: InvoiceAllocation["suggestion"] },
  ) => {
    if (allocations.some((a) => a.quote_id === inv.id)) return;
    const remainingForReceipt = Math.max(0, watchedAmount - totalAllocated);
    const suggested =
      opts?.amount !== undefined
        ? Math.min(inv.remaining, Math.max(0, opts.amount))
        : Math.min(inv.remaining, remainingForReceipt || inv.remaining);
    setAllocations((prev) => [
      ...prev,
      {
        quote_id: inv.id,
        number: inv.number,
        total_amount: inv.total_amount,
        remaining: inv.remaining,
        amount: suggested,
        suggestion: opts?.suggestion,
      },
    ]);
    setInvoicePickerOpen(false);
  };

  // Smart matching suggestions (Phase 11.11)
  const watchedPaymentDate = form.watch("payment_date");
  const suggestions = useMemo(() => {
    if (
      !requiresInvoiceLinks(watchedReceiptType) ||
      !watchedCustomerId ||
      !watchedAmount ||
      watchedAmount <= 0 ||
      customerInvoices.length === 0
    ) {
      return [] as Array<{
        invoice: InvoiceOption;
        allocated_amount: number;
        confidence: "high" | "medium" | "low";
        reason: string;
      }>;
    }
    const receiptDate = watchedPaymentDate ? new Date(watchedPaymentDate).getTime() : NaN;
    const candidates = customerInvoices.filter((i) => i.remaining > 0.001);
    if (candidates.length === 0) return [];

    const scored = candidates.map((inv) => {
      const diff = Math.abs(inv.remaining - watchedAmount);
      const exact = diff < 0.5;
      const closeness = inv.remaining > 0 ? diff / inv.remaining : 1;
      const dateProximity =
        Number.isFinite(receiptDate) && inv.issue_date
          ? Math.abs(receiptDate - new Date(inv.issue_date).getTime()) / (1000 * 60 * 60 * 24)
          : 9999;
      const dueProximity =
        Number.isFinite(receiptDate) && inv.due_date
          ? Math.abs(receiptDate - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24)
          : 9999;

      let confidence: "high" | "medium" | "low" = "low";
      let reason = "این جدیدترین پیش‌فاکتور پرداخت‌نشده مشتری است.";
      let allocated = Math.min(inv.remaining, watchedAmount);

      if (exact) {
        confidence = "high";
        reason = "مبلغ فیش دقیقاً با مانده این پیش‌فاکتور برابر است.";
        allocated = inv.remaining;
      } else if (closeness <= 0.1) {
        confidence = "medium";
        reason = "مبلغ فیش نزدیک‌ترین مقدار به مانده این پیش‌فاکتور است.";
      } else if (dueProximity <= 7 || dateProximity <= 7) {
        confidence = "medium";
        reason =
          dueProximity <= 7
            ? "تاریخ سررسید این پیش‌فاکتور نزدیک تاریخ فیش است."
            : "تاریخ صدور این پیش‌فاکتور نزدیک تاریخ فیش است.";
      }

      // Composite rank: lower is better
      const rank = (exact ? 0 : 1) * 1000 + closeness * 100 + Math.min(dateProximity, 365) * 0.05;

      return { invoice: inv, allocated_amount: allocated, confidence, reason, rank };
    });

    scored.sort((a, b) => a.rank - b.rank);
    return scored.slice(0, 3).map(({ rank: _r, ...rest }) => rest);
  }, [watchedReceiptType, watchedCustomerId, watchedAmount, customerInvoices, watchedPaymentDate]);

  const removeAllocation = (invoiceId: string) => {
    setAllocations((prev) => prev.filter((a) => a.quote_id !== invoiceId));
  };

  const setAllocationAmount = (invoiceId: string, amount: number) => {
    setAllocations((prev) => prev.map((a) => (a.quote_id === invoiceId ? { ...a, amount } : a)));
  };

  // Optional lookups for bank accounts and external parties (Phase 11.9B)
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["receipt-form-bank-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, title, bank_name, is_active")
        .eq("is_active", true)
        .order("title", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; title: string; bank_name: string; is_active: boolean }[];
    },
    staleTime: 60_000,
  });

  const { data: externalParties = [] } = useQuery({
    queryKey: ["receipt-form-external-parties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_parties")
        .select("id, full_name, phone, accounting_code, is_active")
        .eq("is_active", true)
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        full_name: string;
        phone: string | null;
        accounting_code: string | null;
        is_active: boolean;
      }[];
    },
    staleTime: 60_000,
  });

  // Dynamic custom fields defined by admin/accountant
  const { data: customFields = [] } = useQuery<CustomFieldDef[]>({
    queryKey: ["payment-receipt-custom-fields", "active"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_receipt_custom_fields")
        .select(
          "id, field_key, field_label, field_type, field_options, is_required, is_active, sort_order",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as CustomFieldDef[];
    },
  });

  const mutation = useMutation({
    mutationFn: async (args: {
      values: FormValues;
      allocations: InvoiceAllocation[];
      bypassDuplicate?: boolean;
      securityWarnings?: ReceiptSecurityWarning[];
      customData?: CustomData;
    }) => {
      const {
        values,
        allocations: allocs,
        bypassDuplicate,
        securityWarnings = [],
        customData: cData = {},
      } = args;
      if (!user?.id) throw new Error("کاربر شناسایی نشد");

      // Front-end allocation validation (server has no constraint).
      // Only invoice_payment carries invoice links — the other three types are
      // recorded without any allocation.
      if (requiresInvoiceLinks(values.receipt_type)) {
        if (allocs.length === 0) {
          throw new Error("برای پرداخت پیش‌فاکتور، حداقل یک پیش‌فاکتور انتخاب کنید");
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
        beneficiary_accounting_code: values.beneficiary_accounting_code || null,
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
        source_bank_account_id: values.source_bank_account_id || null,
        destination_bank_account_id: values.destination_bank_account_id || null,
        receiver_party_id: values.receiver_party_id || null,
        security_warnings: securityWarnings,
        custom_data: cData,
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

      // Insert links only for invoice_payment
      if (requiresInvoiceLinks(values.receipt_type) && allocs.length > 0) {
        const linkRows = allocs.map((a) => ({
          receipt_id: receiptId,
          quote_id: a.quote_id,
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
          receipt_time: values.receipt_time || null,
          receiver: {
            name: values.receiver_name,
            phone: values.receiver_phone || null,
            accounting_code: values.receiver_accounting_code || null,
          },
          status: "pending_review",
          linked_invoices: requiresInvoiceLinks(values.receipt_type)
            ? allocs.map((a) => ({
                quote_id: a.quote_id,
                amount: Number(a.amount),
                ...(a.suggestion
                  ? {
                      matched_quote_id: a.quote_id,
                      suggested_confidence: a.suggestion.confidence,
                      suggested_reason: a.suggestion.reason,
                      allocated_amount: Number(a.amount),
                    }
                  : {}),
              }))
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
        onSubmit={form.handleSubmit(
          (v) => {
            const cErrs = validateCustomData(customFields, customData);
            setCustomErrors(cErrs);
            if (Object.keys(cErrs).length > 0) {
              toast.error("لطفاً فیلدهای اطلاعات تکمیلی را تکمیل کنید");
              return;
            }
            // Async path: evaluate validation_rules then security warnings
            (async () => {
              const validCodes = await buildValidCodesSet(v);
              const allRules = [...receiptRules, ...journalRules];
              const fieldValues: Record<string, unknown> = {
                receiver_name: v.receiver_name,
                payer_name: v.payer_name,
                payer_accounting_code: v.payer_accounting_code,
                receiver_accounting_code: v.receiver_accounting_code,
              };
              const violations = evaluateRules(allRules, fieldValues, validCodes);
              const { blocking, warnings: ruleWarnings } = splitViolations(violations);
              if (blocking.length > 0) {
                setBlockingViolations(blocking);
                setBlockingOpen(true);
                return;
              }
              const warnings = evaluateFormWarnings({
                payment_date: v.payment_date,
                tracking_number: v.tracking_number,
                amount: v.amount,
                document_channel: v.document_channel,
                payer_name_on_receipt: v.payer_name_on_receipt,
                has_perforation: v.has_perforation,
                is_typed_receipt: v.is_typed_receipt,
              });
              if (warnings.length > 0 || ruleWarnings.length > 0) {
                setPendingWarnings(warnings);
                setPendingRuleWarnings(ruleWarnings);
                setPendingWarningContext({ values: v, allocations });
                setWarningsOpen(true);
                return;
              }
              mutation.mutate({ values: v, allocations, securityWarnings: [], customData });
            })();
          },
          (errors) => {
            console.warn("[receipt-form] validation failed", errors);
            const labels: Record<string, string> = {
              customer_id: "مشتری",
              payer_name: "نام پرداخت‌کننده",
              receiver_name: "نام گیرنده",
              amount: "مبلغ",
              payment_date: "تاریخ پرداخت",
              payment_time: "ساعت پرداخت",
              tracking_number: "شماره پیگیری",
              receiver_party_id: "گیرنده (حساب بانکی ما یا طرف خارجی)",
              destination_bank_account_id: "حساب بانکی مقصد",
            };
            const fields = Object.keys(errors);
            const named = fields.map((f) => labels[f] ?? f);
            const first = fields[0];
            toast.error(named.length ? `فیلدهای ناقص: ${named.join("، ")}` : "فرم نامعتبر است");
            if (first) {
              const el = document.querySelector(`[name="${first}"]`) as HTMLElement | null;
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
              el?.focus?.();
            }
          },
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

            {/* نوع فیش */}
            <div className="space-y-2">
              <Label>
                نوع فیش <span className="text-destructive">*</span>
              </Label>
              <Select
                value={watchedReceiptType}
                onValueChange={(v) =>
                  form.setValue("receipt_type", v as ReceiptType, {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECEIPT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {RECEIPT_TYPE_FA[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {RECEIPT_TYPE_HINT_FA[watchedReceiptType]}
              </p>
            </div>

            {/* اتصال به پیش‌فاکتورها — فقط برای پرداخت پیش‌فاکتور */}
            {requiresInvoiceLinks(watchedReceiptType) && (
              <div className="space-y-3 rounded-md border bg-muted/30 p-3">
                {suggestions.length > 0 && (
                  <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-semibold">پیشنهاد اتصال به پیش‌فاکتور</h4>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      این پیشنهادها بر اساس مبلغ و تاریخ فیش محاسبه شده‌اند. پذیرش و یا تغییر مبلغ
                      تخصیص با حسابدار است.
                    </p>
                    <div className="space-y-2">
                      {suggestions.map((s) => {
                        const already = allocations.some((a) => a.quote_id === s.invoice.id);
                        const confidenceLabel =
                          s.confidence === "high"
                            ? "اطمینان بالا"
                            : s.confidence === "medium"
                              ? "اطمینان متوسط"
                              : "اطمینان پایین";
                        const confidenceClass =
                          s.confidence === "high"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : s.confidence === "medium"
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                              : "border-muted-foreground/30 bg-muted text-muted-foreground";
                        return (
                          <div
                            key={s.invoice.id}
                            className="flex flex-col gap-2 rounded-md border bg-background p-2 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span dir="ltr" className="text-sm font-medium">
                                  {toFaDigits(s.invoice.number ?? s.invoice.id.slice(0, 8))}
                                </span>
                                <span
                                  className={cn(
                                    "rounded-md border px-2 py-0.5 text-[10px]",
                                    confidenceClass,
                                  )}
                                >
                                  {confidenceLabel}
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                مانده: {formatNumber(s.invoice.remaining)} • تخصیص پیشنهادی:{" "}
                                {formatNumber(s.allocated_amount)}
                              </div>
                              <div className="text-xs">{s.reason}</div>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant={already ? "outline" : "default"}
                              disabled={already}
                              onClick={() =>
                                addAllocation(s.invoice, {
                                  amount: s.allocated_amount,
                                  suggestion: { confidence: s.confidence, reason: s.reason },
                                })
                              }
                            >
                              {already ? "افزوده شده" : "اعمال پیشنهاد"}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

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
                        <CommandInput placeholder="جستجو شماره پیش‌فاکتور..." />
                        <CommandList>
                          <CommandEmpty>پیش‌فاکتور بازی یافت نشد</CommandEmpty>
                          <CommandGroup>
                            {customerInvoices
                              .filter((i) => !allocations.some((a) => a.quote_id === i.id))
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
                  <p className="text-xs text-muted-foreground">ابتدا مشتری را انتخاب کنید.</p>
                )}

                {watchedCustomerId &&
                  requiresInvoiceLinks(watchedReceiptType) &&
                  customerInvoices.length === 0 && (
                    <p className="text-xs text-amber-600">
                      این مشتری پیش‌فاکتور پذیرفته‌شده با ماندهٔ باز ندارد؛ امکان اتصال وجود ندارد.
                    </p>
                  )}

                {watchedCustomerId && customerInvoices.length > 0 && allocations.length === 0 && (
                  <p className="text-xs text-muted-foreground">هنوز پیش‌فاکتوری انتخاب نشده است.</p>
                )}

                {allocations.length > 0 && (
                  <div className="space-y-2">
                    {allocations.map((a) => (
                      <div
                        key={a.quote_id}
                        className="flex flex-col gap-2 rounded-md border bg-background p-2 sm:flex-row sm:items-center"
                      >
                        <div className="flex-1 space-y-0.5">
                          <div className="text-sm font-medium" dir="ltr">
                            {toFaDigits(a.number ?? a.quote_id.slice(0, 8))}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            مبلغ کل: {formatNumber(a.total_amount)} • مانده:{" "}
                            {formatNumber(a.remaining)}
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
                              setAllocationAmount(a.quote_id, Number(e.target.value) || 0)
                            }
                            className="w-36"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeAllocation(a.quote_id)}
                            aria-label="حذف"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
                      <span>
                        مجموع تخصیص: <strong>{formatNumber(totalAllocated)}</strong> از{" "}
                        {formatNumber(watchedAmount)}
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
                    form.setValue("payer_accounting_code", m.accounting_code ?? "", {
                      shouldValidate: true,
                    });
                  }}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label>
                    نام و نام‌خانوادگی <span className="text-destructive">*</span>
                  </Label>
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
                  <Input
                    dir="ltr"
                    {...form.register("payer_accounting_code", { onBlur: handlePayerCodeBlur })}
                  />
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
                    form.setValue("receiver_accounting_code", m.accounting_code ?? "", {
                      shouldValidate: true,
                    });
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label>
                  گیرنده وجه{" "}
                  <span className="text-[10px] text-muted-foreground">
                    — یکی از دو حالت زیر را انتخاب کنید
                  </span>
                </Label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      حالت ۱: حساب بانکی خودِ ما
                    </Label>
                    <Select
                      value={form.watch("destination_bank_account_id") || "__none"}
                      disabled={Boolean(form.watch("receiver_party_id"))}
                      onValueChange={(v) => {
                        if (v === "__none") {
                          form.setValue("destination_bank_account_id", "", { shouldDirty: true });
                          return;
                        }
                        form.setValue("destination_bank_account_id", v, { shouldDirty: true });
                        form.setValue("receiver_party_id", "", { shouldDirty: true });
                        const b = bankAccounts.find((x) => x.id === v);
                        if (b) {
                          if (!form.getValues("destination_bank")) {
                            form.setValue("destination_bank", b.bank_name, { shouldDirty: true });
                          }
                          if (!form.getValues("bank_name")) {
                            form.setValue("bank_name", b.bank_name, { shouldDirty: true });
                          }
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="انتخاب حساب بانکی ما" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— بدون انتخاب —</SelectItem>
                        {bankAccounts.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.title} • {b.bank_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">
                      حالت ۲: شخص/طرف حساب خارجی
                    </Label>
                    <Select
                      value={form.watch("receiver_party_id") || "__none"}
                      disabled={Boolean(form.watch("destination_bank_account_id"))}
                      onValueChange={(v) => {
                        if (v === "__none") {
                          form.setValue("receiver_party_id", "", { shouldDirty: true });
                          return;
                        }
                        form.setValue("receiver_party_id", v, { shouldDirty: true });
                        form.setValue("destination_bank_account_id", "", { shouldDirty: true });
                        const p = externalParties.find((x) => x.id === v);
                        if (p) {
                          form.setValue("receiver_name", p.full_name, { shouldValidate: true });
                          if (p.phone)
                            form.setValue("receiver_phone", p.phone, { shouldValidate: true });
                          if (p.accounting_code)
                            form.setValue("receiver_accounting_code", p.accounting_code, {
                              shouldValidate: true,
                            });
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="انتخاب طرف حساب خارجی" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">— بدون انتخاب —</SelectItem>
                        {externalParties.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name}
                            {p.accounting_code ? ` (${toFaDigits(p.accounting_code)})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {errors.receiver_party_id && (
                  <p className="text-xs text-destructive">{errors.receiver_party_id.message}</p>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label>
                    نام گیرنده <span className="text-destructive">*</span>
                  </Label>
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
                  <Input
                    dir="ltr"
                    {...form.register("receiver_accounting_code", {
                      onBlur: handleReceiverCodeBlur,
                    })}
                  />
                </div>
              </div>
            </div>

            {/* ذینفع حسابداری (طلبکار / صاحب بدهی) */}
            <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold">ذینفع حسابداری (طلبکار)</h3>
                <p className="text-[11px] text-muted-foreground">
                  طرفی که بدهی ما به او با این پرداخت کم می‌شود. ممکن است با «گیرنده وجه» (صاحب حساب
                  مقصد فیش) متفاوت باشد. مثلاً اگر افرا به حساب حسن‌زاده پول می‌فرستد تا بدهی ما به
                  ترابی تسویه شود، ذینفع = ترابی.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>کد آسان ذینفع</Label>
                  <Input
                    dir="ltr"
                    placeholder="کد حسابداری طلبکار"
                    {...form.register("beneficiary_accounting_code", {
                      onBlur: handleBeneficiaryCodeBlur,
                    })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>نام ذینفع (خودکار)</Label>
                  <Input value={beneficiaryName} readOnly disabled className="bg-muted/50" />
                </div>
              </div>
            </div>

            {/* پیش‌نمایش سند حسابداری خودکار */}
            {(() => {
              const payerCode = form.watch("payer_accounting_code");
              const benefCode =
                form.watch("beneficiary_accounting_code") || form.watch("receiver_accounting_code");
              const amt = form.watch("amount") || 0;
              if (!payerCode || !benefCode || amt <= 0) return null;
              return (
                <div className="space-y-2 rounded-md border bg-background p-3">
                  <h3 className="text-sm font-semibold">پیش‌نمایش سند حسابداری خودکار</h3>
                  <p className="text-[11px] text-muted-foreground">
                    پس از تأیید این فیش، سند زیر به‌صورت خودکار ثبت می‌شود.
                  </p>
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="p-2 text-right">شرح</th>
                        <th className="p-2 text-right">کد آسان</th>
                        <th className="p-2 text-left">بدهکار</th>
                        <th className="p-2 text-left">بستانکار</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t">
                        <td className="p-2">
                          ذینفع (طلبکار) {beneficiaryName ? `- ${beneficiaryName}` : ""}
                        </td>
                        <td className="p-2 font-mono" dir="ltr">
                          {toFaDigits(benefCode)}
                        </td>
                        <td className="p-2 text-left">{formatNumber(amt)}</td>
                        <td className="p-2 text-left">—</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-2">
                          پرداخت‌کننده{" "}
                          {form.watch("payer_name") ? `- ${form.watch("payer_name")}` : ""}
                        </td>
                        <td className="p-2 font-mono" dir="ltr">
                          {toFaDigits(payerCode)}
                        </td>
                        <td className="p-2 text-left">—</td>
                        <td className="p-2 text-left">{formatNumber(amt)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* جزئیات تراکنش */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>
                  مبلغ (تومان) <span className="text-destructive">*</span>
                </Label>
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
                <Label>
                  شماره پیگیری <span className="text-destructive">*</span>
                </Label>
                <Input dir="ltr" {...form.register("tracking_number")} />
                {errors.tracking_number && (
                  <p className="text-xs text-destructive">{errors.tracking_number.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label>تاریخ ثبت فیش</Label>
                <Input
                  value={isoToJalaliDisplay(today)}
                  readOnly
                  disabled
                  dir="ltr"
                  className="bg-muted/50 cursor-not-allowed text-center"
                />
                <p className="text-[10px] text-muted-foreground">
                  به‌صورت خودکار با تاریخ امروز پر می‌شود.
                </p>
              </div>

              <div className="space-y-1">
                <Label>
                  تاریخ روی فیش واریزی <span className="text-destructive">*</span>
                </Label>
                <JalaliDateInput
                  value={watchedPaymentDate}
                  onChange={(iso) =>
                    form.setValue("payment_date", iso, { shouldValidate: true, shouldDirty: true })
                  }
                  max={today}
                  placeholder="انتخاب تاریخ شمسی"
                  invalid={!watchedPaymentDate || Boolean(errors.payment_date)}
                />
                {!watchedPaymentDate && !errors.payment_date && (
                  <p className="text-xs text-destructive font-medium">
                    تاریخ از روی فیش استخراج نشد — لطفاً دستی وارد کنید (اجباری).
                  </p>
                )}
                {errors.payment_date && (
                  <p className="text-xs text-destructive">{errors.payment_date.message}</p>
                )}
                <p className="text-[10px] text-muted-foreground">
                  در صورت آپلود فیش، به‌صورت خودکار از فیش استخراج می‌شود.
                </p>
              </div>

              <div className="space-y-1">
                <Label>
                  ساعت واریز <span className="text-destructive">*</span>
                </Label>
                <Input type="time" {...form.register("payment_time")} />
                {errors.payment_time && (
                  <p className="text-xs text-destructive">{errors.payment_time.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label>توضیحات</Label>
              <Textarea rows={3} {...form.register("description")} />
            </div>

            {/* جزئیات تکمیلی فیش (قابل استخراج خودکار از تصویر) */}
            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold">جزئیات تکمیلی فیش</h3>
                <p className="text-xs text-muted-foreground">
                  در صورت آپلود تصویر فیش، این فیلدها به‌صورت خودکار از روی فیش پر می‌شوند. در صورت
                  نیاز قابل ویرایش دستی هستند.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>حساب مبدأ ما (اختیاری)</Label>
                  <Select
                    value={form.watch("source_bank_account_id") || "__none"}
                    onValueChange={(v) => {
                      if (v === "__none") {
                        form.setValue("source_bank_account_id", "", { shouldDirty: true });
                        return;
                      }
                      form.setValue("source_bank_account_id", v, { shouldDirty: true });
                      const b = bankAccounts.find((x) => x.id === v);
                      if (b && !form.getValues("source_bank")) {
                        form.setValue("source_bank", b.bank_name, { shouldDirty: true });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="انتخاب از حساب‌های بانکی" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">— بدون انتخاب —</SelectItem>
                      {bankAccounts.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.title} • {b.bank_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="mt-1"
                    {...form.register("source_bank")}
                    placeholder="نام بانک مبدأ (متن)"
                  />
                </div>

                <div className="space-y-1">
                  <Label>نام بانک مقصد (متن)</Label>
                  <Input {...form.register("destination_bank")} placeholder="مثلاً: بانک ملت" />
                </div>

                <div className="space-y-1">
                  <Label>ساعت روی فیش</Label>
                  <Input type="time" dir="ltr" {...form.register("receipt_time")} />
                  {errors.receipt_time && (
                    <p className="text-xs text-destructive">{errors.receipt_time.message}</p>
                  )}
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

                <div className="space-y-1">
                  <Label>نام واریزکننده روی فیش</Label>
                  <Input {...form.register("payer_name_on_receipt")} />
                </div>

                <div className="space-y-1">
                  <Label>نام گیرنده روی فیش</Label>
                  <Input {...form.register("receiver_name_on_receipt")} />
                </div>

                <div className="flex flex-col gap-2 pt-1 sm:col-span-2">
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
            {autoFilling && (
              <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                در حال استخراج خودکار اطلاعات از فایل آپلودشده…
              </div>
            )}

            {customFields.length > 0 && (
              <div className="rounded-md border bg-muted/30 p-3">
                <WaybillCustomFieldsInput
                  fields={customFields}
                  value={customData}
                  onChange={setCustomData}
                  errors={customErrors}
                />
              </div>
            )}
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
          <div className="flex flex-col items-end gap-1">
            <Button
              type="submit"
              disabled={
                mutation.isPending ||
                (requiresInvoiceLinks(watchedReceiptType) &&
                  (allocations.length === 0 || overAllocated))
              }
            >
              {mutation.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              ثبت فیش
            </Button>
            {requiresInvoiceLinks(watchedReceiptType) && allocations.length === 0 && (
              <p className="text-xs text-destructive">
                برای پرداخت پیش‌فاکتور، حداقل یک پیش‌فاکتور انتخاب کنید.
              </p>
            )}
            {requiresInvoiceLinks(watchedReceiptType) &&
              allocations.length > 0 &&
              overAllocated && (
                <p className="text-xs text-destructive">مجموع تخصیص بیشتر از مبلغ فیش است.</p>
              )}
          </div>
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
                    customData,
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
              <li key={i}>
                <span className="font-medium">
                  [{w.severity === "high" ? "مهم" : w.severity === "medium" ? "متوسط" : "کم"}]{" "}
                </span>
                {w.message}
              </li>
            ))}
            {pendingRuleWarnings.map((rv) => (
              <li key={rv.rule.id}>
                <span className="font-medium">[استاندارد] </span>
                {rv.rule.message}
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setPendingWarnings([]);
                setPendingRuleWarnings([]);
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
                    customData,
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

      <AlertDialog open={blockingOpen} onOpenChange={setBlockingOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>ثبت ممکن نیست</AlertDialogTitle>
            <AlertDialogDescription>
              موارد زیر طبق استانداردهای سیستم اجباری هستند و باید اصلاح شوند:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="list-disc space-y-1 pr-6 text-sm text-destructive">
            {blockingViolations.map((rv) => (
              <li key={rv.rule.id}>{rv.rule.message}</li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setBlockingOpen(false)}>متوجه شدم</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
