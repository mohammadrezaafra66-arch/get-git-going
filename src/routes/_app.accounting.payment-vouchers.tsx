import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, Loader2, Plus, Receipt, Wallet, X } from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDateFa, formatNumber, toFaDigits } from "@/lib/i18n/formatters";
import {
  ACCOUNT_TYPE_FA,
  CHANNEL_FA,
  PAYEE_TYPE_FA,
  VOUCHER_CHANNELS,
  createPaymentVoucher,
  fetchAccountBalances,
  fetchPaymentVouchers,
  voucherPayeeLabel,
  type PayeeType,
} from "@/lib/treasury/queries";

// Item 180 — outgoing payment vouchers, including the cheque channel (9.5).
export const Route = createFileRoute("/_app/accounting/payment-vouchers")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: PaymentVouchersPage,
});

const today = new Date().toISOString().slice(0, 10);

type FormState = {
  amount: string;
  paymentDate: string;
  payeeType: PayeeType;
  payeeSupplierId: string;
  payeePartyId: string;
  payeeCustomerId: string;
  payeeName: string;
  documentChannel: string;
  sourceBankAccountId: string;
  trackingNumber: string;
  chequeNumber: string;
  chequeDueDate: string;
  description: string;
};

const EMPTY: FormState = {
  amount: "",
  paymentDate: today,
  payeeType: "supplier",
  payeeSupplierId: "",
  payeePartyId: "",
  payeeCustomerId: "",
  payeeName: "",
  documentChannel: "cash",
  sourceBankAccountId: "",
  trackingNumber: "",
  chequeNumber: "",
  chequeDueDate: "",
  description: "",
};

