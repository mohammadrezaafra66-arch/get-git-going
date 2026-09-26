import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireAnyRole } from "@/lib/rbac/route-guards";

export const Route = createFileRoute("/_app/deal")({
  staticData: {
    gate: { kind: "anyRole", allowed: ["admin", "manager", "sales"] },
  },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "sales"]);
  },
  component: () => <Outlet />,
});
