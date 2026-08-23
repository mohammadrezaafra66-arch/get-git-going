# Locked ledger decisions

Two classes of decision. **Owner decisions (T1–T14)** were made by the owner and are not reopenable.
**Architecture decisions (A1–A4)** were taken by the execution architect from the options in the
roadmap; they become binding once OG-1 is answered.

**T9–T12 were added on 2026-08-18**, after phase 2 closed. **T13 was added on 2026-08-19**: it adopts
the T9 research's recommendation **(b)**, records the four constraints binding on phase 3, and closes
the production-count question **by decision rather than by contacting production**. The same research
corrected two claims inside T9 itself and replaced Part 4's "unmeasured caveat" with a measurement —
each correction is marked in place with its date. **T14 was added on 2026-08-19**: it answers
**OG-19** by deciding that the ledger records money movements only — purchases and sales do not post
— which makes the one-sided accumulation in `supplier_payable` and `customer_credit` intended rather
than defective, and places a binding constraint on what phase 5 may call a balance. T9 and T10 contradict what the current
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
their true position spread across two of them, and **no single figure is correct**.

> **Corrected 2026-08-19 (T9 research).** This paragraph originally continued: "This is the same root
> cause as the already-recorded finding that `person_settlement_position` returns misleading numbers."
> **That was wrong, and the two problems must not be conflated.** The research read the function body
> from the live catalogue: its sign convention is correct, and its numbers are misleading because
> **nothing ever debits `customer_credit`** — there is no sales posting path at all — so a customer who
> has only ever paid reads as a party *we* owe. **Resolving T9 would leave that untouched.** The two
> have been discussed as one throughout this programme, and fixing the wrong one would look like
> progress without being progress. See Part 4 § *Two problems that are not one*.

*What already exists:* `persons` and `person_identifiers` are in place, and `customers.person_id` and
`suppliers.person_id` are **both `NOT NULL`** — so every customer and every supplier already has a
file. The identity layer is not the missing piece; the balance layer is.

> **Corrected 2026-08-19 (T9 research) — the identity layer is *more* complete than this assumed.**
> T9 was recorded anticipating that `external_parties` might lack a `person_id`, and that this would
> be "the gap". **It is not a gap: `external_parties.person_id` exists and is `NOT NULL`**, measured
> from `information_schema.columns`. **All three** role tables carry a `NOT NULL person_id`, so every
> one of the three account kinds already resolves to a person in a single join. Further,
> `person_fk_registry_report()` returns **29** persons-referencing foreign keys, **every one**
> `exists_as_fk = t`, `in_registry = t`, `verdict = ok` — and every document table
> (`purchases`, `payment_receipts` twice, `payment_vouchers`, `sales_quotes`, `delivery_receipts`,
> both credit tables) already carries its own denormalised `person_id`. **`journal_lines.account_ref_id`
> is the only place in the measured surface where a person is reached through a role row rather than
> directly.** This is good news: the work T9 implies is narrower than T9 assumed.

~~**Scope unmeasured. Do not build on this yet.**~~ **Superseded 2026-08-19 — the scope was measured
and T9 is adopted as (b). See T13.** The research mission this paragraph demanded was run
(`docs/research/T9-one-person-one-balance-RESEARCH.md`, merged as `bc0ddafc`), and phase 3 is
unblocked **subject to the four constraints recorded in T13**. T9 itself must still be resolved
before phase 5.

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

**Amendment 2026-08-19 — owner, same day as OG-21 closed.** The four roles above are unchanged.
What this decision did not record, and which caused OG-21:

* The record-only class exists for **evidentiary** reasons, not accounting ones. A year later a
  party may claim the slip was for a different amount. Everything on the slip must be enterable:
  transferrer name, recipient name, date, tracking number, banks, account numbers. AfraKala does
  not know those people; they have no file, no Asan code, no balance, no journal line.
* Those fields are **optional**, because slips vary. Some carry the names; some do not. Omitting
  them must succeed.
* **صراف / واسط / شخص ثالث / نفر سوم / طرف سوم name the same record-only class.** The owner used
  different words in different places. They are never account holders. There is **no fee**.
  Task 4.6's old Accept (three lines when a fee is charged) is retired. The contract's
  `p_intermediary_id` gap noted above was closed by phase 4 as transferrer/recipient columns, then
  the remaining fee columns were dropped by migration 362.