function PaymentVouchersPage() {
  const qc = useQueryClient();
  const { user, roles } = useAuth();
  const canCreate = roles.includes("admin") || roles.includes("accountant");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>({ ...EMPTY });
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const listQ = useQuery({
    queryKey: ["payment-vouchers", fromDate, toDate],
    queryFn: () => fetchPaymentVouchers({ fromDate: fromDate || null, toDate: toDate || null }),
    staleTime: 15_000,
  });

  const accountsQ = useQuery({
    queryKey: ["account-balances", "voucher-form"],
    queryFn: () => fetchAccountBalances({ includeInactive: false }),
    staleTime: 60_000,
  });

  const suppliersQ = useQuery({
    queryKey: ["voucher-suppliers"],
    enabled: open && form.payeeType === "supplier",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .order("name")
        .limit(300);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const partiesQ = useQuery({
    queryKey: ["voucher-parties"],
    enabled: open && form.payeeType === "external_party",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("external_parties")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name")
        .limit(300);
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string }[];
    },
  });

  const customersQ = useQuery({
    queryKey: ["voucher-customers"],
    enabled: open && form.payeeType === "customer",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name")
        .order("name")
        .limit(300);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("کاربر شناسایی نشد.");
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0)
        throw new Error("مبلغ باید بزرگ‌تر از صفر باشد.");
      if (!form.sourceBankAccountId) throw new Error("حساب/صندوق مبدأ را انتخاب کنید.");
      if (form.payeeType === "supplier" && !form.payeeSupplierId)
        throw new Error("تأمین‌کننده را انتخاب کنید.");
      if (form.payeeType === "external_party" && !form.payeePartyId)
        throw new Error("طرف حساب را انتخاب کنید.");
      if (form.payeeType === "customer" && !form.payeeCustomerId)
        throw new Error("مشتری را انتخاب کنید.");
      if (form.payeeType === "other" && !form.payeeName.trim())
        throw new Error("نام دریافت‌کننده را وارد کنید.");
      if (form.documentChannel === "cheque" && !form.chequeNumber.trim())
        throw new Error("برای پرداخت با چک، شمارهٔ چک الزامی است.");

      return createPaymentVoucher(
        {
          amount,
          paymentDate: form.paymentDate,
          payeeType: form.payeeType,
          payeeSupplierId: form.payeeSupplierId || null,
          payeePartyId: form.payeePartyId || null,
          payeeCustomerId: form.payeeCustomerId || null,
          payeeName: form.payeeName,
          documentChannel: form.documentChannel,
          sourceBankAccountId: form.sourceBankAccountId,
          trackingNumber: form.trackingNumber,
          chequeNumber: form.chequeNumber,
          chequeDueDate: form.chequeDueDate,
          description: form.description,
        },
        user.id,
      );
    },
    onSuccess: () => {
      toast.success("سند پرداخت ثبت شد و از ماندهٔ حساب کسر گردید.");
      setOpen(false);
      setForm({ ...EMPTY });
      qc.invalidateQueries({ queryKey: ["payment-vouchers"] });
      qc.invalidateQueries({ queryKey: ["account-balances"] });
      qc.invalidateQueries({ queryKey: ["account-ledger"] });
    },
    onError: (e: Error) => toast.error(e.message || "ثبت سند ناموفق بود."),
  });

  const vouchers = listQ.data ?? [];
  const isCheque = form.documentChannel === "cheque";

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
        actions={
          canCreate ? (
            <Button onClick={() => setOpen(true)}>
              <Plus className="ml-2 h-4 w-4" /> سند پرداخت جدید
            </Button>
          ) : null
        }
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
                description="برای ثبت خروج پول از صندوق یا حساب بانکی، یک سند پرداخت بسازید."
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

      {/* Create voucher */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>سند پرداخت جدید</DialogTitle>
            <DialogDescription>
              این سند بلافاصله تأییدشده ثبت می‌شود و از ماندهٔ حساب/صندوق انتخابی کسر می‌گردد.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>
                  مبلغ (تومان) <span className="text-destructive">*</span>
                </Label>
                <Input
                  inputMode="numeric"
                  dir="ltr"
                  className="text-left font-mono"
                  value={form.amount}
                  onChange={(e) =>
                    setForm({ ...form, amount: e.target.value.replace(/[^\d.]/g, "") })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>
                  تاریخ پرداخت <span className="text-destructive">*</span>
                </Label>
                <JalaliDateInput
                  value={form.paymentDate}
                  onChange={(v) => setForm({ ...form, paymentDate: v })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label>
                از حساب / صندوق <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.sourceBankAccountId || undefined}
                onValueChange={(v) => setForm({ ...form, sourceBankAccountId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب کنید" />
                </SelectTrigger>
                <SelectContent>
                  {(accountsQ.data ?? []).map((a) => (
                    <SelectItem key={a.account_id} value={a.account_id}>
                      {a.title} — {ACCOUNT_TYPE_FA[a.account_type] ?? a.account_type} (مانده:{" "}
                      {formatNumber(a.current_balance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>نوع دریافت‌کننده</Label>
              <Select
                value={form.payeeType}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    payeeType: v as PayeeType,
                    payeeSupplierId: "",
                    payeePartyId: "",
                    payeeCustomerId: "",
                    payeeName: "",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAYEE_TYPE_FA) as PayeeType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {PAYEE_TYPE_FA[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.payeeType === "supplier" && (
              <PayeePicker
                label="تأمین‌کننده"
                value={form.payeeSupplierId}
                onChange={(v) => setForm({ ...form, payeeSupplierId: v })}
                options={(suppliersQ.data ?? []).map((s) => ({ id: s.id, label: s.name }))}
                loading={suppliersQ.isLoading}
              />
            )}
            {form.payeeType === "external_party" && (
              <PayeePicker
                label="طرف حساب خارجی"
                value={form.payeePartyId}
                onChange={(v) => setForm({ ...form, payeePartyId: v })}
                options={(partiesQ.data ?? []).map((p) => ({ id: p.id, label: p.full_name }))}
                loading={partiesQ.isLoading}
              />
            )}
            {form.payeeType === "customer" && (
              <PayeePicker
                label="مشتری"
                value={form.payeeCustomerId}
                onChange={(v) => setForm({ ...form, payeeCustomerId: v })}
                options={(customersQ.data ?? []).map((c) => ({ id: c.id, label: c.name }))}
                loading={customersQ.isLoading}
              />
            )}
            {form.payeeType === "other" && (
              <div className="space-y-1">
                <Label>
                  نام دریافت‌کننده <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={form.payeeName}
                  onChange={(e) => setForm({ ...form, payeeName: e.target.value })}
                />
              </div>
            )}

            <div className="space-y-1">
              <Label>روش پرداخت</Label>
              <Select
                value={form.documentChannel}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    documentChannel: v,
                    // Cheque fields must be null for other channels (DB CHECK).
                    chequeNumber: v === "cheque" ? form.chequeNumber : "",
                    chequeDueDate: v === "cheque" ? form.chequeDueDate : "",
                  })
                }
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

            {isCheque && (
              <div className="grid grid-cols-1 gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>
                    شمارهٔ چک <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    dir="ltr"
                    className="text-left font-mono"
                    value={form.chequeNumber}
                    onChange={(e) => setForm({ ...form, chequeNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>تاریخ سررسید چک</Label>
                  <JalaliDateInput
                    value={form.chequeDueDate}
                    onChange={(v) => setForm({ ...form, chequeDueDate: v })}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label>شماره پیگیری</Label>
              <Input
                dir="ltr"
                className="text-left font-mono"
                value={form.trackingNumber}
                onChange={(e) => setForm({ ...form, trackingNumber: e.target.value })}
              />
            </div>

            <div className="space-y-1">
              <Label>توضیحات</Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={create.isPending}>
              انصراف
            </Button>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <Wallet className="ml-2 h-4 w-4" />
              )}
              ثبت سند پرداخت
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PayeePicker({
  label,
  value,
  onChange,
  options,
  loading,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  loading?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label>
        {label} <span className="text-destructive">*</span>
      </Label>
      <Select value={value || undefined} onValueChange={onChange} disabled={loading}>
        <SelectTrigger>
          <SelectValue placeholder={loading ? "در حال بارگذاری…" : "انتخاب کنید"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
