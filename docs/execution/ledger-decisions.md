# Locked ledger decisions

Two classes of decision. **Owner decisions (T1–T8)** were made by the owner and are not reopenable.
**Architecture decisions (A1–A4)** were taken by the execution architect from the options in the
roadmap; they become binding once OG-1 is answered.

Changing anything here mid-programme invalidates the acceptance criteria that depend on it. If a
decision proves wrong during execution, **stop, record it, and escalate** — do not quietly deviate.

---

# Part 1 — Owner decisions (binding)

## T1 — Approval is removed
A document posts to the ledger **at the moment it is created**. There is no `pending_review` →
`approved` → posted sequence for the three new document types. Access is controlled by role instead.

*Implication:* the RPCs of phases 2–4 create the source row and the journal entry in one transaction,
with `status='posted'` from the outset. `post_receipt_accounting`'s "must already be approved" guard
does not carry over to the new path.

*Risk accepted:* the four-eyes control disappears. Mitigated by role gates (only `admin`,
`accountant`, `manager` may create) and by immutability (task 1.6) — a posted document cannot be
edited, only reversed.

## T2 — All three document types move real balances
Receipt, payment and dual document each write a balanced journal entry that changes party balances.

## T3 — An Asan code is a precondition for creation
A document cannot be created for a party with no `asan_person_code`. Enforced **in the database**,
not only in the form — a direct PostgREST call must fail the same way.

*Implication:* on the test database, 13 of 23 customers currently cannot have a document recorded.
That is expected and acceptable; the rule is the point.

## T4 — Security-warning fields are removed
`has_perforation`, `is_typed_receipt`, `is_mobile_bank_screenshot` and the warning evaluator are
removed from the new form. They were never enforced server-side, so removing them loses no control
that actually existed.

## T5 — `receipt_type` is removed
It is dead for accounting: all four values post identically and no function reads it. Its only real
job — deciding whether the invoice-allocation block appears — is replaced by always showing the
customer's open proformas and letting the user attach optionally.

*Implication:* the column is `NOT NULL` with a default. The RPC sends a fixed value so existing rows
and any remaining reader keep working. The column is **not** dropped in this programme.

## T6 — Every document gets an automatic number
Human-readable, stable, never reused.

## T7 — Party identification is by Asan code or mobile
One primary input; name, file type and balance are auto-filled and locked. Search runs over
`persons`, not only `customers`, so suppliers and external parties are reachable.

## T8 — All three types feed the Asan accounting-document export
The owner imports the Persian-header (بدهکار / بستانکار) layout. All three must classify correctly.

---

# Part 2 — Architecture decisions

## A1 — An explicit `doc_kind` column on `journal_entries`

**Decision.** Add `doc_kind text NOT NULL` to `journal_entries` with CHECK
`('receipt','payment','dual','purchase_payment','settlement','other')`, defaulting to `'other'` for
backfill. `asan_list_journal_export` filters on this column instead of inferring from line shapes.

**Rejected alternative.** Keep inferring the kind from `account_kind`s.

**Why.** The current classifier maps any `external_party` line to `third_party`, a net bank debit to
`receipt`, a net bank credit to `payment`, and everything else to `unclassified`. A dual document
between a customer and a supplier has **no bank line at all**, so it lands in `unclassified` and
appears under none of the owner's three menu options. Inference cannot be repaired without becoming
more fragile still: the shape of a document is not a reliable proxy for its business meaning.

**Consequences.**
- Backfill: the single existing entry becomes `'receipt'` (it is a `payment_receipt` source).
- `asan_list_journal_export`'s `_filter` values stay `all|receipt|payment|third_party` for
  compatibility; `third_party` maps to `doc_kind='dual'`. Front-end labels do not change.
- The classifier CTE is replaced, not extended. Leaving both in place is a parallel implementation.

## A2 — Two new cheque account kinds

**Decision.** Extend the `account_kind` CHECK with `cheque_receivable` and `cheque_payable`.

**Rejected alternatives.** One combined `cheque` kind; or routing cheques through `clearing`.

**Why.** A cheque we hold and a cheque we issued sit on opposite sides of the balance sheet; one kind
cannot express both without a sign convention, and sign conventions are how this project already
produced a bug (`supplier_payable` is summed as `credit − debit` while the only writer debits it).
`clearing` is worse: the owner has stated Asan has no clearing account, and the export blocks on it
unconditionally.

**Consequences.**
- `validate_journal_line_ref` must learn the new kinds and their target tables (task 1.4).
- The Asan export must **skip** cheque lines rather than block on them — a cheque is not yet an Asan
  posting. Task 5.2. Getting this wrong silently withholds every cheque document.
- Cheque lifecycle (cleared / bounced / endorsed) is **deferred** — see `deferred.md`.

## A3 — One polymorphic attachments table

**Decision.** Create `document_attachments` with `document_type text` +
`document_id uuid` + storage path, OCR payload and audit columns. Serves receipts, payments and dual
documents.

**Rejected alternative.** A separate attachments table per document type.

**Why.** OCR, RLS, upload and retention are written once. Three near-identical tables would drift.
`payment_receipt_documents` already exists for receipts and stays for the legacy path; the new table
serves the new RPCs.

**Consequences.**
- No FK is possible on `document_id` (polymorphic). A `CHECK` constrains `document_type`, and a
  trigger validates existence at insert time — the same pattern `validate_journal_line_ref` uses.
- RLS must be written per document type, since a sales user may see receipts but not payments.

## A4 — One RPC per branch, in one transaction

**Decision.** `create_receipt`, `create_payment`, `create_dual_document`. Each does everything:
validate, mint the number, insert the source row, insert links and attachments, write the balanced
journal entry, write the audit row. All in one transaction, all `SECURITY DEFINER` with
`SET search_path TO 'public'`.

**Rejected alternative.** Keep client-side multi-table inserts and add a posting call.

**Why.** The current create path performs four separate inserts and "rolls back" with a `DELETE`
against a table that has no DELETE policy — so the rollback matches zero rows and the orphan is
guaranteed, not merely possible. Business rules enforced only in client code are bypassed by a
direct PostgREST call. A single RPC makes partial creation impossible and gives one auditable place
where the rules live.

**Consequences.**
- The Asan-code precondition (T3), the balance invariant and the immutability rule all live inside
  these functions and their triggers, so they hold for every caller.
- The old client path stays until phase 6 replaces the form. Both exist for phases 2–5; the old one
  is deleted in task 6.9, not before.
- Each RPC must be **idempotent on retry** by honouring `UNIQUE (source_type, source_id)`.

---

# Part 3 — Consequences to hold in mind throughout

1. **Balance or nothing.** An unbalanced document is excluded from the Asan export entirely. The
   RPCs must refuse to create one rather than create it and let the export drop it.
2. **Whole-document blocking.** One unresolvable line blocks the whole document. Validate every line
   at creation, not at export.
3. **No fractional Toman.** The ×10 to Rial must be exact. Reject fractional amounts at creation.
4. **Never let free text become an identity.** `payer_accounting_code` is free text. Identity comes
   only from `person_identifiers`. Migration 295 already gates this; do not weaken it.
5. **Toman in SQL, Rial only in `src/lib/asan/amounts.ts`.** One conversion point.
