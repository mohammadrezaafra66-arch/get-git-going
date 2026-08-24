import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, Receipt, X } from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
import {
  CHANNEL_FA,
  PAYEE_TYPE_FA,
  fetchAccountBalances,
  fetchPaymentVouchers,
  voucherPayeeLabel,
} from "@/lib/treasury/queries";

// Item 180 — outgoing payment vouchers, including the cheque channel (9.5).
//
// READ-ONLY since migration 368 (D19, owner decision 2026-08-21). This page used to create
// vouchers with a direct PostgREST insert that wrote no journal entry, so the row moved the
// displayed bank balance while being absent from the ledger and from every Asan export. The
// create path now lives only in the document wizard, which calls create_payment. The RLS policy
// that permitted the raw insert is gone, so this page could not create one even if the form
// returned. What survives is the list — it is the only place a payment document can be viewed.
export const Route = createFileRoute("/_app/accounting/payment-vouchers")({
  // M6/OG-24 — mirrors the requireAnyRole call below. The shared guard cannot decide
  // during SSR or while roles load, so RouteRoleGate in _app enforces this on the client.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "accountant"] } },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: PaymentVouchersPage,
});

function PaymentVouchersPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const listQ = useQuery({
    queryKey: ["payment-vouchers", fromDate, toDate],
    queryFn: () => fetchPaymentVouchers({ fromDate: fromDate || null, toDate: toDate || null }),
    staleTime: 15_000,
  });

  const vouchers = listQ.data ?? [];

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/accounting/treasury">
            <ArrowRight className="ml-2 h-4 w-4" /> بازگشت به خزانه
          </Link>
        </Button>
      </div>

      <PageHeader
        title="اسناد پرداخت (خروج پول)"
        description="هر سند پرداخت، خروج پول از یک حساب یا صندوق را ثبت می‌کند و بلافاصله در ماندهٔ خزانه اثر می‌گذارد."
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <Label>از تاریخ</Label>
            <JalaliDateInput value={fromDate} onChange={setFromDate} />
          </div>
          <div className="space-y-1">
            <Label>تا تاریخ</Label>
            <JalaliDateInput value={toDate} onChange={setToDate} />
          </div>
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {listQ.isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="ml-2 h-5 w-5 animate-spin" /> در حال بارگذاری…
            </div>
          ) : listQ.isError ? (
            <div className="p-6 text-sm text-destructive">دریافت اسناد پرداخت با خطا مواجه شد.</div>
          ) : vouchers.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Receipt}
                title="سند پرداختی ثبت نشده"
                description="سند پرداخت از «ثبت سند» در ویزارد ساخته می‌شود و پس از ثبت اینجا دیده می‌شود."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">شماره سند</TableHead>
                    <TableHead className="text-right">تاریخ</TableHead>
                    <TableHead className="text-right">دریافت‌کننده</TableHead>
                    <TableHead className="text-right">نوع</TableHead>
                    <TableHead className="text-right">کانال</TableHead>
                    <TableHead className="text-right">از حساب</TableHead>
                    <TableHead className="text-right">مبلغ</TableHead>
                    <TableHead className="text-right">چک</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vouchers.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-mono">
                        {v.voucher_number ? toFaDigits(v.voucher_number) : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDateFa(v.payment_date)}
                      </TableCell>
                      <TableCell className="font-medium">{voucherPayeeLabel(v)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {PAYEE_TYPE_FA[v.payee_type] ?? v.payee_type}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {CHANNEL_FA[v.document_channel] ?? v.document_channel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {v.source_account_title ?? "—"}
                      </TableCell>
                      <TableCell className="font-semibold text-destructive">
                        −{formatNumber(v.amount)} تومان
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {v.cheque_number
                          ? `${toFaDigits(v.cheque_number)}${
                              v.cheque_due_date ? ` — ${formatDateFa(v.cheque_due_date)}` : ""
                            }`
                          : "—"}
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
