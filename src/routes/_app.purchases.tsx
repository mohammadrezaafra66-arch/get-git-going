import { createFileRoute } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";

export const Route = createFileRoute("/_app/purchases")({
  component: () => (
    <div className="space-y-6">
      <PageHeader title="خرید" description="ثبت و مدیریت سفارش‌های خرید از تأمین‌کنندگان" />
      <EmptyState
        icon={ShoppingBag}
        title="ماژول خرید — به‌زودی"
        description="ساختار دیتابیس و route این ماژول آماده است. منطق و رابط کاربری در فاز بعدی پیاده‌سازی می‌شود."
      />
    </div>
  ),
});
