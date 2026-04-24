import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";
import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";

export const Route = createFileRoute("/_app/knowledge")({
  beforeLoad: async () => { await requirePermission("knowledge", "view"); },
  component: () => (
    <div className="space-y-6">
      <PageHeader title="دانش سازمانی" description="پایگاه دانش، مقاله‌ها و دستورالعمل‌ها" />
      <EmptyState
        icon={BookOpen}
        title="ماژول دانش سازمانی — به‌زودی"
        description="ساختار دیتابیس و route این ماژول آماده است. منطق و رابط کاربری در فاز بعدی پیاده‌سازی می‌شود."
      />
    </div>
  ),
});
