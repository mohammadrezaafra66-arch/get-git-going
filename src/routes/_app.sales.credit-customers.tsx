import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, Filter, X, Check, ChevronsUpDown, ShieldCheck, Search,
} from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/_app/sales/credit-customers")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: CreditCustomersPage,
});

const PAGE_SIZE = 20;

interface Row {
  id: string;
  name: string;
  phone: string | null;
  responsible_id: string | null;
  responsible: { id: string; full_name: string | null } | null;
  customer_credit_profile: {
    total_purchases: number;
    credit_limit: number;
    outstanding_balance: number;
    credit_score: number;
  } | null;
}

interface NumRange {
  from: string;
  to: string;
}

const EMPTY_RANGE: NumRange = { from: "", to: "" };

function rangeError(r: NumRange): string | null {
  const f = r.from === "" ? null : Number(r.from);
  const t = r.to === "" ? null : Number(r.to);
  if (f !== null && (isNaN(f) || f < 0)) return "مقدار از باید عدد ≥ ۰ باشد";
  if (t !== null && (isNaN(t) || t < 0)) return "مقدار تا باید عدد ≥ ۰ باشد";
  if (f !== null && t !== null && t < f) return "تا نباید کمتر از از باشد";
  return null;
}

function CreditCustomersPage() {
  const [page, setPage] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [responsible, setResponsible] = useState<{ id: string; label: string } | null>(null);
  const [purchases, setPurchases] = useState<NumRange>(EMPTY_RANGE);
  const [credit, setCredit] = useState<NumRange>(EMPTY_RANGE);
  const [debt, setDebt] = useState<NumRange>(EMPTY_RANGE);
  const [score, setScore] = useState<NumRange>(EMPTY_RANGE);

  const dName = normalizeSearchText(useDebounce(name, 350));
  const dPhone = useDebounce(phone, 350);
  const dPurchases = useDebounce(purchases, 350);
  const dCredit = useDebounce(credit, 350);
  const dDebt = useDebounce(debt, 350);
  const dScore = useDebounce(score, 350);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (dName.trim()) n++;
    if (dPhone.trim()) n++;
    if (responsible) n++;
    if (dPurchases.from || dPurchases.to) n++;
    if (dCredit.from || dCredit.to) n++;
    if (dDebt.from || dDebt.to) n++;
    if (dScore.from || dScore.to) n++;
    return n;
  }, [dName, dPhone, responsible, dPurchases, dCredit, dDebt, dScore]);

  const rangeErrors = {
    purchases: rangeError(dPurchases),
    credit: rangeError(dCredit),
    debt: rangeError(dDebt),
    score: rangeError(dScore),
  };
  const hasRangeError = Object.values(rangeErrors).some(Boolean);

  const queryKey = [
    "credit-customers", page, dName, dPhone, responsible?.id ?? null,
    dPurchases, dCredit, dDebt, dScore,
  ];

  const { data, isFetching, error } = useQuery({
    queryKey,
    enabled: !hasRangeError,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("customers")
        .select(
          `id, name, phone, responsible_id,
           responsible:profiles!customers_responsible_id_fkey(id, full_name),
           customer_credit_profile!inner(total_purchases, credit_limit, outstanding_balance, credit_score)`,
          { count: "exact" },
        )
        .order("name", { ascending: true })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      const term = dName.trim().replace(/[%_]/g, "");
      if (term) q = q.ilike("name", `%${term}%`);
      const phoneTerm = dPhone.trim().replace(/[%_]/g, "");
      if (phoneTerm) q = q.ilike("phone", `%${phoneTerm}%`);
      if (responsible?.id) q = q.eq("responsible_id", responsible.id);

      const numFilter = (
        col: string, r: NumRange,
      ) => {
        if (r.from !== "") q = q.gte(`customer_credit_profile.${col}`, Number(r.from));
        if (r.to !== "") q = q.lte(`customer_credit_profile.${col}`, Number(r.to));
      };
      numFilter("total_purchases", dPurchases);
      numFilter("credit_limit", dCredit);
      numFilter("outstanding_balance", dDebt);
      numFilter("credit_score", dScore);

      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as Row[], count: count ?? 0 };
    },
  });

  const total = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function clearAll() {
    setPage(0);
    setName(""); setPhone(""); setResponsible(null);
    setPurchases(EMPTY_RANGE); setCredit(EMPTY_RANGE);
    setDebt(EMPTY_RANGE); setScore(EMPTY_RANGE);
  }

  const filtersPanel = (
    <FiltersForm
      name={name} setName={(v) => { setPage(0); setName(v); }}
      phone={phone} setPhone={(v) => { setPage(0); setPhone(v); }}
      responsible={responsible} setResponsible={(v) => { setPage(0); setResponsible(v); }}
      purchases={purchases} setPurchases={(v) => { setPage(0); setPurchases(v); }}
      credit={credit} setCredit={(v) => { setPage(0); setCredit(v); }}
      debt={debt} setDebt={(v) => { setPage(0); setDebt(v); }}
      score={score} setScore={(v) => { setPage(0); setScore(v); }}
      errors={rangeErrors}
    />
  );

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="وضعیت اعتبار مشتریان"
        description="فیلتر و مشاهده وضعیت اعتباری مشتریان"
        actions={
          <HelpHint
            size={18}
            text={
              "این لیست وضعیت اعتباری همهٔ مشتریان را نشان می‌دهد.\n" +
              "با فیلترها می‌توانید بر اساس نام، تلفن، مسئول، سابقهٔ خرید، اعتبار، بدهی یا امتیاز فیلتر کنید.\n" +
              "روی نام هر مشتری بزنید تا وارد پروفایل اعتباری او شوید."
            }
          />
        }
      />

      {/* Mobile: Sheet, Desktop: Collapsible */}
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
          <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto" dir="rtl">
            <SheetHeader>
              <SheetTitle>فیلترهای پیشرفته</SheetTitle>
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
        <CardContent className="p-4 space-y-4">
          {error && (
            <p className="text-sm text-destructive">
              خطا در بارگذاری: {(error as Error).message}
            </p>
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
                  <TableHead>کل خرید</TableHead>
                  <TableHead>اعتبار</TableHead>
                  <TableHead>بدهی</TableHead>
                  <TableHead>امتیاز</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.rows ?? []).map((r) => {
                  const ccp = r.customer_credit_profile;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link
                          to="/sales/customers/$customerId/credit"
                          params={{ customerId: r.id }}
                          className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          {r.name}
                        </Link>
                      </TableCell>
                      <TableCell dir="ltr" className="text-right">
                        {r.phone ? toFaDigits(r.phone) : "—"}
                      </TableCell>
                      <TableCell>
                        {r.responsible?.full_name || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{ccp ? formatNumber(ccp.total_purchases) : "—"}</TableCell>
                      <TableCell>{ccp ? formatNumber(ccp.credit_limit) : "—"}</TableCell>
                      <TableCell>{ccp ? formatNumber(ccp.outstanding_balance) : "—"}</TableCell>
                      <TableCell>
                        {ccp ? <ScoreBadge score={ccp.credit_score} /> : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!isFetching && (data?.rows.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
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
              <Button size="sm" variant="outline" disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}>
                قبلی
              </Button>
              <span className="self-center">
                صفحه {toFaDigits(page + 1)} از {toFaDigits(totalPages)}
              </span>
              <Button size="sm" variant="outline" disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}>
                بعدی
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Score badge ---------------- */

function ScoreBadge({ score }: { score: number }) {
  const cls = score <= 30
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

/* ---------------- Filters form ---------------- */

interface FiltersFormProps {
  name: string; setName: (v: string) => void;
  phone: string; setPhone: (v: string) => void;
  responsible: { id: string; label: string } | null;
  setResponsible: (v: { id: string; label: string } | null) => void;
  purchases: NumRange; setPurchases: (v: NumRange) => void;
  credit: NumRange; setCredit: (v: NumRange) => void;
  debt: NumRange; setDebt: (v: NumRange) => void;
  score: NumRange; setScore: (v: NumRange) => void;
  errors: { purchases: string | null; credit: string | null; debt: string | null; score: string | null };
}

function FiltersForm(p: FiltersFormProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">نام مشتری</Label>
          <div className="relative">
            <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={p.name}
              onChange={(e) => p.setName(e.target.value)}
              placeholder="جستجو نام..."
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
          <Label className="text-xs">مسئول</Label>
          <ResponsiblePicker value={p.responsible} onChange={p.setResponsible} />
        </div>
      </div>

      <NumberRange label="سابقه خرید (تومان)" range={p.purchases} onChange={p.setPurchases} error={p.errors.purchases} />
      <NumberRange
        label="اعتبار (تومان)"
        range={p.credit}
        onChange={p.setCredit}
        error={p.errors.credit}
        hint="سقف اعتبار تخصیص‌یافته به مشتری؛ بازهٔ از/تا برای فیلتر مشتریان با اعتبار در این محدوده."
      />
      <NumberRange
        label="بدهی (تومان)"
        range={p.debt}
        onChange={p.setDebt}
        error={p.errors.debt}
        hint="مانده بدهی فعلی مشتری (پرداخت‌نشده). برای پیدا کردن بدهکاران بزرگ از فیلد «از» استفاده کنید."
      />
      <NumberRange
        label="امتیاز اعتباری"
        range={p.score}
        onChange={p.setScore}
        error={p.errors.score}
        hint="عدد ۰ تا ۱۰۰: تا ۳۰ ضعیف (قرمز)، ۳۱ تا ۶۰ متوسط (نارنجی)، بالاتر از ۶۰ خوب (سبز)."
      />
    </div>
  );
}

function NumberRange({
  label, range, onChange, error, hint,
}: {
  label: string;
  range: NumRange;
  onChange: (v: NumRange) => void;
  error: string | null;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs inline-flex items-center gap-1">
        {label}
        {hint && <HelpHint text={hint} size={12} />}
      </Label>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number" min="0" inputMode="numeric" placeholder="از"
          value={range.from}
          onChange={(e) => onChange({ ...range, from: e.target.value })}
        />
        <Input
          type="number" min="0" inputMode="numeric" placeholder="تا"
          value={range.to}
          onChange={(e) => onChange({ ...range, to: e.target.value })}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/* ---------------- Responsible autocomplete ---------------- */

function ResponsiblePicker({
  value, onChange,
}: {
  value: { id: string; label: string } | null;
  onChange: (v: { id: string; label: string } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debounced = useDebounce(search, 350);

  const { data: profiles = [] } = useQuery({
    queryKey: ["credit-customers-resp-profiles", debounced],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("profiles")
        .select("id, full_name")
        .eq("status", "active")
        .order("full_name", { ascending: true })
        .limit(20);
      const term = debounced.trim().replace(/[%_]/g, "");
      if (term) q = q.ilike("full_name", `%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="flex gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button" variant="outline" role="combobox"
            className={cn("flex-1 justify-between font-normal h-9",
              !value && "text-muted-foreground")}
          >
            {value ? value.label || "کاربر" : "همه"}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput placeholder="نام کاربر..." value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>کاربری یافت نشد</CommandEmpty>
              <CommandGroup>
                {profiles.map((pr) => (
                  <CommandItem
                    key={pr.id}
                    value={pr.id}
                    onSelect={() => {
                      onChange({ id: pr.id, label: pr.full_name ?? "" });
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("ml-2 h-4 w-4",
                      pr.id === value?.id ? "opacity-100" : "opacity-0")} />
                    <span>{pr.full_name || "بدون نام"}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)}
          aria-label="پاک کردن">
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
