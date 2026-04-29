import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { PaymentReceiptForm } from "@/shared/components/PaymentReceiptForm";

export const Route = createFileRoute("/_app/accounting/receipts/create")({
  beforeLoad: async () => {
    await requireAnyRole(["admin", "accountant"]);
  },
  component: CreateReceiptPage,
});

function CreateReceiptPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="ثبت فیش واریزی"
        description="ثبت فیش واریزی جدید برای مشتری"
        actions={
          <Button variant="outline" asChild>
            <Link to="/accounting/receipts">
              <ArrowRight className="ml-2 h-4 w-4" />
              بازگشت به لیست
            </Link>
          </Button>
        }
      />
      <PaymentReceiptForm />
    </div>
  );
}
