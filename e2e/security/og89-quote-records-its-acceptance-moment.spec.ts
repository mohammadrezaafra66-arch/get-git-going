/**
 * OG-89 — sales_quotes records WHEN a quote was accepted.
 *
 * WHY THIS EXISTS. The settlement clock starts at acceptance: "3-day settlement" means three days
 * from the moment the customer said yes. The table had eight timestamp columns and not one of them
 * marked that moment, so the receivables report had nothing honest to count from and fell back to
 * expires_at -- the quote's validity deadline, which is NULL on all nine accepted quotes.
 *
 * The behaviour itself is enforced in the database and is proven there, live, inside
 * BEGIN … ROLLBACK: docs/verification/417-gate.sql (9 assertions) with three forced disturbances,
 * one per claim -- 417-disturbance-a-no-stamp.sql, -b-bare-now.sql, -c-insert-hole.sql. This file
 * guards the decisions in the migration that a future edit could quietly undo.
 *
 * The INSERT branch is not decoration. The first draft of 417 stamped only on UPDATE, reasoning
 * that status DEFAULTs to 'draft' and the RPC never sets it. That covers the RPC and nothing else:
 * `authenticated` holds an INSERT grant, the RLS insert policy does not constrain status, and a
 * plain INSERT with status='accepted' produced a row with accepted_at NULL that no later UPDATE
 * could repair -- re-asserting the same status is not DISTINCT, so the branch never runs.
 * Committed e2e fixtures in this repo already insert accepted quotes directly.
 */
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const migration = readFileSync(
  "supabase/migrations/20260831170000_417_sales_quotes_records_when_it_was_accepted.sql",
  "utf8",
);

test.describe("OG-89 — the acceptance moment is recorded", () => {
  test("the column is added, and nullable", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS accepted_at timestamptz NULL");
  });

  test("it is stamped where canceled_at is stamped: the BEFORE UPDATE trigger", () => {
    // Not in update_sales_quote_status. That function writes cancel_reason, never canceled_at --
    // so "follow the canceled_at pattern" means this trigger, which also sees every other writer.
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.sales_quotes_validate_status()");
    expect(migration).toContain("IF new.status = 'accepted' THEN");
    expect(migration).toContain("new.accepted_at := coalesce(new.accepted_at, now())");
  });

  test("it also fires on INSERT, because a quote can be born accepted", () => {
    expect(migration).toContain("BEFORE INSERT OR UPDATE ON public.sales_quotes");
    expect(migration).toContain("IF tg_op = 'INSERT' AND new.status = 'accepted' THEN");
  });

  test("coalesce, not a bare now()", () => {
    // A bare now() would overwrite a historical value supplied by the backfill. Disturbance B
    // proves this assertion is not decorative.
    expect(migration).not.toMatch(/new\.accepted_at\s*:=\s*now\(\)/);
  });

  test("the status RPC is left alone", () => {
    // Deliberate scope limit: the trigger already covers every path into 'accepted', so touching
    // update_sales_quote_status would be risk without benefit.
    //
    // Asserted on the DDL, not on the whole file: the header comment names the function while
    // explaining why it is NOT being redefined, and a file-wide `not.toContain` therefore failed
    // for the wrong reason. The assertion was narrowed; the migration was not.
    expect(migration).not.toMatch(
      /(CREATE|ALTER|DROP)[\s\S]{0,40}FUNCTION[\s\S]{0,40}update_sales_quote_status/i,
    );
  });

  test("the rewrite keeps the guards it inherited", () => {
    // Non-vacuous: a CREATE OR REPLACE generated from a stale file would drop these, and every
    // assertion above would still pass.
    expect(migration).toContain("cannot change status of a finalized quote");
    expect(migration).toContain("invalid status transition");
    expect(migration).toContain("new.canceled_at := coalesce(new.canceled_at, now())");
    expect(migration).toContain("new.canceled_by := coalesce(new.canceled_by, auth.uid())");
  });

  test("nothing is backfilled here", () => {
    // The nine historical rows are inference, and inference gets its own PR and its own approval.
    expect(migration).not.toMatch(/UPDATE\s+public\.sales_quotes\s+SET\s+accepted_at/i);
  });
});
