import { createFileRoute } from "@tanstack/react-router";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { DealListView } from "@/components/deals/DealListView";

export const Route = createFileRoute("/_app/deal/filter")({
  staticData: {
    gate: { kind: "anyRole", allowed: ["admin", "manager", "sales"] },
  },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "sales"]);
  },
  component: () => (
    <div className="deal-surface p-4">
      <DealListView />
    </div>
  ),
});
