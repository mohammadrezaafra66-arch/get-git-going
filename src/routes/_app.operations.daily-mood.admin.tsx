import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasPermissionEx } from "@/lib/rbac/roles";
import { PageHeader } from "@/components/common/PageHeader";
import { DailyMoodAdminTable } from "@/components/operations/mood/DailyMoodAdminTable";

export const Route = createFileRoute("/_app/operations/daily-mood/admin")({
  component: DailyMoodAdminPage,
});

function DailyMoodAdminPage() {
  const { roles } = useAuth();
  const canView = hasPermissionEx(roles, "hr", "view");
  if (!canView) {
    return (
      <div className="container py-12 text-center" dir="rtl">
        <p className="text-muted-foreground">دسترسی به این صفحه را ندارید.</p>
        <Link to="/operations/daily-mood" className="text-primary underline mt-2 inline-block">بازگشت به صفحه ثبت</Link>
      </div>
    );
  }
  return (
    <div className="container py-6 space-y-4" dir="rtl">
      <PageHeader title="مدیریت حال‌وهوای کارکنان" description="مشاهده ثبت‌های روزانه، فیلتر، رسیدگی و یادداشت مدیریتی" />
      <DailyMoodAdminTable />
    </div>
  );
}