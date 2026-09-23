import { createFileRoute } from "@tanstack/react-router";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { SalesDeskShell } from "@/components/sales-desk";
import { DealPipelineBoard } from "@/components/sales-desk/DealPipelineBoard";

export const Route = createFileRoute("/_app/operations/sales-desk_/pipeline")({
  staticData: {
    gate: { kind: "anyRole", allowed: ["admin", "manager", "sales"] },
  },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "sales"]);
  },
  component: SalesPipelinePage,
});

function SalesPipelinePage() {
  return (
    <SalesDeskShell
      title="کاریز فروش"
      description="معاملات روی مراحل کاریز — بکشید و رها کنید."
      fallbackTo="/operations/sales-desk"
    >
      <DealPipelineBoard />
    </SalesDeskShell>
  );
}
