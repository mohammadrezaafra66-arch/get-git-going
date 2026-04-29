import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { CustomerImportForm } from "@/shared/components/CustomerImportForm";

export const Route = createFileRoute("/_app/sales/customers_/import")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "accountant"]);
  },
  component: CustomersImportPage,
});

function CustomersImportPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        title="ورود مشتریان از اکسل"
        description="آپلود فایل اکسل، نگاشت ستون‌ها و ورود گروهی مشتریان (حداکثر ۱۰۰۰ ردیف)"
        actions={
          <Button asChild variant="outline">
            <Link to="/sales/customers">
              <ArrowRight className="ml-2 h-4 w-4" /> بازگشت به فهرست
            </Link>
          </Button>
        }
      />
      <CustomerImportForm />
    </div>
  );
}