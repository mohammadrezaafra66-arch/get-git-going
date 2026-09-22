import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/rbac/route-guards";
import { TorobOpsAccessAdminPage } from "@/components/torob-ops/TorobOpsAccessAdminPage";

export const Route = createFileRoute("/_app/admin/torob-ops-access")({
  staticData: { gate: { kind: "admin" } },
  beforeLoad: async () => {
    await requireAdmin();
  },
  component: TorobOpsAccessAdminPage,
});
