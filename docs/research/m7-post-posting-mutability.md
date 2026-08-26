# M7 — what is mutable after a document is posted, and by whom

**Date:** 2026-08-26 · **Mission:** M7 · **DOCUMENT ONLY — nothing was implemented** ·
production لمس نشد

The owner's standing instruction (OG-23) is: **no column lock now.** Document the current
state precisely; record the declared future direction; change nothing. That is what this is.

---

## 1. The headline: post-posting, UPDATE is completely unrestricted

Measured on the live catalogue, 2026-08-26.

**There is no column lock, and there is no posted-state lock either.** An `admin` or
`accountant` can change **any column** of a **posted** `payment_receipt`, `payment_voucher` or
`dual_document` — amount, party, date, bank account — and nothing in the database stops them.

The three triggers whose names suggest otherwise do not:

| Trigger | Fires on |
|---|---|
| `trg_payment_receipts_block_delete_when_posted` | **DELETE only** |
| `trg_payment_vouchers_block_delete_when_posted` | **DELETE only** |
| `trg_dual_documents_block_delete_when_posted` | **DELETE only** |

So the posted state is protected against **erasure** and not against **alteration**. A reader
skimming the trigger list would reasonably conclude a posted document is frozen. It is not.

This is worth stating plainly because it is the gap OG-23's future option (b) exists to close,
and because the *ledger* behaves the opposite way: `journal_entries` carries an immutability
trigger strong enough to block deletion even for a superuser (that is how OG-56's two stuck
rows came to exist). **The ledger is frozen; the documents that feed it are not.**

---

## 2. Who can update, exactly

| Table | UPDATE policy | Roles | Mode |
|---|---|---|---|
| `payment_receipts` | `pr_update_admin_accountant` | admin, accountant | PERMISSIVE |
| `payment_vouchers` | `payment_vouchers_update_finance` | admin, accountant | PERMISSIVE |
| `dual_documents` | `dual_documents_update_finance` | admin, accountant | PERMISSIVE |

Uniformly admin + accountant. `manager` can SELECT receipts but not update them; `sales` and
`viewer` reach none of these tables for writing.

**Column-level:** there are no column privileges in play — the policies are row-level and
grant the whole row. So "which columns are mutable" has a single answer today: **all of them.**

---

## 3. Three asymmetries found while measuring, recorded rather than acted on

These were not in the brief. None is an open door; each is an inconsistency that a later
reader would otherwise have to rediscover.

**(a) `viewer_restricted` guards only `payment_receipts`.** `payment_vouchers` and
`dual_documents` have no such RESTRICTIVE policy. It is **not** an open door — their
permissive policies already require admin or accountant, and a viewer-only account holds
neither. It would *become* one only if a future policy on those tables granted a broader role
without re-adding the guard. The receipts table has defence in depth here and the other two
do not.

**(b) `payment_receipts` has no DELETE policy at all.** DELETE is therefore denied to everyone
by RLS, and `trg_payment_receipts_block_delete_when_posted` is belt-and-braces on top of a
door that is already shut. Safe, and worth knowing before someone "fixes" the apparently
missing policy.

**(c) `payment_vouchers` has no INSERT policy.** Direct inserts are denied to every role, so
vouchers must be created through a `SECURITY DEFINER` function, which runs as its owner and
bypasses RLS. That is a legitimate pattern — it forces creation through vetted logic — but it
means the table's policy list understates how rows appear, and anyone auditing "who can create
a voucher" must read the function, not the policies.

---

## 4. The owner's declared future direction (recorded, NOT implemented)

**OG-23, option (b), to be revisited after Phase 7:** lock **amount** and **party** once a
document is posted; leave **status** open.

Recorded here so the eventual implementer inherits the reasoning rather than re-deriving it:

- **Status must stay open** because the document's lifecycle continues after posting —
  approval, settlement, cancellation all move status, and freezing it would freeze the
  workflow, not the record.
- **Amount and party are what the ledger consumed.** Changing either after posting makes the
  document disagree with the journal entry generated from it, and nothing currently detects
  that divergence.
- The natural mechanism is a `BEFORE UPDATE` trigger raising when `status = 'posted'` and
  `NEW.amount IS DISTINCT FROM OLD.amount` (likewise the party column), **not** column
  privileges — privileges cannot be conditional on a row's state.
- **Sequencing note:** the three existing `block_delete_when_posted` triggers are the obvious
  place to extend, and extending them is cheaper and less risky than adding three new ones.

---

## 5. What would make this measurable

There is currently **no gate** asserting anything about post-posting mutability, in either
direction. When option (b) is implemented, the honest gate is two-sided:

- **CLOSED** — an accountant cannot change the amount of a posted document.
- **OPEN** — an accountant *can* still change its status, and *can* still change the amount of
  a **draft** document, so the lock is proven to bite only where intended.

Asserting only the refusal would pass equally well against a table nobody can update at all.
