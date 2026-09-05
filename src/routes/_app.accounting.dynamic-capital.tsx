import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Loader2,
  PlayCircle,
  History,
  RefreshCw,
  AlertTriangle,
  Info,
  GraduationCap,
} from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { toFaDigits, formatDateFa } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";

import { PageHeader } from "@/components/common/PageHeader";
import { HelpHint } from "@/components/common/HelpHint";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { JalaliDateInput } from "@/shared/components/JalaliDateInput";

import {
  useRunDailyAllocation,
  useSettingByDate,
  useAllocationHistory,
  useSalespersonAllocations,
  useCustomerAllocations,
  useSalespersonCapitalUsage,
  useSuggestedDailyCapital,
  type SalespersonAllocationRow,
  type SuggestedDailyCapital,
} from "@/hooks/capital/useDynamicCapital";

export const Route = createFileRoute("/_app/accounting/dynamic-capital")({
  // M6/OG-24 — mirrors the requireAnyRole call below. The shared guard cannot decide
  // during SSR or while roles load, so RouteRoleGate in _app enforces this on the client.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "accountant"] } },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "accountant"]);
  },
  component: DynamicCapitalPage,
});

function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtMoney(n: number): string {
  return toFaDigits(Math.round(n).toLocaleString("en-US"));
}

const CONSTRAINT_META: Record<string, { label: string; cls: string }> = {
  formula: { label: "بر اساس فرمول", cls: "bg-muted text-foreground" },
  credit_limit: { label: "محدود به سقف اعتبار", cls: "bg-amber-100 text-amber-900" },
  overdue: { label: "معوقه ـ مسدود", cls: "bg-red-100 text-red-900" },
  no_profile: { label: "بدون پروفایل اعتباری", cls: "bg-red-50 text-red-800" },
};

