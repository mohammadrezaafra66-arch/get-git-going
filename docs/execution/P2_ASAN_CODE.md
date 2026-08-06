# P2 — ASAN CODE ON SUPPLIERS

Read `docs/execution/UNIFY_MISSION_CONTROL.md` and `docs/asan/final-architecture-plan.md`.

Goal: give suppliers an Asan code so the purchase export unblocks. Three phases.

---

## Phase 2.1 — Add `accounting_code` column to `suppliers`

Symmetric with `customers.accounting_code`.

1. Migration adds `accounting_code text NULL` to `public.suppliers`.
2. Add a partial unique index on non-null values, scoped so two suppliers can't share.
3. Migration also backfills from existing `person_identifiers` where the linked person has
   an `asan_person_code`. Report how many suppliers were backfilled — expect 0 given the
   diagnostic finding that no supplier has a code today, but confirm.
4. Trigger on `person_identifiers` for `kind='asan_person_code'` inserts/updates now
   propagates to `suppliers.accounting_code` too (extend the trigger from phase 1.5).

**Test:**
- Column exists, is nullable, has partial unique index.
- Insert a duplicate non-null code → rejected.
- Two NULLs → both accepted.
- Set a person's asan code → `suppliers.accounting_code` reflects it if that person has a
  supplier row.
- `docker restart afrakala-lan-rest`. Column visible via PostgREST.

Commit.

---

## Phase 2.2 — Expose the Asan-code field on the supplier form

Symmetric with the customer form (which already has one — evidence at
`CustomerForm:42` per diagnostic report).

1. Locate the supplier edit form component. The diagnostic report identifies it as
   `SupplierForm` — confirm the exact file path live.
2. Add a text field labeled "کد آسان" placed near the top of the identity section (after
   name, before phone). Optional; empty is fine.
3. On save, write to `person_identifiers` (kind='asan_person_code') via the same path the
   customer form uses — reuse, don't duplicate.
4. On load, populate from `person_identifiers` for the linked person, not from
   `suppliers.accounting_code`. The mirror is a mirror; the identifier is the source.
5. Show a Persian help text under the field: "کد یکتای آسان برای این شخص. اگر خالی باشد،
   خروجی آسان این تأمین‌کننده را بلاک می‌کند."

**Test (real browser, deployed build):**
- Create a supplier via `/suppliers` with an Asan code.
- Reload. Assert the code shows in the field.
- Edit and change the code. Reload. Assert the change persists.
- Assert `person_identifiers` and `suppliers.accounting_code` and any customer mirror all
  agree.
- Attempt to enter a code already used by another supplier. Assert the form shows a Persian
  error.
- Clean up.

Commit.

---

## Phase 2.3 — Enter the 15 real supplier Asan codes (owner will do this by hand)

The owner supplies these values. This phase is preparation — the actual entering is manual.

1. Query all 15 suppliers. Produce a checklist file
   `docs/asan/supplier-asan-codes-to-fill.md` with one row per supplier: id, name, phone,
   current code (blank), and space for the owner to write it in.
2. Add a Persian banner to the `/suppliers` list page: "N تأمین‌کننده هنوز کد آسان ندارند"
   linking to the same list filtered by "بدون کد". Query dynamically so it goes to 0 as
   the owner fills them in.

**Test:**
- With 15 empty codes, banner reads 15.
- Enter one code manually via the UI. Reload. Banner reads 14.
- Clean up (revert the manual entry).

Commit.

**The owner will fill in the 15 codes himself after this phase lands. Do not attempt to
fill them.**

---

## MISSION GATE

1. `npm run typecheck` = exactly 70.
2. Clean tree. Committed. Built. Deployed. Signals match.
3. `docker restart afrakala-lan-rest`.
4. Full e2e vs baseline. Any new red is yours.
5. New specs:
   - `e2e/unify/supplier-asan-code.spec.ts`
6. Update `unify-progress.md`.
7. **Immediately proceed to `docs/execution/P3_SIDEBAR.md`.**
