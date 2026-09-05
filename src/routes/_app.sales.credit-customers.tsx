import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronsUpDown,
  Filter,
  Loader2,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

import { requirePermission } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { useDebounce } from "@/hooks/use-debounce";
import { normalizeSearchText } from "@/lib/i18n/search-normalizer";
import { cn } from "@/lib/utils";
import { formatNumber, toFaDigits } from "@/lib/i18n/formatters";

import { PageHeader } from "@/components/common/PageHeader";
import { HelpHint } from "@/components/common/HelpHint";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export const Route = createFileRoute("/_app/sales/credit-customers")({
  beforeLoad: async () => {
    await requirePermission("sales", "view");
  },
  component: CreditCustomersPage,
});

const PAGE_SIZE = 20;

interface TrustedCreditCustomerRow {
  customer_id: string;
  customer_name: string;
  phone: string | null;
  easy_code: string | null;
  responsible_id: string | null;
  responsible_name: string | null;
  // 452 — these four are fed by `customer_credit_profile`, which is empty until
  // someone runs the credit recompute. They are NULL, not 0, when uncomputed;
  // `has_credit_profile` says which case a row is in.
  total_purchases: number | null;
  credit_score: number | null;
  credit_limit: number | null;
  available_credit: number;
  held_credit: number;
  outstanding_balance: number | null;
  computed_allowed_credit: number;
  has_active_overdue: boolean;
  overdue_amount: number;
  overdue_count: number;
  oldest_due_date: string | null;
  is_trusted: boolean;
  status_code: "trusted" | "overdue" | "no_credit" | "inactive" | string;
  status_reason: string;
  has_credit_profile: boolean;
  total_count: number;
}

interface NumRange {
  from: string;
  to: string;
}

type RpcError = { message?: string } | null;
type RpcResult<T> = Promise<{ data: T | null; error: RpcError }>;
type TrustedCustomersRpc = (
  fn: "list_trusted_credit_customers",
  args: Record<string, unknown>,
) => RpcResult<TrustedCreditCustomerRow[]>;

const EMPTY_RANGE: NumRange = { from: "", to: "" };

/**
 * 452 — appended to the three filters that read `customer_credit_profile`.
 * They cannot match a customer whose profile has never been computed, and before
 * 452 they silently matched everyone on the strength of a fabricated 0.
 */
const FILTER_NEEDS_PROFILE =
  " تا وقتی امتیاز اعتباری محاسبه نشده باشد، این فیلتر مشتری‌ای برنمی‌گرداند.";

function rangeError(r: NumRange): string | null {
  const f = r.from === "" ? null : Number(r.from);
  const t = r.to === "" ? null : Number(r.to);
  if (f !== null && (Number.isNaN(f) || f < 0)) return "مقدار از باید عدد ≥ ۰ باشد";
  if (t !== null && (Number.isNaN(t) || t < 0)) return "مقدار تا باید عدد ≥ ۰ باشد";
  if (f !== null && t !== null && t < f) return "تا نباید کمتر از از باشد";
  return null;
}

function toNullableNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function CreditCustomersPage() {
  const { roles } = useAuth();
  const canOpenSensitiveProfile = hasAnyRole(roles, ["admin", "manager", "accountant"]);

  const [page, setPage] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [purchases, setPurchases] = useState<NumRange>(EMPTY_RANGE);
  const [allowedCredit, setAllowedCredit] = useState<NumRange>(EMPTY_RANGE);
  const [debt, setDebt] = useState<NumRange>(EMPTY_RANGE);
  const [score, setScore] = useState<NumRange>(EMPTY_RANGE);
  const [onlyTrusted, setOnlyTrusted] = useState(true);

  const dName = normalizeSearchText(useDebounce(name, 350));
  const dPhone = useDebounce(phone, 350);
  const dPurchases = useDebounce(purchases, 350);
  const dAllowedCredit = useDebounce(allowedCredit, 350);
  const dDebt = useDebounce(debt, 350);
  const dScore = useDebounce(score, 350);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (dName.trim()) n++;
    if (dPhone.trim()) n++;
    if (dPurchases.from || dPurchases.to) n++;
    if (dAllowedCredit.from || dAllowedCredit.to) n++;
    if (dDebt.from || dDebt.to) n++;
    if (dScore.from || dScore.to) n++;
    if (onlyTrusted) n++;
    return n;
  }, [dName, dPhone, dPurchases, dAllowedCredit, dDebt, dScore, onlyTrusted]);

  const rangeErrors = {
    purchases: rangeError(dPurchases),
    allowedCredit: rangeError(dAllowedCredit),
    debt: rangeError(dDebt),
    score: rangeError(dScore),
  };
  const hasRangeError = Object.values(rangeErrors).some(Boolean);

  const queryKey = [
    "trusted-credit-customers",
    page,
    dName,
    dPhone,
    dPurchases,
    dAllowedCredit,
    dDebt,
    dScore,
    onlyTrusted,
  ];

  const { data, isFetching, error } = useQuery({
    queryKey,
    enabled: !hasRangeError,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as TrustedCustomersRpc)(
        "list_trusted_credit_customers",
        {
          p_search: dName.trim() || null,
          p_phone: dPhone.trim() || null,
          p_min_total_purchases: toNullableNumber(dPurchases.from),
          p_max_total_purchases: toNullableNumber(dPurchases.to),
          p_min_allowed_credit: toNullableNumber(dAllowedCredit.from),
          p_max_allowed_credit: toNullableNumber(dAllowedCredit.to),
          p_min_outstanding_balance: toNullableNumber(dDebt.from),
          p_max_outstanding_balance: toNullableNumber(dDebt.to),
          p_min_credit_score: toNullableNumber(dScore.from),
          p_max_credit_score: toNullableNumber(dScore.to),
          p_only_trusted: onlyTrusted,
          p_limit: PAGE_SIZE,
          p_offset: page * PAGE_SIZE,
        },
      );

      if (error) throw new Error(error.message || "خطا در دریافت مشتریان معتبر");
      const rows = data ?? [];
      return { rows, count: rows[0]?.total_count ?? 0 };
    },
  });

  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // 452 — counted from the rows on screen, never written as a literal.
  const uncomputedCount = (data?.rows ?? []).filter((r) => !r.has_credit_profile).length;

  function clearAll() {
    setPage(0);
    setName("");
    setPhone("");
    setPurchases(EMPTY_RANGE);
    setAllowedCredit(EMPTY_RANGE);
    setDebt(EMPTY_RANGE);
    setScore(EMPTY_RANGE);
    setOnlyTrusted(true);
  }

  const filtersPanel = (
    <FiltersForm
      name={name}
      setName={(v) => {
        setPage(0);
        setName(v);
      }}
      phone={phone}
      setPhone={(v) => {
        setPage(0);
        setPhone(v);
      }}
      purchases={purchases}
      setPurchases={(v) => {
        setPage(0);
        setPurchases(v);
      }}
      allowedCredit={allowedCredit}
      setAllowedCredit={(v) => {
        setPage(0);
        setAllowedCredit(v);
      }}
      debt={debt}
      setDebt={(v) => {
        setPage(0);
        setDebt(v);
      }}
      score={score}
      setScore={(v) => {
        setPage(0);
        setScore(v);
      }}
      onlyTrusted={onlyTrusted}
      setOnlyTrusted={(v) => {
        setPage(0);
        setOnlyTrusted(v);
      }}
      errors={rangeErrors}
    />
  );

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="مشتریان معتبر و سقف حساب‌باز"
        description="نمای کنترل‌شدهٔ مشتریان قابل فروش حساب‌باز و سقف مجاز محاسبه‌شده"
        actions={
          <HelpHint
            size={18}
            text={
              "مشتری معتبر یعنی مشتری‌ای که معوق فعال ندارد و سقف مجاز محاسبه‌شده‌اش بیشتر از صفر است.\n" +
              "عدد اصلی این صفحه «سقف مجاز حساب‌باز» است؛ یعنی اعتبار قابل استفاده پس از کسر محدودیت‌های فعال، نه صرفاً سقف خام اعتبار.\n" +
              "فروشنده‌ها نمای عملیاتی و محدود می‌بینند؛ جزئیات حساس فرمول اعتبار فقط در صفحات مجاز باقی می‌ماند."
            }
          />
        }
      />

      {/* 452 — say WHY three columns are empty, instead of leaving the operator to
          guess. Driven by the rows actually on screen: when the recompute is wired
          and profiles exist, this disappears on its own with nothing to remember to
          remove — the same self-clearing pattern the suppliers page uses. */}
      {uncomputedCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="leading-6">
            <span className="font-medium">
              برای {toFaDigits(uncomputedCount)} مشتری از {toFaDigits(data?.rows.length ?? 0)} مشتری
              این صفحه، امتیاز اعتباری هنوز محاسبه نشده است
            </span>
            <p className="text-xs text-muted-foreground">
              ستون‌های «امتیاز»، «سقف اعتبار پایه» و «بدهی جاری» برای این مشتری‌ها «محاسبه نشده»
              نشان داده می‌شوند، نه صفر. تصمیم فروش حساب‌باز به این سه ستون وابسته نیست: «سقف مجاز
              حساب‌باز» و وضعیت معتبر/معوق از اعتبار در دسترس و صورت‌حساب‌های سررسیدشده می‌آیند و
              درست‌اند. فیلتر «امتیاز» و «مجموع خرید» تا وقتی محاسبه انجام نشده نتیجه‌ای
              برنمی‌گردانند.
            </p>
          </div>
        </div>
      )}

      <div className="md:hidden">
        <Sheet>
          <div className="flex items-center justify-between gap-2">
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                <Filter className="ml-1 h-4 w-4" />
                فیلترها
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="mr-1">
                    {toFaDigits(activeFilterCount)}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAll}>
                <X className="ml-1 h-3.5 w-3.5" /> پاک کردن همه
              </Button>
            )}
          </div>
          <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md" dir="rtl">
            <SheetHeader>
              <SheetTitle>فیلترهای مشتریان معتبر</SheetTitle>
            </SheetHeader>
            <div className="mt-4">{filtersPanel}</div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="hidden md:block">
        <Card>
          <CardContent className="p-4">
            <Collapsible defaultOpen>
              <div className="flex items-center justify-between">
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <Filter className="h-4 w-4" />
                    فیلترها
                    {activeFilterCount > 0 && (
                      <Badge variant="secondary">{toFaDigits(activeFilterCount)}</Badge>
                    )}
                    <ChevronsUpDown className="h-4 w-4 opacity-60" />
                  </Button>
                </CollapsibleTrigger>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearAll}>
                    <X className="ml-1 h-3.5 w-3.5" /> پاک کردن همه فیلترها
                  </Button>
                )}
              </div>
              <CollapsibleContent className="pt-4">{filtersPanel}</CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          {error && (
            <p className="text-sm text-destructive">خطا در بارگذاری: {(error as Error).message}</p>
          )}
          {isFetching && (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
              <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام مشتری</TableHead>
                  <TableHead>تلفن</TableHead>
                  <TableHead>مسئول</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>سقف مجاز حساب‌باز</TableHead>
                  <TableHead>سقف اعتبار پایه</TableHead>
                  <TableHead>بدهی جاری</TableHead>
                  <TableHead>امتیاز</TableHead>
                  <TableHead>دلیل</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.rows ?? []).map((r) => (
                  <TableRow key={r.customer_id}>
                    <TableCell>
                      {canOpenSensitiveProfile ? (
                        <Link
                          to="/sales/customers/$customerId/credit"
                          params={{ customerId: r.customer_id }}
                          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {r.customer_name}
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-medium">
                          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                          {r.customer_name}
                        </span>
                      )}
                      {r.easy_code && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          کد آسان: {toFaDigits(r.easy_code)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell dir="ltr" className="text-right">
                      {r.phone ? toFaDigits(r.phone) : "—"}
                    </TableCell>
                    <TableCell>
                      {r.responsible_name || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <TrustedStatusBadge row={r} />
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatNumber(Number(r.computed_allowed_credit ?? 0))}
                    </TableCell>
                    <TableCell>
                      <ComputedNumber value={r.credit_limit} />
                    </TableCell>
                    <TableCell>
                      <ComputedNumber value={r.outstanding_balance} />
                    </TableCell>
                    <TableCell>
                      {r.credit_score === null ? (
                        <span className="text-xs text-muted-foreground">محاسبه نشده</span>
                      ) : (
                        <ScoreBadge score={Number(r.credit_score)} />
                      )}
                    </TableCell>
                    <TableCell className="min-w-[220px] text-xs text-muted-foreground">
                      <div>{r.status_reason || "—"}</div>
                      {r.has_active_overdue && (
                        <div className="mt-1 text-destructive">
                          معوق: {formatNumber(Number(r.overdue_amount ?? 0))}
                          {r.oldest_due_date
                            ? `، قدیمی‌ترین سررسید: ${toFaDigits(r.oldest_due_date)}`
                            : ""}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!isFetching && (data?.rows.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-6 text-center text-muted-foreground">
                      مشتری‌ای با این فیلترها یافت نشد
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>مجموع: {toFaDigits(total)}</span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                قبلی
              </Button>
              <span className="self-center">
                صفحه {toFaDigits(page + 1)} از {toFaDigits(totalPages)}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                بعدی
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * 452 — a number that was never computed is not the number zero.
 *
 * `customer_credit_profile` is empty until the credit recompute runs, and nothing
 * currently runs it. Before 452 the RPC turned that absence into 0 and this table
 * printed «۰» — a row flagged «معوق‌دار» with 415,800,000 overdue also read
 * «بدهی جاری: ۰». The RPC now sends NULL, and this renders the difference.
 */
function ComputedNumber({ value }: { value: number | null }) {
  if (value === null || value === undefined) {
    return <span className="text-xs text-muted-foreground">محاسبه نشده</span>;
  }
  return <>{formatNumber(Number(value))}</>;
}

function TrustedStatusBadge({ row }: { row: TrustedCreditCustomerRow }) {
  const cls = row.is_trusted
    ? "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300"
    : row.has_active_overdue
      ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
      : "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300";

  const label = row.is_trusted
    ? "معتبر"
    : row.has_active_overdue
      ? "معوق‌دار"
      : row.status_code === "inactive"
        ? "غیرفعال"
        : "بدون سقف مجاز";

  return (
    <Badge variant="outline" className={cn("gap-1 font-semibold", cls)}>
      {row.has_active_overdue && <AlertTriangle className="h-3 w-3" />}
      {label}
    </Badge>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score <= 30
      ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"
      : score <= 60
        ? "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300"
        : "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300";
  return (
    <Badge variant="outline" className={cn("font-semibold", cls)}>
      {toFaDigits(score)}
    </Badge>
  );
}

interface FiltersFormProps {
  name: string;
  setName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  purchases: NumRange;
  setPurchases: (v: NumRange) => void;
  allowedCredit: NumRange;
  setAllowedCredit: (v: NumRange) => void;
  debt: NumRange;
  setDebt: (v: NumRange) => void;
  score: NumRange;
  setScore: (v: NumRange) => void;
  onlyTrusted: boolean;
  setOnlyTrusted: (v: boolean) => void;
  errors: {
    purchases: string | null;
    allowedCredit: string | null;
    debt: string | null;
    score: string | null;
  };
}

function FiltersForm(p: FiltersFormProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">نام مشتری</Label>
          <div className="relative">
            <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={p.name}
              onChange={(e) => p.setName(e.target.value)}
              placeholder="جستجوی نام یا کد آسان..."
              className="pr-8"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">شماره موبایل</Label>
          <Input
            value={p.phone}
            onChange={(e) => p.setPhone(e.target.value)}
            placeholder="09..."
            inputMode="numeric"
            dir="ltr"
            className="text-right"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">نمایش</Label>
          <Button
            type="button"
            variant={p.onlyTrusted ? "default" : "outline"}
            className="w-full justify-center"
            onClick={() => p.setOnlyTrusted(!p.onlyTrusted)}
          >
            {p.onlyTrusted ? "فقط مشتریان معتبر" : "همه وضعیت‌های اعتباری"}
          </Button>
        </div>
      </div>

      <NumberRange
        label="سابقه خرید (تومان)"
        range={p.purchases}
        onChange={p.setPurchases}
        error={p.errors.purchases}
        hint={"مجموع خرید ثبت‌شده برای مشتری." + FILTER_NEEDS_PROFILE}
      />
      <NumberRange
        label="سقف مجاز حساب‌باز (تومان)"
        range={p.allowedCredit}
        onChange={p.setAllowedCredit}
        error={p.errors.allowedCredit}
        hint="عدد قابل استفاده برای فروش حساب‌باز؛ مشتری معوق‌دار اینجا صفر می‌شود."
      />
      <NumberRange
        label="بدهی جاری (تومان)"
        range={p.debt}
        onChange={p.setDebt}
        error={p.errors.debt}
        hint={"مانده بدهی فعلی مشتری." + FILTER_NEEDS_PROFILE}
      />
      <NumberRange
        label="امتیاز اعتباری"
        range={p.score}
        onChange={p.setScore}
        error={p.errors.score}
        hint={
          "امتیاز فقط روی مبلغ اعتبار اثر می‌گذارد و به‌تنهایی مجوز فروش نیست." +
          FILTER_NEEDS_PROFILE
        }
      />
    </div>
  );
}

function NumberRange({
  label,
  range,
  onChange,
  error,
  hint,
}: {
  label: string;
  range: NumRange;
  onChange: (r: NumRange) => void;
  error: string | null;
  hint: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {label}
        <HelpHint text={hint} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={range.from}
          onChange={(e) => onChange({ ...range, from: e.target.value })}
          placeholder="از"
          inputMode="numeric"
          dir="ltr"
          className="text-right"
        />
        <Input
          value={range.to}
          onChange={(e) => onChange({ ...range, to: e.target.value })}
          placeholder="تا"
          inputMode="numeric"
          dir="ltr"
          className="text-right"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
