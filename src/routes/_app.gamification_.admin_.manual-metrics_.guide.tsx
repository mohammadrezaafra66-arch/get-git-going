import { createFileRoute } from "@tanstack/react-router";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { ManualMetricsGuide } from "@/components/gamification/ManualMetricsGuide";

// Item 143 — in-page guide for the manual daily-performance form.
// Same guard as the form itself so anyone who can reach the form can read the guide.
export const Route = createFileRoute("/_app/gamification_/admin_/manual-metrics_/guide")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: ManualMetricsGuide,
});
