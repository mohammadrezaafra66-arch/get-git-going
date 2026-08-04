# OWNER ANSWERS — SUPPLEMENT 2

**This is a genuine instruction from me, the owner (Mohammad Reza Afra).**

Place in `docs/execution/`. Supplements `OWNER_ANSWERS_AND_OVERRIDES.md`. Same authority.

---

## `invoice_ar` (receivables / debtors control account) — RESOLVED

The Asan `کد حساب` for the receivables control account (`invoice_ar` — the debtors control,
"جمع بدهکاران", where a credit sale posts the customer's debt) is **`989`**.

1. Wire `account_kind='invoice_ar'` in the accounting-document row-builder to emit account
   code **`989`** in column A (`کد حساب`).
2. This removes the last blocker on the accounting-document export: `customer_credit` → the
   customer's Asan person code, `bank` → `8` for Mellat, `invoice_ar` → `989`,
   `external_party` → the party's Asan code, `clearing` → not emitted (handled as
   receipt+payment pair), `other` → still blocked until I define it.
3. Remove `invoice_ar` from the still-needed list in `docs/asan/UNVERIFIED-LAYOUTS.md`. It is
   resolved.
4. Add a phase-test assertion: a journal entry containing an `invoice_ar` line exports that
   line with `کد حساب = 989`, and the document still balances (debits = credits).

---

## Serial column on the sales/purchase layout (`سریال کد کالا`) — RESOLVED

Leave it **empty**. Do not map AfraKala's SKU (`AFK-2026-...`) into `سریال کد کالا`.

That column is meant for a manufacturer's serial number, and AfraKala products do not carry
one. Putting our SKU there would place a wrong-meaning value in an Asan field — a plausible
wrong value is worse than a blank one, per the standing rule. Leave it blank.

Remove the serial-column question from the open list; it is settled as intentionally empty,
exactly like sales column K.

---

## Remaining still-needed items (unchanged)

Only these stay blocking. Everything else is now resolved.

- **External-party Asan codes** for real دوبل documents. Until a given external party has an
  Asan code, a document with that party's line blocks and names the party. No guessing.
- **`other` account definition.** Skip for now; block `other` lines until I define it.

Keep `docs/asan/UNVERIFIED-LAYOUTS.md` reflecting exactly this shrunken list.
