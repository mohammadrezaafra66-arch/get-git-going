import { createFileRoute } from "@tanstack/react-router";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { TorobOpsFindingsPage } from "@/components/torob-ops/TorobOpsFindingsPage";

const ROLES = ["admin", "manager", "sales", "accountant", "viewer"] as const;

export const Route = createFileRoute("/_app/torob-ops_/findings")({
  staticData: { gate: { kind: "anyRole", allowed: [...ROLES] } },
  beforeLoad: async () => {
    await requireAnyRole([...ROLES]);
  },
  component: TorobOpsFindingsPage,
});
