import { createFileRoute } from "@tanstack/react-router";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { DealDidarDetail } from "@/components/deals/DealDidarDetail";

export const Route = createFileRoute("/_app/deal_/$dealId")({
  staticData: {
    gate: { kind: "anyRole", allowed: ["admin", "manager", "sales"] },
  },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "sales"]);
  },
  component: DealPage,
});

function DealPage() {
  const { dealId } = Route.useParams();
  return (
    <div className="deal-surface min-w-0 max-w-full overflow-x-hidden p-4">
      <DealDidarDetail dealId={dealId} />
    </div>
  );
}
