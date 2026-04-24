import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";
import { ListOrdered } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";

export const Route = createFileRoute("/_app/price-lists")({
  beforeLoad: async () => { await requirePermission("price-lists", "view"); },
  component: () => (
    <div className="space-y-6">
      <PageHeader title="لیست‌های قیمت" description="مدیریت چندین لیست قیمت با ارز و دوره اعتبار" />
      <EmptyState
        icon={ListOrdered}
        title="ماژول لیست‌های قیمت — به‌زودی"
        description="ساختار دیتابیس و route این ماژول آماده است. منطق و رابط کاربری در فاز بعدی پیاده‌سازی می‌شود."
      />
    </div>
  ),
});
