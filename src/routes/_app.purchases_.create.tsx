import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { PurchaseForm } from "@/shared/components/PurchaseForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_app/purchases_/create")({
  beforeLoad: async () => { await requirePermission("purchases", "create"); },
  component: PurchaseCreatePage,
});

function PurchaseCreatePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <PageHeader
          title="ثبت خرید جدید"
          description="ثبت سریع خرید تک‌محصولی با تأمین‌کننده، قیمت، ارز، تعداد و تاریخ"
        />
        <Button asChild variant="outline" size="sm">
          <Link to="/purchases">
            <ArrowRight className="ml-2 h-4 w-4" />
            بازگشت
          </Link>
        </Button>
      </div>
      <Card>
        <CardContent className="pt-6">
          <PurchaseForm />
        </CardContent>
      </Card>
    </div>
  );
}