# Task 6.7 / M2 — party search: what already exists, and the one thing that does not

Phase 0 audit, measured on 2026-08-26 for mission 9 of the chained execution (branch
`feature/m9-party-search-audit`). **Nothing was built.** v8 orders a real code read first,
and the read settles a question that has been carried as `[U]` since 2026-08-25.

---

## 1. The `[U]` v8 asked to settle — REFUTED at the argument level

v8: *"whether `src/features/ledger-wizard/lookup.ts` passes the Asan code to
`person_find_by_identifiers` or only the mobile — an earlier (unverified) report claimed
only the mobile is sent; confirm against the real file."*

**The Asan code is passed, and it is tried FIRST.** `lookup.ts:81-84`:

```ts
(await identifierPerson("asan_person_code", query)) ??
(await identifierPerson("mobile_e164", query)) ??
(await findByIdentifiers("asan_person_code", query)) ??
(await findByIdentifiers("mobile_e164", query));
```

Four paths, Asan code before mobile in both halves. The earlier report was wrong.

**And the RPC honours the kind** — this is the argument-level half the previous session
recorded as unmeasurable from a cloud container. `person_find_by_identifiers` loops the
array, reads `_kind`, normalises with `normalize_identifier(_kind, …)` and matches on
`kind = _kind AND value_normalized = _norm`. It is not mobile-only in any sense:

```
_kind := _e->>'kind';
_norm := public.normalize_identifier(_kind, _e->>'value_raw', false);
SELECT pi.person_id INTO _hit FROM public.person_identifiers pi
 WHERE pi.kind = _kind AND pi.value_normalized = _norm AND pi.status <> 'revoked'
```

It also grades matches: `national_id_ir`, `tax_id_ir`, `company_reg_id_ir` and `iban` are
**strong**, everything else weak. **`[U]` closed.**

## 2. Name / Asan code / mobile search is BUILT *and* WIRED

`search_visible_persons(p_query, p_limit, p_offset, p_kind, p_context_kinds,
p_active_status, p_missing_identifier_kinds)` exists (migration 299, SECURITY INVOKER) and
is already called from two places:

```
src/lib/persons/functions.ts:482   supabase.rpc("search_visible_persons", …)
src/routes/_app.persons.tsx:201    supabase.rpc("search_visible_persons", …)
```

It searches `display_name` and `legal_name`, and normalises the query into identifier forms
before matching `person_identifiers` on **`mobile_e164`, `national_id_ir` and
`asan_person_code`**. It returns `matched_by`, so the UI can say *why* a row matched, and it
supports context filters, active-status filters and a missing-identifier filter.

So three of v8's five search fields — **name, Asan code, mobile** — are done, wired and in
production use on `/persons`.

**Mobile normalisation is consistent with OG-4**, measured rather than assumed:

```
       kind       | rows | plus98 | national_0 | bare9
------------------+------+--------+------------+-------
 mobile_e164      |   34 |      0 |         34 |     0
 asan_person_code |   15 |      0 |          0 |     2
```

All 34 stored mobiles are the leading-zero national form; **zero** `+98`, **zero** bare-9.
The `kind` is *named* `mobile_e164` while the values are national — a naming legacy, not a
defect, and the lookup queries that same kind, so it matches.

*(The two `asan_person_code` values beginning with `9` are codes, not phone numbers.)*

## 3. What is NOT built: `city` — and it is not a missing column, it is a modelling question

v8 says search must match *"name, surname, city, Asan code, mobile"*. **The person core has
no city at all:**

```
persons columns matching name/city ->  display_name, legal_name     (no city)

every city column in the database:
  customers.city
  suppliers.city
```

City lives on the **role** tables, not on the person. And CLAUDE.md's phase rule is explicit
that *any customer, supplier, account party … belongs to Phase 2: unified persons core — do
not create separate person systems.* So adding city to person search is one of:

- **(a)** join `search_visible_persons` out to `customers`/`suppliers` for the city — makes
  the person search depend on role tables, which is the direction the phase rule pushes
  against;
- **(b)** put city on the person core (a migration, and Phase 2 territory);
- **(c)** leave city out of party search.

None of these is a "conservative default" an agent may pick: (a) and (b) both change the
data model's direction, and (c) knowingly under-delivers the stated requirement.

**"Surname" is the same shape of question, smaller.** `persons` carries `display_name` and
`legal_name` and no separate surname field, so surname search is whatever
`display_name`/`legal_name` matching already gives. Whether that satisfies the requirement
is the owner's call.

## 4. The one actionable, non-gated gap

**The ledger wizard searches more narrowly than the persons page does.** `lookup.ts` matches
only `asan_person_code` and `mobile_e164` by exact identifier; it never calls
`search_visible_persons`, so it cannot find a party by **name** at all.

That is the "built but never wired" pattern (A1.5) in its usual form: the richer search
exists and one surface does not use it. Wiring the wizard to `search_visible_persons` would
give it name matching for free.

It is **not** done here, for one reason worth stating: it changes what the ledger wizard
matches on a live business surface — a name search can return several parties where an
identifier search returned exactly one, and the wizard's `pickKind` logic currently assumes
a single hit. That is a behaviour change requiring its own gate, not a drive-by.

Also noted, not acted on: `identifierPerson()` matches `value_raw` while the RPC matches
`value_normalized`. That is why both are tried — the raw path is exact, the normalised path
catches a differently-formatted input. Belt and braces rather than a defect.

---

## 5. Raised as OG-66

| question | why an agent must not default it |
|---|---|
| Should party search match **city**, and if so from where — a join to `customers`/`suppliers`, or a city on the person core? | The person core has no city; city exists only on the role tables. Both routes change the data model's direction, and CLAUDE.md's phase rule pushes against role-table dependence in the person core. |
| Does **surname** search mean anything beyond the existing `display_name`/`legal_name` matching? | There is no surname column. |
| Should the **ledger wizard** be wired to `search_visible_persons` so it can find a party by name? | It changes what a live business surface matches, and the wizard's single-hit assumption would need a gate. |

**Nothing was built and no `src/` or database object was changed by this audit.**
