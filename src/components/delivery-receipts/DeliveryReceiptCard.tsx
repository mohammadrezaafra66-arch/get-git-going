import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, Download, FileText, Receipt, User, XCircle } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatJalaliDateTime } from "@/lib/messenger/format";
import {
  deliveryReceiptStatusBadgeClass,
  deliveryReceiptStatusLabel,
  deliveryReceiptTypeLabel,
  formatFileSize,
  toPersianDigits,
} from "@/lib/delivery-receipts/labels";
import {
  getSignedDeliveryReceiptUrl,
  type DeliveryReceiptRow,
} from "@/hooks/delivery-receipts/useDeliveryReceipts";

function useNow(intervalMs: number, enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "مهلت تمام شد";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${toPersianDigits(h)}:${toPersianDigits(String(m).padStart(2, "0"))}:${toPersianDigits(
      String(s).padStart(2, "0"),
    )}`;
  }
  return `${toPersianDigits(m)}:${toPersianDigits(String(s).padStart(2, "0"))}`;
}

function useInvoiceNumber(invoiceId: string | null) {
  return useQuery({
    queryKey: ["dr-invoice-number", invoiceId],
    enabled: !!invoiceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("number")
        .eq("id", invoiceId!)
        .maybeSingle();
      if (error) throw error;
      return (data?.number as string | null) ?? null;
    },
    staleTime: 5 * 60_000,
  });
}

function useCustomerName(customerId: string | null) {
  return useQuery({
    queryKey: ["dr-customer-name", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("name")
        .eq("id", customerId!)
        .maybeSingle();
      if (error) throw error;
      return (data?.name as string | null) ?? null;
    },
    staleTime: 5 * 60_000,
  });
}

export function DeliveryReceiptCard({ receipt }: { receipt: DeliveryReceiptRow }) {
  const isPending = receipt.status === "pending_review";
  const now = useNow(30_000, isPending);

  const createdTs = new Date(receipt.created_at).getTime();
  const deadlineTs = new Date(receipt.review_deadline).getTime();
  const total = Math.max(1, deadlineTs - createdTs);
  const remaining = Math.max(0, deadlineTs - now);
  const percentLeft = Math.min(100, Math.max(0, (remaining / total) * 100));

  let barClass = "bg-green-500";
  if (remaining <= 10 * 60 * 1000) barClass = "bg-red-500";
  else if (remaining <= 30 * 60 * 1000) barClass = "bg-amber-500";

  const invoiceQ = useInvoiceNumber(receipt.invoice_id);
  const customerQ = useCustomerName(receipt.customer_id);

  const handleDownload = async () => {
    try {
      const url = await getSignedDeliveryReceiptUrl(receipt.storage_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(`دانلود ناموفق: ${(e as Error).message}`);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4" dir="rtl">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{deliveryReceiptTypeLabel(receipt.type)}</Badge>
              <Badge
                variant="outline"
                className={deliveryReceiptStatusBadgeClass(receipt.status)}
              >
                {deliveryReceiptStatusLabel(receipt.status)}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate" title={receipt.file_name}>
                {receipt.file_name}
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              {formatFileSize(receipt.file_size)} •{" "}
              {formatJalaliDateTime(receipt.created_at)}
            </div>
            {receipt.uploader_name && (
              <div className="text-xs text-muted-foreground">
                آپلودکننده: {receipt.uploader_name}
              </div>
            )}
            {receipt.invoice_id && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Receipt className="h-3 w-3" />
                فاکتور: {invoiceQ.data ?? "—"}
              </div>
            )}
            {receipt.customer_id && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                مشتری: {customerQ.data ?? "—"}
              </div>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={handleDownload}>
            <Download className="ml-1 h-4 w-4" />
            دانلود
          </Button>
        </div>

        {isPending && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                مهلت تأیید
              </span>
              <span className="font-mono">{formatRemaining(remaining)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all ${barClass}`}
                style={{ width: `${percentLeft}%` }}
              />
            </div>
          </div>
        )}

        {receipt.status === "confirmed" && (
          <div className="flex items-center gap-2 rounded-md bg-green-50 p-2 text-xs text-green-800 dark:bg-green-900/30 dark:text-green-200">
            <CheckCircle2 className="h-4 w-4" />
            <span>
              تأیید توسط {receipt.reviewer_name ?? "—"}
              {receipt.reviewed_at &&
                ` • ${formatJalaliDateTime(receipt.reviewed_at)}`}
            </span>
          </div>
        )}

        {receipt.status === "rejected" && (
          <div className="flex items-start gap-2 rounded-md bg-red-50 p-2 text-xs text-red-800 dark:bg-red-900/30 dark:text-red-200">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-0.5">
              <div>
                رد توسط {receipt.reviewer_name ?? "—"}
                {receipt.reviewed_at &&
                  ` • ${formatJalaliDateTime(receipt.reviewed_at)}`}
              </div>
              {receipt.notes && <div>یادداشت: {receipt.notes}</div>}
            </div>
          </div>
        )}

        {receipt.status === "expired" && (
          <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
            مهلت تأیید این رسید منقضی شد.
          </div>
        )}

        {receipt.notes && receipt.status !== "rejected" && (
          <div className="rounded-md bg-muted/40 p-2 text-xs">{receipt.notes}</div>
        )}
      </CardContent>
    </Card>
  );
}