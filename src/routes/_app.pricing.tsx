import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";
import { DollarSign } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";

export const Route = createFileRoute("/_app/pricing")({
  beforeLoad: async () => { await requirePermission("pricing", "view"); },
  component: () => (
    <div className="space-y-6">
      <PageHeader title="موتور قیمت‌گذاری" description="تعریف قوانین قیمت‌گذاری rule-based با versioning" />
      <EmptyState
        icon={DollarSign}
        title="ماژول موتور قیمت‌گذاری — به‌زودی"
        description="ساختار دیتابیس و route این ماژول آماده است. منطق و رابط کاربری در فاز بعدی پیاده‌سازی می‌شود."
      />
    </div>
  ),
});
