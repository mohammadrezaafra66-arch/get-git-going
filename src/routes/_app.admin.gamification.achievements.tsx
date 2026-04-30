import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy achievements admin — redirected to the new achievements admin page.
export const Route = createFileRoute("/_app/admin/gamification/achievements")({
  beforeLoad: () => {
    throw redirect({ to: "/gamification/admin/achievements" });
  },
});
