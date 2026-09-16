import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/rbac/route-guards";
import { TorobOpsAccountsPage } from "@/components/torob-ops/TorobOpsAccountsPage";

export const Route = createFileRoute("/_app/torob-ops_/accounts")({
  staticData: { gate: { kind: "admin" } },
  beforeLoad: async () => {
    await requireAdmin();
  },
  component: TorobOpsAccountsPage,
});
