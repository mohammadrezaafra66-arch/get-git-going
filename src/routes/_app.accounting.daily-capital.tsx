import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarIcon, Loader2, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { toFaDigits, formatDateFa } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";

import { PageHeader } from "@/components/common/PageHeader";
import { HelpHint } from "@/components/common/HelpHint";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/_app/accounting/daily-capital")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: DailyCapitalPage,
});

type ComputeRow = {
  capital_date: string;
  formula_version: string;
  system_suggested_capital: number;
  total_receivables: number;
  overdue_receivables: number;
  due_today_receivables: number;
  future_receivables: number;
  total_payables: number;
  overdue_payables: number;
  due_today_payables: number;
  future_payables: number;
  input_id: string | null;
  bank_balance: number;
  cash_balance: number;
  incoming_checks: number;
  outgoing_checks: number;
  external_receivables: number;
  external_payables: number;
  near_term_expenses: number;
  risk_reserve: number;
  blocked_funds: number;
  inventory_liquidity_value: number;
  manual_adjustment: number;
};

const NA = "نامشخص";

function fmtMoney(n: number | null | undefined) {
  if (n == null) return NA;
  return `${toFaDigits(Math.round(Number(n)).toLocaleString("en-US"))} تومان`;
}
function isForbidden(e: unknown) {
  const msg = (e as { message?: string } | null)?.message ?? "";
  return /forbidden|permission denied|42501/i.test(msg);
}
function errMsg(e: unknown, fallback: string) {
  return isForbidden(e) ? "شما دسترسی این عملیات را ندارید." : fallback;
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "primary" | "danger" | "warn" | "info" | "muted";
}) {
  const toneCls =
    tone === "primary"
      ? "text-primary"
      : tone === "danger"
        ? "text-destructive"
        : tone === "warn"
          ? "text-amber-600 dark:text-amber-400"
          : tone === "info"
            ? "text-foreground"
            : tone === "muted"
              ? "text-muted-foreground"
              : "";
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn("text-lg font-semibold", toneCls)}>{value}</div>
      </CardContent>
    </Card>
  );
}

type InputForm = {
  bank_balance: string;
  cash_balance: string;
  incoming_checks: string;
  outgoing_checks: string;
  external_receivables: string;
  external_payables: string;
  near_term_expenses: string;
  risk_reserve: string;
  blocked_funds: string;
  inventory_liquidity_value: string;
  manual_adjustment: string;
  notes: string;
};

const EMPTY_FORM: InputForm = {
  bank_balance: "0",
  cash_balance: "0",
  incoming_checks: "0",
  outgoing_checks: "0",
  external_receivables: "0",
  external_payables: "0",
  near_term_expenses: "0",
  risk_reserve: "0",
  blocked_funds: "0",
  inventory_liquidity_value: "0",
  manual_adjustment: "0",
  notes: "",
};

function rowToForm(row: ComputeRow | null | undefined): InputForm {
  if (!row) return EMPTY_FORM;
  return {
    bank_balance: String(row.bank_balance ?? 0),
    cash_balance: String(row.cash_balance ?? 0),
    incoming_checks: String(row.incoming_checks ?? 0),
    outgoing_checks: String(row.outgoing_checks ?? 0),
    external_receivables: String(row.external_receivables ?? 0),
    external_payables: String(row.external_payables ?? 0),
    near_term_expenses: String(row.near_term_expenses ?? 0),
    risk_reserve: String(row.risk_reserve ?? 0),
    blocked_funds: String(row.blocked_funds ?? 0),
    inventory_liquidity_value: String(row.inventory_liquidity_value ?? 0),
    manual_adjustment: String(row.manual_adjustment ?? 0),
    notes: "",
  };
}

