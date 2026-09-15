import { createFileRoute } from "@tanstack/react-router";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { WorkBoardPage } from "@/components/work/WorkBoardPage";

const WORK_ROLES = ["admin", "manager", "sales", "accountant"] as const;

export const Route = createFileRoute("/_app/operations/work")({
  staticData: { gate: { kind: "anyRole", allowed: [...WORK_ROLES] } },
  beforeLoad: async () => {
    await requireAnyRole([...WORK_ROLES]);
  },
  component: WorkBoardPage,
});
