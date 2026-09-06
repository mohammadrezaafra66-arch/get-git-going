import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";

export const Route = createFileRoute("/_app/sales/quotes")({
  // Wave 2 / B-1 — the client half of the guard below. `beforeLoad` runs only on the server
  // for a direct navigation and cannot see a localStorage session, so RouteRoleGate reads this.
  // Mirrors requirePermission("sales", "view"). `allowed` is the LIVE
  // role_permissions.sales.can_view set read from the database on 2026-09-06 —
  // NOT src/lib/rbac/roles.ts, whose static table disagrees for several modules.
  // Layout route: this one line gates /sales/quotes and its leaves (index, $quoteId, new).
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "accountant", "sales"] } },
  beforeLoad: async () => {
    await requirePermission("sales", "view");
  },
  component: QuotesLayout,
});

function QuotesLayout() {
  return <Outlet />;
}
