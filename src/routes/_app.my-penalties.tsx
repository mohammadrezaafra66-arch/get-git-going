import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/common/PageHeader";
import { MyPenaltiesPanel } from "@/components/penalties/MyPenaltiesPanel";

function MyPenaltiesPage() {
  return (
    <div dir="rtl" className="space-y-4">
      <PageHeader
        title="کارت‌های قرمز من"
        description="فهرست تخلف‌های ثبت‌شده در پرونده عملکرد شما و امکان ثبت اعتراض تا ۲۴ ساعت."
      />
      <MyPenaltiesPanel />
    </div>
  );
}

export const Route = createFileRoute("/_app/my-penalties")({
  component: MyPenaltiesPage,
});