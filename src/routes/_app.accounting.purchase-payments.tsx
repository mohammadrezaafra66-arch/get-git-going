import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarIcon, Loader2, CheckCircle2, Wallet } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { toFaDigits, formatDateFa } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";

import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_app/accounting/purchase-payments")({
  beforeLoad: async () => { await requireAnyRole(["admin", "manager", "accountant"]); },
  component: PurchasePaymentsPage,
});

type Row = {
  id: string;
  number: string | null;
  purchase_date: string;
  purchase_price: number | null;
  cash_price: number | null;
  quantity: number;
  total_amount: number;
  currency: string | null;
  paid_at: string | null;
  paid_by: string | null;
  product: { name: string | null } | null;
  supplier: { name: string | null } | null;
  payment_term: { name: string | null; days: number | null } | null;
};

function fmtMoney(n: number | null | undefined, ccy: string | null) {
  if (n == null) return "—";
  const s = toFaDigits(Math.round(Number(n)).toLocaleString("en-US"));
  const u = ccy === "usd" ? "$" : ccy === "aed" ? "د.إ" : "تومان";
  return `${s} ${u}`;
}

function daysSince(date: string) {
  const d = new Date(date).getTime();
  return Math.floor((Date.now() - d) / 86400_000);
}

function PurchasePaymentsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"unpaid" | "paid">("unpaid");
  const [target, setTarget] = useState<Row | null>(null);
  const [paidAt, setPaidAt] = useState<Date>(new Date());

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["purchase-payments", tab],
    queryFn: async () => {
      let q = supabase
        .from("purchases")
        .select(`
          id, number, purchase_date, purchase_price, cash_price, quantity,
          total_amount, currency, paid_at, paid_by,
          product:products(name),
          supplier:suppliers(name),
          payment_term:payment_terms(name, days)
        `)
        .order("purchase_date", { ascending: false })
        .limit(200);
      q = tab === "unpaid" ? q.is("paid_at", null) : q.not("paid_at", "is", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const markPaid = useMutation({
    mutationFn: async () => {
      if (!target || !user?.id) throw new Error("کاربر یا خرید نامشخص");
      const { error } = await supabase
        .from("purchases")
        .update({ paid_at: paidAt.toISOString(), paid_by: user.id })
        .eq("id", target.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("پرداخت ثبت شد و امتیاز محاسبه گردید");
      setTarget(null);
      qc.invalidateQueries({ queryKey: ["purchase-payments"] });
    },
    onError: (e: Error) => toast.error(`ثبت پرداخت ناموفق: ${e.message}`),
  });

  const overdueCount = useMemo(
    () => rows.filter((r) => {
      if (r.paid_at) return false;
      const d = (r.payment_term?.days ?? 0);
      return daysSince(r.purchase_date) > d;
    }).length,
    [rows],
  );

  return (
    <div className="space-y-4 pb-10" dir="rtl">
      <PageHeader
        title="ثبت پرداخت خریدها"
        description="حسابدار با ثبت زمان پرداخت، امتیاز خود را در گیمیفیکیشن «طلای زمان» می‌گیرد"
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as "unpaid" | "paid")}>
        <TabsList>
          <TabsTrigger value="unpaid">
            تسویه نشده
            {overdueCount > 0 && (
              <Badge variant="destructive" className="mr-2">{toFaDigits(String(overdueCount))} دیرکرد</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="paid">تسویه شده</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-3">
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : rows.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">موردی یافت نشد</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">شماره</TableHead>
                        <TableHead className="text-right">محصول</TableHead>
                        <TableHead className="text-right">تأمین‌کننده</TableHead>
                        <TableHead className="text-right">تاریخ خرید</TableHead>
                        <TableHead className="text-right">مبلغ کل</TableHead>
                        <TableHead className="text-right">مهلت</TableHead>
                        <TableHead className="text-right">وضعیت</TableHead>
                        <TableHead className="text-right">عملیات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => {
                        const promised = r.payment_term?.days ?? 0;
                        const elapsed = daysSince(r.purchase_date);
                        const overdue = !r.paid_at && elapsed > promised;
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-xs">{r.number ?? "—"}</TableCell>
                            <TableCell>{r.product?.name ?? "—"}</TableCell>
                            <TableCell>{r.supplier?.name ?? "—"}</TableCell>
                            <TableCell>{toFaDigits(formatDateFa(new Date(r.purchase_date)))}</TableCell>
                            <TableCell>{fmtMoney(r.total_amount, r.currency)}</TableCell>
                            <TableCell>
                              {r.payment_term?.name ?? "—"}
                              {promised > 0 && (
                                <span className="mr-1 text-xs text-muted-foreground">
                                  ({toFaDigits(String(promised))} روز)
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {r.paid_at ? (
                                <Badge variant="secondary" className="gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  پرداخت‌شده در {toFaDigits(formatDateFa(new Date(r.paid_at)))}
                                </Badge>
                              ) : overdue ? (
                                <Badge variant="destructive">
                                  دیرکرد {toFaDigits(String(elapsed - promised))} روز
                                </Badge>
                              ) : (
                                <Badge variant="outline">
                                  {toFaDigits(String(Math.max(0, promised - elapsed)))} روز مانده
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {!r.paid_at && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => { setTarget(r); setPaidAt(new Date()); }}
                                >
                                  <Wallet className="ml-1 h-4 w-4" />
                                  ثبت پرداخت
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>ثبت پرداخت خرید</DialogTitle>
            <DialogDescription>
              تاریخ پرداخت پیش‌فرض روی امروز است. می‌توانید تاریخ دیگری انتخاب کنید.
            </DialogDescription>
          </DialogHeader>

          {target && (
            <div className="space-y-3">
              <div className="rounded-md border p-3 text-sm">
                <div><span className="text-muted-foreground">محصول: </span>{target.product?.name ?? "—"}</div>
                <div><span className="text-muted-foreground">تأمین‌کننده: </span>{target.supplier?.name ?? "—"}</div>
                <div><span className="text-muted-foreground">مبلغ: </span>{fmtMoney(target.total_amount, target.currency)}</div>
                <div><span className="text-muted-foreground">تاریخ خرید: </span>{toFaDigits(formatDateFa(new Date(target.purchase_date)))}</div>
                <div><span className="text-muted-foreground">مهلت: </span>{target.payment_term?.name ?? "—"}</div>
              </div>

              <div className="space-y-2">
                <Label>تاریخ پرداخت</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-right font-normal")}>
                      <CalendarIcon className="ml-2 h-4 w-4" />
                      {toFaDigits(formatDateFa(paidAt))}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={paidAt}
                      onSelect={(d) => d && setPaidAt(d)}
                      disabled={(d) => d > new Date()}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>انصراف</Button>
            <Button onClick={() => markPaid.mutate()} disabled={markPaid.isPending}>
              {markPaid.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              ثبت پرداخت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}