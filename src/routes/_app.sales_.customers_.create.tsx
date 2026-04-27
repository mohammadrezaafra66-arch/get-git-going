import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { CustomerForm } from "@/shared/components/CustomerForm";

export const Route = createFileRoute("/_app/sales_/customers_/create")({
  beforeLoad: async () => { await requirePermission("sales", "create"); },
  component: () => (
    <div className="space-y-6" dir="rtl">
      <PageHeader title="مشتری جدید" description="افزودن مشتری به سیستم" />
      <CustomerForm />
    </div>
  ),
});