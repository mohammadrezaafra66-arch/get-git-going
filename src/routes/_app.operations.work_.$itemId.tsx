import { createFileRoute } from "@tanstack/react-router";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { WorkItemDetailPage } from "@/components/work/WorkItemDetailPage";

const WORK_ROLES = ["admin", "manager", "sales", "accountant"] as const;

export const Route = createFileRoute("/_app/operations/work_/$itemId")({
  staticData: { gate: { kind: "anyRole", allowed: [...WORK_ROLES] } },
  beforeLoad: async () => {
    await requireAnyRole([...WORK_ROLES]);
  },
  component: WorkItemDetailRoute,
});

function WorkItemDetailRoute() {
  const { itemId } = Route.useParams();
  return <WorkItemDetailPage itemId={itemId} />;
}
