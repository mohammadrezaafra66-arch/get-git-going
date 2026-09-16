import { createFileRoute } from "@tanstack/react-router";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { TorobOpsDashboardPage } from "@/components/torob-ops/TorobOpsDashboardPage";

const ROLES = ["admin", "manager", "sales", "accountant", "viewer"] as const;

export const Route = createFileRoute("/_app/torob-ops")({
  staticData: { gate: { kind: "anyRole", allowed: [...ROLES] } },
  beforeLoad: async () => {
    await requireAnyRole([...ROLES]);
  },
  component: TorobOpsDashboardPage,
});
