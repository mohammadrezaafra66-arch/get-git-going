import { createFileRoute } from "@tanstack/react-router";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { DealForecastView } from "@/components/deals/DealForecastView";

export const Route = createFileRoute("/_app/deal/forecast")({
  staticData: {
    gate: { kind: "anyRole", allowed: ["admin", "manager", "sales"] },
  },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "sales"]);
  },
  component: () => (
    <div className="deal-surface p-4">
      <DealForecastView />
    </div>
  ),
});
