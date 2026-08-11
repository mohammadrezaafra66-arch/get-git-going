import { createFileRoute } from "@tanstack/react-router";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { WorkflowSettingsTable } from "@/components/settings/WorkflowSettingsTable";

export const Route = createFileRoute("/_app/admin/workflow-settings")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: WorkflowSettingsPage,
});

function WorkflowSettingsPage() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="تنظیمات گردش‌کار"
        description="تایمر، نقش‌ها و کارت قرمز هر فرایند را از اینجا تنظیم کنید"
      />
      <WorkflowSettingsTable />
    </div>
  );
}