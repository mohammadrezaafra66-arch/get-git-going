import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Banknote, Landmark, Loader2, Receipt, Wallet, X } from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JalaliDateInput } from "@/shared/components/JalaliDateInput";
import { formatDateFa, formatNumber, toFaDigits } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";
import {
  ACCOUNT_TYPE_FA,
  CHANNEL_FA,
  fetchAccountBalances,
  fetchAccountLedger,
  type AccountType,
} from "@/lib/treasury/queries";

// Items 181/182 — treasury: account & cash-box balances plus the two-sided
// in/out report with a running balance over a Jalali date range.
export const Route = createFileRoute("/_app/accounting/treasury")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: TreasuryPage,
});

const ALL = "__all__";

function TreasuryPage() {
  const [typeFilter, setTypeFilter] = useState<string>(ALL);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const balancesQ = useQuery({
    queryKey: ["account-balances", typeFilter, includeInactive],
    queryFn: () =>
      fetchAccountBalances({
        accountType: typeFilter === ALL ? null : (typeFilter as AccountType),
        includeInactive,
      }),
    staleTime: 20_000,
  });

  const accounts = balancesQ.data ?? [];

  const ledgerQ = useQuery({
    queryKey: ["account-ledger", selectedAccount, fromDate, toDate],
    enabled: !!selectedAccount,
    queryFn: () => fetchAccountLedger(selectedAccount, fromDate || null, toDate || null),
    staleTime: 15_000,
  });

  const totals = useMemo(() => {
    const cash = accounts.filter((a) => a.account_type === "cash");
    const bank = accounts.filter((a) => a.account_type === "bank");
    const sum = (xs: typeof accounts) => xs.reduce((s, a) => s + Number(a.current_balance), 0);
    return { cash: sum(cash), bank: sum(bank), all: sum(accounts) };
  }, [accounts]);

  const ledgerTotals = useMemo(() => {
    const rows = ledgerQ.data ?? [];
    let inSum = 0;
    let outSum = 0;
    for (const r of rows) {
      if (r.entry_kind === "in") inSum += Number(r.amount);
      else outSum += Number(r.amount);
    }
    return { inSum, outSum, net: inSum - outSum, closing: rows.at(-1)?.running_balance ?? null };
  }, [ledgerQ.data]);

  const isForbidden = (e: unknown) =>
    /forbidden|permission denied|42501/i.test((e as { message?: string })?.message ?? "");

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        title="خزانه"
        description="ماندهٔ جاری هر صندوق و حساب بانکی، و گزارش ورود/خروج پول با ماندهٔ تجمعی. فقط اسناد تأییدشده در مانده اثر دارند."
        actions={
          <Button asChild variant="outline">
            <Link to="/accounting/payment-vouchers">
              <Receipt className="ml-2 h-4 w-4" /> اسناد پرداخت
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryTile
          label="مجموع صندوق‌های نقدی"
          value={formatNumber(totals.cash)}
          icon={<Wallet className="h-4 w-4" />}
        />
        <SummaryTile
          label="مجموع حساب‌های بانکی"
          value={formatNumber(totals.bank)}
          icon={<Landmark className="h-4 w-4" />}
        />
        <SummaryTile
          label="مجموع کل خزانه"
          value={formatNumber(totals.all)}
          icon={<Banknote className="h-4 w-4" />}
          strong
        />
      </div>

      {/* Balances */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>نوع حساب</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>همه</SelectItem>
                  <SelectItem value="cash">{ACCOUNT_TYPE_FA.cash}</SelectItem>
                  <SelectItem value="bank">{ACCOUNT_TYPE_FA.bank}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm">
              <Switch checked={includeInactive} onCheckedChange={(v) => setIncludeInactive(!!v)} />
              نمایش غیرفعال‌ها
            </label>
          </div>

          {balancesQ.isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری…
            </div>
          ) : balancesQ.isError ? (
            <p className="text-sm text-destructive">
              {isForbidden(balancesQ.error)
                ? "شما دسترسی مشاهده خزانه را ندارید."
                : "دریافت ماندهٔ حساب‌ها با خطا مواجه شد."}
            </p>
          ) : accounts.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="حسابی برای نمایش نیست"
              description="در صفحهٔ «حساب‌های بانکی» یک حساب بانکی یا صندوق نقدی تعریف کنید."
            />
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">عنوان</TableHead>
                    <TableHead className="text-right">نوع</TableHead>
                    <TableHead className="text-right">ماندهٔ اولیه</TableHead>
                    <TableHead className="text-right">ورودی</TableHead>
                    <TableHead className="text-right">خروجی</TableHead>
                    <TableHead className="text-right">ماندهٔ جاری</TableHead>
                    <TableHead className="text-right">گزارش</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a) => (
                    <TableRow
                      key={a.account_id}
                      className={cn(selectedAccount === a.account_id && "bg-muted/50")}
                    >
                      <TableCell className="font-medium">
                        {a.title}
                        {!a.is_active && (
                          <Badge variant="outline" className="ms-2 text-[10px]">
                            غیرفعال
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={a.account_type === "cash" ? "default" : "secondary"}>
                          {ACCOUNT_TYPE_FA[a.account_type] ?? a.account_type}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatNumber(a.opening_balance)}</TableCell>
                      <TableCell className="text-emerald-700 dark:text-emerald-400">
                        {formatNumber(a.total_in)}
                      </TableCell>
                      <TableCell className="text-destructive">
                        {formatNumber(a.total_out)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "font-semibold",
                          Number(a.current_balance) < 0 && "text-destructive",
                        )}
                      >
                        {formatNumber(a.current_balance)} تومان
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant={selectedAccount === a.account_id ? "default" : "outline"}
                          onClick={() => setSelectedAccount(a.account_id)}
                        >
                          ورود/خروج
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

      {/* Ledger (182) */}
      {selectedAccount && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">
                گزارش ورود/خروج — {accounts.find((a) => a.account_id === selectedAccount)?.title}
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedAccount("")}>
                <X className="ml-1 h-4 w-4" /> بستن گزارش
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label>از تاریخ</Label>
                <JalaliDateInput value={fromDate} onChange={setFromDate} />
              </div>
              <div className="space-y-1">
                <Label>تا تاریخ</Label>
                <JalaliDateInput value={toDate} onChange={setToDate} />
              </div>
              <div className="flex items-end">
                {(fromDate || toDate) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFromDate("");
                      setToDate("");
                    }}
                  >
                    <X className="ml-1 h-4 w-4" /> پاک کردن بازه
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <MiniTile label="جمع ورودی" value={formatNumber(ledgerTotals.inSum)} tone="in" />
              <MiniTile label="جمع خروجی" value={formatNumber(ledgerTotals.outSum)} tone="out" />
              <MiniTile label="خالص بازه" value={formatNumber(ledgerTotals.net)} tone="net" />
              <MiniTile
                label="ماندهٔ پایان بازه"
                value={ledgerTotals.closing === null ? "—" : formatNumber(ledgerTotals.closing)}
                tone="net"
              />
            </div>

            {ledgerQ.isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری…
              </div>
            ) : ledgerQ.isError ? (
              <p className="text-sm text-destructive">دریافت گزارش با خطا مواجه شد.</p>
            ) : (ledgerQ.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                در این بازه هیچ ورود یا خروجی ثبت نشده است.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">تاریخ</TableHead>
                      <TableHead className="text-right">نوع</TableHead>
                      <TableHead className="text-right">شماره سند</TableHead>
                      <TableHead className="text-right">طرف حساب</TableHead>
                      <TableHead className="text-right">کانال</TableHead>
                      <TableHead className="text-right">مبلغ</TableHead>
                      <TableHead className="text-right">ماندهٔ تجمعی</TableHead>
                      <TableHead className="text-right">توضیح</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(ledgerQ.data ?? []).map((r) => (
                      <TableRow key={`${r.entry_kind}-${r.entry_id}`}>
                        <TableCell className="whitespace-nowrap">
                          {formatDateFa(r.entry_date)}
                        </TableCell>
                        <TableCell>
                          {r.entry_kind === "in" ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                            >
                              ورود
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-destructive/50 text-destructive"
                            >
                              خروج
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono">
                          {r.document_number ? toFaDigits(r.document_number) : "—"}
                        </TableCell>
                        <TableCell>{r.counterparty ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.document_channel
                            ? (CHANNEL_FA[r.document_channel] ?? r.document_channel)
                            : "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "font-semibold",
                            r.entry_kind === "in"
                              ? "text-emerald-700 dark:text-emerald-400"
                              : "text-destructive",
                          )}
                        >
                          {r.entry_kind === "in" ? "+" : "−"}
                          {formatNumber(r.amount)}
                        </TableCell>
                        <TableCell className="font-semibold">
                          {formatNumber(r.running_balance)}
                        </TableCell>
                        <TableCell className="max-w-[14rem] truncate text-muted-foreground">
                          {r.description || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  icon,
  strong,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className={cn("text-lg font-semibold", strong && "text-primary")}>{value} تومان</div>
      </CardContent>
    </Card>
  );
}

function MiniTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "in" | "out" | "net";
}) {
  const cls =
    tone === "in"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "out"
        ? "text-destructive"
        : "";
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-base font-semibold", cls)}>{value}</div>
    </div>
  );
}
