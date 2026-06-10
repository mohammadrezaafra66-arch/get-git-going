import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";

export const Route = createFileRoute("/_app/invoices")({
  beforeLoad: async () => { await requirePermission("invoices", "view"); },
  component: () => (
    <div className="space-y-6">
      <PageHeader title="فاکتورها" description="صدور و مدیریت فاکتورهای فروش" />
      <EmptyState
        icon={FileText}
        title="ماژول فاکتورها — به‌زودی"
        description="ساختار دیتابیس و route این ماژول آماده است. منطق و رابط کاربری در فاز بعدی پیاده‌سازی می‌شود."
      />
    </div>
  ),
});
