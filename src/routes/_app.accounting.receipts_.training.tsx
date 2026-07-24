import { createFileRoute } from "@tanstack/react-router";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PaymentReceiptGuide } from "@/components/accounting/PaymentReceiptGuide";

export const Route = createFileRoute("/_app/accounting/receipts_/training")({
  beforeLoad: async () => {
    // Matches the guard on /accounting/receipts.
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: PaymentReceiptGuide,
});
