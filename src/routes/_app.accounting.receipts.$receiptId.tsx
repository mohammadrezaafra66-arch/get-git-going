import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole, type AppRole } from "@/lib/rbac/roles";
import { formatNumber, toFaDigits } from "@/lib/i18n/formatters";

import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { ReceiptDocumentsList } from "@/components/accounting/PaymentReceiptDocuments";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/accounting/receipts/$receiptId")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: ReceiptDetailPage,
});

const STATUS_LABEL: Record<string, string> = {
  pending_review: "در انتظار بررسی",
  approved: "تأییدشده",
  rejected: "ردشده",
};
const STATUS_VARIANT: Record<string, "secondary" | "default" | "destructive"> = {
  pending_review: "secondary",
  approved: "default",
  rejected: "destructive",
};

type ReceiptRow = {
  id: string;
  customer_id: string;
  receipt_type: string;
  payer_name: string;
  payer_phone: string | null;
  payer_accounting_code: string | null;
  receiver_name: string;
  receiver_phone: string | null;
  receiver_accounting_code: string | null;
  amount: number;
  payment_date: string;
  payment_time: string;
  tracking_number: string;
  bank_name: string | null;
  receipt_image_url: string | null;
  description: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  customer: { id: string; name: string; phone: string | null } | null;
};

type LinkedInvoice = {
  id: string;
  amount: number;
  invoice: {
    id: string;
    number: string | null;
    total_amount: number;
    status: string;
  } | null;
};

function Field({ label, children, dir }: { label: string; children: React.ReactNode; dir?: "ltr" | "rtl" }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div dir={dir} className="text-sm font-medium">{children || "—"}</div>
    </div>
  );
}

