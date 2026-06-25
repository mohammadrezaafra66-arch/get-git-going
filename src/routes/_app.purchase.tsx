import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";
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
import { Loader2, ShoppingCart } from "lucide-react";
import { useMyPurchaseRequests } from "@/hooks/purchase/usePurchase";
import { PurchaseRequestCard } from "@/components/purchase/PurchaseRequestCard";
import { PurchaseRequestForm } from "@/components/purchase/PurchaseRequestForm";
import { PURCHASE_STATUS_FA } from "@/lib/purchase/labels";

export const Route = createFileRoute("/_app/purchase")({
  beforeLoad: async () => {
    await requirePermission("purchases", "view");
  },
  component: PurchasePage,
});

const ALL = "__all__";

function PurchasePage() {
  const [status, setStatus] = useState<string>(ALL);
  const [tab, setTab] = useState("list");
  const { data: rows = [], isLoading, error } = useMyPurchaseRequests(
    status === ALL ? null : status,
  );

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        title="فضای خرید"
        description="ثبت درخواست خرید و پیگیری وضعیت درخواست‌های خود"
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">درخواست‌های من</TabsTrigger>
          <TabsTrigger value="new">ارسال درخواست جدید</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="max-w-xs space-y-1">
                <Label>فیلتر وضعیت</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>همه</SelectItem>
                    {Object.entries(PURCHASE_STATUS_FA).map(([k, v]) => (
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
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="ms-2 h-4 w-4 animate-spin" /> در حال بارگذاری...
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
                <ShoppingCart className="h-8 w-8" />
                درخواستی برای نمایش وجود ندارد.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {rows.map((r) => (
                <PurchaseRequestCard key={r.id} request={r} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="new">
          <Card>
            <CardContent className="p-4">
              <PurchaseRequestForm onSuccess={() => setTab("list")} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}