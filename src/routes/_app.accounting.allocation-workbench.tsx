/**
 * Wave 5 · [U] D-22 — «پخش حساب», the allocation workbench.
 *
 * The accountant already had two separate reports: what customers owe us
 * (`/accounting/receivables`) and what we owe suppliers (`/accounting/payables`). Deciding who
 * gets paid out of today's incoming money meant reading both on paper and remembering the answer.
 * This page puts them side by side with a third column in the middle where that decision is
 * written down.
 *
 * ## Nothing here is a new report
 *
 * Both outer columns call the SAME database functions the two existing pages call —
 * `get_receivables_list` and `get_payables_list` — with the same argument shape, and render the
 * same `AgingBucketBadge`. The headline reuses `useSuggestedDailyCapital`, the existing hook over
 * `compute_daily_capital`. A second receivables or payables query is the one failure this whole
 * programme exists to prevent, so there is not one here.
 *
 * ## What the date means
 *
 * `p_to_date` on both list functions filters on the DUE DATE, so the selected date reads as
 * "everything payable/receivable by this date" — today's obligations plus everything already
 * overdue, which is what an allocation actually has to cover. `p_due_filter = 'today'` (exactly
 * due today) is offered as a filter but is not the default: on 2026-09-06 it returns zero
 * payables, and an empty workbench is not the honest picture of the day's cash.
 *
 * ## What this page deliberately does NOT do
 *
 * - It does not suggest an allocation and does not learn from past ones ([U] D-23).
 * - It does not reallocate anything when a promise expires. `is_unfunded` is a FLAG, computed on
 *   read by `list_allocation_rows`, and the accountant decides what to do about it ([U] D-21).
 * - It cannot change the two parties on a row after creation; `update_allocation_row` has no
 *   parameter for either, by design.
 *
 * ## The gate
 *
 * `staticData.gate` AND `beforeLoad`, both naming `["admin","manager","accountant"]` — the live
 * `role_permissions` rows for module `accounting`, which is also `compute_daily_capital`'s own
 * guard. `beforeLoad` runs only on the server; on a cold direct navigation it never runs in the
 * browser at all, so `staticData.gate` is what `RouteRoleGate` enforces client-side. A route with
 * only one of the two is the security-wave-2 defect.
 *
 * WRITING is narrower than viewing and is enforced in the database, not here: `create_allocation_row`,
 * `update_allocation_row` and `set_allocation_row_status` all raise 42501 for anyone who is not
 * `admin` or `accountant`, so a `manager` can read this page and will be refused on save. The form
 * does not hide itself for that role — a hidden button is not a permission check, and the refusal
 * comes back as the database's own Persian sentence.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, CalendarIcon, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { toFaDigits, formatDateFa } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";
import { useSuggestedDailyCapital } from "@/hooks/capital/useDynamicCapital";
import {
  ALLOCATION_PRIORITIES,
  ALLOCATION_STATUSES,
  PRIORITY_FA,
  STATUS_REQUIRING_PROMISE,
  createAllocationRow,
  fetchCustomerOverdueSignals,
  fetchSupplierPersonIds,
  listAllocationRows,
  setAllocationRowStatus,
  updateAllocationRow,
  type AllocationPriority,
  type AllocationRow,
  type AllocationStatus,
} from "@/lib/allocation/queries";

import { PageHeader } from "@/components/common/PageHeader";
import { AgingBucketBadge } from "@/components/accounting/AgingBuckets";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/accounting/allocation-workbench")({
  // M6/OG-24 — mirrors the requireAnyRole call below. The shared guard cannot decide
  // during SSR or while roles load, so RouteRoleGate in _app enforces this on the client.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "accountant"] } },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: AllocationWorkbenchPage,
});

const NA = "نامشخص";

/** The same five due filters both existing columns offer, by the same names the RPCs accept. */
const DUE_FILTERS = [
  { value: "all", label: "تا تاریخ انتخاب‌شده" },
  { value: "overdue", label: "فقط معوق" },
  { value: "today", label: "فقط سررسید امروز" },
] as const;