function DynamicCapitalPage() {
  const [capitalDate, setCapitalDate] = useState<string>(todayISO());
  const [totalCapital, setTotalCapital] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [activeSettingId, setActiveSettingId] = useState<string | undefined>(undefined);
  const [selectedSalesperson, setSelectedSalesperson] = useState<SalespersonAllocationRow | null>(
    null,
  );

  const existing = useSettingByDate(capitalDate);
  const suggestion = useSuggestedDailyCapital(capitalDate);
  const history = useAllocationHistory(30);
  const runMutation = useRunDailyAllocation();
  const qc = useQueryClient();
  const [isOverwriting, setIsOverwriting] = useState(false);
  const salespersonRows = useSalespersonAllocations(activeSettingId);
  const customerRows = useCustomerAllocations(activeSettingId, selectedSalesperson?.salesperson_id);

  const alreadyExists = Boolean(existing.data);
  const totalCapitalNum = useMemo(() => {
    const v = Number(totalCapital.replace(/,/g, ""));
    return Number.isFinite(v) && v > 0 ? v : 0;
  }, [totalCapital]);

  const canRun = !alreadyExists && totalCapitalNum > 0 && !runMutation.isPending;

  const canOverwrite =
    alreadyExists && totalCapitalNum > 0 && !runMutation.isPending && !isOverwriting;

  const handleOverwrite = async () => {
    if (!canOverwrite) return;
    const ok = window.confirm(
      "snapshot فعلی این تاریخ حذف و با سرمایه جدید بازنویسی می‌شود. ادامه می‌دهید؟",
    );
    if (!ok) return;
    const toastId = toast.loading("در حال بازنویسی snapshot...");
    setIsOverwriting(true);
    try {
      const { error: delErr } = await supabase
        .from("daily_capital_settings")
        .delete()
        .eq("capital_date", capitalDate);
      if (delErr) throw delErr;
      const res = await runMutation.mutateAsync({
        p_capital_date: capitalDate,
        p_total_capital: totalCapitalNum,
        p_notes: notes.trim() ? notes.trim() : null,
      });
      toast.success("سرمایه امروز بازنویسی شد", { id: toastId });
      setActiveSettingId(res.setting_id);
      qc.invalidateQueries({ queryKey: ["dyn-capital-setting-by-date", capitalDate] });
      qc.invalidateQueries({ queryKey: ["dyn-capital-history"] });
      qc.invalidateQueries({ queryKey: ["dyn-salesperson-allocations"] });
      qc.invalidateQueries({ queryKey: ["dyn-customer-allocations"] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطا در بازنویسی snapshot";
      toast.error(msg, { id: toastId });
    } finally {
      setIsOverwriting(false);
    }
  };

  // W-1 — the only route by which the suggestion can reach the form: the accountant asks for
  // it. It lands in the same field they type into, formatted the same way, and is editable and
  // clearable exactly like a typed value. Nothing is submitted here.
  const applySuggestion = (n: number) => {
    setTotalCapital(Math.round(n).toLocaleString("en-US"));
  };

  const handleRun = () => {
    if (!canRun) return;
    const toastId = toast.loading("در حال محاسبه برای همه کارشناسان و مشتریان...");
    runMutation.mutate(
      {
        p_capital_date: capitalDate,
        p_total_capital: totalCapitalNum,
        p_notes: notes.trim() ? notes.trim() : null,
      },
      {
        onSuccess: (res) => {
          toast.success(
            `محاسبه با موفقیت انجام شد — ${toFaDigits(res.salespersons_count)} کارشناس و ${toFaDigits(res.customers_count)} مشتری`,
            { id: toastId },
          );
          setActiveSettingId(res.setting_id);
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "خطا در محاسبه snapshot";
          toast.error(msg, { id: toastId });
        },
      },
    );
  };

  const handleHistoryClick = (id: string, date: string) => {
    setActiveSettingId(id);
    setSelectedSalesperson(null);
    setCapitalDate(date);
  };

  const totalAllocated = useMemo(() => {
    return (salespersonRows.data ?? []).reduce((s, r) => s + r.allocated_capital, 0);
  }, [salespersonRows.data]);

  const totalCustomersAllocated = useMemo(() => {
    return (salespersonRows.data ?? []).length;
  }, [salespersonRows.data]);

  // Item 141.3 — salesperson-level ledger usage for the open snapshot.
  const spUsageMap = useSalespersonCapitalUsage(activeSettingId);
  const spUsage = selectedSalesperson
    ? (spUsageMap.data?.get(selectedSalesperson.salesperson_id) ?? null)
    : null;

  // Item 141.3 — per-drawer warnings about capital that cannot be used.
  const drawerWarnings = useMemo(() => {
    const out: string[] = [];
    if (!selectedSalesperson) return out;

    if (selectedSalesperson.weighted_score <= 0) {
      out.push("امتیاز وزنی این کارشناس صفر است؛ سهمی از سرمایه دریافت نکرده است.");
    }
    if (selectedSalesperson.allocated_capital <= 0) {
      out.push("سرمایه‌ای به این کارشناس تخصیص نیافته است؛ مشتریان او سقف اعتبار ندارند.");
    }
    if (spUsage && spUsage.allocated_capital > 0 && spUsage.remaining_amount <= 0) {
      out.push("مانده سرمایه این کارشناس صفر است؛ پیش‌فاکتور جدید ثبت نمی‌شود.");
    }

    const rows = customerRows.data ?? [];
    const noSalesperson = rows.filter((c) => !c.salesperson_id).length;
    if (noSalesperson > 0) {
      out.push(
        `${toFaDigits(noSalesperson)} مشتری کارشناس مسئول ندارد و در تقسیم سرمایه شرکت داده نشده است.`,
      );
    }
    const zeroScore = rows.filter((c) => c.weighted_score <= 0).length;
    if (zeroScore > 0) {
      out.push(`${toFaDigits(zeroScore)} مشتری امتیاز صفر دارند و سقف اعتبارشان صفر است.`);
    }
    const exhausted = rows.filter((c) => c.final_limit > 0 && c.remaining_amount <= 0).length;
    if (exhausted > 0) {
      out.push(`${toFaDigits(exhausted)} مشتری مانده سرمایه‌شان تمام شده است.`);
    }
    return out;
  }, [selectedSalesperson, spUsage, customerRows.data]);

  // Item 141 — surface every zero-allocation cause at once, so the accountant
  // knows exactly what to fix rather than seeing a silently empty table.
  const allocationWarnings = useMemo(() => {
    const rows = salespersonRows.data ?? [];
    const out: string[] = [];

    if (rows.length === 0) {
      out.push(
        "هیچ کارشناسی در این snapshot تخصیص نگرفته است؛ بررسی کنید پارامترهای امتیازدهی کارشناسان تعریف و فعال شده باشند.",
      );
      return out;
    }
    if (rows.every((r) => r.weighted_score <= 0)) {
      out.push(
        "امتیاز وزنی همهٔ کارشناسان صفر است؛ پارامترهای امتیازدهی کارشناس و وزن‌های دورهٔ جاری را بررسی کنید.",
      );
    } else if (rows.some((r) => r.weighted_score <= 0)) {
      const names = rows
        .filter((r) => r.weighted_score <= 0)
        .map((r) => r.full_name ?? "بدون نام")
        .join("، ");
      out.push(`امتیاز این کارشناسان صفر است و سهمی دریافت نکرده‌اند: ${names}`);
    }
    if (rows.some((r) => r.allocated_capital <= 0)) {
      out.push(
        "برای بعضی کارشناسان سرمایه‌ای تخصیص نیافته است؛ مشتریان آن‌ها سقف اعتبار صفر خواهند داشت.",
      );
    }
    if (totalAllocated <= 0) {
      out.push("مجموع تخصیص صفر است؛ سرمایه کل یا امتیازها را بررسی کنید.");
    }
    return out;
  }, [salespersonRows.data, totalAllocated]);

  return (
    <div className="container mx-auto p-4 space-y-6" dir="rtl">
      <PageHeader
        title="تخصیص سرمایه روزانه"
        description="صفحهٔ رسمی ثبت سرمایه روز و تقسیم آن بین کارشناسان و مشتریان"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/sales/customers/credit-allocation-guide">
              <GraduationCap className="ml-2 h-4 w-4" />
              آموزش تخصیص اعتبار
            </Link>
          </Button>
        }
      />

      {/* Item 141 — plain-language explanation of what this page does. */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 text-sm leading-7">
          <p className="font-medium">این صفحه در سه گام کار می‌کند:</p>
          <ol className="mt-2 space-y-1">
            <li>
              <span className="font-medium">۱)</span> حسابدار سرمایه کل امروز را وارد می‌کند.
            </li>
            <li>
              <span className="font-medium">۲)</span> سامانه سرمایه را بین کارشناسان فروش، بر اساس
              امتیاز هر کارشناس، تقسیم می‌کند.
            </li>
            <li>
              <span className="font-medium">۳)</span> سهم هر کارشناس بین مشتریان همان کارشناس، بر
              اساس امتیاز هر مشتری، تقسیم می‌شود.
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* فرم اجرا */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PlayCircle className="h-4 w-4" />
            اجرای محاسبه snapshot
            <HelpHint text="هر تاریخ فقط یک بار قابل محاسبه است. سرمایه کل را وارد کنید و سامانه به‌صورت خودکار بین کارشناسان فعال و مشتریان آن‌ها بر اساس امتیاز وزنی تقسیم می‌کند." />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>تاریخ محاسبه</Label>
              <JalaliDateInput
                value={capitalDate}
                onChange={(iso) => {
                  setCapitalDate(iso);
                  setActiveSettingId(undefined);
                  setSelectedSalesperson(null);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>سرمایه کل (تومان)</Label>
              <Input
                data-testid="dynamic-capital-total-input"
                inputMode="numeric"
                placeholder="مثلاً ۱,۰۰۰,۰۰۰,۰۰۰"
                value={totalCapital}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^\d]/g, "");
                  setTotalCapital(raw ? Number(raw).toLocaleString("en-US") : "");
                }}
                disabled={runMutation.isPending || isOverwriting}
                className="text-left"
              />
              {totalCapitalNum > 0 ? (
                <p className="text-xs text-muted-foreground">{fmtMoney(totalCapitalNum)} تومان</p>
              ) : alreadyExists ? (
                <p className="text-xs text-red-600">برای بازنویسی ابتدا سرمایه جدید را وارد کنید</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>یادداشت (اختیاری)</Label>
              <Textarea
                rows={1}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="توضیح کوتاه..."
                disabled={runMutation.isPending || isOverwriting}
              />
            </div>
          </div>

          {/* W-1 — the suggestion from compute_daily_capital. Read-only, never submitted. */}
          <SystemSuggestion
            isLoading={suggestion.isLoading}
            isError={suggestion.isError}
            error={suggestion.error}
            data={suggestion.data ?? null}
            disabled={runMutation.isPending || isOverwriting}
            onApply={applySuggestion}
          />

          {alreadyExists && existing.data && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                snapshot موجود — سرمایه ثبت‌شده: {fmtMoney(Number(existing.data.total_capital))}{" "}
                تومان
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleHistoryClick(existing.data!.id, existing.data!.capital_date)}
              >
                مشاهده نتیجه
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleOverwrite}
                disabled={!canOverwrite}
                className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
              >
                {isOverwriting ? (
                  <Loader2 className="h-4 w-4 ml-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 ml-1" />
                )}
                🔄 بازنویسی با سرمایه جدید
              </Button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              data-testid="dynamic-capital-run-button"
              onClick={handleRun}
              disabled={!canRun}
              size="lg"
            >
              {runMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                  در حال محاسبه...
                </>
              ) : (
                <>
                  <PlayCircle className="h-4 w-4 ml-2" />
                  محاسبه و ذخیره
                </>
              )}
            </Button>
            {runMutation.isPending && (
              <div className="flex-1 max-w-md">
                <Progress value={undefined} className="h-2" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Item 141 — zero / missing allocation warnings. */}
      {!activeSettingId && !alreadyExists && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>هنوز سرمایه‌ای برای این تاریخ ثبت نشده است</AlertTitle>
          <AlertDescription className="text-xs leading-6">
            تا زمانی که سرمایه روز ثبت نشود، سقف اعتبار هیچ مشتری‌ای محاسبه نمی‌شود.
          </AlertDescription>
        </Alert>
      )}

      {activeSettingId && !salespersonRows.isLoading && allocationWarnings.length > 0 && (
        <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-300">هشدارهای تخصیص</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pe-4 text-xs leading-6">
              {allocationWarnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* نتیجه snapshot فعال */}
      {activeSettingId && (
        <>
          <Separator />
          <ResultSection
            settingId={activeSettingId}
            salespersonRows={salespersonRows.data ?? []}
            isLoading={salespersonRows.isLoading}
            totalAllocated={totalAllocated}
            totalCustomersAllocated={totalCustomersAllocated}
            onSelectSalesperson={setSelectedSalesperson}
          />
        </>
      )}

      {/* تاریخچه */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" />
            تاریخچه snapshot ها (۳۰ مورد اخیر)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.isLoading ? (
            <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>
          ) : (history.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">هنوز هیچ snapshotی ثبت نشده است.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">تاریخ</TableHead>
                    <TableHead className="text-right">سرمایه کل</TableHead>
                    <TableHead className="text-right">یادداشت</TableHead>
                    <TableHead className="text-right">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(history.data ?? []).map((row) => (
                    <TableRow
                      key={row.id}
                      className={cn(activeSettingId === row.id && "bg-muted/40")}
                    >
                      <TableCell>{formatDateFa(row.capital_date)}</TableCell>
                      <TableCell>{fmtMoney(Number(row.total_capital))} تومان</TableCell>
                      <TableCell className="text-muted-foreground text-xs max-w-xs truncate">
                        {row.notes ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleHistoryClick(row.id, row.capital_date)}
                        >
                          مشاهده
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drawer مشتریان کارشناس */}
      <Sheet
        open={Boolean(selectedSalesperson)}
        onOpenChange={(open) => !open && setSelectedSalesperson(null)}
      >
        <SheetContent side="left" className="w-full sm:max-w-2xl overflow-y-auto" dir="rtl">
          <SheetHeader>
            <SheetTitle>مشتریان کارشناس: {selectedSalesperson?.full_name ?? "بدون نام"}</SheetTitle>
            <SheetDescription>
              سهم کارشناس:{" "}
              {selectedSalesperson ? fmtMoney(selectedSalesperson.allocated_capital) : "۰"} تومان
              {" • "}
              امتیاز وزنی:{" "}
              {selectedSalesperson
                ? toFaDigits(selectedSalesperson.weighted_score.toFixed(3))
                : "۰"}
            </SheetDescription>
          </SheetHeader>

          {/* Item 141.3 — salesperson-level usage from the ledger */}
          {spUsage && (
            <div className="mt-3 grid grid-cols-3 gap-2 rounded-md border bg-muted/30 p-3 text-center text-xs">
              <div>
                <div className="text-muted-foreground">رزرو</div>
                <div className="mt-0.5 font-semibold text-amber-700 dark:text-amber-400">
                  {fmtMoney(spUsage.held_amount)}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">مصرف‌شده</div>
                <div className="mt-0.5 font-semibold">{fmtMoney(spUsage.consumed_amount)}</div>
              </div>
              <div>
                <div className="text-muted-foreground">مانده</div>
                <div
                  className={cn(
                    "mt-0.5 font-semibold",
                    spUsage.remaining_amount <= 0 && "text-destructive",
                  )}
                >
                  {fmtMoney(spUsage.remaining_amount)}
                </div>
              </div>
            </div>
          )}

          {drawerWarnings.length > 0 && (
            <Alert className="mt-3 border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription>
                <ul className="list-disc space-y-1 pe-4 text-xs leading-6">
                  {drawerWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="mt-4">
            {customerRows.isLoading ? (
              <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>
            ) : (customerRows.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                هیچ مشتری برای این کارشناس در این snapshot ثبت نشده است.
              </p>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">مشتری</TableHead>
                      <TableHead className="text-right">امتیاز</TableHead>
                      <TableHead className="text-right">سقف نهایی</TableHead>
                      <TableHead className="text-right">رزرو</TableHead>
                      <TableHead className="text-right">مصرف‌شده</TableHead>
                      <TableHead className="text-right">مانده</TableHead>
                      <TableHead className="text-right">قید</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(customerRows.data ?? []).map((c) => {
                      const meta = CONSTRAINT_META[c.binding_constraint] ?? {
                        label: c.binding_constraint,
                        cls: "bg-muted",
                      };
                      return (
                        <TableRow key={c.id}>
                          <TableCell>{c.customer_name ?? "—"}</TableCell>
                          <TableCell>{toFaDigits(c.weighted_score.toFixed(3))}</TableCell>
                          <TableCell className="font-medium">{fmtMoney(c.final_limit)}</TableCell>
                          <TableCell className="text-amber-700 dark:text-amber-400">
                            {fmtMoney(c.held_amount)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {fmtMoney(c.consumed_amount)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "font-medium",
                              c.remaining_amount <= 0 && "text-destructive",
                            )}
                          >
                            {fmtMoney(c.remaining_amount)}
                          </TableCell>
                          <TableCell>
                            <Badge className={cn("font-normal", meta.cls)} variant="secondary">
                              {meta.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/**
 * W-1 — the system's suggestion for today's capital, from `compute_daily_capital`.
 *
 * The function is a complete daily cash engine: live receivables and payables due on the date,
 * plus that date's registered cash position. It had no callers at all, so the accountant typed
 * the figure from memory while the calculation sat unused in the database.
 *
 * Three things this deliberately does NOT do. It does not fill the field by itself — the
 * accountant presses «درج در فیلد سرمایه کل» and can then edit or clear the number like any
 * other. It does not submit. And it does not become the value that is stored: the snapshot is
 * still built from whatever is in the field when «محاسبه و ذخیره» is pressed.
 *
 * WHEN THE DAY'S CASH INPUTS ARE MISSING, NO NUMBER IS SHOWN. `daily_capital_inputs` holds the
 * bank balance, the till, cheques in and out and the reserves for a given date. With no row for
 * this date all of those COALESCE to zero inside the function, which then still returns a
 * figure — usually 0, because it is clamped at zero from below. That figure is an artefact of
 * the missing row, not a suggestion, and presenting it as one is the same defect as printing a
 * credit ceiling of ۰ for a customer whose ceiling was never computed. So the card names the
 * missing input instead.
 */
function SystemSuggestion({
  isLoading,
  isError,
  error,
  data,
  disabled,
  onApply,
}: {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  data: SuggestedDailyCapital | null;
  disabled: boolean;
  onApply: (n: number) => void;
}) {
  if (isLoading) {
    return (
      <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
        <Loader2 className="inline h-4 w-4 ml-2 animate-spin" />
        در حال محاسبه پیشنهاد سامانه...
      </div>
    );
  }

  if (isError) {
    const msg = (error as { message?: string } | null)?.message ?? "";
    return (
      <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-800 dark:text-amber-300">
          پیشنهاد سامانه در دسترس نیست
        </AlertTitle>
        <AlertDescription className="text-xs leading-6">
          {/forbidden|permission denied|42501/i.test(msg)
            ? "شما دسترسی محاسبه پیشنهاد سرمایه را ندارید. سرمایه کل را دستی وارد کنید."
            : "محاسبه پیشنهاد با خطا مواجه شد. سرمایه کل را دستی وارد کنید."}
        </AlertDescription>
      </Alert>
    );
  }

  if (!data) return null;

  // No `daily_capital_inputs` row for this date — see the note above.
  if (!data.input_id) {
    return (
      <Alert className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-800 dark:text-amber-300">
          پیشنهاد سامانه محاسبه نشد
        </AlertTitle>
        <AlertDescription className="text-xs leading-6">
          ورودی‌های نقدی این تاریخ (موجودی بانک، صندوق، چک‌های دریافتی و پرداختی، ذخیره ریسک و وجوه
          مسدود) ثبت نشده است، بنابراین سامانه عددی برای پیشنهاد ندارد. سرمایه کل را دستی وارد کنید.
          <div className="mt-2">
            مطالبات جاری: {fmtMoney(data.total_receivables)} تومان{" • "}
            بدهی‌های جاری: {fmtMoney(data.total_payables)} تومان
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  const rows: Array<{ label: string; value: number; sign: "+" | "-" }> = [
    { label: "موجودی بانک", value: data.bank_balance, sign: "+" },
    { label: "موجودی صندوق", value: data.cash_balance, sign: "+" },
    { label: "چک‌های دریافتی", value: data.incoming_checks, sign: "+" },
    { label: "مطالبات سررسید امروز", value: data.due_today_receivables, sign: "+" },
    { label: "مطالبات خارج از سامانه", value: data.external_receivables, sign: "+" },
    { label: "ارزش نقدشوندگی انبار", value: data.inventory_liquidity_value, sign: "+" },
    { label: "اصلاح دستی", value: data.manual_adjustment, sign: "+" },
    { label: "بدهی‌های سررسید امروز", value: data.due_today_payables, sign: "-" },
    { label: "چک‌های پرداختی", value: data.outgoing_checks, sign: "-" },
    { label: "بدهی‌های خارج از سامانه", value: data.external_payables, sign: "-" },
    { label: "هزینه‌های کوتاه‌مدت", value: data.near_term_expenses, sign: "-" },
    { label: "ذخیره ریسک", value: data.risk_reserve, sign: "-" },
    { label: "وجوه مسدود", value: data.blocked_funds, sign: "-" },
  ];

  return (
    <div
      data-testid="dynamic-capital-suggestion"
      className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">
            پیشنهاد سامانه برای سرمایه {formatDateFa(data.capital_date)}
            <HelpHint text="این عدد از مطالبات و بدهی‌های سررسید همان روز به‌علاوهٔ موقعیت نقدی ثبت‌شدهٔ همان تاریخ محاسبه می‌شود. فقط یک پیشنهاد است؛ عدد نهایی را حسابدار تعیین می‌کند و در فیلد بالا قابل تغییر است." />
          </div>
          <div
            data-testid="dynamic-capital-suggestion-value"
            className="text-lg font-semibold mt-1"
          >
            {fmtMoney(data.system_suggested_capital)} تومان
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="dynamic-capital-apply-suggestion"
          disabled={disabled}
          onClick={() => onApply(data.system_suggested_capital)}
        >
          درج در فیلد سرمایه کل
        </Button>
      </div>

      <p className="text-xs text-muted-foreground leading-6">
        این عدد فقط پیشنهاد است و در هیچ جا ثبت نمی‌شود. تصمیم نهایی با حسابدار است: می‌توانید آن را
        در فیلد «سرمایه کل» درج و سپس ویرایش کنید، یا نادیده بگیرید و عدد دیگری وارد کنید.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 text-xs">
        {rows.map((r) => (
          <div key={r.label} className="flex justify-between gap-2">
            <span className="text-muted-foreground">
              {r.sign === "+" ? "+" : "−"} {r.label}
            </span>
            <span className={cn(r.sign === "-" && "text-destructive")}>{fmtMoney(r.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface ResultSectionProps {
  settingId: string;
  salespersonRows: SalespersonAllocationRow[];
  isLoading: boolean;
  totalAllocated: number;
  totalCustomersAllocated: number;
  onSelectSalesperson: (row: SalespersonAllocationRow) => void;
}

function ResultSection({
  salespersonRows,
  isLoading,
  totalAllocated,
  onSelectSalesperson,
}: ResultSectionProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard label="تعداد کارشناسان" value={toFaDigits(salespersonRows.length)} />
        <SummaryCard label="مجموع تخصیص" value={`${fmtMoney(totalAllocated)} تومان`} />
        <SummaryCard
          label="میانگین به ازای کارشناس"
          value={
            salespersonRows.length
              ? `${fmtMoney(totalAllocated / salespersonRows.length)} تومان`
              : "—"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">تخصیص هر کارشناس</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">در حال بارگذاری...</p>
          ) : salespersonRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              هیچ کارشناسی در این snapshot تخصیص نگرفته است.
            </p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">کارشناس فروش</TableHead>
                    <TableHead className="text-right">امتیاز وزنی</TableHead>
                    <TableHead className="text-right">سهم</TableHead>
                    <TableHead className="text-right">تخصیص</TableHead>
                    <TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salespersonRows.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => onSelectSalesperson(r)}
                    >
                      <TableCell>{r.full_name ?? "—"}</TableCell>
                      <TableCell>{toFaDigits(r.weighted_score.toFixed(3))}</TableCell>
                      <TableCell>{toFaDigits((r.share_ratio * 100).toFixed(2))}٪</TableCell>
                      <TableCell className="font-medium">
                        {fmtMoney(r.allocated_capital)} تومان
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        مشاهده مشتریان ←
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-semibold mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
