import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requirePermission } from "@/lib/rbac/route-guards";

export const Route = createFileRoute("/_app/bot-api-keys")({
  beforeLoad: async () => { await requirePermission("bot-api-keys", "view"); },
  component: BotApiKeysLayout,
});

function BotApiKeysLayout() {
  return <Outlet />;
}
