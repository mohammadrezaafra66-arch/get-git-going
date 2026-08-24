import { createFileRoute } from "@tanstack/react-router";

import { requireAnyRole } from "@/lib/rbac/route-guards";
import { PaymentReceiptGuide } from "@/components/accounting/PaymentReceiptGuide";

export const Route = createFileRoute("/_app/accounting/receipts_/training")({
  // M6/OG-24 — mirrors the requireAnyRole call below. The shared guard cannot decide
  // during SSR or while roles load, so RouteRoleGate in _app enforces this on the client.
  staticData: { gate: { kind: "anyRole", allowed: ["admin", "manager", "accountant"] } },
  beforeLoad: async () => {
    // Matches the guard on /accounting/receipts.
    await requireAnyRole(["admin", "manager", "accountant"]);
  },
  component: PaymentReceiptGuide,
});
