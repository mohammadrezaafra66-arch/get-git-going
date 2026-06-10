import { createFileRoute, Link } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";
import { ShoppingBag, Plus } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { RoleGuard } from "@/components/rbac/RoleGuard";

export const Route = createFileRoute("/_app/purchases")({
  beforeLoad: async () => {
    await requirePermission("purchases", "view");
  },
  component: () => (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <PageHeader title="خرید" description="ثبت و مدیریت سفارش‌های خرید از تأمین‌کنندگان" />
        <RoleGuard roles={["admin", "manager"]}>
          <Button asChild size="sm">
            <Link to="/purchases/create">
              <Plus className="ml-2 h-4 w-4" />
              ثبت خرید جدید
            </Link>
          </Button>
        </RoleGuard>
      </div>
      <EmptyState
        icon={ShoppingBag}
        title="ماژول خرید"
        description="برای ثبت یک خرید جدید روی دکمه «ثبت خرید جدید» کلیک کنید. لیست خریدها در فاز بعدی اضافه می‌شود."
      />
    </div>
  ),
});
