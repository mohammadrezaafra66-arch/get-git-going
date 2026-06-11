import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";
import { Mail } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";

export const Route = createFileRoute("/_app/messages")({
  beforeLoad: async () => { await requirePermission("messages", "view"); },
  component: () => (
    <div className="space-y-6">
      <PageHeader title="پیام‌های داخلی" description="ارسال و دریافت پیام بین کاربران سامانه" />
      <EmptyState
        icon={Mail}
        title="ماژول پیام‌های داخلی — به‌زودی"
        description="ساختار دیتابیس و route این ماژول آماده است. منطق و رابط کاربری در فاز بعدی پیاده‌سازی می‌شود."
      />
    </div>
  ),
});
