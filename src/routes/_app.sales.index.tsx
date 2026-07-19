import { createFileRoute, Link } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";
import { Search, BellRing, FileText, Send, Inbox, UserSquare2, FilePlus2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_app/sales/")({
  beforeLoad: async () => {
    await requirePermission("sales", "view");
  },
  component: SalesHub,
});

function SalesHub() {
  return (
    <div className="space-y-6">
      <PageHeader title="فروش" description="مدیریت فرآیند فروش، مشتریان و سفارش‌ها" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link to="/sales/customers" className="block">
          <Card className="h-full transition-colors hover:bg-muted/40">
            <CardContent className="p-5 space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserSquare2 className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-foreground">مشتریان</h3>
              <p className="text-sm text-muted-foreground">
                مدیریت اطلاعات مشتریان و افزودن مشتری جدید
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/sales/invoices" className="block">
          <Card className="h-full transition-colors hover:bg-muted/40">
            <CardContent className="p-5 space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FilePlus2 className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-foreground">فاکتورهای فروش</h3>
              <p className="text-sm text-muted-foreground">ثبت و مشاهده فاکتورهای فروش (سیستم فاکتور)</p>
            </CardContent>
          </Card>
        </Link>
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
        <Link to="/sales/quotes" className="block">
          <Card className="h-full transition-colors hover:bg-muted/40">
            <CardContent className="p-5 space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-foreground">پیش‌فاکتورها</h3>
              <p className="text-sm text-muted-foreground">ثبت و پیگیری پیش‌فاکتورهای فروش</p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/sales/quote-share-logs" className="block">
          <Card className="h-full transition-colors hover:bg-muted/40">
            <CardContent className="p-5 space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Send className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-foreground">سوابق ارسال پیش‌فاکتور</h3>
              <p className="text-sm text-muted-foreground">
                مشاهده پیش‌نویس‌ها و سوابق آماده‌سازی ارسال پیش‌فاکتورها
              </p>
            </CardContent>
          </Card>
        </Link>
        <Link to="/sales/send-queue" className="block">
          <Card className="h-full transition-colors hover:bg-muted/40">
            <CardContent className="p-5 space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Inbox className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-foreground">صف ارسال پیش‌فاکتور</h3>
              <p className="text-sm text-muted-foreground">
                مدیریت صف داخلی ارسال پیش‌فاکتورها و شبیه‌سازی نتیجه ارسال
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