type DueFilter = (typeof DUE_FILTERS)[number]["value"];

/** One receivable, as `get_receivables_list` returns it. Only the columns this page prints. */
interface ReceivableRow {
  customer_id: string | null;
  customer_name: string | null;
  invoice_id: string;
  invoice_number: string | null;
  due_date: string | null;
  outstanding_amount: number | null;
  is_overdue: boolean | null;
  aging_bucket: string | null;
  due_date_unknown: boolean | null;
}

/** One payable, as `get_payables_list` returns it. Only the columns this page prints. */
interface PayableRow {
  supplier_id: string | null;
  supplier_name: string | null;
  purchase_id: string;
  due_date: string | null;
  outstanding_amount: number | null;
  is_overdue: boolean | null;
  aging_bucket: string | null;
  due_date_unknown: boolean | null;
}

function fmtMoney(n: number | null | undefined) {
  if (n == null) return NA;
  return `${toFaDigits(Math.round(Number(n)).toLocaleString("en-US"))} تومان`;
}
function fmtDate(s: string | null | undefined) {
  if (!s) return NA;
  try {
    return formatDateFa(s);
  } catch {
    return s;
  }
}

function isForbidden(e: unknown) {
  const msg = (e as { message?: string } | null)?.message ?? "";
  return /forbidden|permission denied|42501|مجاز/i.test(msg);
}
function errText(e: unknown, fallback: string) {
  const msg = (e as { message?: string } | null)?.message ?? "";
  // The allocation RPCs raise finished Persian sentences on purpose. Printing our own wording
  // over them would replace a specific reason («مبلغ پرداخت از ماندهٔ بدهی بیشتر است») with a
  // generic one, which is exactly the information the accountant needs.
  if (/[؀-ۿ]/.test(msg)) return msg;
  if (isForbidden(e)) return "شما دسترسی لازم برای این کار را ندارید.";
  return fallback;
}

/** A section that has three honest empty answers, not one. */
function ColumnState({
  isLoading,
  isError,
  error,
  isEmpty,
  emptyText,
  errorText,
  testId,
}: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyText: string;
  errorText: string;
  testId: string;
}) {
  if (isLoading) {
    return (
      <div
        data-testid={`${testId}-loading`}
        className="flex items-center gap-2 py-6 text-sm text-muted-foreground"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        در حال دریافت…
      </div>
    );
  }
  if (isError) {
    return (
      <div data-testid={`${testId}-error`} className="py-6 text-sm text-destructive">
        {errText(error, errorText)}
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div data-testid={`${testId}-empty`} className="py-6 text-sm text-muted-foreground">
        {emptyText}
      </div>
    );
  }
  return null;
}

