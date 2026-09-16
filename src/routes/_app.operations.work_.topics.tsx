import { createFileRoute } from "@tanstack/react-router";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { WorkTopicsPage } from "@/components/work/WorkTopicsPage";

const WORK_ROLES = ["admin", "manager", "sales", "accountant"] as const;

export const Route = createFileRoute("/_app/operations/work_/topics")({
  staticData: { gate: { kind: "anyRole", allowed: [...WORK_ROLES] } },
  beforeLoad: async () => {
    await requireAnyRole([...WORK_ROLES]);
  },
  component: WorkTopicsPage,
});
