import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, XCircle, ArrowRight } from "lucide-react";
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
    default:
      return s;
  }
}

function InvoiceDetailPage() {
  const { invoiceId } = Route.useParams();
  const { roles } = useAuth();
  const router = useRouter();
  const [canceling, setCanceling] = useState(false);

  const canManage = roles.includes("admin") || roles.includes("accountant");

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

  const isDraftPreInvoice = invoice?.status === "draft" && invoice?.type === "pre_invoice";
  const showCancel = canManage && isDraftPreInvoice;

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