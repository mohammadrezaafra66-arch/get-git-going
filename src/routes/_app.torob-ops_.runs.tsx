import { createFileRoute } from "@tanstack/react-router";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { TorobOpsRunsPage } from "@/components/torob-ops/TorobOpsRunsPage";

const ROLES = ["admin", "manager", "sales", "accountant", "viewer"] as const;

export const Route = createFileRoute("/_app/torob-ops_/runs")({
  staticData: { gate: { kind: "anyRole", allowed: [...ROLES] } },
  beforeLoad: async () => {
    await requireAnyRole([...ROLES]);
  },
  component: TorobOpsRunsPage,
});
