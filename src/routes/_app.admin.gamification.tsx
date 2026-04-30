import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy admin gamification panel — redirected to the new analytics dashboard.
export const Route = createFileRoute("/_app/admin/gamification")({
  beforeLoad: () => {
    throw redirect({ to: "/gamification/admin/analytics" });
  },
});
