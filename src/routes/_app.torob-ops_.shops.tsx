import { createFileRoute } from "@tanstack/react-router";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { TorobOpsShopsPage } from "@/components/torob-ops/TorobOpsShopsPage";

const ROLES = ["admin", "manager", "sales", "accountant", "viewer"] as const;

export const Route = createFileRoute("/_app/torob-ops_/shops")({
  staticData: { gate: { kind: "anyRole", allowed: [...ROLES] } },
  beforeLoad: async () => {
    await requireAnyRole([...ROLES]);
  },
  component: TorobOpsShopsPage,
});
