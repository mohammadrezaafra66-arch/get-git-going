# P4 — JOURNAL DESCRIPTION ENRICHMENT

Read `docs/execution/UNIFY_MISSION_CONTROL.md` and
`docs/asan/supplier-and-journal-diagnostic.md` Part C.

Goal: fix the accountant's complaint that the شرح (description) column in the accounting-
document Asan export doesn't say "who paid" or "what for".

Two phases.

---

## Phase 4.1 — Enrich the شرح column for NEW journal entries

The diagnostic proved: the source data is there (payer name, tracking number, quote settled),
but `asan_list_journal_export` never joins to it. It just reads the line/entry description,
which is a generic accounting-effect string.

1. Read `asan_list_journal_export` live via `pg_get_functiondef`. Snapshot to
   `docs/verification/pre-<NNN>/asan_list_journal_export.live.sql`.
2. Rewrite the شرح mapping (column C of the layout) to compose a richer description per
   line:
   - For a payment_receipt-sourced line: `<payer_name> — <tracking_number> — پرداخت SQ-XXXX`
   - For a journal-entry manual line: existing line description falls through unchanged
   - For a دوبل line: include the third-party name if present
3. The join path: `journal_lines.journal_entry_id → journal_entries.source_id →
   payment_receipts.id` when `journal_entries.source_type = 'payment_receipt'`. Verify each
   FK live.
4. Use `COALESCE` in stages so a missing piece degrades gracefully rather than producing
   empty:
   - Rich: `payer + tracking + purpose`
   - Medium: `payer + purpose`
   - Falls back to: line description
   - Falls back to: entry description
   - Never: empty (empty means the accountant can't identify the row)
5. Persian text goes through the file-safe method (docker cp + psql -f), never a pipe.
   Round-trip verify every literal after write.

**Test:**
- Take a real recent payment_receipt with a payer, tracking number, and settled quote.
- Run the export function for its date. Assert the شرح column contains the payer name AND
  the tracking number AND the quote ref.
- Take an old manual journal entry. Assert its شرح is unchanged (falls through to existing
  description).
- Take a synthetic دوبل entry (create one in the test, roll back after). Assert the
  intermediary is named.
- Clean up.

Commit.

---

## Phase 4.2 — Do NOT retroactively rewrite legacy receipts

**Owner decision, confirmed:** The 300+ legacy payment_receipts stay as they are. New
receipts flow through the enriched path; old ones stay with whatever شرح they always had.

This is a phase in name only — it exists to make the decision explicit and to add a note
to the Asan export UI so the accountant knows.

1. In the export UI, when a preview row's شرح was generated from a legacy receipt (detect
   via `payment_receipts.created_at < <cutoff>`), show a small badge "شرح ساده" so the
   accountant knows to look at the original document if she needs more detail.
2. The cutoff is the timestamp of migration N from Phase 4.1 — save it in a config table
   or a constant, whichever is cleaner.

**Test:**
- A row from before the cutoff shows the badge.
- A row from after doesn't.
- Sort the preview by badge to prove new rows are on top of the enrichment.

Commit.

---

## MISSION GATE

1. `npm run typecheck` = 70.
2. Clean tree. Deployed. Signals match.
3. Full e2e vs baseline. New reds → yours.
4. New spec:
   - `e2e/unify/journal-description-enrichment.spec.ts`
5. Update `unify-progress.md`.
6. **Immediately proceed to `docs/execution/P5_MUTUAL_SETTLEMENT.md`.**
