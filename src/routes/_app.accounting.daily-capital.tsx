import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Item 141 — legacy route, superseded by /accounting/dynamic-capital.
 *
 * The old UUID-driven daily capital page is no longer the official entry
 * point. The file is kept (rather than deleted) so route generation and any
 * existing bookmark or deep link keep working; it now redirects.
 *
 * The previous implementation is preserved in git history.
 */
export const Route = createFileRoute("/_app/accounting/daily-capital")({
  beforeLoad: () => {
    throw redirect({ to: "/accounting/dynamic-capital", replace: true });
  },
});
