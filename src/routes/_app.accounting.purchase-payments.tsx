import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarIcon, Loader2, CheckCircle2, Wallet, Search, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { toFaDigits, formatDateFa, formatNumber } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";

import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { JalaliDateInput } from "@/shared/components/JalaliDateInput";
import {
  ACCOUNT_TYPE_FA,
  VOUCHER_CHANNELS,
  fetchAccountBalances,
  fetchActiveExternalParties,
  payPurchaseWithVoucher,
} from "@/lib/treasury/queries";

import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Sentinel: Radix Select cannot hold an empty string value. */
const NO_ACCOUNT = "__no_account__";
/** Same reason, for the third-party payee select (empty = pay the supplier). */
const NO_PARTY = "__no_party__";

export const Route = createFileRoute("/_app/accounting/purchase-payments")({
  // M6/OG-24 — mirrors the requireAnyRole call below. The shared guard cannot decide
  // during SSR or while roles load, so RouteRoleGate in _app enforces this on the client.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "accountant"] } },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
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
  /** Item 231 — the unified person behind this purchase's supplier, if linked. */
  supplier_person_id: string | null;
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
  // Item 180 / 9.2 — optional treasury source. Empty keeps the pre-phase-9
  // behaviour (stamp paid_at only, no voucher).
  const [sourceAccountId, setSourceAccountId] = useState<string>("");
  const [voucherChannel, setVoucherChannel] = useState<string>("cash");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDueDate, setChequeDueDate] = useState("");
  // Migration 313 — payee identity. Empty payeePartyId means the payee is the
  // purchase's own supplier; a value means we paid a third party on the
  // supplier's behalf. Exactly one of the two, mirroring the receipt side and
  // the payment_vouchers_payee_matches_type_chk CHECK.
  const [payeePartyId, setPayeePartyId] = useState<string>("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [payeeAccountingCode, setPayeeAccountingCode] = useState("");

  const accountsQ = useQuery({
    queryKey: ["account-balances", "purchase-payment"],
    queryFn: () => fetchAccountBalances({ includeInactive: false }),
    staleTime: 60_000,
  });

  const partiesQ = useQuery({
    queryKey: ["external-parties", "purchase-payment"],
    queryFn: fetchActiveExternalParties,
    staleTime: 60_000,
  });
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [sortBy, setSortBy] = useState<
    "date_desc" | "date_asc" | "amount_desc" | "amount_asc" | "deadline_asc"
  >("date_desc");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["purchase-payments", tab],
    queryFn: async () => {
      let q = supabase
        .from("purchases")
        .select(
          `
          id, number, purchase_date, purchase_price, cash_price, quantity,
          total_amount, currency, paid_at, paid_by, supplier_person_id,
          product:products(name),
          supplier:suppliers(name),
          payment_term:payment_terms(name, days)
        `,
        )
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

      // Item 180 / 9.2 — when a source account is chosen, the payment goes
      // through pay_purchase_with_voucher so money leaving the treasury gets a
      // real document. That function stamps paid_at itself, atomically.
      if (sourceAccountId) {
        await payPurchaseWithVoucher({
          purchaseId: target.id,
          sourceBankAccountId: sourceAccountId,
          paymentDate: paidAt.toISOString().slice(0, 10),
          documentChannel: voucherChannel,
          chequeNumber: voucherChannel === "cheque" ? chequeNumber : null,
          chequeDueDate: voucherChannel === "cheque" ? chequeDueDate || null : null,
          description: "پرداخت خرید",
          // Migration 313 — payee identity + tracking number reach the RPC,
          // which records them on the voucher and posts the journal entry.
          payeePartyId: payeePartyId || null,
          trackingNumber: trackingNumber.trim() || null,
          payeeAccountingCode: payeeAccountingCode.trim() || null,
        });
        return;
      }

      // Fallback: mark paid without a voucher (behaviour before phase 9).
      const { error } = await supabase
        .from("purchases")
        .update({ paid_at: paidAt.toISOString(), paid_by: user.id })
        .eq("id", target.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(
        sourceAccountId
          ? "پرداخت ثبت شد، سند پرداخت و سند حسابداری ساخته شد و از ماندهٔ حساب کسر گردید."
          : "پرداخت ثبت شد و امتیاز محاسبه گردید",
      );
      setTarget(null);
      setSourceAccountId("");
      setVoucherChannel("cash");
      setChequeNumber("");
      setChequeDueDate("");
      setPayeePartyId("");
      setTrackingNumber("");
      setPayeeAccountingCode("");
      qc.invalidateQueries({ queryKey: ["purchase-payments"] });
      qc.invalidateQueries({ queryKey: ["account-balances"] });
      qc.invalidateQueries({ queryKey: ["payment-vouchers"] });
      qc.invalidateQueries({ queryKey: ["account-ledger"] });
    },
    onError: (e: Error) => toast.error(`ثبت پرداخت ناموفق: ${e.message}`),
  });

  const overdueCount = useMemo(
    () =>
      rows.filter((r) => {
        if (r.paid_at) return false;
        const d = r.payment_term?.days ?? 0;
        return daysSince(r.purchase_date) > d;
      }).length,
    [rows],
  );

  const filteredRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    let out = rows;
    if (q) {
      out = out.filter((r) => {
        return (
          (r.number ?? "").toLowerCase().includes(q) ||
          (r.product?.name ?? "").toLowerCase().includes(q) ||
          (r.supplier?.name ?? "").toLowerCase().includes(q)
        );
      });
    }
    if (tab === "unpaid" && overdueOnly) {
      out = out.filter((r) => {
        const d = r.payment_term?.days ?? 0;
        return daysSince(r.purchase_date) > d;
      });
    }
    const sorted = [...out];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case "date_asc":
          return a.purchase_date.localeCompare(b.purchase_date);
        case "date_desc":
          return b.purchase_date.localeCompare(a.purchase_date);
        case "amount_asc":
          return Number(a.total_amount) - Number(b.total_amount);
        case "amount_desc":
          return Number(b.total_amount) - Number(a.total_amount);
        case "deadline_asc": {
          const remA = (a.payment_term?.days ?? 0) - daysSince(a.purchase_date);
          const remB = (b.payment_term?.days ?? 0) - daysSince(b.purchase_date);
          return remA - remB;
        }
      }
    });
    return sorted;
  }, [rows, debouncedSearch, sortBy, overdueOnly, tab]);

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
              <Badge variant="destructive" className="mr-2">
                {toFaDigits(String(overdueCount))} دیرکرد
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="paid">تسویه شده</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-3">
          <Card className="mb-3">
            <CardContent className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
              <div className="relative w-full md:max-w-sm">
                <Search className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="جستجو شماره، محصول یا تأمین‌کننده..."
                  className="pr-8 pl-8"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="پاک کردن جستجو"
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {tab === "unpaid" && (
                  <div className="flex items-center gap-2 rounded-md border px-3 py-1.5">
                    <Switch
                      checked={overdueOnly}
                      onCheckedChange={setOverdueOnly}
                      id="overdue-only"
                    />
                    <Label htmlFor="overdue-only" className="cursor-pointer text-xs">
                      فقط دیرکردها
                    </Label>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">مرتب‌سازی:</Label>
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                    <SelectTrigger className="h-9 w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date_desc">جدیدترین خرید</SelectItem>
                      <SelectItem value="date_asc">قدیمی‌ترین خرید</SelectItem>
                      <SelectItem value="amount_desc">بیشترین مبلغ</SelectItem>
                      <SelectItem value="amount_asc">کمترین مبلغ</SelectItem>
                      <SelectItem value="deadline_asc">نزدیک‌ترین سررسید</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="mb-2 px-1 text-xs text-muted-foreground">
            {toFaDigits(String(filteredRows.length))} مورد از {toFaDigits(String(rows.length))}{" "}
            نمایش داده شد
          </div>

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : filteredRows.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  موردی یافت نشد
                </div>
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
                      {filteredRows.map((r) => {
                        const promised = r.payment_term?.days ?? 0;
                        const elapsed = daysSince(r.purchase_date);
                        const overdue = !r.paid_at && elapsed > promised;
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-xs">{r.number ?? "—"}</TableCell>
                            <TableCell>{r.product?.name ?? "—"}</TableCell>
                            <TableCell>
                              {/* Item 231 — link through to the unified person
                                  record when the supplier is linked to one. */}
                              {r.supplier_person_id ? (
                                <Link
                                  to="/persons/$personId/edit"
                                  params={{ personId: r.supplier_person_id }}
                                  className="text-primary hover:underline"
                                >
                                  {r.supplier?.name ?? "—"}
                                </Link>
                              ) : (
                                (r.supplier?.name ?? "—")
                              )}
                            </TableCell>
                            <TableCell>
                              {toFaDigits(formatDateFa(new Date(r.purchase_date)))}
                            </TableCell>
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
                                  onClick={() => {
                                    setTarget(r);
                                    setPaidAt(new Date());
                                    // Never carry a previous row's payee into
                                    // the next payment.
                                    setPayeePartyId("");
                                    setTrackingNumber("");
                                    setPayeeAccountingCode("");
                                  }}
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
                <div>
                  <span className="text-muted-foreground">محصول: </span>
                  {target.product?.name ?? "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">تأمین‌کننده: </span>
                  {target.supplier?.name ?? "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">مبلغ: </span>
                  {fmtMoney(target.total_amount, target.currency)}
                </div>
                <div>
                  <span className="text-muted-foreground">تاریخ خرید: </span>
                  {toFaDigits(formatDateFa(new Date(target.purchase_date)))}
                </div>
                <div>
                  <span className="text-muted-foreground">مهلت: </span>
                  {target.payment_term?.name ?? "—"}
                </div>
              </div>

              <div className="space-y-2">
                <Label>تاریخ پرداخت</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-full justify-start text-right font-normal")}
                    >
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

              {/* Item 180 / 9.2 — choosing a source account creates a payment
                  voucher so the outflow is recorded in the treasury. */}
              <div className="space-y-2">
                <Label>از حساب / صندوق (اختیاری)</Label>
                <Select
                  value={sourceAccountId || NO_ACCOUNT}
                  onValueChange={(v) => setSourceAccountId(v === NO_ACCOUNT ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ACCOUNT}>بدون سند خزانه (فقط علامت پرداخت)</SelectItem>
                    {(accountsQ.data ?? []).map((a) => (
                      <SelectItem key={a.account_id} value={a.account_id}>
                        {a.title} — {ACCOUNT_TYPE_FA[a.account_type] ?? a.account_type} (مانده:{" "}
                        {formatNumber(a.current_balance)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  اگر حساب را انتخاب کنید، یک «سند پرداخت» ساخته می‌شود و مبلغ از ماندهٔ آن حساب کسر
                  می‌گردد. در غیر این صورت فقط خرید پرداخت‌شده علامت می‌خورد.
                </p>
              </div>

              {sourceAccountId && (
                <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                  <div className="space-y-2">
                    <Label>روش پرداخت</Label>
                    <Select
                      value={voucherChannel}
                      onValueChange={(v) => {
                        setVoucherChannel(v);
                        if (v !== "cheque") {
                          setChequeNumber("");
                          setChequeDueDate("");
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VOUCHER_CHANNELS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {voucherChannel === "cheque" && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label>
                          شمارهٔ چک <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          dir="ltr"
                          className="text-left font-mono"
                          value={chequeNumber}
                          onChange={(e) => setChequeNumber(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>سررسید چک</Label>
                        <JalaliDateInput value={chequeDueDate} onChange={setChequeDueDate} />
                      </div>
                    </div>
                  )}

                  {/* مهاجرت ۳۱۳ — هویت گیرندهٔ پرداخت. دقیقاً یکی: یا
                      تأمین‌کنندهٔ خودِ خرید، یا یک طرف حساب خارجی. همان الگوی
                      «حالت ۱ / حالت ۲» فرم فیش دریافت. */}
                  <div className="space-y-2 border-t pt-3">
                    <Label>گیرندهٔ پرداخت</Label>
                    <Select
                      value={payeePartyId || NO_PARTY}
                      onValueChange={(v) => setPayeePartyId(v === NO_PARTY ? "" : v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_PARTY}>
                          حالت ۱: تأمین‌کنندهٔ همین خرید
                          {target?.supplier?.name ? ` — ${target.supplier.name}` : ""}
                        </SelectItem>
                        {(partiesQ.data ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            حالت ۲: {p.full_name}
                            {p.accounting_code ? ` (کد ${toFaDigits(p.accounting_code)})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      اگر پول به‌جای تأمین‌کننده به شخص دیگری پرداخت شده، او را اینجا انتخاب کنید.
                      بدهی تأمین‌کننده در هر دو حالت کم می‌شود؛ فقط گیرندهٔ واقعی در سند ثبت
                      می‌گردد.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>شمارهٔ پیگیری</Label>
                      <Input
                        dir="ltr"
                        className="text-left font-mono"
                        placeholder="شمارهٔ پیگیری تراکنش"
                        value={trackingNumber}
                        onChange={(e) => setTrackingNumber(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>کد آسان ذینفع (اختیاری)</Label>
                      <Input
                        dir="ltr"
                        className="text-left font-mono"
                        placeholder="کد حسابداری گیرنده"
                        value={payeeAccountingCode}
                        onChange={(e) => setPayeeAccountingCode(e.target.value)}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    با ثبت این پرداخت یک سند حسابداری متوازن ساخته می‌شود: بدهکار «بدهی به
                    تأمین‌کننده» و بستانکار «حساب بانکی».
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              انصراف
            </Button>
            <Button
              onClick={() => markPaid.mutate()}
              disabled={
                markPaid.isPending ||
                (!!sourceAccountId && voucherChannel === "cheque" && !chequeNumber.trim())
              }
            >
              {markPaid.isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              ثبت پرداخت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
