# Person search Phase 2 — read-only audit

Date: 2026-08-05  
Branch: `feature/navigation-modernization`  
HEAD at audit start: `b03e57c2`  
Migration selected: **298**

## 1. Current query path

| Surface | Path today | What it searches |
|---|---|---|
| `/persons` list | Direct PostgREST `from("persons").or(display_name.ilike, legal_name.ilike)` | name + legal_name only |
| Picker (`CustomerPersonLink`) | ServerFn `searchPersons()` → same columns | name + legal_name only |
| Identifiers | Never queried for search from list | — |

List UX: debounce 350ms; filter applies only when trimmed normalized term length ≥ 2; otherwise full visible list with `count: exact`, `PAGE_SIZE=20`, `order created_at desc`.

`searchPersons` deliberately excludes identifier search (comment: existence-leak risk). That is correct for a naive join; this phase replaces it with an RLS-safe RPC.

## 2. Exact identifier kinds (code + live)

CHECK / `IDENTIFIER_KINDS` / `normalize_identifier` (mig 228 + 283):

| kind | Used in Phase 2 search |
|---|---|
| `mobile_e164` | yes — exact on `value_normalized` via `normalize_identifier(..., false)` |
| `national_id_ir` | yes — exact after normalize |
| `asan_person_code` | yes — exact after normalize (digits only, leading zeros stripped) |
| `landline`, `email`, `tax_id_ir`, `company_reg_id_ir`, `iban`, `custom` | no |

Live non-revoked counts (2026-08-05): `mobile_e164`=28, `asan_person_code`=11. No live `national_id_ir` rows today; kind remains valid and tested via fixtures.

Stored mobile form is **E.164** (`+989…`). Local `09…` form is for business phone columns (`normalize_phone_local`), not `person_identifiers`.

## 3. Current RLS

### `can_read_person` / `can_read_person_scoped` (264/265) — live verified

- Owner: `supabase_admin`
- `SECURITY DEFINER`, `search_path=public`
- `can_read_person_scoped(id, visibility_scope)` is the single rule (never reads `persons`)
- `can_read_person(id)` wraps it by resolving scope from `persons`
- Persons SELECT policy uses **scoped** form (INSERT…RETURNING safe)
- Child tables use **wrapper** form

Visibility + sales ownership (unchanged):

- `internal_general`: admin, manager, accountant, viewer; sales only via active `person_context_links` → `customers` with `responsible_id = auth.uid() OR NULL`
- `restricted_finance`: admin, manager, accountant
- `restricted_executive`: admin, manager
- `purchase_specialist`: still not granted (264 decision)

### Child policies

| Table | SELECT policy | Notes |
|---|---|---|
| `person_identifiers` | `can_read_person(person_id)` + **viewer_restricted** (281) | Viewer cannot read any identifier rows |
| `person_context_links` | `can_read_person(person_id)` | |
| `person_aliases` | `EXISTS (SELECT 1 FROM persons p WHERE p.id = person_id)` | Relies on **persons RLS** inside EXISTS; not updated in 264 |

Aliases SELECT is safe under `SECURITY INVOKER` because the EXISTS subquery is RLS-filtered. It is **weaker wording** than identifiers. Phase 2 will **strengthen** aliases SELECT to `can_read_person(person_id)` (allowed: strengthen only).

## 4. Leak risks if done wrong

| Bad pattern | Risk |
|---|---|
| Search all identifiers then filter in app | Existence leak of restricted persons |
| `SECURITY DEFINER` without `can_read_person` first | Bypass ownership + viewer_restricted |
| DEFINER that matches mobile then returns person for viewer | Reveals identifier→person map viewers must not have (281) |
| Different error/count for hidden vs nonexistent | Existence oracle |
| Returning identifier values / snippets | Data leak |

## 5. Proposed design

### Prefer `SECURITY INVOKER`

Documented choice: **INVOKER**, not DEFINER.

Reason: starting from `persons` (RLS = `can_read_person_scoped`) then `EXISTS` into aliases/identifiers inherits child RLS, including **viewer_restricted** on identifiers. Viewers can search by name/alias of visible persons but **not** by mobile/national ID/Asan — matching 281. No service-role, no auth.uid() spoofing surface.

### RPC signature

```sql
search_visible_persons(
  p_query  text,
  p_limit  integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_kind   text DEFAULT NULL   -- optional persons.kind filter (list UX)
)
RETURNS TABLE (
  id uuid,
  kind text,
  display_name text,
  legal_name text,
  visibility_scope text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  matched_by text,   -- name|alias|mobile|national_id|asan_code|NULL when unfiltered list
  total_count bigint
)
```

### Match rules

1. Cap `p_query` length (80); trim; escape `%` `_` `\` for ILIKE.
2. `length(trim(query)) < 2` → paginated visible list, `matched_by = NULL` (preserve current UX).
3. Mobile: `normalize_identifier('mobile_e164', q, false)` → exact `value_normalized` (supports 09 / 9 / +98 / 0098 / Persian digits via existing function).
4. National ID: `normalize_identifier('national_id_ir', q, false)` → exact.
5. Asan: `normalize_identifier('asan_person_code', q, false)` → **exact only** (no fuzzy; codes are short digit strings).
6. Name/alias: `normalize_fa_text` equality, then prefix `ILIKE term||'%'`, then contains `ILIKE '%'||term||'%'` on `display_name`, `legal_name`, `alias_normalized`.
7. One row per person; highest-priority `matched_by` wins.
8. Priority: mobile → national_id → asan_code → exact name/alias → prefix name/alias → contains → `created_at DESC`, `id`.
9. Limit clamped `[1,100]`; offset `GREATEST(0, p_offset)`.
10. `total_count` = count of **visible matching** persons only.
11. No dynamic SQL; revoke from `PUBLIC`/`anon`; grant `authenticated`.

### Frontend

- `/persons` calls `supabase.rpc('search_visible_persons', …)` (user JWT).
- `searchPersons()` serverFn delegates to same RPC; keep narrow picker DTO (no identifiers).
- Placeholder: `جستجو با نام، نام دیگر، موبایل، کد ملی یا کد آسان`
- No filters / alias CRUD / profile changes beyond list search wiring.

## 6. Indexes

| Index | Status | Action |
|---|---|---|
| `idx_person_identifiers_kind_value` | exists | reuse (exact kind+value) |
| `uq_person_identifiers_asan_code_active` | exists | reuse |
| `idx_person_aliases_normalized` | exists | reuse |
| `idx_persons_display_name_normalized` | exists | reuse |
| legal_name expression index | **missing** | **avoid** — ~70 persons; not evidence-backed |

**No new indexes in 298.**

## 7. Hard-stop check

| Gate | Result |
|---|---|
| `can_read_person` matches expected scoped/wrapper split | PASS (live def matches 265) |
| Identifier kinds clear | PASS |
| Aliases have safe SELECT under INVOKER | PASS (strengthen to `can_read_person`) |
| Need to weaken RLS? | NO |

**No hard stop. Proceed to Phase 2.1.**
