import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, XCircle, ArrowRight, Copy, Send, Truck } from "lucide-react";
import { WaybillStatusBadge } from "@/shared/components/WaybillStatusBadge";
import { toast } from "sonner";

import { requirePermission } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toFaDigits, formatNumber, formatDateFa } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/sales_/invoices_/$invoiceId")({
  beforeLoad: async () => {
    await requirePermission("invoices", "view");
  },
  component: InvoiceDetailPage,
});

function statusLabel(s: string) {
  switch (s) {
    case "draft":
      return "پیش‌نویس";
    case "canceled":
      return "لغو شده";
    case "paid":
      return "پرداخت شده";
    case "partially_paid":
      return "پرداخت جزئی";
    case "issued":
      return "صادر شده";
    case "pending_accountant":
      return "در انتظار حسابدار";
    case "final":
      return "نهایی";
    default:
      return s;
  }
}

function InvoiceDetailPage() {
  const { invoiceId } = Route.useParams();
  const { roles } = useAuth();
  const router = useRouter();
  const [canceling, setCanceling] = useState(false);
  const [copying, setCopying] = useState(false);
  const [sending, setSending] = useState(false);

  const canManage = roles.includes("admin") || roles.includes("accountant");
  const canSendToAccountant =
    roles.includes("admin") || roles.includes("manager") || roles.includes("sales");

  const { data: invoice, isFetching, refetch } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, number, type, invoice_type, status, total_amount, subtotal, discount_amount, tax_amount, issue_date, due_date, notes, created_at, customer:customers(id, name), price_type:sale_price_types(title)"
        )
        .eq("id", invoiceId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["invoice-items", invoiceId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_items")
        .select("id, quantity, unit_price, line_total, product:products(name)")
        .eq("invoice_id", invoiceId);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        quantity: number;
        unit_price: number;
        line_total: number;
        product: { name: string } | null;
      }>;
    },
  });

  const { data: waybill } = useQuery({
    queryKey: ["waybill-summary", invoiceId],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waybills")
        .select("id, waybill_number, status, shipping_company, destination_city")
        .eq("invoice_id", invoiceId)
        .neq("status", "canceled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const isDraftPreInvoice = invoice?.status === "draft" && invoice?.type === "pre_invoice";
  const showCancel = canManage && isDraftPreInvoice;
  const showSendToAccountant = canSendToAccountant && isDraftPreInvoice;

  const handleCopy = async () => {
    if (!invoice) return;
    setCopying(true);
    try {
      const customer = invoice.customer as { id: string; name: string } | null;
      const lines: string[] = [];
      lines.push("📋 پیش‌فاکتور");
      lines.push(`👤 مشتری: ${customer?.name ?? "—"}`);
      lines.push(`💰 مبلغ کل: ${formatNumber(Number(invoice.total_amount))} تومان`);
      lines.push(`📅 تاریخ: ${formatDateFa(invoice.issue_date)}`);
      lines.push(
        `🏷 نوع: ${invoice.invoice_type === "pre_invoice" ? "اعتباری" : invoice.invoice_type === "advance_payment" ? "پیش‌واریزی" : invoice.invoice_type}`,
      );
      lines.push(`📊 وضعیت: ${statusLabel(invoice.status)}`);
      lines.push("");
      lines.push("📦 اقلام:");
      if (items && items.length > 0) {
        for (const it of items) {
          const name = it.product?.name ?? "—";
          lines.push(`• ${name} - ${toFaDigits(it.quantity)} عدد - ${formatNumber(Number(it.unit_price))} تومان`);
        }
      } else {
        lines.push("• —");
      }
      lines.push("");
      lines.push("🔗 برای اطلاعات بیشتر با ما تماس بگیرید.");
      const text = lines.join("\n");

      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          copied = true;
        }
      } catch {
        copied = false;
      }
      if (!copied) {
        // Fallback for older browsers / non-secure contexts
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try {
          copied = document.execCommand("copy");
        } finally {
          document.body.removeChild(ta);
        }
      }
      if (!copied) throw new Error("کپی در کلیپ‌بورد ممکن نشد");
      toast.success("اطلاعات پیش‌فاکتور در کلیپ‌بورد کپی شد.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطا در کپی اطلاعات";
      toast.error(msg);
    } finally {
      setCopying(false);
    }
  };

  const handleCancel = async () => {
    if (!invoice) return;
    setCanceling(true);
    try {
      const { error } = await supabase.rpc("cancel_invoice", { p_invoice_id: invoice.id });
      if (error) throw error;
      toast.success("پیش‌فاکتور لغو شد.");
      await refetch();
      router.invalidate();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطا در لغو پیش‌فاکتور";
      toast.error(msg);
    } finally {
      setCanceling(false);
    }
  };

  const handleSendToAccountant = async () => {
    if (!invoice) return;
    setSending(true);
    try {
      const { error } = await supabase.rpc("send_invoice_to_accountant", { p_invoice_id: invoice.id });
      if (error) throw error;
      toast.success("پیش‌فاکتور به میز کار حسابدار ارسال شد.");
      await refetch();
      router.invalidate();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطا در ارسال به حسابدار";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  if (isFetching && !invoice) {
    return (
      <div className="flex items-center justify-center py-10 text-sm text-muted-foreground" dir="rtl">
        <Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="space-y-4" dir="rtl">
        <PageHeader title="پیش‌فاکتور یافت نشد" description="" />
        <Button asChild variant="outline">
          <Link to="/sales/invoices">
            <ArrowRight className="ml-2 h-4 w-4" /> بازگشت به فهرست
          </Link>
        </Button>
      </div>
    );
  }

  const customer = invoice.customer as { id: string; name: string } | null;
  const priceType = invoice.price_type as { title: string } | null;

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title={`پیش‌فاکتور ${invoice.number ? toFaDigits(invoice.number) : toFaDigits(invoice.id.slice(0, 8))}`}
        description={customer?.name ?? "—"}
        actions={
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild variant="outline">
              <Link to="/sales/invoices">
                <ArrowRight className="ml-2 h-4 w-4" /> بازگشت
              </Link>
            </Button>
            <Button variant="secondary" onClick={handleCopy} disabled={copying}>
              {copying ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : (
                <Copy className="ml-2 h-4 w-4" />
              )}
              کپی اطلاعات پیش‌فاکتور
            </Button>
            {showSendToAccountant && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button disabled={sending}>
                    {sending ? (
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="ml-2 h-4 w-4" />
                    )}
                    ارسال به حسابدار
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent dir="rtl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>ارسال به میز کار حسابدار</AlertDialogTitle>
                    <AlertDialogDescription>
                      پس از ارسال، وضعیت پیش‌فاکتور به «در انتظار حسابدار» تغییر می‌کند و یک وظیفه برای حسابدار ایجاد می‌شود.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>انصراف</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSendToAccountant}>تأیید و ارسال</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {showCancel && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={canceling}>
                    {canceling ? (
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="ml-2 h-4 w-4" />
                    )}
                    لغو پیش‌فاکتور
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent dir="rtl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>تأیید لغو پیش‌فاکتور</AlertDialogTitle>
                    <AlertDialogDescription>
                      آیا از لغو این پیش‌فاکتور اطمینان دارید؟ این عملیات قابل بازگشت نیست و اعتبار مشتری آزاد می‌شود.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>انصراف</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCancel}>تأیید و لغو</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        }
      />

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <Field label="وضعیت">
              <Badge variant={invoice.status === "canceled" ? "destructive" : "secondary"}>
                {statusLabel(invoice.status)}
              </Badge>
            </Field>
            <Field label="نوع پیش‌فاکتور">
              {invoice.invoice_type === "pre_invoice" ? "اعتباری" : invoice.invoice_type}
            </Field>
            <Field label="مشتری">{customer?.name ?? "—"}</Field>
            <Field label="نوع قیمت">{priceType?.title ?? "—"}</Field>
            <Field label="تاریخ صدور">{formatDateFa(invoice.issue_date)}</Field>
            <Field label="سررسید">{invoice.due_date ? formatDateFa(invoice.due_date) : "—"}</Field>
            <Field label="جمع کل">{formatNumber(Number(invoice.total_amount))}</Field>
            <Field label="تخفیف">{formatNumber(Number(invoice.discount_amount))}</Field>
            <Field label="مالیات">{formatNumber(Number(invoice.tax_amount))}</Field>
            <Field label="جمع جزء">{formatNumber(Number(invoice.subtotal))}</Field>
          </div>
          {invoice.notes && (
            <div className="text-sm">
              <div className="text-muted-foreground mb-1">یادداشت</div>
              <div className="rounded-md border p-3 whitespace-pre-wrap">{invoice.notes}</div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Truck className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-sm font-semibold">بیجک / بارنامه</div>
              {waybill ? (
                <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                  <span>{toFaDigits(waybill.waybill_number)}</span>
                  <WaybillStatusBadge status={waybill.status} />
                  <span>{waybill.shipping_company} — {waybill.destination_city}</span>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground mt-1">بیجکی برای این پیش‌فاکتور صادر نشده است</div>
              )}
            </div>
          </div>
          {waybill ? (
            <Button asChild variant="outline">
              <Link to="/sales/invoices/$invoiceId/waybill" params={{ invoiceId: invoice.id }}>مشاهده بیجک</Link>
            </Button>
          ) : (
            <Button asChild>
              <Link to="/sales/invoices/$invoiceId/waybill/create" params={{ invoiceId: invoice.id }}>
                <Truck className="ml-2 h-4 w-4" /> صدور بیجک
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}