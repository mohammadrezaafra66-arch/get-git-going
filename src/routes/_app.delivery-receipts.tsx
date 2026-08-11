import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { ALL_ROLES } from "@/lib/rbac/roles";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { FileCheck } from "lucide-react";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useMyDeliveryReceipts } from "@/hooks/delivery-receipts/useDeliveryReceipts";
import { DeliveryReceiptCard } from "@/components/delivery-receipts/DeliveryReceiptCard";
import { DeliveryReceiptUploadForm } from "@/components/delivery-receipts/DeliveryReceiptUploadForm";
import { PendingDeliveryReceiptsPanel } from "@/components/delivery-receipts/PendingDeliveryReceiptsPanel";
import {
  DELIVERY_RECEIPT_STATUS_FA,
  DELIVERY_RECEIPT_TYPE_FA,
} from "@/lib/delivery-receipts/labels";

export const Route = createFileRoute("/_app/delivery-receipts")({
  beforeLoad: async () => {
    await requireAnyRole(ALL_ROLES);
  },
  component: DeliveryReceiptsPage,
});

const ALL = "__all__";

function DeliveryReceiptsPage() {
  const { roles } = useAuth();
  const canUpload =
    roles.includes("admin") ||
    roles.includes("manager") ||
    roles.includes("sales");
  const canReview = canUpload;

  const [type, setType] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [tab, setTab] = useState("list");

  const {
    data: rows = [],
    isLoading,
    error,
  } = useMyDeliveryReceipts(
    type === ALL ? null : type,
    status === ALL ? null : status,
  );

  return (
    <div className="space-y-4 p-4 sm:p-6" dir="rtl">
      <PageHeader
        title="رسیدهای تحویل"
        description="بیجک باربری و رسید تحویل به مشتری"
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">رسیدهای من</TabsTrigger>
          <TabsTrigger value="new">آپلود رسید جدید</TabsTrigger>
          {canReview && <TabsTrigger value="pending">در انتظار تأیید</TabsTrigger>}
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <Card>
            <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>نوع</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>همه</SelectItem>
                    {Object.entries(DELIVERY_RECEIPT_TYPE_FA).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>وضعیت</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>همه</SelectItem>
                    {Object.entries(DELIVERY_RECEIPT_STATUS_FA).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : error ? (
            <Card>
              <CardContent className="p-4 text-sm text-destructive">
                خطا: {(error as Error).message}
              </CardContent>
            </Card>
          ) : rows.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <FileCheck className="h-8 w-8" />
                رسیدی برای نمایش وجود ندارد.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {rows.map((r) => (
                <DeliveryReceiptCard key={r.id} receipt={r} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="new">
          <Card>
            <CardContent className="p-4">
              {canUpload ? (
                <DeliveryReceiptUploadForm onSuccess={() => setTab("list")} />
              ) : (
                <div className="text-sm text-muted-foreground">
                  شما دسترسی آپلود رسید را ندارید.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canReview && (
          <TabsContent value="pending">
            <PendingDeliveryReceiptsPanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}