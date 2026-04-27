import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { InvoiceForm } from "@/shared/components/InvoiceForm";

export const Route = createFileRoute("/_app/sales_/invoices_/create")({
  beforeLoad: async () => { await requirePermission("invoices", "create"); },
  component: () => (
    <div className="space-y-6" dir="rtl">
      <PageHeader title="پیش‌فاکتور جدید" description="ثبت پیش‌فاکتور برای مشتری" />
      <InvoiceForm />
    </div>
  ),
});