## T12 — The boundary between a plain receipt and a dual document
* money reached us **and stayed** → **plain receipt**
* money reached us **and went straight out** to someone else → **dual document**

## T13 — T9 is adopted as (b); the production count is not required
The T9 research (`docs/research/T9-one-person-one-balance-RESEARCH.md`, merged as `bc0ddafc`)
measured the scope and recommended **(b)** — *phase 3 may proceed, but must be written so it does not
deepen the split*. **Recommendation (b) is adopted.**

The research was **right to flag** that its confidence in (b) over (c) rested on one number it could
not measure: how many persons on **production** are both a customer and a supplier. **That gap is
closed by a decision, not by a measurement.**

*The owner's answer:* the count is low today and **will grow**, because being both a customer and a
supplier is **part of this business's model, not an anomaly**.

*Why that settles it — the reasoning matters more than the number, and is recorded so the question is
not reopened:*

1. **The count was only ever a proxy** for one thing: whether the contradiction is realised today or
   latent. The owner's answer makes the model explicit, which is a **stronger** answer than any count
   — a count tells you about today, the model tells you about every tomorrow.
2. **The practical decision is identical either way.** `journal_entries` holds **1 row** and
   `journal_lines` **2**. No affected person has a ledger line, *regardless of how many of them there
   are*. The contradiction stays **latent at any count**.
3. Therefore **CLAUDE.md rule 10 stands unweakened**: production (`192.168.170.10`) is **not queried,
   not pinged, not contacted** — outside phase 9, for this or any other question. A question that
   would only have confirmed a decision already made is not a reason to touch the company's real
   records.

### The four constraints phase 3 must respect — binding

The research states these as measured constraints. They are binding on phase 3.

1. **No new `account_kind` → table mapping.** `validate_journal_line_ref`'s `CASE` has **6** mapped
   kinds; phase 3 needs **0** new ones.
2. **Resolve the party to a `person_id` at the boundary and store it.** `payment_vouchers` already has
   `payee_person_id`, already registered in the person-FK registry — populating it **costs nothing**
   and makes the line re-keyable when T9 is resolved.
3. **Do not copy `pay_purchase_with_voucher`'s unconditional supplier keying.** It posts
   `('supplier_payable', _purchase.supplier_id)` **regardless of payee type**, including when the
   payee is an `external_party`. That is the exact failure **T10** forbids, and phase 3 must not write
   it fresh into the one function **A4** designates as where the rule holds for every caller.
4. **T9 must be resolved before phase 5.** `asan_list_journal_export` and
   `person_settlement_position` both read all three kinds, and **phase 5 is where they become the
   accountant's numbers**.

*Why phase 3 is the hinge:* `supplier_payable` has **never been written** — `payment_vouchers` is
empty, so `pay_purchase_with_voucher` has never run. The split is cheap to change now *because* it is
empty, and `create_payment` is the function that stops it being empty. Constraint 2 is what keeps it
cheap.

## T14 — The ledger records money movements only
`journal_entries` records **money movements** — receipts, payments, dual documents, settlements. It
does **not** record the obligations that caused them. A purchase does not post. A sale does not post.

**This is a scope decision, not a defect resolution.** It settles a question that has been open since
before phase 0, and it is the answer to **OG-19**. The owner will complete the purchase and sales
side later, **separately from this programme**.

### What follows from it, stated plainly so a later reader does not file it as a bug

* `supplier_payable` accumulates **debits with no credits** — a payment lowers what we owe, and
  nothing ever raised it, because the purchase that created the debt was never a ledger event.
* `customer_credit` accumulates **credits with no debits** — the mirror image, for the same reason.
* **This is by design. It is not an absent counter-posting and it must not be "fixed".**

Therefore **`person_settlement_position` and every ledger-derived balance shows money moved, not the
party's full position.** The party measured by the T9 research — 13,000,000,000 Toman of received
purchases — reads `balanced`, because the purchase was never a ledger event. **That figure is correct
for what it measures and wrong for what its name suggests.**

*This also confirms two earlier judgements, which stand:* phase 3's contradiction **C5** and its
refusal to invert the sign convention were both **right**. The convention was never inverted, three
functions still agree, and the one-sided accumulation those functions read is now confirmed as
intended rather than defective.

### The constraint this places on phase 5 — binding

