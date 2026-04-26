import { createFileRoute, Link } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";
import { Search, BellRing } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_app/sales/")({
  beforeLoad: async () => { await requirePermission("sales", "view"); },
  component: SalesHub,
});

function SalesHub() {
  return (
    <div className="space-y-6">
      <PageHeader title="فروش" description="مدیریت فرآیند فروش، مشتریان و سفارش‌ها" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/sales/search" className="block">
          <Card className="h-full transition-colors hover:bg-muted/40">
            <CardContent className="p-5 space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Search className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-foreground">جستجوی سریع فروش</h3>
              <p className="text-sm text-muted-foreground">
                پیدا کردن سریع محصول و مشاهده قیمت فروش معتبر
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/sales/stock-alerts" className="block">
          <Card className="h-full transition-colors hover:bg-muted/40">
            <CardContent className="p-5 space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BellRing className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-foreground">درخواست‌های موجودی</h3>
              <p className="text-sm text-muted-foreground">
                پیگیری مشتریانی که منتظر موجود شدن کالا هستند
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
