import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";

export const Route = createFileRoute("/_app/sales")({
  beforeLoad: async () => {
    await requirePermission("sales", "view");
  },
  component: () => <Outlet />,
});