Phase 5 is where these numbers reach the accountant.

> **No phase-5 export or report may present a ledger-derived figure as a party's total balance or
> total debt.** Name it for what it is — money moved through the ledger — not a position.
>
> If a phase-5 task requires a party's **full** position, that task must **raise an Owner-Gate**
> rather than sum the ledger and hope.

A ledger-derived total labelled "بدهی" or "مانده" would be wrong by an amount nobody can bound, and
it would be wrong silently, because the arithmetic is correct.

### What T14 does NOT resolve — open and unassigned

**T9** says a person has one file and one balance. **T14** says the ledger holds only part of that
balance. **Where the complete figure comes from is not decided.** A report combining `sales_quotes`,
`purchases` and the ledger is one possibility; there are others; none is chosen here.

The owner has **deferred this explicitly**, along with the purchase and sales work. It is recorded as
**open and unassigned** — no phase owns it, and this decision deliberately proposes no design for it.

## T15 — What the Asan file may contain (owner 2026-08-19)

The ledger holds every posted money movement. **The Asan export does not.** Some documents are
entered into Asan by hand. Anything with a manual path is **absent from the file entirely** — never
shown with a zero amount, an empty line set, or a partial row (Gate A M3 was that failure).

| Branch | To Asan |
|---|---|
| Bank | **automatic**, via the journal export |
| Cash | **manual** — excluded from the bank-deposit export by migration 350 |
| Cheque | **manual** — excluded from the journal export by migration 367 |
| Reversal | **manual** — both legs excluded by migration 367 |

A document exported *before* it was reversed is already in the accountant's books. Removing it from
a later file does not undo that; the owner's manual path does. Exclusion is not a correction
mechanism.

**Binding on any later export:** if a new document type has a manual Asan path, it is omitted from
the file the same way. Do not invent a blocked/empty row for it.

D8 originally said skip cheque *lines*. This rule supersedes D8 for the export; D8 is amended in
place in `decisions.md`.

## OG-22 — who may reverse a posted document (interim)

**Answered 2026-08-19:** reversal is limited to `accountant` and `admin`. `manager` is excluded.
Implemented in migration **365**.

**This is a deliberate interim position, not the final architecture.** The owner stated that access
control will be built properly in a **separate, dedicated phase**, where permissions for every
module are set by role. The future access-control phase must treat the `reverse_document` role
array as a **decision to revisit**, not as a fixed constant. Create remains the wider OG-13 set
(`admin`, `accountant`, `manager`); only reversal was narrowed.

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

## The caveat — measured 2026-08-19. The holding half was never built.

The model above is correct **only if the symmetry holds**: every finalised proforma must consume
limit, and every payment must release exactly what was consumed.

> **This section previously read "the hold half is unmeasured" and asked for the symmetry to be
> verified. It has now been measured** (T9 research, `bc0ddafc`), and the answer is not a degree of
> compliance — **one side of the symmetry does not exist.**

| Half of the model | Built? | Evidence, from the live catalogue |
|---|---|---|
| **Check** — a proforma may only be finalised if credit is available | **yes** | `create_sales_quote_with_items` calls `get_customer_dynamic_credit` and compares `available_credit` against the quote total. It runs in anger: **6** `credit_limit_blocked` rows in `audit_logs`. |
| **Hold** — finalising consumes the limit | **NO** | `hold_credit` has **zero** SQL callers and appears in `src/` **only** in the generated `src/integrations/supabase/types.ts`. All **11** `customer_credit_balance` rows have `held_credit = 0.00`, and **0** rows hold anything. **None of the 9 `sales_quotes` triggers touches credit.** `create_sales_quote_with_items` writes a `_credit_snapshot jsonb` but never calls `hold_credit`, never writes `held_credit`, never writes `customer_credit_ledger`. |
| **Release** — paying restores the limit | **yes** | `increase_credit`, called by `create_receipt` and `post_receipt_accounting`. |

**So the system checks the limit, never reserves against it, and then releases against it on
payment.** `release_credit` and `hold_capital_allocation` are equally unreachable — zero callers in
SQL, generated types only in `src/`.

This does **not** make the owner's model wrong. It makes it **half-implemented**: the intent is a
revolving limit, and what exists is a gate with nothing behind it. Because nothing is ever consumed,
`available_credit` today behaves as a monotonically increasing total of receipts — which is exactly
what a wallet reading would predict, and why Gate A's M1 measurement looked like a double count.

