import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy route — pending users are now managed inside the unified /users page.
export const Route = createFileRoute("/_app/users/pending")({
  beforeLoad: () => {
    throw redirect({ to: "/users", search: { status: "pending" } });
  },
});
