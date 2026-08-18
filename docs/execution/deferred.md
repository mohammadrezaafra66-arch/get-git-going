# Deferred — explicitly out of scope

Named here so nobody builds them by accident and nobody assumes they were forgotten. **Do not
implement anything on this list.** If a task seems to require one, stop and escalate — the task is
probably wrong.

---

## Cheque lifecycle
Only two cheque fields exist today (`cheque_number`, `cheque_due_date`) on the document row. There is
no cheque register and no state machine.

This programme adds `cheque_receivable` / `cheque_payable` account kinds and posts on receipt (D7),
but **does not** build: clearing, bouncing, re-presentation, a cheque portfolio view, or due-date
alerts. Endorsement is supported minimally in task 3.8 (select a held cheque, mark it consumed)
because the payment branch needs it.

## Cheque book management
Task 3.7 references "our cheque book" but no such table exists. The minimum is a validated cheque
number on the payment; a real cheque book register with used/unused ranges is deferred.

## Accrual accounting for sales and purchases
Today nothing debits `customer_credit` on a sale or credits `supplier_payable` on a purchase — the
ledger records money movement, not the underlying trade. This programme does **not** change that.

Consequence to state plainly: after this programme, party balances reflect **payments only**, not
what is owed. Asan remains the source of truth for receivables until a separate accrual programme
runs. This is the single largest remaining gap and deserves its own roadmap.

## The `invoice_ar`, `clearing` and `other` account kinds
All three block the Asan export by design. `invoice_ar` needs a code from the owner (OG-3);
`clearing` has no Asan counterpart at all — the owner's real flow is a cash receipt and a cash
payment in the same moment; `other` is undefined. **Never guess a code for any of them.**

## Dropping `receipt_type` and the security-warning columns
Hidden from the UI (T4, T5), left in the schema (D1). Dropping is a separate, irreversible migration
after phase 8 proves nothing reads them.

## The `person_settlement_position` sign bug
Payable is summed as `credit − debit` while the only writer debits it, so a paid supplier reads
negative. Phase 3 fixes the convention **for new documents**; auditing and correcting existing
settlement figures is separate.

## Mutual settlement (تهاتر) as a feature
`mutual_settlements` and its RPC exist with zero rows. Task 4.2 may reuse the table for dual
documents, but the netting workflow itself — candidate lists, settlement UI — is not in scope.

## Purchase and sales Asan exports
`asan_list_purchase_export` and `asan_list_sales_export` work and are untouched. The 92 purchases
lacking a supplier are a data problem, not an infrastructure one.

## `normalize_identifier`
Needed for mobile lookup (task 6.7) and gated by OG-4, but the function itself — canonicalising
`09xxx` / `9xxx` / `+98xxx` / Persian digits — is a small separate piece of work. Build it before
phase 6; do not fold it into a wizard task.

## HTTPS
Gates phase 7 (OG-5). Infrastructure work: split-horizon DNS, Let's Encrypt DNS-01, WireGuard for
external access. Not part of this programme, but phase 7 cannot start without it.

## The pgvector dimension mismatch
`bge-m3` emits 1024 dimensions; `message_embeddings` is declared 1536. Unrelated to the ledger.

## The 70 typecheck errors
Baseline (D14). Fixing them means installing the Supabase CLI and regenerating types.

## Removing the exported spreadsheet from git history
A file with real customer names reached history and needs a force-push to remove. **Owner decision,
owner action** — the rules forbid an agent force-pushing.

## Production data repair
Supplier links and Asan codes on production data (phase 9.6) is owner work, not agent work. Only the
owner knows which supplier a purchase came from and what a person's Asan code is.
