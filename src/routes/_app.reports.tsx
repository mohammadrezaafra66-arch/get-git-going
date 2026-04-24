import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";

export const Route = createFileRoute("/_app/reports")({
  component: () => (
    <div className="space-y-6">
      <PageHeader title="گزارش‌ها" description="گزارش‌های فروش، مالی و عملیاتی" />
      <EmptyState
        icon={BarChart3}
        title="ماژول گزارش‌ها — به‌زودی"
        description="ساختار دیتابیس و route این ماژول آماده است. منطق و رابط کاربری در فاز بعدی پیاده‌سازی می‌شود."
      />
    </div>
  ),
});