**OG-17 stays OPEN, with its question restated a second time.** It is no longer *"is this behaviour
wrong"*, and no longer *"is the hold/release symmetry actually maintained"*. It is:

> **Given that the hold half was never built — should it be built, and if so, in which phase?**

**Not answered here.** That is a decision about what the business wants the limit to do, not a
measurement.

## Two problems that are not one

Recorded because they have been discussed as one throughout this programme, and **fixing the wrong
one would look like progress without being progress.**

**`person_settlement_position` returns misleading numbers because nothing ever debits
`customer_credit`** — there is no sales posting path at all — **not because the three-account split
exists.** Its sign convention, read from the live body, is correct: `receivable = SUM(debit − credit)`
on `customer_credit`. A receipt *credits* that account, and the offsetting *debit* would come from
posting a sale. No such posting exists (`ground-truth.md` §1; `invoice_ar` is a control account with
no writer). So a customer who has only ever paid reads as a party **we** owe — Gate A check 14,
`receivable=-8827000 payable=0 net=-8827000 direction=we_pay`. **Resolving T9 would leave this exactly
as it is.**

## The gap that is larger than the split, and that no phase owns

**No balance a user can see comes from the ledger.** Measured across every balance reader:

| Reader | Actually reads | Reads `journal_lines`? |
|---|---|---|
| `vw_account_balances` | `payment_receipts` + `payment_vouchers` + `bank_accounts` | **no** |
| `vw_customer_receivables` | `sales_quotes` + `payment_receipt_links` | **no** |
| `vw_supplier_payables` | `purchases` | **no** |
| `get_payables_summary` / `_list` / `_detail` | `vw_supplier_payables` | **no** |
| `customer_credit_balance` / `_ledger` | their own tables | **no** |
| `person_settlement_position` | `journal_lines` | **yes — 1 of 6** |

`journal_entries` holds **1** row and `journal_lines` **2**, having ever used **2 of 9** account
kinds, against **101** purchases, **57** sales quotes and **7** receipts. The consequence, measured:
`get_payables_summary()` reports **50,530,370,424.94 Toman outstanding across 101 items** while
`person_settlement_position` reports every person `balanced` — including one party carrying
**13,000,000,000 Toman** of received purchases.

**This gap is larger than the three-account split, and no phase currently owns it.** Stated as a fact
for the owner to place; **not assigned to a phase here.**

---

OG-1: CONFIRMED 2026-08-18 — A1, A2, A3, A4 approved by owner.
OG-2: CONFIRMED 2026-08-18 — owner authorised dropping trg_payment_receipts_post_journal and post_receipt_journal.

---

# Part 5 — Owner answers to the remaining missions' pre-flight questions

**Given 2026-08-23, all at once, before the missions ran.** They are recorded here rather than in
each mission's progress file because they span missions and because several of them **override the
fallback the execution brief had pre-declared**. Where they do, that is called out — an agent
reading only the brief would otherwise do the opposite of what the owner asked.

| Mission | Question | **Owner answer** | Brief's fallback | Same? |
|---|---|---|---|---|
| **M3** | may the last-purchase timestamp be public? | **No. Close the leak. Do not use the fallback.** | close it | ✅ same, but now a decision |
| **M4** | should signed-in roles keep the wider view, or fall back to base-table RLS? | **Do not change what signed-in roles currently see. Fix only the NULL-uid fail-open.** | change nothing for signed-in access | ✅ same |
| **M5** | may `/api/public/products` publish prices? repair the sale-list page? | **Publish nothing. Repair nothing now. Measure and report only.** | publish nothing, repair nothing | ✅ same |
| **M1** | does the attachment precede the document? must OCR pre-fill before submit? | **Attachment comes BEFORE the document. OCR must pre-fill the form before submit. Do not use the fallback.** | create-then-attach | ❌ **OVERRIDDEN** |
| **M2** | what is the canonical mobile format? | **Do not rewrite stored identifiers. Search must normalise all three forms: `09121234567`, `9121234567`, `+989121234567`.** | normalise at the query boundary, change no stored data | ✅ same — and now explicit about all three forms |
| **M7** | which columns freeze on a posted document? | **Freeze nothing now. Document precisely which columns are mutable by whom.** | freeze nothing, document | ✅ same |
| **M11** | should `hold_credit` be built? | **Build it and activate it. Reserve on quote finalise/create, release on payment or cancellation. Do not use the fallback.** | build nothing, write up the measurement | ❌ **OVERRIDDEN** |
| **M12** | reset the serial each Jalali year? rename the module? | **Do not reset the serial. Do not rename the module.** | change neither | ✅ same |

