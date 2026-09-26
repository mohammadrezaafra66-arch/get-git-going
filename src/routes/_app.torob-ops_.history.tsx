import { createFileRoute } from "@tanstack/react-router";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { TorobOpsHistoryPage } from "@/components/torob-ops/TorobOpsHistoryPage";

const ROLES = ["admin", "manager", "sales", "accountant", "viewer"] as const;

export const Route = createFileRoute("/_app/torob-ops_/history")({
  staticData: { gate: { kind: "anyRole", allowed: [...ROLES] } },
  beforeLoad: async () => {
    await requireAnyRole([...ROLES]);
  },
  component: TorobOpsHistoryPage,
});