function ReceiptDetailPage() {
  const { receiptId } = Route.useParams();
  const { user, roles } = useAuth();
  const queryClient = useQueryClient();

  const canActOnReceipt = hasAnyRole(roles as AppRole[], ["admin", "accountant"]);

  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  const { data: receipt, isLoading, error } = useQuery({
    queryKey: ["payment-receipt", receiptId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_receipts")
        .select(
          "id, customer_id, receipt_type, payer_name, payer_phone, payer_accounting_code, receiver_name, receiver_phone, receiver_accounting_code, amount, payment_date, payment_time, tracking_number, bank_name, receipt_image_url, description, status, rejection_reason, created_at, customer:customers(id, name, phone)",
        )
        .eq("id", receiptId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("فیش یافت نشد");
      return data as unknown as ReceiptRow;
    },
  });

  const { data: linkedInvoices = [] } = useQuery<LinkedInvoice[]>({
    queryKey: ["payment-receipt-links", receiptId],
    enabled: !!receipt,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_receipt_links")
        .select("id, amount, invoice:invoices(id, number, total_amount, status)")
        .eq("receipt_id", receiptId);
      if (error) throw error;
      return (data ?? []) as unknown as LinkedInvoice[];
    },
  });

  const { data: credit } = useQuery({
    queryKey: ["customer-credit", receipt?.customer_id],
    enabled: !!receipt?.customer_id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_customer_credit", {
        p_customer_id: receipt!.customer_id,
      });
      if (error) throw error;
      const row = (data as unknown as Array<{
        available_credit: number;
        held_credit: number;
        outstanding_balance: number;
      }>)?.[0];
      return row ?? null;
    },
    staleTime: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id || !receipt) throw new Error("اطلاعات ناقص");
      if (receipt.status !== "pending_review") {
        throw new Error("فقط فیش‌های در انتظار بررسی قابل تأیید هستند");
      }
      // 1) Update status
      const { error: updErr } = await supabase
        .from("payment_receipts")
        .update({ status: "approved", rejection_reason: null } as never)
        .eq("id", receipt.id)
        .eq("status", "pending_review");
      if (updErr) throw updErr;

      // 2) Atomic accounting posting via RPC (idempotent, prevents duplicate posting)
      const { data: postResult, error: rpcErr } = await supabase.rpc(
        "post_receipt_accounting",
        { p_receipt_id: receipt.id, p_user_id: user.id },
      );
      if (rpcErr) {
        // Roll back the approval if posting failed
        await supabase
          .from("payment_receipts")
          .update({ status: "pending_review" } as never)
          .eq("id", receipt.id);
        throw new Error(rpcErr.message || "خطا در ثبت سند حسابداری فیش");
      }
      const linkedInvoiceUpdates =
        ((postResult as { invoice_updates?: unknown })?.invoice_updates as Array<{
          invoice_id: string;
          from: string;
          to: string;
          paid_total: number;
          invoice_total: number;
        }>) ?? [];

      // 3) Top-level audit (in addition to the receipt_accounting_posted entry written by the RPC)
      await supabase.from("audit_logs").insert({
        actor_id: user.id,
        entity_type: "payment_receipt",
        entity_id: receipt.id,
        action: receipt.receipt_type === "prepayment" ? "prepayment_credit_added" : "payment_receipt_approved",
        diff: {
          receipt_id: receipt.id,
          customer_id: receipt.customer_id,
          amount: Number(receipt.amount),
          receipt_type: receipt.receipt_type,
          invoice_updates: linkedInvoiceUpdates,
        },
      } as never);
    },
    onSuccess: () => {
      toast.success("فیش تأیید شد و اعتبار مشتری به‌روزرسانی گردید.");
      queryClient.invalidateQueries({ queryKey: ["payment-receipt", receiptId] });
      queryClient.invalidateQueries({ queryKey: ["payment-receipt-links", receiptId] });
      queryClient.invalidateQueries({ queryKey: ["payment-receipts"] });
      queryClient.invalidateQueries({ queryKey: ["customer-credit"] });
      setApproveOpen(false);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      toast.error(`تأیید فیش ناموفق بود: ${msg}`);
    },
  });

  const reasonSchema = z.string().trim().min(10, "حداقل ۱۰ کاراکتر");

  const rejectMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!user?.id || !receipt) throw new Error("اطلاعات ناقص");
      if (receipt.status !== "pending_review") {
        throw new Error("فقط فیش‌های در انتظار بررسی قابل رد هستند");
      }
      const parsed = reasonSchema.safeParse(reason);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "دلیل نامعتبر");

      const { error: updErr } = await supabase
        .from("payment_receipts")
        .update({ status: "rejected", rejection_reason: parsed.data } as never)
        .eq("id", receipt.id)
        .eq("status", "pending_review");
      if (updErr) throw updErr;

      await supabase.from("audit_logs").insert({
        actor_id: user.id,
        entity_type: "payment_receipt",
        entity_id: receipt.id,
        action: "payment_receipt_rejected",
        diff: { reason: parsed.data, receipt_id: receipt.id },
      } as never);
    },
    onSuccess: () => {
      toast.success("فیش رد شد.");
      queryClient.invalidateQueries({ queryKey: ["payment-receipt", receiptId] });
      queryClient.invalidateQueries({ queryKey: ["payment-receipts"] });
      setRejectOpen(false);
      setRejectReason("");
      setRejectError(null);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "خطای ناشناخته";
      toast.error(`رد فیش ناموفق بود: ${msg}`);
    },
  });

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="جزئیات فیش واریزی"
        description="مشاهده اطلاعات و بررسی فیش"
        actions={
          <Button variant="outline" asChild>
            <Link to="/accounting/receipts">
              <ArrowRight className="ml-2 h-4 w-4" />
              بازگشت به لیست
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center p-10">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : error || !receipt ? (
        <Card>
          <CardContent className="p-6 text-center text-destructive">
            {error instanceof Error ? error.message : "فیش یافت نشد"}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Badge variant={STATUS_VARIANT[receipt.status] ?? "secondary"}>
                    {STATUS_LABEL[receipt.status] ?? receipt.status}
                  </Badge>
                  <Badge variant="outline">
                    {receipt.receipt_type === "prepayment" ? "پیش واریز: اعتبار مثبت" : "پرداخت بدهی"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    شماره پیگیری: <span dir="ltr">{toFaDigits(receipt.tracking_number)}</span>
                  </span>
                </div>
                {canActOnReceipt && receipt.status === "pending_review" && (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setApproveOpen(true)}
                      disabled={approveMutation.isPending}
                    >
                      <Check className="ml-2 h-4 w-4" />
                      تأیید فیش
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => setRejectOpen(true)}
                      disabled={rejectMutation.isPending}
                    >
                      <X className="ml-2 h-4 w-4" />
                      رد فیش
                    </Button>
                  </div>
                )}
              </div>

              {receipt.status === "rejected" && receipt.rejection_reason && (
                <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm">
                  <span className="font-semibold">دلیل رد: </span>
                  {receipt.rejection_reason}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardContent className="p-4 space-y-4">
                <h3 className="text-sm font-semibold">جزئیات تراکنش</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label="مبلغ (تومان)">
                    <span className="text-base">{formatNumber(Number(receipt.amount))}</span>
                  </Field>
                  <Field label="تاریخ" dir="ltr">{toFaDigits(receipt.payment_date)}</Field>
                  <Field label="ساعت" dir="ltr">
                    {toFaDigits(receipt.payment_time?.slice(0, 5) ?? "")}
                  </Field>
                  <Field label="بانک مقصد">{receipt.bank_name}</Field>
                </div>

                <Separator />

                <ReceiptDocumentsList
                  receiptId={receipt.id}
                  legacyImageUrl={receipt.receipt_image_url}
                />

                <Separator />

                <h3 className="text-sm font-semibold">واریزکننده</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label="نام">{receipt.payer_name}</Field>
                  <Field label="شماره موبایل" dir="ltr">
                    {receipt.payer_phone ? toFaDigits(receipt.payer_phone) : ""}
                  </Field>
                  <Field label="کد حسابداری" dir="ltr">{receipt.payer_accounting_code}</Field>
                </div>

                <Separator />

                <h3 className="text-sm font-semibold">گیرنده وجه</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <Field label="نام">{receipt.receiver_name}</Field>
                  <Field label="شماره موبایل" dir="ltr">
                    {receipt.receiver_phone ? toFaDigits(receipt.receiver_phone) : ""}
                  </Field>
                  <Field label="کد حسابداری" dir="ltr">{receipt.receiver_accounting_code}</Field>
                </div>

                {receipt.description && (
                  <>
                    <Separator />
                    <Field label="توضیحات">
                      <p className="whitespace-pre-wrap text-sm">{receipt.description}</p>
                    </Field>
                  </>
                )}

                {receipt.receipt_type === "payment" && (
                  <>
                    <Separator />
                    <h3 className="text-sm font-semibold">پیش‌فاکتورهای متصل</h3>
                    {linkedInvoices.length === 0 ? (
                      <p className="text-xs text-muted-foreground">هیچ پیش‌فاکتوری متصل نیست.</p>
                    ) : (
                      <div className="space-y-2">
                        {linkedInvoices.map((l) => (
                          <div
                            key={l.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-2 text-sm"
                          >
                            <div className="flex flex-col">
                              <span dir="ltr" className="font-medium">
                                {toFaDigits(l.invoice?.number ?? l.invoice?.id?.slice(0, 8) ?? "—")}
                              </span>
                              {l.invoice && (
                                <span className="text-xs text-muted-foreground">
                                  مبلغ کل: {formatNumber(Number(l.invoice.total_amount))} تومان
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {l.invoice?.status && (
                                <Badge variant="outline" className="text-xs">
                                  {l.invoice.status === "paid"
                                    ? "پرداخت‌شده"
                                    : l.invoice.status === "partially_paid"
                                      ? "پرداخت جزئی"
                                      : l.invoice.status}
                                </Badge>
                              )}
                              <span className="text-sm font-semibold">
                                {formatNumber(Number(l.amount))} تومان
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold">مشتری</h3>
                <Field label="نام مشتری">{receipt.customer?.name ?? "—"}</Field>
                <Field label="شماره تماس" dir="ltr">
                  {receipt.customer?.phone ? toFaDigits(receipt.customer.phone) : ""}
                </Field>

                <Separator />
                <h3 className="text-sm font-semibold">وضعیت اعتباری</h3>
                {credit ? (
                  <>
                    <Field label="اعتبار قابل استفاده">
                      {formatNumber(Number(credit.available_credit))} تومان
                    </Field>
                    <Field label="بدهی فعلی">
                      {formatNumber(Number(credit.outstanding_balance))} تومان
                    </Field>
                    {Number(credit.held_credit) > 0 && (
                      <Field label="اعتبار رزرو شده">
                        {formatNumber(Number(credit.held_credit))} تومان
                      </Field>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">در حال دریافت…</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Approve confirm */}
          <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>تأیید فیش واریزی</AlertDialogTitle>
                <AlertDialogDescription>
                  {`با تأیید این فیش، اعتبار مشتری «${receipt.customer?.name ?? "—"}» به میزان ${formatNumber(Number(receipt.amount))} تومان افزایش می‌یابد. ادامه می‌دهید؟`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={approveMutation.isPending}>انصراف</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    approveMutation.mutate();
                  }}
                  disabled={approveMutation.isPending}
                >
                  {approveMutation.isPending && (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  )}
                  تأیید
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Reject dialog */}
          <Dialog open={rejectOpen} onOpenChange={(open) => {
            setRejectOpen(open);
            if (!open) {
              setRejectReason("");
              setRejectError(null);
            }
          }}>
            <DialogContent dir="rtl">
              <DialogHeader>
                <DialogTitle>رد فیش واریزی</DialogTitle>
                <DialogDescription>
                  لطفاً دلیل رد این فیش را وارد کنید (حداقل ۱۰ کاراکتر).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label>دلیل رد <span className="text-destructive">*</span></Label>
                <Textarea
                  rows={4}
                  value={rejectReason}
                  onChange={(e) => {
                    setRejectReason(e.target.value);
                    if (rejectError) setRejectError(null);
                  }}
                  placeholder="مثلاً: مغایرت در شماره پیگیری، تصویر ناخوانا و …"
                />
                {rejectError && <p className="text-xs text-destructive">{rejectError}</p>}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setRejectOpen(false)}
                  disabled={rejectMutation.isPending}
                >
                  انصراف
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    const parsed = reasonSchema.safeParse(rejectReason);
                    if (!parsed.success) {
                      setRejectError(parsed.error.issues[0]?.message ?? "دلیل نامعتبر");
                      return;
                    }
                    rejectMutation.mutate(parsed.data);
                  }}
                  disabled={rejectMutation.isPending}
                >
                  {rejectMutation.isPending && (
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  )}
                  رد فیش
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
