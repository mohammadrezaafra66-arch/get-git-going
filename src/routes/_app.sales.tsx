import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";
import { ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";

export const Route = createFileRoute("/_app/sales")({
  beforeLoad: async () => { await requirePermission("sales", "view"); },
  component: () => (
    <div className="space-y-6">
      <PageHeader title="فروش" description="مدیریت فرآیند فروش، مشتریان و سفارش‌ها" />
      <EmptyState
        icon={ShoppingCart}
        title="ماژول فروش — به‌زودی"
        description="ساختار دیتابیس و route این ماژول آماده است. منطق و رابط کاربری در فاز بعدی پیاده‌سازی می‌شود."
      />
    </div>
  ),
});
