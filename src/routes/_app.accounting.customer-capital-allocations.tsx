import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Item 141 — legacy route, superseded by /accounting/dynamic-capital.
 *
 * Customer allocations are now reached by drilling into a salesperson on the
 * dynamic capital page. The file is kept so route generation and old links
 * keep working. The previous implementation is preserved in git history.
 */
export const Route = createFileRoute("/_app/accounting/customer-capital-allocations")({
  beforeLoad: () => {
    throw redirect({ to: "/accounting/dynamic-capital", replace: true });
  },
});
