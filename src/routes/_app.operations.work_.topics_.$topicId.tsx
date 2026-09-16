import { createFileRoute } from "@tanstack/react-router";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { WorkTopicDetailPage } from "@/components/work/WorkTopicDetailPage";

const WORK_ROLES = ["admin", "manager", "sales", "accountant"] as const;

export const Route = createFileRoute("/_app/operations/work_/topics_/$topicId")({
  staticData: { gate: { kind: "anyRole", allowed: [...WORK_ROLES] } },
  beforeLoad: async () => {
    await requireAnyRole([...WORK_ROLES]);
  },
  component: WorkTopicDetailRoute,
});

function WorkTopicDetailRoute() {
  const { topicId } = Route.useParams();
  return <WorkTopicDetailPage topicId={topicId} />;
}
