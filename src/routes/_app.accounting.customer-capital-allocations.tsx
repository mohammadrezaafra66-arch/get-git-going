import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Save, Calculator } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { toFaDigits } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";

import { PageHeader } from "@/components/common/PageHeader";
import { HelpHint } from "@/components/common/HelpHint";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/accounting/customer-capital-allocations")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: CustomerCapitalAllocationsPage,
});

type ComputeRow = {
  salesperson_allocation_id: string;
  capital_snapshot_id: string;
  capital_date: string;
  salesperson_id: string;
  salesperson_final_amount: number;
  customer_id: string;
  customer_score: number;
  total_customer_score: number;
  system_suggested_amount: number;
};

type RowState = {
  customer_id: string;
  customer_score: number;
  system_suggested_amount: number;
  final_amount: string;
  override_reason: string;
};

const NA = "نامشخص";

function fmtMoney(n: number | null | undefined) {
  if (n == null) return NA;
  return `${toFaDigits(Math.round(Number(n)).toLocaleString("en-US"))} تومان`;
}
function fmtNum(n: number | null | undefined) {
  if (n == null) return NA;
  return toFaDigits(String(Math.round(Number(n) * 100) / 100));
}
function isForbidden(e: unknown) {
  const msg = (e as { message?: string } | null)?.message ?? "";
  return /forbidden|permission denied|42501/i.test(msg);
}
function errMsg(e: unknown, fallback: string) {
  return isForbidden(e) ? "شما دسترسی این عملیات را ندارید." : fallback;
}
function toNum(s: string): number {
  const n = Number(String(s).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function shortId(id: string) {
  return toFaDigits(id.slice(0, 8));
}

function CustomerCapitalAllocationsPage() {
  const qc = useQueryClient();
  const [allocInput, setAllocInput] = useState<string>("");
  const [activeAllocId, setActiveAllocId] = useState<string>("");
  const [rows, setRows] = useState<RowState[]>([]);
  const [meta, setMeta] = useState<{
    capital_date: string;
    salesperson_id: string;
    salesperson_final_amount: number;
    total_customer_score: number;
  } | null>(null);

  const computeQ = useQuery({
    queryKey: ["customer-capital-compute", activeAllocId],
    enabled: !!activeAllocId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("compute_customer_capital_allocations", {
        p_salesperson_allocation_id: activeAllocId,
      });
      if (error) throw error;
      return (data as ComputeRow[] | null) ?? [];
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    const data = computeQ.data;
    if (!data) return;
    if (data.length === 0) {
      setRows([]);
      setMeta(null);
      return;
    }
    const first = data[0];
    setMeta({
      capital_date: first.capital_date,
      salesperson_id: first.salesperson_id,
      salesperson_final_amount: Number(first.salesperson_final_amount ?? 0),
      total_customer_score: Number(first.total_customer_score ?? 0),
    });
    setRows(
      data.map((r) => ({
        customer_id: r.customer_id,
        customer_score: Number(r.customer_score ?? 0),
        system_suggested_amount: Math.round(Number(r.system_suggested_amount ?? 0)),
        final_amount: String(Math.round(Number(r.system_suggested_amount ?? 0))),
        override_reason: "",
      })),
    );
  }, [computeQ.data]);

  const saveM = useMutation({
    mutationFn: async () => {
      if (!activeAllocId) throw new Error("ابتدا شناسه تخصیص فروشنده را انتخاب کنید.");
      const payload: Array<{
        customer_id: string;
        final_amount: number;
        override_reason?: string;
      }> = [];
      for (const r of rows) {
        const final = toNum(r.final_amount);
        if (final < 0) {
          throw new Error("مقدار سهم نهایی نمی‌تواند منفی باشد.");
        }
        const isOverride = Math.round(final) !== Math.round(r.system_suggested_amount);
        const reason = r.override_reason.trim();
        if (isOverride && reason.length === 0) {
          throw new Error("برای تغییر سهم پیشنهادی مشتری، دلیل تغییر الزامی است.");
        }
        payload.push({
          customer_id: r.customer_id,
          final_amount: final,
          ...(reason ? { override_reason: reason } : {}),
        });
      }
      const { data, error } = await supabase.rpc("save_customer_capital_allocations", {
        p_salesperson_allocation_id: activeAllocId,
        p_allocations: payload,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      toast.success("تخصیص مشتریان ذخیره شد.");
      await qc.invalidateQueries({ queryKey: ["customer-capital-compute", activeAllocId] });
    },
    onError: (e) => toast.error(errMsg(e, "ذخیره تخصیص مشتریان با خطا مواجه شد.")),
  });

  const totalFinal = useMemo(
    () => rows.reduce((acc, r) => acc + (toNum(r.final_amount) || 0), 0),
    [rows],
  );

  const isUuid = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());

  return (
    <div className="space-y-4 p-4" dir="rtl">
      <PageHeader
        title="تخصیص سرمایه فروشنده بین مشتریان"
        description="محاسبه و ثبت سهم هر مشتری از سهم سرمایه یک فروشنده بر اساس امتیاز اعتباری مشتری"
        actions={
          <HelpHint
            size={18}
            text={
              "این صفحه سهم یک فروشنده را بین مشتریانش (بر اساس امتیاز اعتباری مشتری) تقسیم می‌کند.\n" +
              "۱) از صفحه «تخصیص سرمایه فروشندگان» شناسه تخصیص فروشنده موردنظر را کپی کنید.\n" +
              "۲) شناسه را در کادر بالا وارد کرده و «محاسبه سهم مشتریان» را بزنید.\n" +
              "۳) سهم نهایی هر مشتری را در صورت لزوم تغییر دهید (ثبت دلیل اجباری است).\n" +
              "۴) «ذخیره تخصیص مشتریان» را بزنید تا سقف اعتبار قابل استفاده هر مشتری برای امروز ثبت شود."
            }
          />
        }
      />

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold inline-flex items-center gap-1">
            انتخاب تخصیص فروشنده
            <HelpHint
              text={
                "شناسه (UUID) همان رکوردی است که در صفحه «تخصیص سرمایه فروشندگان» برای این فروشنده ذخیره کرده‌اید."
              }
            />
          </div>
          <div className="text-xs text-muted-foreground">
            شناسه تخصیص فروشنده (salesperson_allocation_id) را از صفحه «تخصیص سرمایه فروشندگان» یا
            گزارش backend وارد کنید.
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[260px] space-y-1">
              <Label className="text-xs">شناسه تخصیص فروشنده</Label>
              <Input
                dir="ltr"
                placeholder="00000000-0000-0000-0000-000000000000"
                value={allocInput}
                onChange={(e) => setAllocInput(e.target.value)}
              />
            </div>
            <Button
              className="gap-2"
              disabled={!isUuid(allocInput) || computeQ.isFetching}
              onClick={() => {
                if (!isUuid(allocInput)) {
                  toast.error("شناسه تخصیص فروشنده معتبر نیست.");
                  return;
                }
                setActiveAllocId(allocInput.trim());
              }}
            >
              <Calculator className="h-4 w-4" />
              محاسبه سهم مشتریان
            </Button>
            {activeAllocId && (
              <Button
                variant="ghost"
                className="gap-2"
                onClick={() => computeQ.refetch()}
                disabled={computeQ.isFetching}
              >
                <RefreshCw className={cn("h-4 w-4", computeQ.isFetching && "animate-spin")} />
                به‌روزرسانی
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {!activeAllocId ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            برای مشاهده تخصیص، یک شناسه تخصیص فروشنده معتبر وارد کنید.
          </CardContent>
        </Card>
      ) : computeQ.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> در حال محاسبه…
        </div>
      ) : computeQ.isError ? (
        <Card>
          <CardContent className="p-4 text-destructive">
            {errMsg(computeQ.error, "دریافت محاسبه سهم مشتریان با خطا مواجه شد.")}
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            برای این فروشنده، مشتری فعالی یافت نشد.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4 space-y-1">
                <div className="text-xs text-muted-foreground">تاریخ سرمایه</div>
                <div className="text-base font-semibold">
                  {toFaDigits(meta?.capital_date ?? NA)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-1">
                <div className="text-xs text-muted-foreground">سهم نهایی فروشنده</div>
                <div className="text-base font-semibold text-primary">
                  {fmtMoney(meta?.salesperson_final_amount)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-1">
                <div className="text-xs text-muted-foreground">مجموع امتیاز مشتریان</div>
                <div className="text-base font-semibold">{fmtNum(meta?.total_customer_score)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-1">
                <div className="text-xs text-muted-foreground">جمع سهم نهایی مشتریان</div>
                <div className="text-base font-semibold">{fmtMoney(totalFinal)}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">شناسه مشتری</TableHead>
                    <TableHead className="text-right">
                      <span className="inline-flex items-center gap-1">
                        امتیاز اعتباری
                        <HelpHint
                          text={
                            "امتیاز اعتباری مشتری که از قوانین اعتبار محاسبه می‌شود (بین ۰ تا ۱۰۰).\nمشتری بدون پروفایل اعتباری یا با امتیاز صفر، سهمی نمی‌گیرد."
                          }
                        />
                      </span>
                    </TableHead>
                    <TableHead className="text-right">
                      <span className="inline-flex items-center gap-1">
                        سهم پیشنهادی سیستم
                        <HelpHint
                          text={
                            "سهم پیشنهادی مشتری = سهم نهایی فروشنده × (امتیاز مشتری ÷ مجموع امتیاز مشتریان این فروشنده)."
                          }
                        />
                      </span>
                    </TableHead>
                    <TableHead className="text-right">
                      <span className="inline-flex items-center gap-1">
                        سهم نهایی
                        <HelpHint
                          text={
                            "سقف اعتباری که این مشتری امروز از این فروشنده می‌تواند استفاده کند.\nدر صورت تغییر نسبت به پیشنهاد سیستم، نوشتن دلیل اجباری است."
                          }
                        />
                      </span>
                    </TableHead>
                    <TableHead className="text-right">
                      <span className="inline-flex items-center gap-1">
                        دلیل تغییر (در صورت override)
                        <HelpHint
                          text={
                            "وقتی «سهم نهایی» با «سهم پیشنهادی» متفاوت باشد، نوشتن دلیل اجباری است و برای حسابرسی ذخیره می‌شود."
                          }
                        />
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => {
                    const isOverride =
                      Math.round(toNum(r.final_amount)) !== Math.round(r.system_suggested_amount);
                    return (
                      <TableRow key={r.customer_id}>
                        <TableCell className="font-mono text-xs" dir="ltr">
                          {shortId(r.customer_id)}…
                        </TableCell>
                        <TableCell>{fmtNum(r.customer_score)}</TableCell>
                        <TableCell>{fmtMoney(r.system_suggested_amount)}</TableCell>
                        <TableCell className="min-w-[160px]">
                          <Input
                            inputMode="numeric"
                            value={toFaDigits(r.final_amount)}
                            onChange={(e) => {
                              const raw = e.target.value
                                .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
                                .replace(/[^\d]/g, "");
                              setRows((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], final_amount: raw };
                                return next;
                              });
                            }}
                            className={cn(isOverride && "border-amber-500")}
                          />
                        </TableCell>
                        <TableCell className="min-w-[220px]">
                          <Textarea
                            rows={1}
                            value={r.override_reason}
                            onChange={(e) => {
                              const v = e.target.value;
                              setRows((prev) => {
                                const next = [...prev];
                                next[idx] = { ...next[idx], override_reason: v };
                                return next;
                              });
                            }}
                            placeholder={isOverride ? "دلیل تغییر الزامی است" : "—"}
                            disabled={!isOverride}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              onClick={() => saveM.mutate()}
              disabled={saveM.isPending || rows.length === 0}
              className="gap-2"
            >
              {saveM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              ذخیره تخصیص مشتریان
            </Button>
          </div>

          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="text-sm font-semibold">فرمول سهم پیشنهادی</div>
              <pre
                className="text-xs leading-7 whitespace-pre-wrap text-muted-foreground"
                dir="rtl"
              >
                {`سهم پیشنهادی مشتری = ROUND( سهم نهایی فروشنده × ( امتیاز اعتباری مشتری ÷ مجموع امتیاز مشتریان ) )
مشتریان بدون پروفایل اعتباری یا با امتیاز صفر، سهم پیشنهادی صفر دارند.
اگر سهم نهایی با سهم پیشنهادی متفاوت باشد، ثبت دلیل override اجباری است.`}
              </pre>
              <div className="text-xs text-muted-foreground">
                نمایش نام مشتری در این فاز پشتیبانی نمی‌شود؛ به دلیل عدم وجود فیلد امن نام در RPC،
                فقط شناسه مشتری نمایش داده می‌شود.
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
