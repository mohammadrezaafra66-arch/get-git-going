import { useEffect, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  XCircle,
  ArrowRight,
  Copy,
  Send,
  Truck,
  Printer,
  Pencil,
  X,
  Save,
} from "lucide-react";
import { WaybillStatusBadge } from "@/shared/components/WaybillStatusBadge";
import { toast } from "sonner";

import { requirePermission } from "@/lib/rbac/route-guards";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useAllDeliveryReceipts } from "@/hooks/delivery-receipts/useDeliveryReceipts";
import { DeliveryReceiptCard } from "@/components/delivery-receipts/DeliveryReceiptCard";
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
import { toFaDigits, formatNumber, formatDateFa, formatDateTimeFa } from "@/lib/i18n/formatters";
import { InvoiceAccountingMarkers } from "@/components/invoices/InvoiceAccountingMarkers";

export const Route = createFileRoute("/_app/sales_/invoices_/$invoiceId")({
  beforeLoad: async () => {
    await requirePermission("invoices", "view");
  },
  component: InvoiceDetailPage,
});

const PRINT_STYLE = `
@media print {
  @page { size: A4 portrait; margin: 1.5cm; }
  body > * { display: none !important; }
  #invoice-print-root { display: block !important; }
}
#invoice-print-root { display: none; }
`;

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
  const qc = useQueryClient();
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");

  useEffect(() => {
    const el = document.createElement("style");
    el.textContent = PRINT_STYLE;
    el.id = "invoice-print-style";
    document.head.appendChild(el);
    return () => {
      document.getElementById("invoice-print-style")?.remove();
    };
  }, []);

  const canManage = roles.includes("admin") || roles.includes("accountant");
  const canSendToAccountant =
    roles.includes("admin") || roles.includes("manager") || roles.includes("sales");

  const {
    data: invoice,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(
          "id, number, type, invoice_type, status, total_amount, subtotal, discount_amount, tax_amount, issue_date, due_date, notes, product_video_required, created_at, accounting_registered_at, accounting_sent_at, customer:customers(id, name), price_type:sale_price_types(title)",
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

  const notesMutation = useMutation({
    mutationFn: async (notes: string) => {
      const { error } = await supabase
        .from("invoices")
        .update({ notes: notes || null })
        .eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("یادداشت ذخیره شد");
      setEditingNotes(false);
      refetch();
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
    onError: () => toast.error("خطا در ذخیره یادداشت"),
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
          lines.push(
            `• ${name} - ${toFaDigits(it.quantity)} عدد - ${formatNumber(Number(it.unit_price))} تومان`,
          );
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
      const { error } = await supabase.rpc("send_invoice_to_accountant", {
        p_invoice_id: invoice.id,
      });
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
      <div
        className="flex items-center justify-center py-10 text-sm text-muted-foreground"
        dir="rtl"
      >
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
            <Button variant="outline" onClick={() => window.print()} className="gap-2">
              <Printer className="h-4 w-4" />
              چاپ / PDF
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
                      پس از ارسال، وضعیت پیش‌فاکتور به «در انتظار حسابدار» تغییر می‌کند و یک وظیفه
                      برای حسابدار ایجاد می‌شود.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>انصراف</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSendToAccountant}>
                      تأیید و ارسال
                    </AlertDialogAction>
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
                      آیا از لغو این پیش‌فاکتور اطمینان دارید؟ این عملیات قابل بازگشت نیست و اعتبار
                      مشتری آزاد می‌شود.
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
            <Field label="ثبت در حسابداری آسان">
              {invoice.accounting_registered_at ? formatDateTimeFa(invoice.accounting_registered_at) : "—"}
            </Field>
            <Field label="ارسال برای مشتری">
              {invoice.accounting_sent_at ? formatDateTimeFa(invoice.accounting_sent_at) : "—"}
            </Field>
          </div>

          {/* مورد ۱۳۵ — همان دو مارکر، قابل تغییر از صفحهٔ جزئیات */}
          <InvoiceAccountingMarkers
            invoiceId={invoice.id}
            state={{
              accounting_registered_at: invoice.accounting_registered_at,
              accounting_sent_at: invoice.accounting_sent_at,
            }}
            invalidateKeys={[["invoice", invoiceId], ["invoices"]]}
          />
          {/* Notes — always shown, editable */}
          <div className="text-sm mt-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-muted-foreground font-medium">یادداشت</span>
              {!editingNotes && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => {
                    setNotesValue(invoice.notes ?? "");
                    setEditingNotes(true);
                  }}
                >
                  <Pencil className="h-3 w-3 ml-1" />
                  {invoice.notes ? "ویرایش" : "افزودن یادداشت"}
                </Button>
              )}
            </div>
            {editingNotes ? (
              <div className="space-y-2">
                <Textarea
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="یادداشت یا توضیحات..."
                  className="text-sm"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => notesMutation.mutate(notesValue)}
                    disabled={notesMutation.isPending}
                  >
                    {notesMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin ml-1" />
                    ) : (
                      <Save className="h-3 w-3 ml-1" />
                    )}
                    ذخیره
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingNotes(false)}
                    disabled={notesMutation.isPending}
                  >
                    <X className="h-3 w-3 ml-1" />
                    انصراف
                  </Button>
                </div>
              </div>
            ) : invoice.notes ? (
              <div className="rounded-md border p-3 whitespace-pre-wrap text-sm bg-muted/30">
                {invoice.notes}
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground text-center">
                یادداشتی ثبت نشده
              </div>
            )}
          </div>
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
                  <span>
                    {waybill.shipping_company} — {waybill.destination_city}
                  </span>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground mt-1">
                  بیجکی برای این پیش‌فاکتور صادر نشده است
                </div>
              )}
            </div>
          </div>
          {waybill ? (
            <Button asChild variant="outline">
              <Link to="/sales/invoices/$invoiceId/waybill" params={{ invoiceId: invoice.id }}>
                مشاهده بیجک
              </Link>
            </Button>
          ) : (
            <Button asChild>
              <Link
                to="/sales/invoices/$invoiceId/waybill/create"
                params={{ invoiceId: invoice.id }}
              >
                <Truck className="ml-2 h-4 w-4" /> صدور بیجک
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <DeliveryReceiptsForInvoice
        invoiceId={invoice.id}
        videoRequired={Boolean(
          (invoice as { product_video_required?: boolean }).product_video_required,
        )}
      />

      {/* Print layout — hidden in browser, shown only when printing */}
      <div
        id="invoice-print-root"
        dir="rtl"
        style={{ fontFamily: "Tahoma, sans-serif", fontSize: 13 }}
      >
        {/* Header */}
        <div
          style={{
            borderBottom: "2px solid #000",
            paddingBottom: 12,
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>دستیار هوشمند افراکالا</div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>سیستم مدیریت فروش</div>
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 17, fontWeight: 800 }}>
              پیش‌فاکتور شماره{" "}
              {invoice?.number
                ? toFaDigits(invoice.number)
                : toFaDigits(invoice?.id?.slice(0, 8) ?? "")}
            </div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
              وضعیت: {statusLabel(invoice?.status ?? "")}
            </div>
          </div>
        </div>

        {/* Customer & Date info */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 16,
            padding: "10px 14px",
            border: "1px solid #ddd",
            borderRadius: 6,
            background: "#f9f9f9",
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: "#777" }}>مشتری</div>
            <div style={{ fontWeight: 700, marginTop: 2 }}>
              {(invoice?.customer as { name?: string } | null)?.name ?? "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#777" }}>نوع قیمت</div>
            <div style={{ fontWeight: 700, marginTop: 2 }}>
              {(invoice?.price_type as { title?: string } | null)?.title ?? "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#777" }}>تاریخ صدور</div>
            <div style={{ fontWeight: 700, marginTop: 2 }}>
              {invoice?.issue_date ? formatDateFa(invoice.issue_date) : "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#777" }}>سررسید</div>
            <div style={{ fontWeight: 700, marginTop: 2 }}>
              {invoice?.due_date ? formatDateFa(invoice.due_date) : "—"}
            </div>
          </div>
        </div>

        {/* Items table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
          <thead>
            <tr style={{ background: "#1e293b", color: "#fff" }}>
              <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 12 }}>ردیف</th>
              <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 12 }}>نام محصول</th>
              <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 12 }}>تعداد</th>
              <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 12 }}>قیمت واحد</th>
              <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 12 }}>جمع ردیف</th>
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((it, idx) => (
              <tr
                key={it.id}
                style={{
                  borderBottom: "1px solid #e2e8f0",
                  background: idx % 2 === 0 ? "#fff" : "#f8fafc",
                }}
              >
                <td style={{ padding: "7px 10px", fontSize: 12 }}>{toFaDigits(idx + 1)}</td>
                <td style={{ padding: "7px 10px", fontSize: 12 }}>{it.product?.name ?? "—"}</td>
                <td style={{ padding: "7px 10px", textAlign: "center", fontSize: 12 }}>
                  {toFaDigits(it.quantity)}
                </td>
                <td
                  style={{
                    padding: "7px 10px",
                    textAlign: "left",
                    fontSize: 12,
                    direction: "ltr",
                  }}
                >
                  {formatNumber(Number(it.unit_price))}
                </td>
                <td
                  style={{
                    padding: "7px 10px",
                    textAlign: "left",
                    fontSize: 12,
                    fontWeight: 700,
                    direction: "ltr",
                  }}
                >
                  {formatNumber(Number(it.line_total))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <div
            style={{
              minWidth: 240,
              border: "1px solid #ddd",
              borderRadius: 6,
              overflow: "hidden",
            }}
          >
            {invoice?.discount_amount && Number(invoice.discount_amount) > 0 ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 12px",
                  borderBottom: "1px solid #eee",
                  fontSize: 12,
                }}
              >
                <span style={{ color: "#777" }}>تخفیف</span>
                <span style={{ direction: "ltr" }}>
                  {formatNumber(Number(invoice.discount_amount))}
                </span>
              </div>
            ) : null}
            {invoice?.tax_amount && Number(invoice.tax_amount) > 0 ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 12px",
                  borderBottom: "1px solid #eee",
                  fontSize: 12,
                }}
              >
                <span style={{ color: "#777" }}>مالیات</span>
                <span style={{ direction: "ltr" }}>
                  {formatNumber(Number(invoice.tax_amount))}
                </span>
              </div>
            ) : null}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "10px 12px",
                background: "#1e293b",
                color: "#fff",
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              <span>جمع کل</span>
              <span style={{ direction: "ltr" }}>
                {formatNumber(Number(invoice?.total_amount ?? 0))} تومان
              </span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {invoice?.notes && (
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: 6,
              padding: "10px 12px",
              marginBottom: 16,
              fontSize: 12,
            }}
          >
            <div style={{ color: "#777", marginBottom: 4, fontWeight: 600 }}>یادداشت</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{invoice.notes}</div>
          </div>
        )}

        {/* Signatures */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 20,
            marginTop: 40,
          }}
        >
          {["مهر و امضای فروشنده", "مهر و امضای مشتری", "تأیید حسابدار"].map((label) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div
                style={{
                  height: 70,
                  border: "1px dashed #aaa",
                  borderRadius: 6,
                  marginBottom: 6,
                }}
              />
              <div style={{ fontSize: 11, color: "#555" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: "1px solid #ddd",
            marginTop: 24,
            paddingTop: 8,
            textAlign: "center",
            fontSize: 10,
            color: "#999",
          }}
        >
          این سند توسط سیستم دستیار هوشمند افراکالا صادر شده است —{" "}
          {new Date().toLocaleDateString("fa-IR")}
        </div>
      </div>
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

function DeliveryReceiptsForInvoice({
  invoiceId,
  videoRequired,
}: {
  invoiceId: string;
  videoRequired: boolean;
}) {
  const { data, isLoading } = useAllDeliveryReceipts({
    invoice_id: invoiceId,
    limit: 20,
  });
  const rows = data?.rows ?? [];
  return (
    <Card>
      <CardContent className="p-4 space-y-3" dir="rtl">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">رسیدهای تحویل</div>
          {videoRequired && (
            <Badge variant="outline" className="text-amber-700 border-amber-400">
              ویدئوی محصول الزامی است
            </Badge>
          )}
        </div>
        {isLoading ? (
          <div className="text-xs text-muted-foreground">در حال بارگذاری...</div>
        ) : rows.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            رسیدی برای این فاکتور ثبت نشده است.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {rows.map((r) => (
              <DeliveryReceiptCard key={r.id} receipt={r} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
