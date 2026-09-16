import { createFileRoute } from "@tanstack/react-router";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PersonMergePage } from "@/components/persons/PersonMergePage";

// Phase 8.1 - merge review page. UI lives outside this file so the TanStack
// route transformer stays small and stable.
export const Route = createFileRoute("/_app/persons_/merge")({
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager"] } },
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: PersonMergePage,
});
