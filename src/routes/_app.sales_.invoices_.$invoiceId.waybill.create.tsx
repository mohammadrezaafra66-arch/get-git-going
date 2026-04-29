import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requirePermission } from "@/lib/rbac/route-guards";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { WaybillForm } from "@/shared/components/WaybillForm";
import { formatNumber, toFaDigits } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/sales_/invoices_/$invoiceId/waybill/create")({
  beforeLoad: async () => { await requirePermission("invoices", "view"); },
  component: CreateWaybillPage,
});

function CreateWaybillPage() {
  const { invoiceId } = Route.useParams();
  const { roles } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const canCreate = roles.includes("admin") || roles.includes("manager") || roles.includes("sales");

  const { data: invoice, isFetching } = useQuery({
    queryKey: ["invoice-for-waybill", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, number, status, total_amount, customer:customers(id,name,phone,accounting_code)")
        .eq("id", invoiceId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["invoice-items-for-waybill", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_items")
        .select("id, quantity, unit_price, line_total, product:products(name)")
        .eq("invoice_id", invoiceId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["waybill-for-invoice", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waybills")
        .select("id, status")
        .eq("invoice_id", invoiceId)
        .neq("status", "canceled")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (existing) {
    return (
      <div className="space-y-4" dir="rtl">
        <PageHeader title="بیجک قبلاً صادر شده" description="" />
        <Button asChild><Link to="/sales/invoices/$invoiceId/waybill" params={{ invoiceId }}>مشاهده بیجک</Link></Button>
      </div>
    );
  }

  const customer = invoice?.customer as { name?: string; phone?: string; accounting_code?: string } | null;

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="صدور بیجک"
        description={invoice ? `پیش‌فاکتور ${toFaDigits(invoice.number ?? invoice.id.slice(0, 8))}` : ""}
        actions={
          <Button asChild variant="outline">
            <Link to="/sales/invoices/$invoiceId" params={{ invoiceId }}>
              <ArrowRight className="ml-2 h-4 w-4" /> بازگشت
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold">اقلام پیش‌فاکتور</div>
          {isFetching && !items ? (
            <div className="text-xs text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin" /> در حال بارگذاری</div>
          ) : (items?.length ?? 0) === 0 ? (
            <div className="text-xs text-muted-foreground">قلمی یافت نشد</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">محصول</TableHead>
                  <TableHead className="text-right">تعداد</TableHead>
                  <TableHead className="text-right">قیمت واحد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items!.map((it: any) => (
                  <TableRow key={it.id}>
                    <TableCell>{it.product?.name ?? "—"}</TableCell>
                    <TableCell>{toFaDigits(it.quantity)}</TableCell>
                    <TableCell>{formatNumber(Number(it.unit_price))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          {!canCreate ? (
            <div className="text-sm text-muted-foreground">دسترسی غیرمجاز</div>
          ) : (
            <WaybillForm
              initial={{
                receiver_name: customer?.name ?? "",
                receiver_phone: customer?.phone ?? "",
                customer_accounting_code: customer?.accounting_code ?? "",
              }}
              submitting={submitting}
              onSubmit={async (values, register) => {
                setSubmitting(true);
                try {
                  const { data, error } = await supabase.rpc("create_waybill_for_invoice", {
                    p_invoice_id: invoiceId,
                    p_sender_name: values.sender_name,
                    p_sender_phone: values.sender_phone,
                    p_receiver_name: values.receiver_name,
                    p_receiver_phone: values.receiver_phone,
                    p_shipping_company: values.shipping_company,
                    p_destination_city: values.destination_city,
                    p_customer_accounting_code: values.customer_accounting_code || undefined,
                    p_destination_address: values.destination_address || undefined,
                    p_shipping_notes: values.shipping_notes || undefined,
                    p_register: register,
                  });
                  if (error) throw error;
                  toast.success("بیجک با موفقیت صادر شد");
                  navigate({ to: "/sales/invoices/$invoiceId/waybill", params: { invoiceId } });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "خطا در صدور بیجک");
                } finally {
                  setSubmitting(false);
                }
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}