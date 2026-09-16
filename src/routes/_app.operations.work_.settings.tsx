import { createFileRoute } from "@tanstack/react-router";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { WorkTaxonomiesSettingsPage } from "@/components/work/WorkTaxonomiesSettingsPage";

/** Admin|manager only — taxonomy mutations are RLS-gated the same way. */
const SETTINGS_ROLES = ["admin", "manager"] as const;

export const Route = createFileRoute("/_app/operations/work_/settings")({
  staticData: { gate: { kind: "anyRole", allowed: [...SETTINGS_ROLES] } },
  beforeLoad: async () => {
    await requireAnyRole([...SETTINGS_ROLES]);
  },
  component: WorkTaxonomiesSettingsPage,
});