## The two that override the brief, and what changes because of them

### M1 — attachment before document

The brief's fallback was create-then-attach, chosen because it needs no schema change. **The owner
refused it.** So M1 must actually resolve the ordering contradiction rather than route around it:

`document_attachments.document_id` is `NOT NULL` behind a `BEFORE INSERT` existence trigger
(`validate_document_attachment_ref`), and all three RPCs raise `0A000` when `p_attachment_ids` is
non-empty — precisely because an attachment row cannot precede its document today. Honouring the
owner's answer means changing that: a nullable `document_id` with a later binding step, a staging
table, or an RPC that takes the storage path instead of an attachment id. M1's phase 0 design study
still runs, but its **conclusion is constrained** — the option it selects must put the attachment
first, and "we could not, so we did create-then-attach" is no longer available.

~~The upload leg still needs a Secure Context and OG-5 is still unanswered. That does not change: the
ordering work is database and RPC, and it proceeds; the browser upload leg stays `[U]`.~~

**Corrected 2026-08-23, and this is a consequence of the owner's own answer that I got wrong when I
first wrote it down.** If the attachment must come **before** the document, then the attachment must
be uploaded before the document exists — and an upload is a browser upload, which needs a Secure
Context. **So the whole of M1 now sits behind OG-5, not just its upload leg.** There is no
database-and-RPC half that can proceed alone: relaxing the ordering constraint without a working
upload path would ship a schema change nothing can exercise. M1 does not start until OG-5 lands.

### M11 — build `hold_credit`

The brief's fallback was to build nothing and write up the measurement. **The owner refused it.**
Measured state, from Part 4 of this file: CHECK is built and running, RELEASE is built and running,
**HOLD was never built** — `hold_credit` has zero SQL callers, all 11 `customer_credit_balance` rows
have `held_credit = 0.00`, and none of the 9 `sales_quotes` triggers touches credit. So the system
checks the limit, never reserves against it, then releases against it on payment.

The owner's answer closes that loop: reserve when a sales quote is finalised or created, release on
payment or cancellation. This makes M11 a build mission rather than a measurement mission, and it
stays last in the order — after Phase 8 — because it changes what the credit limit *does*, and the
sales side is being completed separately.

**A prerequisite the owner added on 2026-08-23, and it comes before any `hold_credit` code is
written:** `increase_credit` already runs on the release side today. **Prove there is no
double-release path first.** If release fires both on payment and on some other event that already
calls `increase_credit`, then adding a hold would turn a currently-invisible double-release into a
visible over-restoration of the limit. That proof is M11's phase 0 and it produces no code.

M11's summary-table row is therefore: **1 gate, 2–3 items, depends on Phase 8.**

## Two things these answers do not change

**OG-4 is still open.** M2's answer settles the *search* behaviour — normalise all three forms, touch
no stored data — but the owner has not named a canonical stored format, which is what OG-4 asks. The
gate stays open and task 6.7 may still be ticked on the search acceptance alone.

**Nothing here authorises production.** OG-6 is untouched and phase 9 remains `DO NOT EXECUTE`.

## An additional M2 requirement, beyond the pre-flight question

The owner also specified, in the same message, that the customer/party search must support:

- first name
- last name
- city
- Asan code
- mobile number

**not identifier-based lookup alone.** That is a widening of task 6.7, not a restatement of it.

Measured 2026-08-23, `src/features/ledger-wizard/lookup.ts` does an **exact-match** lookup: it calls
`person_find_by_identifiers`, and otherwise selects `id, display_name` by exact identifier. There is
no name search, no city search and no partial matching anywhere in that path. So M2 is larger than
"wire up what exists" — it must add a real search surface, and its phase 0 must measure what
`persons` actually holds (`display_name`, and whether a city column exists on `persons` or only on a
related table) before designing it.

This does not change the two constraints the owner set alongside it: **no stored identifier is
rewritten**, and all three mobile forms must resolve.
