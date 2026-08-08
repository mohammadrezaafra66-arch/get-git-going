import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Retired 2026-08-08 — superseded by /operations/didar.
 *
 * What this was: a second "یکپارچه‌سازی دیدار CRM" page. The system-wide wiring audit
 * (docs/audits/system-wide-wiring-audit.md, بند الف-۴) found two pages carrying that exact
 * title; the owner chose to keep /operations/didar, which is far more complete (817 vs
 * 293 lines: credential settings, a real connection test, a real import, contact linking
 * and gamification enrichment).
 *
 * Why it went: its three sync buttons were a stub — they slept 600ms and fired a
 * "coming soon" toast, writing nothing. Its connection badge read `bot_api_keys`, a
 * table with RLS enabled and zero policies, so it reported "not connected" for every
 * non-superuser regardless of the truth; the surviving page reads the credentials it
 * actually uses, from `shop_settings`. It also had no route guard at all, while
 * /operations/didar requires admin (logged in docs/qa/BLOCKERS.md).
 *
 * What was salvaged first: the two things it did that the surviving page did not —
 * import stats for all three entity types rather than contacts only, and the last-100
 * import-history table — were ported into /operations/didar before this file was
 * reduced to a redirect. Nothing else here was unique.
 *
 * The route file is kept, rather than deleted, so route generation and any existing
 * bookmark keep working instead of hitting a raw 404. The previous implementation is
 * preserved in git history.
 */
export const Route = createFileRoute("/_app/integrations/didar")({
  beforeLoad: () => {
    throw redirect({ to: "/operations/didar", replace: true });
  },
});
