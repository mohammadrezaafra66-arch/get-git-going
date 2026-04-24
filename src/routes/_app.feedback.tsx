import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";
import { MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";

export const Route = createFileRoute("/_app/feedback")({
  beforeLoad: async () => { await requirePermission("feedback", "view"); },
  component: () => (
    <div className="space-y-6">
      <PageHeader title="بازخورد" description="دریافت بازخورد و پیشنهاد از کاربران" />
      <EmptyState
        icon={MessageSquare}
        title="ماژول بازخورد — به‌زودی"
        description="ساختار دیتابیس و route این ماژول آماده است. منطق و رابط کاربری در فاز بعدی پیاده‌سازی می‌شود."
      />
    </div>
  ),
});
