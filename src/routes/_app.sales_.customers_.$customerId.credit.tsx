import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, ShieldCheck, AlertTriangle, Wallet, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";
import { PageHeader } from "@/components/common/PageHeader";
import { HelpHint } from "@/components/common/HelpHint";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber, formatDateTimeFa, toFaDigits } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/sales_/customers_/$customerId/credit")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: CustomerCreditPage,
});

function scoreColor(score: number): string {
  if (score <= 30) return "bg-destructive text-destructive-foreground";
  if (score <= 60) return "bg-amber-500 text-white";
  return "bg-emerald-600 text-white";
}

function CustomerCreditPage() {
  const { customerId } = Route.useParams();
  const { roles } = useAuth();
  const queryClient = useQueryClient();
  const canRecalc = hasAnyRole(roles, ["admin", "accountant"]);

  const { data: customer } = useQuery({
    queryKey: ["customer-basic", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("id", customerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: profile, isLoading: pLoading } = useQuery({
    queryKey: ["credit-profile", customerId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_credit_profile")
        .select("*")
        .eq("customer_id", customerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: snapshots = [] } = useQuery({
    queryKey: ["credit-snapshots", customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_score_snapshots")
        .select("id, score, credit_limit, calculated_at, calculated_by")
        .eq("customer_id", customerId)
        .order("calculated_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const recalc = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("calculate_credit_score", {
        _customer_id: customerId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("امتیاز اعتباری به‌روزرسانی شد");
      queryClient.invalidateQueries({ queryKey: ["credit-profile", customerId] });
      queryClient.invalidateQueries({ queryKey: ["credit-snapshots", customerId] });
    },
    onError: (e: unknown) => {
      toast.error(`خطا: ${e instanceof Error ? e.message : "ناشناخته"}`);
    },
  });

  const score = profile?.credit_score ?? 0;
  const limit = Number(profile?.credit_limit ?? 0);
  const outstanding = Number(profile?.outstanding_balance ?? 0);
  const totalPurchases = Number(profile?.total_purchases ?? 0);
  const totalPaid = Number(profile?.total_paid ?? 0);

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title={`پروفایل اعتباری ${customer?.name ?? ""}`}
        description="امتیاز اعتباری، سقف اعتبار و سابقه مالی مشتری"
        actions={
          <div className="flex gap-2">
            <HelpHint
              size={18}
              text={
                "این صفحه وضعیت اعتباری یک مشتری را نشان می‌دهد:\n" +
                "• امتیاز اعتباری (۰ تا ۱۰۰) بر اساس قوانین تعریف‌شده محاسبه می‌شود.\n" +
                "• سقف اعتبار، حداکثر بدهی مجاز برای این مشتری است.\n" +
                "• «محاسبه مجدد» اعداد را بر اساس آخرین فاکتور‌ها/پرداخت‌ها به‌روز می‌کند."
              }
            />
            <Button variant="outline" asChild>
              <Link to="/sales/customers">بازگشت به مشتریان</Link>
            </Button>
            {canRecalc && (
              <Button onClick={() => recalc.mutate()} disabled={recalc.isPending}>
                {recalc.isPending ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="ml-2 h-4 w-4" />
                )}
                محاسبه مجدد امتیاز
              </Button>
            )}
          </div>
        }
      />

      {pLoading ? (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری...
        </div>
      ) : !profile ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">پروفایل اعتباری برای این مشتری ایجاد نشده است.</p>
            {canRecalc && (
              <Button onClick={() => recalc.mutate()} disabled={recalc.isPending}>
                ایجاد و محاسبه امتیاز
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={<ShieldCheck className="h-5 w-5" />}
              label="امتیاز اعتباری"
              hintText={
                "عدد ۰ تا ۱۰۰: تا ۳۰ پرریسک (قرمز)، ۳۱ تا ۶۰ متوسط (کهربایی)، بالاتر از ۶۰ خوش‌حساب (سبز)."
              }
              value={
                <Badge className={`text-lg px-3 py-1 ${scoreColor(score)}`}>
                  {toFaDigits(score)} / ۱۰۰
                </Badge>
              }
            />
            <MetricCard
              icon={<Wallet className="h-5 w-5" />}
              label="سقف اعتبار"
              hintText={
                "حداکثر مبلغی که این مشتری می‌تواند بدهکار شود. هنگام صدور فاکتور اعتباری چک می‌شود."
              }
              value={<span className="text-xl font-bold">{formatNumber(limit)}</span>}
              hint="ریال"
            />
            <MetricCard
              icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
              label="بدهی جاری"
              hintText={
                "مبلغی که هنوز پرداخت نشده. هر فاکتور اعتباری به آن اضافه و هر دریافت از آن کم می‌شود."
              }
              value={<span className="text-xl font-bold">{formatNumber(outstanding)}</span>}
              hint="ریال"
            />
            <MetricCard
              icon={<TrendingUp className="h-5 w-5" />}
              label="کل خرید"
              hintText={"مجموع تمام خریدهای ثبت‌شدهٔ این مشتری از ابتدای همکاری."}
              value={<span className="text-xl font-bold">{formatNumber(totalPurchases)}</span>}
              hint="ریال"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base inline-flex items-center gap-2">
                سابقه پرداخت
                <HelpHint
                  text={
                    "خلاصهٔ رفتار پرداختی مشتری.\n" +
                    "«تعداد تأخیر» یعنی چند بار پرداخت دیرتر از موعد انجام شده است."
                  }
                />
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <Stat label="کل پرداخت" value={`${formatNumber(totalPaid)} ریال`} />
              <Stat label="تعداد تأخیر" value={toFaDigits(profile.late_payments_count ?? 0)} />
              <Stat
                label="آخرین خرید"
                value={
                  profile.last_purchase_date ? formatDateTimeFa(profile.last_purchase_date) : "—"
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base inline-flex items-center gap-2">
                تاریخچه محاسبات (۲۰ مورد اخیر)
                <HelpHint
                  text={
                    "هر بار که امتیاز اعتباری مشتری محاسبه می‌شود، یک ردیف اینجا ثبت می‌گردد.\n" +
                    "می‌توانید روند تغییر امتیاز و سقف اعتبار در طول زمان را مشاهده کنید."
                  }
                />
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">تاریخ</TableHead>
                    <TableHead className="text-right">امتیاز</TableHead>
                    <TableHead className="text-right">سقف اعتبار</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {snapshots.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                        هنوز محاسبه‌ای ثبت نشده است
                      </TableCell>
                    </TableRow>
                  ) : (
                    snapshots.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{formatDateTimeFa(s.calculated_at)}</TableCell>
                        <TableCell>
                          <Badge className={scoreColor(s.score)}>{toFaDigits(s.score)}</Badge>
                        </TableCell>
                        <TableCell>{formatNumber(Number(s.credit_limit))} ریال</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  hint,
  hintText,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
  hintText?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          <span>{label}</span>
          {hintText && <HelpHint text={hintText} />}
        </div>
        <div>{value}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}
