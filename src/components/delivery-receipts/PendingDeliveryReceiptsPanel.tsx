import { ClipboardCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePendingDeliveryReceipts } from "@/hooks/delivery-receipts/useDeliveryReceipts";
import { DeliveryReceiptCard } from "./DeliveryReceiptCard";
import { DeliveryReceiptReviewActions } from "./DeliveryReceiptReviewActions";

export function PendingDeliveryReceiptsPanel() {
  const { data = [], isLoading, error } = usePendingDeliveryReceipts();

  if (isLoading) {
    return (
      <div className="space-y-3" dir="rtl">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-destructive" dir="rtl">
          خطا در بارگذاری: {(error as Error).message}
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardContent
          className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground"
          dir="rtl"
        >
          <ClipboardCheck className="h-8 w-8" />
          هیچ رسیدی در انتظار تأیید نیست.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3" dir="rtl">
      {data.map((r) => (
        <div key={r.id} className="space-y-2">
          <DeliveryReceiptCard receipt={r} />
          <DeliveryReceiptReviewActions receipt={r} />
        </div>
      ))}
    </div>
  );
}