function toNum(s: string): number {
  const n = Number(String(s).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const NON_NEGATIVE_FIELDS: (keyof InputForm)[] = [
  "bank_balance",
  "cash_balance",
  "incoming_checks",
  "outgoing_checks",
  "external_receivables",
  "external_payables",
  "near_term_expenses",
  "risk_reserve",
  "blocked_funds",
  "inventory_liquidity_value",
];

function DailyCapitalPage() {
  const qc = useQueryClient();
  const [date, setDate] = useState<Date>(() => new Date());
  const dateIso = format(date, "yyyy-MM-dd");

  const computeQ = useQuery({
    queryKey: ["daily-capital-compute", dateIso],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("compute_daily_capital", {
        p_capital_date: dateIso,
      });
      if (error) throw error;
      const rows = (data as ComputeRow[] | null) ?? [];
      return rows[0] ?? null;
    },
    staleTime: 30_000,
  });

  const [form, setForm] = useState<InputForm>(EMPTY_FORM);
  const [finalCapital, setFinalCapital] = useState<string>("0");
  const [overrideReason, setOverrideReason] = useState<string>("");

  // sync form & final when compute result changes (only when date changes)
  useEffect(() => {
    if (computeQ.data) {
      setForm(rowToForm(computeQ.data));
      setFinalCapital(String(Math.round(Number(computeQ.data.system_suggested_capital ?? 0))));
      setOverrideReason("");
    } else if (computeQ.data === null) {
      setForm(EMPTY_FORM);
      setFinalCapital("0");
      setOverrideReason("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computeQ.data?.capital_date]);

  const upsertM = useMutation({
    mutationFn: async () => {
      // client-side validation: non-negative for the listed fields
      for (const k of NON_NEGATIVE_FIELDS) {
        if (toNum(form[k]) < 0) throw new Error(`مقدار «${k}» نباید منفی باشد.`);
      }
      const { data, error } = await supabase.rpc("upsert_daily_capital_input", {
        p_capital_date: dateIso,
        p_bank_balance: toNum(form.bank_balance),
        p_cash_balance: toNum(form.cash_balance),
        p_incoming_checks: toNum(form.incoming_checks),
        p_outgoing_checks: toNum(form.outgoing_checks),
        p_external_receivables: toNum(form.external_receivables),
        p_external_payables: toNum(form.external_payables),
        p_near_term_expenses: toNum(form.near_term_expenses),
        p_risk_reserve: toNum(form.risk_reserve),
        p_blocked_funds: toNum(form.blocked_funds),
        p_inventory_liquidity_value: toNum(form.inventory_liquidity_value),
        p_manual_adjustment: toNum(form.manual_adjustment),
        p_notes: form.notes?.trim() || undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      toast.success("ورودی‌های روز ذخیره شد.");
      await qc.invalidateQueries({ queryKey: ["daily-capital-compute", dateIso] });
    },
    onError: (e) => toast.error(errMsg(e, "ذخیره ورودی‌ها با خطا مواجه شد.")),
  });

  const saveSnapshotM = useMutation({
    mutationFn: async () => {
      const final = toNum(finalCapital);
      if (final < 0) throw new Error("سرمایه نهایی نمی‌تواند منفی باشد.");
      const suggested = Math.round(Number(computeQ.data?.system_suggested_capital ?? 0));
      const reason = overrideReason.trim();
      if (Math.round(final) !== suggested && reason.length === 0) {
        throw new Error("اگر سرمایه نهایی با سرمایه پیشنهادی فرق دارد، توضیح override الزامی است.");
      }
      const { data, error } = await supabase.rpc("save_daily_capital_snapshot", {
        p_capital_date: dateIso,
        p_final_capital: final,
        p_override_reason: reason || undefined,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      toast.success("اسنپ‌شات سرمایه روز ذخیره شد.");
      await qc.invalidateQueries({ queryKey: ["daily-capital-compute", dateIso] });
    },
    onError: (e) => toast.error(errMsg(e, "ذخیره اسنپ‌شات با خطا مواجه شد.")),
  });

  const c = computeQ.data;
  const suggestedRounded = useMemo(
    () => (c ? Math.round(Number(c.system_suggested_capital ?? 0)) : 0),
    [c],
  );
  const isOverride = c ? Math.round(toNum(finalCapital)) !== suggestedRounded : false;

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <PageHeader
        title="سرمایه روز"
        description="محاسبه سرمایه قابل تخصیص برای فروش حساب‌باز"
        actions={
          <HelpHint
            size={18}
            text={
              "این صفحه «سرمایه قابل تخصیص روز» را محاسبه می‌کند.\n" +
              "۱) تاریخ موردنظر را انتخاب کنید.\n" +
              "۲) ورودی‌های دستی (موجودی بانک، صندوق، چک‌ها، …) را وارد و ذخیره کنید.\n" +
              "۳) عدد «سرمایه پیشنهادی سیستم» محاسبه می‌شود.\n" +
              "۴) در «سرمایه نهایی تأییدشده» عدد را تأیید یا تغییر دهید (در صورت تغییر، دلیل اجباری است) و اسنپ‌شات را ثبت کنید.\n" +
              "این اسنپ‌شات سپس بین فروشندگان و در ادامه بین مشتریان تخصیص داده می‌شود."
            }
          />
        }
      />

      {/* Date picker + refresh */}
      <div className="flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-start gap-2">
              <CalendarIcon className="h-4 w-4" />
              {toFaDigits(formatDateFa(dateIso))}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={(d) => d && setDate(d)}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          onClick={() => computeQ.refetch()}
          disabled={computeQ.isFetching}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", computeQ.isFetching && "animate-spin")} />
          به‌روزرسانی
        </Button>
        <div className="ms-auto text-xs text-muted-foreground">
          نسخه فرمول: {toFaDigits(c?.formula_version ?? "v1")}
        </div>
      </div>

      {/* Loading / error */}
      {computeQ.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> در حال محاسبه…
        </div>
      ) : computeQ.isError ? (
        <Card>
          <CardContent className="p-4 text-destructive">
            {errMsg(computeQ.error, "دریافت محاسبه سرمایه روز با خطا مواجه شد.")}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard
              label="سرمایه پیشنهادی سیستم"
              value={fmtMoney(c?.system_suggested_capital)}
              tone="primary"
            />
            <SummaryCard
              label="مطالبات سررسید این روز"
              value={fmtMoney(c?.due_today_receivables)}
              tone="info"
            />
            <SummaryCard
              label="بدهی‌های سررسید این روز"
              value={fmtMoney(c?.due_today_payables)}
              tone="warn"
            />
            <SummaryCard
              label="مطالبات معوق"
              value={fmtMoney(c?.overdue_receivables)}
              tone="danger"
            />
            <SummaryCard
              label="بدهی‌های معوق"
              value={fmtMoney(c?.overdue_payables)}
              tone="danger"
            />
            <SummaryCard label="کل مطالبات" value={fmtMoney(c?.total_receivables)} tone="muted" />
            <SummaryCard label="کل بدهی‌ها" value={fmtMoney(c?.total_payables)} tone="muted" />
            <SummaryCard
              label="مطالبات / بدهی آینده"
              value={`${fmtMoney(c?.future_receivables)} / ${fmtMoney(c?.future_payables)}`}
              tone="muted"
            />
          </div>

          {/* Inputs form */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="text-sm font-semibold inline-flex items-center gap-1">
                ورودی‌های دستی این روز
                <HelpHint
                  text={
                    "اعدادی که سیستم خودکار از حساب‌ها استخراج نمی‌کند را اینجا وارد کنید.\nهمه فیلدها به جز «تعدیل دستی» باید نامنفی باشند.\nبعد از هر تغییر، «ذخیره ورودی‌ها» را بزنید تا در محاسبه سرمایه پیشنهادی اعمال شود."
                  }
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <NumField
                  label="موجودی بانک‌ها"
                  hint="مجموع موجودی قابل برداشت همه حساب‌های بانکی شرکت در پایان امروز."
                  value={form.bank_balance}
                  onChange={(v) => setForm({ ...form, bank_balance: v })}
                />
                <NumField
                  label="موجودی صندوق"
                  hint="پول نقد موجود در صندوق‌های شرکت."
                  value={form.cash_balance}
                  onChange={(v) => setForm({ ...form, cash_balance: v })}
                />
                <NumField
                  label="چک‌های دریافتی در راه وصول"
                  hint="مبلغ چک‌هایی که از مشتریان گرفته‌اید و هنوز به حساب نشسته اما تا چند روز آینده وصول می‌شوند."
                  value={form.incoming_checks}
                  onChange={(v) => setForm({ ...form, incoming_checks: v })}
                />
                <NumField
                  label="چک‌های پرداختی"
                  hint="مبلغ چک‌هایی که شما داده‌اید و هنوز پاس نشده‌اند؛ از سرمایه قابل استفاده کم می‌شود."
                  value={form.outgoing_checks}
                  onChange={(v) => setForm({ ...form, outgoing_checks: v })}
                />
                <NumField
                  label="مطالبات خارج از سیستم"
                  hint="پول‌هایی که باید به شما برسد ولی در این نرم‌افزار ثبت نشده‌اند (مثلاً بدهی شخصی یا قرارداد خارج از سیستم)."
                  value={form.external_receivables}
                  onChange={(v) => setForm({ ...form, external_receivables: v })}
                />
                <NumField
                  label="بدهی‌های خارج از سیستم"
                  hint="بدهی‌هایی که باید پرداخت کنید ولی در نرم‌افزار ثبت نشده‌اند."
                  value={form.external_payables}
                  onChange={(v) => setForm({ ...form, external_payables: v })}
                />
                <NumField
                  label="هزینه‌های نزدیک"
                  hint="هزینه‌های قطعی روزهای نزدیک (حقوق، اجاره، عوارض و …) که باید از سرمایه کنار گذاشته شود."
                  value={form.near_term_expenses}
                  onChange={(v) => setForm({ ...form, near_term_expenses: v })}
                />
                <NumField
                  label="ذخیره ریسک"
                  hint="مبلغی که محتاطانه برای اتفاقات پیش‌بینی‌نشده کنار می‌گذارید."
                  value={form.risk_reserve}
                  onChange={(v) => setForm({ ...form, risk_reserve: v })}
                />
                <NumField
                  label="وجوه بلوکه‌شده"
                  hint="مبالغی که فعلاً قابل استفاده نیستند (تضامین، ضمانت‌نامه، وثیقه و …)."
                  value={form.blocked_funds}
                  onChange={(v) => setForm({ ...form, blocked_funds: v })}
                />
                <NumField
                  label="ارزش نقدشوندگی موجودی انبار"
                  hint="آن بخش از موجودی انبار که در صورت لزوم سریع نقد می‌شود — معمولاً درصدی از کل ارزش انبار."
                  value={form.inventory_liquidity_value}
                  onChange={(v) => setForm({ ...form, inventory_liquidity_value: v })}
                />
                <NumField
                  label="تعدیل دستی (می‌تواند منفی باشد)"
                  hint="اصلاح دستی نهایی برای بالا یا پایین بردن سرمایه پیشنهادی. مقدار منفی مجاز است."
                  value={form.manual_adjustment}
                  allowNegative
                  onChange={(v) => setForm({ ...form, manual_adjustment: v })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">توضیحات</Label>
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="یادداشت اختیاری برای ورودی‌های این روز"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => upsertM.mutate()}
                  disabled={upsertM.isPending}
                  className="gap-2"
                >
                  {upsertM.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  ذخیره ورودی‌ها
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Formula explanation */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="text-sm font-semibold">فرمول نسخه ۱</div>
              <pre
                className="text-xs leading-7 whitespace-pre-wrap text-muted-foreground"
                dir="rtl"
              >
                {`سرمایه پیشنهادی = موجودی بانک + صندوق + چک‌های دریافتی
  + مطالبات سررسید این روز + مطالبات خارج از سیستم
  + ارزش نقدشوندگی انبار + تعدیل دستی
  − بدهی‌های سررسید این روز − چک‌های پرداختی
  − بدهی‌های خارج از سیستم − هزینه‌های نزدیک
  − ذخیره ریسک − وجوه بلوکه‌شده
(در صورت منفی شدن، صفر در نظر گرفته می‌شود)`}
              </pre>
            </CardContent>
          </Card>

          <Separator />

          {/* Final / snapshot */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                ثبت سرمایه نهایی روز
                <HelpHint
                  text={
                    "این مرحله سرمایه نهایی روز را قفل می‌کند.\nاگر عدد «سرمایه نهایی تأییدشده» با «سرمایه پیشنهادی سیستم» فرق داشته باشد، باید دلیل تغییر را بنویسید.\nبعد از ثبت اسنپ‌شات، می‌توان آن را بین فروشندگان تخصیص داد."
                  }
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">سرمایه پیشنهادی سیستم</Label>
                  <Input value={fmtMoney(c?.system_suggested_capital)} disabled />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">سرمایه نهایی تأییدشده</Label>
                  <Input
                    inputMode="numeric"
                    value={toFaDigits(finalCapital)}
                    onChange={(e) => {
                      // accept Persian digits + raw numbers; strip non-digits
                      const raw = e.target.value
                        .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
                        .replace(/[^\d]/g, "");
                      setFinalCapital(raw);
                    }}
                  />
                </div>
              </div>
              {isOverride && (
                <div className="space-y-1">
                  <Label className="text-xs">دلیل override (اجباری وقتی نهایی ≠ پیشنهادی)</Label>
                  <Textarea
                    rows={2}
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="توضیح کوتاه دلیل تغییر مقدار نسبت به پیشنهاد سیستم"
                  />
                </div>
              )}
              <div className="flex justify-end">
                <Button
                  onClick={() => saveSnapshotM.mutate()}
                  disabled={saveSnapshotM.isPending}
                  className="gap-2"
                  variant={isOverride ? "secondary" : "default"}
                >
                  {saveSnapshotM.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {isOverride ? "ثبت با override" : "ثبت اسنپ‌شات"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  allowNegative,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allowNegative?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs inline-flex items-center gap-1">
        {label}
        {hint ? <HelpHint text={hint} /> : null}
      </Label>
      <Input
        inputMode="numeric"
        value={toFaDigits(value)}
        onChange={(e) => {
          let raw = e.target.value.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
          raw = allowNegative ? raw.replace(/[^\d-]/g, "") : raw.replace(/[^\d]/g, "");
          // keep at most one leading minus
          if (allowNegative) raw = raw.replace(/(?!^)-/g, "");
          onChange(raw === "" ? "0" : raw);
        }}
      />
    </div>
  );
}
