# Locked ledger decisions

Two classes of decision. **Owner decisions (T1–T12)** were made by the owner and are not reopenable.
**Architecture decisions (A1–A4)** were taken by the execution architect from the options in the
roadmap; they become binding once OG-1 is answered.

**T9–T12 were added on 2026-08-18**, after phase 2 closed. T9 and T10 contradict what the current
schema assumes — the ledger keeps three balances per person where the owner keeps one — so they are
not bookkeeping: they are what stops phases 3 and 4 being built to the wrong model. T10 answers
**OG-16**. Part 4 records what "credit" means in this business, which nothing in the repository stated
before and whose absence cost a review cycle.

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

## T9 — One person, one file, one balance
A person has exactly **one** account file and **one** balance. Membership of the customer group or
the supplier group is a **label only**: it decides which lists the person appears in, never where
their money is kept. The same person may be in both groups at once and still has one balance.

*State of the ledger today:* the ledger splits this across three account kinds, each keyed to a
different table — `customer_credit` → `customers`, `supplier_payable` → `suppliers`,
`external_party` → `external_parties`. A person who is both a customer and a supplier therefore has
their true position spread across two of them, and **no single figure is correct**. This is the same
root cause as the already-recorded finding that `person_settlement_position` returns misleading
numbers (`docs/execution/deferred.md` § *The `person_settlement_position` sign bug*; measured again
as check 14 of `phase-2-GATE-A.md`).

*What already exists:* `persons` and `person_identifiers` are in place, and `customers.person_id` and
`suppliers.person_id` are **both `NOT NULL`** — so every customer and every supplier already has a
file. The identity layer is not the missing piece; the balance layer is.

**Scope unmeasured. Do not build on this yet.** A read-only research mission must size the change
first — how many readers compute a position from one of the three account kinds, what
`vw_account_balances`, `vw_customer_receivables`, `person_settlement_position`,
`list_mutual_settlement_candidates`, `get_customer_credit` and the credit-limit path each assume, and
what a single balance would have to replace. That size is **not** estimated here and must not be
guessed. Nothing in phase 3 or phase 4 may be dispatched on an assumed answer.

## T10 — A receipt or a payment moves that one balance, and asks nothing
For a receipt or a payment the counterparty is always **us**, so there is exactly one other party and
exactly one rule:

* if that person's balance shows **they owe us**, a receipt **reduces what they owe**
* if it shows **we owe them**, a receipt **increases what we owe**

**The user is never asked what the money is for.** Whether the movement reads as "debt reduced" or
"credit increased" follows from the **sign of the single balance** (T9), not from a separate choice
presented in the form.

*The owner's example:* someone who is neither a customer nor a debtor — a friend or a relative
lending money — is **not** a special case. They become a creditor, and their balance moves in the
creditor direction under the same rule. No new party type, no branch in the form.

**This answers OG-16 and supersedes the three options that gate offered.** OG-16 asked what a receipt
from a non-customer should credit, and offered (a) `external_party`, (b) a new `person_credit` kind,
(c) require promotion to a customer first. T10 replaces all three: there is one balance per person
and the sign decides the direction.

*Consequence for what is built:* `create_receipt` takes `p_customer_id` and **always** credits
`customer_credit`, which resolves only through `customers.person_id`. That is now known to be **too
narrow** — it cannot express a receipt from a person who is not a customer, and it cannot move the
one balance T9 requires. **The fix belongs to the T9 research, not to a patch on
`create_receipt`.** Do not widen the RPC ahead of that research; a second narrow path is worse than
one.

## T11 — The dual document has four roles, and only two of them are account holders
A dual document is a receipt and a payment in the same instant, where the money never lands in our
account. **Four** people can appear on it, in **two distinct classes**.

**Account holders** — full file, Asan code required (T3), balance moves, journal line written:

* the party who **owed us** (the payer's side of the transaction)
* the party **we owed** (the beneficiary's side)

**Recorded on the document only** — name and account number, **no** Asan code, **no** journal line,
balance does **not** move:

* the person who **actually transferred** the money
* the person whose account **actually received** it

*The owner's worked example.* Mohammad is owed money by Khan-Mohammadi and owes money to Zeinab.
Zeinab supplies Mitra's account number, because Zeinab owes Mitra and does not want the money passing
through her own account. Mohammad passes Mitra's account number to Khan-Mohammadi, who does not want
it passing through his account either. Khan-Mohammadi gives it to his father, who owed him, and the
father makes the transfer and sends the slip. **Four people, one document.** Khan-Mohammadi and
Zeinab are the account holders: their balances move and both must have Asan codes. The father is the
**transferrer** and Mitra is the **recipient**; both appear on the document as name and account
details and generate **no accounting line**.

*Consistent with, and extending, what was already designed.* The earlier wizard work already
established a party that appears on a receipt without being an account holder — the صراف of
requirement 207, whose Asan code was deliberately made **not** mandatory because the account is not
ours. T11's record-only class is that same idea, generalised. **What is new is that there are TWO
such record-only roles, not one:** the transferrer as well as the recipient.

*Consequence for what is built:* the `create_dual_document` contract in `docs/api/rpc-contracts.md`
§3 currently carries `p_payer_id`, `p_beneficiary_id` and an optional `p_intermediary_id` (صراف), and
has **no field for a transferrer or a recipient**. Recording that gap here, not fixing it — phase 4
owns the contract. Note also that `MASTER-CHECKLIST.md` task 4.6 has the intermediary generating a
third journal line when a fee is non-zero; a fee is **our** expense and is a separate question from
whose balance moves, and T11 does not settle it.

## T12 — The boundary between a plain receipt and a dual document
* money reached us **and stayed** → **plain receipt**
* money reached us **and went straight out** to someone else → **dual document**

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

---

# Part 4 — What "credit" means in this business

**This was not written down anywhere, and its absence has already cost a review cycle.** Phase 2's
Gate A raised **M1** as a MAJOR defect: a receipt allocated to a proforma both reduces that proforma's
outstanding **and** adds the full receipt amount to `customer_credit_balance.available_credit`, and
`hold_credit` can then commit that same amount to a different order. Measured: 62,200,000 →
61,200,000 outstanding, 0 → 1,000,000 available, `hold_credit(1,000,000)` succeeded.

**The owner has explained the model, and the behaviour is correct.**

Credit in AfraKala is a **revolving limit**, not a wallet. A proforma can only be finalised if the
customer has either paid or has credit available. Finalising **consumes** the limit — a
200,000,000 limit becomes 150,000,000 when 50,000,000 is committed. Paying that 50,000,000
**restores** the limit to 200,000,000. So a receipt that raises available credit is **releasing a
limit that was consumed, not creating money**. Read as a wallet the figure looks double-counted; read
as a limit it is exactly right.

**The reviewer was not wrong to raise it.** Nothing in the repository stated the model, and under the
wallet reading the measurement is a genuine double count. That is why this section exists: the next
reviewer must not have to rediscover it, and must not "fix" it.

## The caveat — open, and not to be closed quietly

**This is only correct if the symmetry holds.** Every finalised proforma must consume limit, and every
payment must release **exactly** the amount that was consumed. If a finalisation ever fails to
consume, or a payment releases more than was held, the revolving-limit reading stops protecting
anything and the double count becomes real.

**Gate A measured the release half only.** It proved that a receipt raises `available_credit` and that
`hold_credit` can then spend it. **The hold half is unmeasured** — no test has shown that finalising a
proforma consumes the limit by the matching amount, and Gate A's own census found that
`customer_credit_ledger` holds **only** `payment` rows: nothing in the system's history has ever held,
released or consumed credit. So the mechanism that makes the model correct has never been exercised.

**The symmetry must be verified before OG-17 is closed.** OG-17 therefore stays **OPEN**, with a
changed question — not *"is this behaviour wrong"* but **"is the hold/release symmetry actually
maintained"**. The owner has confirmed the intended model; what is unconfirmed is whether the
implementation keeps to it.

---

OG-1: CONFIRMED 2026-08-18 — A1, A2, A3, A4 approved by owner.
OG-2: CONFIRMED 2026-08-18 — owner authorised dropping trg_payment_receipts_post_journal and post_receipt_journal.
