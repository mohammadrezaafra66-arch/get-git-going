import { createFileRoute } from "@tanstack/react-router";

import { requirePermission } from "@/lib/rbac/route-guards";
import { CustomerCreditGuide } from "@/components/customers/CustomerCreditGuide";

export const Route = createFileRoute("/_app/sales_/customers_/credit-training")({
  beforeLoad: async () => {
    await requirePermission("sales", "view");
  },
  component: CustomerCreditGuide,
});
