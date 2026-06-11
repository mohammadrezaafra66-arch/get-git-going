import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";
import { AminHozoorPriceBoard } from "@/components/pricing/board/AminHozoorPriceBoard";

export const Route = createFileRoute("/_app/pricing/amin-hozoor-board")({
  beforeLoad: async () => {
    await requirePermission("pricing", "view");
  },
  component: AminHozoorPriceBoard,
});
