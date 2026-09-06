import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { CustomerForm } from "@/shared/components/CustomerForm";

export const Route = createFileRoute("/_app/sales_/customers_/create")({
  // Wave 2 / B-1 — the client half of the guard below. `beforeLoad` runs only on the server
  // for a direct navigation and cannot see a localStorage session, so RouteRoleGate reads this.
  // Mirrors requirePermission("sales", "create"). `allowed` is the LIVE
  // role_permissions.sales.can_create set read from the database on 2026-09-06 —
  // NOT src/lib/rbac/roles.ts, whose static table disagrees for several modules.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales"] } },
  beforeLoad: async () => {
    await requirePermission("sales", "create");
  },
  component: () => (
    <div className="space-y-6" dir="rtl">
      <PageHeader title="مشتری جدید" description="افزودن مشتری به سیستم" />
      <CustomerForm />
    </div>
  ),
});
