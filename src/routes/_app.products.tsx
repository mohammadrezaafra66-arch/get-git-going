import { createFileRoute } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";

export const Route = createFileRoute("/_app/products")({
  component: () => (
    <div className="space-y-6">
      <PageHeader title="محصولات" description="مدیریت محصولات، دسته‌بندی‌ها و واحدها" />
      <EmptyState
        icon={Package}
        title="ماژول محصولات — به‌زودی"
        description="ساختار دیتابیس و route این ماژول آماده است. منطق و رابط کاربری در فاز بعدی پیاده‌سازی می‌شود."
      />
    </div>
  ),
});
