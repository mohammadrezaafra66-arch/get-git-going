import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { requirePermission } from "@/lib/rbac/route-guards";
import { useAuth } from "@/lib/auth/AuthProvider";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { WaybillStatusBadge, WAYBILL_STATUS_LABEL } from "@/shared/components/WaybillStatusBadge";
import { toFaDigits, formatDateFa } from "@/lib/i18n/formatters";

export const Route = createFileRoute("/_app/sales_/invoices_/$invoiceId/waybill")({
  beforeLoad: async () => { await requirePermission("invoices", "view"); },
  component: WaybillViewPage,
});

const NEXT_STATUS: Record<string, string> = {
  draft: "registered",
  registered: "delivered_to_carrier",
  delivered_to_carrier: "sent",
  sent: "delivered_to_customer",
};

function WaybillViewPage() {
  const { invoiceId } = Route.useParams();
  const { roles } = useAuth();
  const canManage = roles.includes("admin") || roles.includes("manager") || roles.includes("sales");
  const [acting, setActing] = useState(false);

  const { data: waybill, refetch, isFetching } = useQuery({
    queryKey: ["waybill", invoiceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waybills")
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: items } = useQuery({
    queryKey: ["waybill-items", waybill?.id],
    enabled: !!waybill?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waybill_items")
        .select("id, quantity, notes, product:products(name)")
        .eq("waybill_id", waybill!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: customFields } = useQuery({
    queryKey: ["waybill-custom-fields", "active"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waybill_custom_fields")
        .select("field_key, field_label")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as { field_key: string; field_label: string }[];
    },
  });

  const changeStatus = async (newStatus: string) => {
    if (!waybill) return;
    setActing(true);
    const { error } = await supabase.rpc("update_waybill_status", { p_waybill_id: waybill.id, p_new_status: newStatus });
    setActing(false);
    if (error) { toast.error(error.message); return; }
    toast.success("وضعیت به‌روزرسانی شد");
    refetch();
  };

  if (isFetching && !waybill) {
    return <div className="flex items-center py-10 text-sm text-muted-foreground" dir="rtl"><Loader2 className="ml-2 h-4 w-4 animate-spin" /> در حال بارگذاری...</div>;
  }

  if (!waybill) {
    return (
      <div className="space-y-4" dir="rtl">
        <PageHeader title="بیجک یافت نشد" description="" />
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/sales/invoices/$invoiceId" params={{ invoiceId }}>
              <ArrowRight className="ml-2 h-4 w-4" /> بازگشت به پیش‌فاکتور
            </Link>
          </Button>
          <Button asChild>
            <Link to="/sales/invoices/$invoiceId/waybill/create" params={{ invoiceId }}>صدور بیجک</Link>
          </Button>
        </div>
      </div>
    );
  }

  const next = NEXT_STATUS[waybill.status];

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title={`بیجک ${toFaDigits(waybill.waybill_number)}`}
        description={formatDateFa(waybill.created_at)}
        actions={
          <div className="flex flex-col sm:flex-row gap-2">
            <Button asChild variant="outline">
              <Link to="/sales/invoices/$invoiceId" params={{ invoiceId }}>
                <ArrowRight className="ml-2 h-4 w-4" /> پیش‌فاکتور
              </Link>
            </Button>
            {canManage && next && waybill.status !== "canceled" && (
              <Button onClick={() => changeStatus(next)} disabled={acting}>
                {acting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                انتقال به: {WAYBILL_STATUS_LABEL(next)}
              </Button>
            )}
            {canManage && waybill.status !== "canceled" && waybill.status !== "delivered_to_customer" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" disabled={acting}>لغو بیجک</Button>
                </AlertDialogTrigger>
                <AlertDialogContent dir="rtl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>تأیید لغو بیجک</AlertDialogTitle>
                    <AlertDialogDescription>این عملیات قابل بازگشت نیست.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>انصراف</AlertDialogCancel>
                    <AlertDialogAction onClick={() => changeStatus("canceled")}>تأیید لغو</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        }
      />

      <Card>
        <CardContent className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <Field label="وضعیت"><WaybillStatusBadge status={waybill.status} /></Field>
          <Field label="شماره بیجک">{toFaDigits(waybill.waybill_number)}</Field>
          <Field label="فرستنده">{waybill.sender_name} ({waybill.sender_phone})</Field>
          <Field label="گیرنده">{waybill.receiver_name} ({waybill.receiver_phone})</Field>
          <Field label="باربری">{waybill.shipping_company}</Field>
          <Field label="شهر مقصد">{waybill.destination_city}</Field>
          <Field label="کد حسابداری مشتری">{waybill.customer_accounting_code ?? "—"}</Field>
          <Field label="آدرس مقصد">{waybill.destination_address ?? "—"}</Field>
          {waybill.shipping_notes && (
            <div className="sm:col-span-2">
              <div className="text-xs text-muted-foreground mb-1">توضیحات</div>
              <div className="rounded-md border p-3 whitespace-pre-wrap">{waybill.shipping_notes}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {(() => {
        const cd = (waybill.custom_data ?? {}) as Record<string, unknown>;
        const keys = Object.keys(cd).filter((k) => cd[k] !== null && cd[k] !== "");
        if (keys.length === 0) return null;
        const labelOf = (k: string) =>
          customFields?.find((f) => f.field_key === k)?.field_label ?? k;
        return (
          <Card>
            <CardContent className="p-6 space-y-3">
              <div className="text-sm font-semibold">اطلاعات تکمیلی</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                {keys.map((k) => (
                  <Field key={k} label={labelOf(k)}>{String(cd[k])}</Field>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold">اقلام</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">محصول</TableHead>
                <TableHead className="text-right">تعداد</TableHead>
                <TableHead className="text-right">یادداشت</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(items ?? []).map((it: any) => (
                <TableRow key={it.id}>
                  <TableCell>{it.product?.name ?? "—"}</TableCell>
                  <TableCell>{toFaDigits(it.quantity)}</TableCell>
                  <TableCell>{it.notes ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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