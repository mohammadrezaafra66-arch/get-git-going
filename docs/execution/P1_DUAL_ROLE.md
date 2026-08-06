# P1 — DUAL ROLE FOUNDATION

Read `docs/execution/UNIFY_MISSION_CONTROL.md` and `docs/asan/final-architecture-plan.md`.
This mission is built on that plan's Part 6 execution order — not on a re-derivation.

Goal: make it possible for one person to be both customer and supplier, with phone as the
identity key, and the two dropdowns still working.

Five phases.

---

## Phase 1.1 — Auto-create suppliers row from context link (build the trigger)

The final architecture plan identified this as Step 1 of Part 6.

When someone adds a `context_kind='supplier'` link to a person via
`person_context_links.insert`, the system today does NOT create a matching `suppliers` row.
The person becomes a "supplier by label" that is invisible to every purchase form. Fix at
the trigger layer per rule 2.5 — a bare `PATCH` must not bypass this.

1. Read the current shape of `person_context_links` live. Confirm the columns and any
   existing triggers via `pg_get_triggerdef`.
2. Write a trigger: `AFTER INSERT ON person_context_links WHEN NEW.context_kind = 'supplier'`.
   - If no `suppliers` row exists for `NEW.person_id`, insert one, copying `display_name`
     and phone from `persons`.
   - If a `suppliers` row already exists for that person, do nothing (idempotent).
   - Same for `context_kind='customer'` → `customers` row.
3. Run it retroactively: for every existing `person_context_links` row where the mirror
   doesn't exist yet, create the mirror. This heals any garbage still lurking.

**Test (real JWT via PostgREST, not UI):**
- Create a fresh person via API.
- Insert a `context_kind='supplier'` link via direct PostgREST `PATCH`.
- Assert a `suppliers` row now exists for that person.
- Simulate the purchase form's dropdown query. Assert the person appears.
- Insert another `context_kind='supplier'` link for the same person. Assert **no duplicate**
  suppliers row is created (idempotent).
- Clean up.

Commit.

---

## Phase 1.2 — Wire the phone-first person search into creation forms

`person_upsert_by_mobile` exists (final architecture plan Part 5). No form calls it.

1. Read `person_upsert_by_mobile` live via `pg_get_functiondef`. Confirm its signature and
   behavior: given a normalized phone, return the existing person if found, else create
   and return.
2. Identify every creation flow that should call it first. From the previous diagnostics
   these are known:
   - `/suppliers` → `+ تأمین‌کننده جدید` button
   - `/customers` → `+ مشتری جدید` button
   - `/persons/create`
   - `/purchases/create` inline supplier creation modal
   - `/sales/quote/create` inline customer creation modal (if it exists — verify)
3. For each, change the flow: when the user enters a phone, call `person_upsert_by_mobile`
   first. If a person is returned:
   - Show them: name, existing roles, city, last activity.
   - Ask: "این همان شخص است؟ می‌خواهی نقش <role> هم به او اضافه شود؟"
   - On confirm, just insert the context link. Do not create a new person.
4. If no person is returned, proceed with the current creation flow.

**Test:**
- Create person A with phone `09121234567`.
- From `/suppliers`, try to create a person with the same phone. Assert the confirmation
  UI appears and shows person A.
- Confirm. Assert person count did not grow. Assert person A now has both a customer and
  supplier row (or whichever new role was added).
- From `/suppliers`, create a person with a genuinely new phone. Assert normal creation
  path.
- Clean up.

Commit.

---

## Phase 1.3 — Fix the `/persons/all` role display

Deeper diagnostic report showed the "همه‌ی اشخاص" page reads roles from
`customers`/`suppliers` mirror rows, not from `person_context_links`. This is inconsistent
with the identity model now that context links create the mirrors.

Actually — with 1.1 done, mirrors and context links are always in sync going forward.
Historically may not be. Verify current agreement:

1. Query: for every person, does the presence of a `context_link='supplier'` equal the
   presence of a `suppliers` row? Same for customer.
2. Report drift. If any, fix it by writing missing links or missing mirrors (whichever is
   behind). Do this in a migration.
3. Once in sync, either approach shows correctly. Pick the source: the context link, since
   it is the semantic label. Update the `/persons/all` component to read from context links.
4. Ensure a person with BOTH roles shows BOTH badges, not just one.

**Test:**
- Create a person with only a customer link. `/persons/all` shows badge "مشتری".
- Add a supplier link. Assert BOTH badges show.
- Clean up.

Commit.

---

## Phase 1.4 — Add mutual-role indicator to person detail pages

For a person with both roles, the detail page should be clear about it.

1. On the person detail page (`/persons/$personId`), add a section labeled "نقش‌ها" that
   lists every context_kind. If the person has both customer and supplier, both are visible
   with a clickable link to their respective role-specific views.
2. On the supplier detail page (`/suppliers/$supplierId`), if the underlying person is also
   a customer, add a link "این شخص مشتری شما هم هست →" pointing to the customer view.
3. Same the other way for the customer detail page.

**Test:**
- With a dual-role person from phase 1.2, visit their `/persons` detail. Assert both roles
  listed.
- Visit their supplier detail. Assert the "customer too" link appears.
- Same for customer detail.
- For a single-role person, assert no cross-link appears.

Commit.

---

## Phase 1.5 — Ensure Asan code is one-per-person

Rule from the plan: one Asan code per person, ever, regardless of roles.

1. Check the current partial unique index on `person_identifiers` for `kind='asan_person_code'`.
   Report its definition. If it does not already enforce one-per-person across all statuses,
   tighten it.
2. Confirm no legacy `customers.accounting_code` or `suppliers.accounting_code` disagrees
   with the `person_identifiers` row for the same person. Report drift. Reconcile if any:
   the `person_identifiers` row is the source of truth; the mirror columns follow.
3. Add a trigger on `person_identifiers` for `kind='asan_person_code'` inserts/updates that
   propagates the new code to `customers.accounting_code` and `suppliers.accounting_code`
   if those mirror columns exist. (P2 will add the missing supplier column — for now, only
   propagate to whatever exists today.)

**Test:**
- Create a dual-role person.
- Set their asan_person_code via `person_identifiers` insert.
- Assert `customers.accounting_code` reflects it (if the mirror column exists today).
- Attempt to insert a second `asan_person_code` for the same person. Assert rejection.
- Attempt to insert the same code for a different person. Assert rejection.
- Clean up.

Commit.

---

## MISSION GATE

1. `npm run typecheck` = exactly 70.
2. Clean tree. Everything committed.
3. Build, deploy, three signals match `HEAD`. `docker restart afrakala-lan-rest`.
4. Full e2e vs baseline. Any new red is yours.
5. New specs:
   - `e2e/unify/dual-role-trigger.spec.ts`
   - `e2e/unify/phone-first-creation.spec.ts`
   - `e2e/unify/asan-code-unique-per-person.spec.ts`
6. Update `unify-progress.md`.
7. **Immediately proceed to `docs/execution/P2_ASAN_CODE.md`.**
