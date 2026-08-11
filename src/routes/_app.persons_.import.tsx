import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { PersonImportForm } from "@/components/persons/PersonImportForm";
import { requireAnyRole } from "@/lib/rbac/route-guards";
import { useAuth } from "@/lib/auth/AuthProvider";
import { hasAnyRole } from "@/lib/rbac/roles";

// Item 170 — bulk person import from Excel, mirroring CustomerImportForm.
// Writing persons + identifiers is admin/manager only at the RLS layer, so the
// route guard matches rather than relying on the permission fallback.
// Client-side gate mirrors phone-collisions: beforeLoad may defer while roles load.
export const Route = createFileRoute("/_app/persons_/import")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "manager"]);
  },
  component: PersonImportPage,
});

function PersonImportPage() {
  const { roles, rolesLoading } = useAuth();
  const allowed = hasAnyRole(roles, ["admin", "manager"]);

  if (rolesLoading) {
    return <div className="p-6 text-muted-foreground">در حال بررسی دسترسی…</div>;
  }
  if (!allowed) {
    return <div className="p-6 text-muted-foreground">دسترسی ندارید.</div>;
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/persons">
            <ArrowRight className="ml-2 h-4 w-4" />
            بازگشت به اشخاص
          </Link>
        </Button>
      </div>

      <PageHeader
        title="ایمپورت اشخاص از اکسل"
        description="ستون‌های فایل را به فیلدهای شخص نگاشت کنید، پیش‌نمایش را ببینید و ردیف‌ها را دسته‌ای وارد کنید."
      />

      <PersonImportForm />
    </div>
  );
}