function DateField({
  label,
  value,
  onChange,
  testId,
}: {
  label: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  testId?: string;
}) {
  const asDate = value ? new Date(`${value}T00:00:00`) : undefined;
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            data-testid={testId}
            variant="outline"
            className="w-full justify-start font-normal"
          >
            <CalendarIcon className="ml-2 h-4 w-4" />
            {value ? fmtDate(value) : <span className="text-muted-foreground">انتخاب تاریخ</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={asDate}
            onSelect={(d) => onChange(d ? format(d, "yyyy-MM-dd") : null)}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface PayerPick {
  customerId: string;
  customerName: string;
  quoteId: string | null;
}
interface BeneficiaryPick {
  personId: string;
  supplierName: string;
  purchaseId: string | null;
}

function AllocationWorkbenchPage() {
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const [workDate, setWorkDate] = useState<string>(today);
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");

  const [payer, setPayer] = useState<PayerPick | null>(null);
  const [beneficiary, setBeneficiary] = useState<BeneficiaryPick | null>(null);
  const [amount, setAmount] = useState("");
  const [priority, setPriority] = useState<AllocationPriority>("normal");
  const [accountNo, setAccountNo] = useState("");

  // `p_from_date` stays NULL so nothing overdue is hidden: an allocation has to cover what was
  // already late, not only what falls due on the chosen day.
  const receivablesQ = useQuery({
    queryKey: ["wb-receivables", workDate, dueFilter],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_receivables_list", {
        p_from_date: undefined,
        p_to_date: workDate,
        p_customer_id: undefined,
        p_due_filter: dueFilter,
        p_search: undefined,
        p_limit: 50,
        p_offset: 0,
      });
      if (error) throw error;
      return (data as unknown as ReceivableRow[] | null) ?? [];
    },
  });

  const payablesQ = useQuery({
    queryKey: ["wb-payables", workDate, dueFilter],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_payables_list", {
        p_from_date: undefined,
        p_to_date: workDate,
        p_supplier_id: undefined,
        p_due_filter: dueFilter,
        p_search: undefined,
        p_limit: 50,
        p_offset: 0,
        p_include_paid: false,
      });
      if (error) throw error;
      return (data as unknown as PayableRow[] | null) ?? [];
    },
  });

  const allocationsQ = useQuery({
    queryKey: ["wb-allocations", workDate],
    staleTime: 10_000,
    queryFn: () => listAllocationRows({ allocationDate: workDate }),
  });

  const capitalQ = useSuggestedDailyCapital(workDate);

  const receivables = useMemo(() => receivablesQ.data ?? [], [receivablesQ.data]);
  const payables = useMemo(() => payablesQ.data ?? [], [payablesQ.data]);

  const customerIds = useMemo(
    () => receivables.map((r) => r.customer_id).filter((v): v is string => Boolean(v)),
    [receivables],
  );
  const supplierIds = useMemo(
    () => payables.map((p) => p.supplier_id).filter((v): v is string => Boolean(v)),
    [payables],
  );

  const overdueQ = useQuery({
    queryKey: ["wb-overdue-signal", customerIds.join(",")],
    enabled: customerIds.length > 0,
    staleTime: 60_000,
    queryFn: () => fetchCustomerOverdueSignals(customerIds),
  });

  const supplierPersonQ = useQuery({
    queryKey: ["wb-supplier-persons", supplierIds.join(",")],
    enabled: supplierIds.length > 0,
    staleTime: 300_000,
    queryFn: () => fetchSupplierPersonIds(supplierIds),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["wb-allocations", workDate] });
  };

  const amountNum = useMemo(() => {
    const v = Number(amount.replace(/[,\s]/g, ""));
    return Number.isFinite(v) ? Math.trunc(v) : 0;
  }, [amount]);

  const createM = useMutation({
    mutationFn: async () => {
      if (!payer) throw new Error("مشتری بدهکار انتخاب نشده است.");
      if (!beneficiary) throw new Error("ذی‌نفع بستانکار انتخاب نشده است.");
      if (amountNum <= 0) throw new Error("مبلغ تخصیص باید عددی بزرگ‌تر از صفر باشد.");
      return createAllocationRow({
        payerCustomerId: payer.customerId,
        beneficiaryPersonId: beneficiary.personId,
        amount: amountNum,
        allocationDate: workDate,
        priority,
        beneficiaryAccountNo: accountNo.trim() || null,
        payerQuoteId: payer.quoteId,
        beneficiaryPurchaseId: beneficiary.purchaseId,
      });
    },
    onSuccess: () => {
      toast.success("ردیف تخصیص ثبت شد");
      setAmount("");
      setAccountNo("");
      invalidate();
    },
    onError: (e) => toast.error(errText(e, "ثبت ردیف تخصیص انجام نشد.")),
  });

  const suggestion = capitalQ.data;

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <PageHeader
        title="پخش حساب"
        description="تصمیم روزانه: پول امروز از چه کسی می‌آید و به چه کسی می‌رسد."
      />

      {/* ── Headline: compute_daily_capital ─────────────────────────────────────────── */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
            <DateField
              label="تاریخ کاری"
              value={workDate}
              onChange={(d) => setWorkDate(d ?? today)}
              testId="wb-work-date"
            />
            <div className="space-y-1">
              <Label>محدودهٔ سررسید</Label>
              <Select value={dueFilter} onValueChange={(v) => setDueFilter(v as DueFilter)}>
                <SelectTrigger data-testid="wb-due-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DUE_FILTERS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <HeadlineFigure
              label="مطالبات معوق"
              value={suggestion?.overdue_receivables}
              isLoading={capitalQ.isLoading}
              isError={capitalQ.isError}
              tone="warn"
            />
            <HeadlineFigure
              label="بدهی معوق"
              value={suggestion?.overdue_payables}
              isLoading={capitalQ.isLoading}
              isError={capitalQ.isError}
              tone="danger"
            />
            <HeadlineFigure
              label="سررسید امروز (دریافت / پرداخت)"
              value={suggestion?.due_today_receivables}
              secondary={suggestion?.due_today_payables}
              isLoading={capitalQ.isLoading}
              isError={capitalQ.isError}
            />
          </div>

          {/*
            The suggested capital is only honest when the day's cash inputs exist. With no
            `daily_capital_inputs` row every cash term COALESCEs to zero and the function still
            returns a figure — an artefact of the missing row, not a suggestion. The existing
            capital page makes exactly this distinction and so does this one.
          */}
          <div data-testid="wb-capital-suggestion" className="text-sm">
            {capitalQ.isLoading ? (
              <span className="text-muted-foreground">در حال محاسبهٔ سرمایهٔ روز…</span>
            ) : capitalQ.isError ? (
              <span className="text-destructive">
                {errText(capitalQ.error, "محاسبهٔ سرمایهٔ روز انجام نشد.")}
              </span>
            ) : !suggestion ? (
              <span className="text-muted-foreground">برای این تاریخ محاسبه‌ای برنگشت.</span>
            ) : suggestion.input_id ? (
              <span>
                سرمایهٔ پیشنهادی سامانه برای این روز:{" "}
                <span className="font-semibold">
                  {fmtMoney(suggestion.system_suggested_capital)}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">
                پیشنهاد سرمایهٔ روز محاسبه نشد؛ ورودی‌های نقدی این تاریخ («موجودی بانک، صندوق،
                چک‌ها») ثبت نشده است. ارقام معوق و سررسید بالا از خودِ اسناد خوانده شده‌اند و
                معتبرند.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Three columns. In RTL the first child is the rightmost. ─────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* RIGHT — receivables */}
        <Card data-testid="wb-col-receivables">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">دریافتنی — مشتریان</h2>
              <Badge variant="secondary">{toFaDigits(receivables.length)}</Badge>
            </div>
            <ColumnState
              isLoading={receivablesQ.isLoading}
              isError={receivablesQ.isError}
              error={receivablesQ.error}
              isEmpty={receivables.length === 0}
              emptyText="برای این تاریخ هیچ مطالبه‌ای ثبت نشده است."
              errorText="دریافت فهرست مطالبات با خطا مواجه شد."
              testId="wb-receivables"
            />
            <div className="space-y-2">
              {receivables.map((r) => {
                const signal = r.customer_id ? overdueQ.data?.[r.customer_id] : undefined;
                const selected =
                  payer?.customerId === r.customer_id && payer?.quoteId === r.invoice_id;
                return (
                  <div
                    key={r.invoice_id}
                    data-testid="wb-receivable-row"
                    className={cn(
                      "rounded-md border p-3 text-sm",
                      selected && "border-primary bg-primary/5",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{r.customer_name ?? NA}</span>
                      <AgingBucketBadge bucket={r.aging_bucket} />
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      فاکتور {toFaDigits(r.invoice_number ?? NA)} · سررسید{" "}
                      {r.due_date_unknown ? "نامشخص" : fmtDate(r.due_date)}
                    </div>
                    <div className="mt-1 font-semibold">{fmtMoney(r.outstanding_amount)}</div>
                    {/* The reason sentence is written by `can_issue_customer_invoice` for the
                        accountant and is printed exactly as it comes back. */}
                    {signal && !signal.can_issue && signal.reason ? (
                      <div
                        data-testid="wb-overdue-signal"
                        className="mt-2 flex items-start gap-1 rounded bg-destructive/10 p-2 text-xs text-destructive"
                      >
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{signal.reason}</span>
                      </div>
                    ) : null}
                    <Button
                      data-testid="wb-pick-payer"
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      className="mt-2 w-full"
                      disabled={!r.customer_id}
                      onClick={() =>
                        setPayer({
                          customerId: r.customer_id as string,
                          customerName: r.customer_name ?? NA,
                          quoteId: r.invoice_id,
                        })
                      }
                    >
                      انتخاب به‌عنوان بدهکار
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* MIDDLE — the allocation column */}
        <Card data-testid="wb-col-allocations">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">پخش حساب — ردیف‌های تخصیص</h2>
              <Badge variant="secondary">{toFaDigits(allocationsQ.data?.length ?? 0)}</Badge>
            </div>

            {/* New row */}
            <div className="space-y-2 rounded-md border border-dashed p-3">
              <div className="text-sm font-medium">ردیف جدید</div>
              <div className="text-xs text-muted-foreground">
                بدهکار:{" "}
                <span data-testid="wb-picked-payer" className="font-medium text-foreground">
                  {payer ? payer.customerName : "از ستون راست انتخاب کنید"}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                بستانکار:{" "}
                <span data-testid="wb-picked-beneficiary" className="font-medium text-foreground">
                  {beneficiary ? beneficiary.supplierName : "از ستون چپ انتخاب کنید"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>مبلغ (تومان)</Label>
                  <Input
                    data-testid="wb-new-amount"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="۰"
                  />
                </div>
                <div className="space-y-1">
                  <Label>اولویت</Label>
                  <Select
                    value={priority}
                    onValueChange={(v) => setPriority(v as AllocationPriority)}
                  >
                    <SelectTrigger data-testid="wb-new-priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALLOCATION_PRIORITIES.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>شمارهٔ حساب ذی‌نفع (اختیاری)</Label>
                <Input
                  data-testid="wb-new-account-no"
                  value={accountNo}
                  onChange={(e) => setAccountNo(e.target.value)}
                  placeholder="شماره کارت یا شبا"
                />
              </div>
              <Button
                data-testid="wb-create-allocation"
                className="w-full"
                disabled={!payer || !beneficiary || amountNum <= 0 || createM.isPending}
                onClick={() => createM.mutate()}
              >
                {createM.isPending ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="ml-2 h-4 w-4" />
                )}
                ثبت ردیف تخصیص
              </Button>
            </div>

            <ColumnState
              isLoading={allocationsQ.isLoading}
              isError={allocationsQ.isError}
              error={allocationsQ.error}
              isEmpty={(allocationsQ.data?.length ?? 0) === 0}
              emptyText="برای این تاریخ هنوز ردیف تخصیصی ثبت نشده است."
              errorText="دریافت ردیف‌های تخصیص با خطا مواجه شد."
              testId="wb-allocations"
            />

            <div className="space-y-2">
              {(allocationsQ.data ?? []).map((row) => (
                <AllocationRowCard key={row.id} row={row} onChanged={invalidate} />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* LEFT — payables */}
        <Card data-testid="wb-col-payables">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">پرداختنی — تأمین‌کنندگان</h2>
              <Badge variant="secondary">{toFaDigits(payables.length)}</Badge>
            </div>
            <ColumnState
              isLoading={payablesQ.isLoading}
              isError={payablesQ.isError}
              error={payablesQ.error}
              isEmpty={payables.length === 0}
              emptyText="برای این تاریخ هیچ بدهی پرداخت‌نشده‌ای وجود ندارد."
              errorText="دریافت فهرست بدهی‌ها با خطا مواجه شد."
              testId="wb-payables"
            />
            <div className="space-y-2">
              {payables.map((p) => {
                const personId = p.supplier_id ? supplierPersonQ.data?.[p.supplier_id] : undefined;
                const selected =
                  beneficiary?.personId === personId && beneficiary?.purchaseId === p.purchase_id;
                return (
                  <div
                    key={p.purchase_id}
                    data-testid="wb-payable-row"
                    className={cn(
                      "rounded-md border p-3 text-sm",
                      selected && "border-primary bg-primary/5",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{p.supplier_name ?? NA}</span>
                      <AgingBucketBadge bucket={p.aging_bucket} />
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      سررسید {p.due_date_unknown ? "نامشخص" : fmtDate(p.due_date)}
                    </div>
                    <div className="mt-1 font-semibold">{fmtMoney(p.outstanding_amount)}</div>
                    <Button
                      data-testid="wb-pick-beneficiary"
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      className="mt-2 w-full"
                      // A supplier with no `person_id` cannot be a beneficiary: the row is
                      // keyed to a PERSON, not to a supplier record.
                      disabled={!personId}
                      onClick={() =>
                        setBeneficiary({
                          personId: personId as string,
                          supplierName: p.supplier_name ?? NA,
                          purchaseId: p.purchase_id,
                        })
                      }
                    >
                      {personId ? "انتخاب به‌عنوان بستانکار" : "شخص این تأمین‌کننده ثبت نشده"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HeadlineFigure({
  label,
  value,
  secondary,
  isLoading,
  isError,
  tone,
}: {
  label: string;
  value: number | undefined;
  secondary?: number;
  isLoading: boolean;
  isError: boolean;
  tone?: "warn" | "danger";
}) {
  const toneCls =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "";
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className={cn("pt-2 text-sm font-semibold", toneCls)}>
        {isLoading ? (
          <span className="text-muted-foreground">…</span>
        ) : isError ? (
          <span className="text-destructive">—</span>
        ) : (
          <>
            {fmtMoney(value ?? 0)}
            {secondary != null ? (
              <span className="text-muted-foreground"> / {fmtMoney(secondary)}</span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * One allocation row and the four things the accountant can change about it.
 *
 * `status` starts NULL — «پیگیری نشده» — and that is an ABSENCE, not a sixth state. The select
 * therefore shows an unset placeholder and offers exactly the five values D-20 closed the list
 * at; there is no option that puts the row back to unset, because `set_allocation_row_status`
 * refuses NULL and inventing a client-side clear would be a sixth state in disguise.
 *
 * «شنبه واریز می‌کنه» is refused by the database without a promise date, so the button stays
 * disabled until one is picked. The refusal is still the database's — this only avoids sending a
 * call that is known to fail.
 *
 * The two PARTIES are absent from every control here on purpose: `update_allocation_row` has no
 * parameter for them.
 */
function AllocationRowCard({ row, onChanged }: { row: AllocationRow; onChanged: () => void }) {
  const [draftStatus, setDraftStatus] = useState<AllocationStatus | "">("");
  const [draftPromise, setDraftPromise] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState("");
  const [draftAccount, setDraftAccount] = useState(row.beneficiary_account_no ?? "");

  const statusM = useMutation({
    mutationFn: () =>
      setAllocationRowStatus({
        allocationId: row.id,
        status: draftStatus as AllocationStatus,
        promisedAt: draftPromise,
        promisedNote: draftNote.trim() || null,
      }),
    onSuccess: () => {
      toast.success("وضعیت پیگیری ثبت شد");
      setDraftStatus("");
      setDraftPromise(null);
      setDraftNote("");
      onChanged();
    },
    onError: (e) => toast.error(errText(e, "ثبت وضعیت پیگیری انجام نشد.")),
  });

  const priorityM = useMutation({
    mutationFn: (p: AllocationPriority) =>
      updateAllocationRow({ allocationId: row.id, priority: p }),
    onSuccess: () => {
      toast.success("اولویت به‌روزرسانی شد");
      onChanged();
    },
    onError: (e) => toast.error(errText(e, "به‌روزرسانی اولویت انجام نشد.")),
  });

  const accountM = useMutation({
    mutationFn: () => {
      const v = draftAccount.trim();
      return updateAllocationRow({
        allocationId: row.id,
        // An emptied field is a deliberate clear, and the database refuses an empty string
        // (`text_shape`), so it has to travel through `p_clear` instead.
        beneficiaryAccountNo: v || null,
        clear: v ? undefined : ["beneficiary_account_no"],
      });
    },
    onSuccess: () => {
      toast.success("شمارهٔ حساب ذخیره شد");
      onChanged();
    },
    onError: (e) => toast.error(errText(e, "ذخیرهٔ شمارهٔ حساب انجام نشد.")),
  });

  const needsPromise = draftStatus === STATUS_REQUIRING_PROMISE;
  const canSubmitStatus =
    draftStatus !== "" && (!needsPromise || Boolean(draftPromise)) && !statusM.isPending;

  return (
    <div
      data-testid="wb-allocation-row"
      data-unfunded={row.is_unfunded ? "true" : "false"}
      className={cn(
        "space-y-2 rounded-md border p-3 text-sm",
        // The unfunded row is the one the accountant must look at again today, so it is marked
        // by colour AND by a badge — colour alone is not a signal everyone receives.
        row.is_unfunded && "border-destructive bg-destructive/5",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">
          {row.payer_name ?? NA} ← {row.beneficiary_name ?? NA}
        </span>
        {row.is_unfunded ? (
          <Badge data-testid="wb-unfunded-badge" variant="destructive">
            بی‌پشتوانه
          </Badge>
        ) : null}
      </div>

      <div className="font-semibold">{fmtMoney(row.amount)}</div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span data-testid="wb-row-status">وضعیت: {row.status ? row.status : "پیگیری نشده"}</span>
        {row.promised_at ? <span>· قول: {fmtDate(row.promised_at)}</span> : null}
        {row.promised_note ? <span>· {row.promised_note}</span> : null}
      </div>

      <div className="space-y-1">
        <Label>اولویت</Label>
        <Select
          value={row.priority}
          onValueChange={(v) => priorityM.mutate(v as AllocationPriority)}
          disabled={priorityM.isPending}
        >
          <SelectTrigger data-testid="wb-row-priority">
            <SelectValue>{PRIORITY_FA[row.priority] ?? row.priority}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ALLOCATION_PRIORITIES.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>شمارهٔ حساب ذی‌نفع</Label>
        <div className="flex gap-2">
          <Input
            data-testid="wb-row-account-no"
            value={draftAccount}
            onChange={(e) => setDraftAccount(e.target.value)}
            placeholder="ثبت نشده"
          />
          <Button
            data-testid="wb-row-account-save"
            variant="outline"
            disabled={accountM.isPending || draftAccount === (row.beneficiary_account_no ?? "")}
            onClick={() => accountM.mutate()}
          >
            ذخیره
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <Label>وضعیت پیگیری</Label>
        <Select value={draftStatus} onValueChange={(v) => setDraftStatus(v as AllocationStatus)}>
          <SelectTrigger data-testid="wb-row-status-select">
            <SelectValue placeholder="پیگیری نشده — انتخاب وضعیت" />
          </SelectTrigger>
          <SelectContent>
            {ALLOCATION_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsPromise ? (
        <div className="space-y-2">
          <DateField
            label="تاریخ قول (الزامی برای این وضعیت)"
            value={draftPromise}
            onChange={setDraftPromise}
            testId="wb-row-promise-date"
          />
          <div className="space-y-1">
            <Label>یادداشت قول (اختیاری)</Label>
            <Input
              data-testid="wb-row-promise-note"
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      <Button
        data-testid="wb-row-status-save"
        size="sm"
        className="w-full"
        disabled={!canSubmitStatus}
        onClick={() => statusM.mutate()}
      >
        {statusM.isPending ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
        ثبت وضعیت
      </Button>
    </div>
  );
}
