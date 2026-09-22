import { createFileRoute } from "@tanstack/react-router";
import { requireAdmin } from "@/lib/rbac/route-guards";
import { TorobOpsSettingsPage } from "@/components/torob-ops/TorobOpsSettingsPage";

export const Route = createFileRoute("/_app/torob-ops_/settings")({
  staticData: { gate: { kind: "admin" } },
  beforeLoad: async () => {
    await requireAdmin();
  },
  component: TorobOpsSettingsPage,
});
