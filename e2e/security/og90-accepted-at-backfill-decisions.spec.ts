/**
 * OG-90 — the three decisions behind the accepted_at backfill, guarded.
 *
 * Migration 418 filled sales_quotes.accepted_at for the nine quotes accepted before 417 existed.
 * The value is inferred from history, so the owner approved each decision explicitly after
 * reading a row-by-row report. The decisions are cheap to undo by accident in a later edit, and
 * each of them silently produces a WRONG due date rather than an obviously broken one -- which is
 * why they are asserted here as well as in the migration's own verification block.
 *
 * The data half is proven live: docs/verification/418-disturbance-a-wrong-source.sql and
 * -b-null-guard.sql, plus 418-preflight-no-collateral-writes.sql, which measured a delta of zero
 * across seven side-effect tables before the migration was allowed to run at all.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const migration = readFileSync(
  "supabase/migrations/20260831190000_418_backfill_accepted_at_from_the_audit_log.sql",
  "utf8",
);

test.describe("OG-90 — the backfill's decisions", () => {
  test("(a) the FIRST acceptance event, not the last", () => {
    // Taking the last would push the settlement deadline out in the customer's favour.
    expect(migration).toContain("row_number() OVER (PARTITION BY a.entity_id ORDER BY a.created_at)");
    expect(migration).toContain("e.rn = 1");
    expect(migration).not.toMatch(/ORDER BY a\.created_at\s+DESC/i);
  });

  test("(b) no timezone conversion -- both columns are timestamptz", () => {
    // AT TIME ZONE here would yield a naive timestamp that shifts by 3.5 hours on the way back in.
    expect(migration).toContain("SET accepted_at = e.created_at");
    expect(migration).not.toMatch(/accepted_at\s*=\s*[^;]*AT TIME ZONE/i);
  });

  test("(c) a quote with no acceptance event keeps NULL", () => {
    // The UPDATE is driven by a join to the audit events, so a quote without one is simply not
    // matched. Nothing in the migration may supply a fallback date.
    expect(migration).not.toMatch(/COALESCE\s*\([^)]*created_at[^)]*,\s*[^)]*\)/i);
    expect(migration).not.toMatch(/accepted_at\s*=\s*q\.created_at/i);
    expect(migration).not.toMatch(/accepted_at\s*=\s*now\(\)/i);
  });

  test("it is idempotent, and cannot overwrite a real 417 stamp", () => {
    expect(migration).toContain("q.accepted_at IS NULL");
  });

  test("it only touches quotes that are actually accepted", () => {
    expect(migration).toContain("q.status = 'accepted'");
  });

  test("the source is the audit trail, identified by action and new_status", () => {
    // Non-vacuous: a looser filter (diff::text LIKE '%accepted%') would also match the 94 events
    // belonging to deleted quotes and any future field that happens to contain the word.
    expect(migration).toContain("a.action      = 'sales_quote_status_changed'");
    expect(migration).toContain("a.diff->>'new_status' = 'accepted'");
    expect(migration).not.toContain("diff::text LIKE");
  });

  test("it verifies its own result rather than trusting the UPDATE", () => {
    expect(migration).toContain("rows do not equal their first audit event");
    expect(migration).toContain("rows accepted before they were created");
    expect(migration).toContain("rows accepted in the future");
  });

  test("SQ-2026-000005's settlement days are not touched here", () => {
    // A data defect the owner fixes from the UI. Carried into PR 3 as a display decision instead.
    expect(migration).not.toMatch(/UPDATE\s+public\.settlement_types/i);
  });
});
