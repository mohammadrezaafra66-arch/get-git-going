# Person filters Phase 3 — read-only audit

Date: 2026-08-05  
Branch: `feature/navigation-modernization`  
HEAD at audit start: `1e739d78`  
Prior search: migration **298** / commit `16f95fb5`  
Migration selected: **299**

## 1. Current filter state

| Control | Today |
|---|---|
| Search | RPC `search_visible_persons` (name/alias/mobile/nid/asan) |
| `p_kind` | individual \| organization \| null (already on list) |
| Context | **none** |
| Active | **none** (list shows badge only) |
| Missing identifier | **none** |
| URL state | local React state only (`search`, `kind`, `page`) |

## 2. Exact live values (2026-08-05)

### `persons.kind`
`individual` (55), `organization` (15)

### `persons.is_active`
All live rows currently `true` (70). Column is boolean NOT NULL; inactive is supported and index `idx_persons_is_active` exists. Default filter: **all**.

### `person_context_links.context_kind` (CHECK = 18 values)

Live counts: `staff_link` 41, `supplier` 15, `customer` 14, `accounting_party` 1.

Mission UI mapping (actual DB values, not synonyms):

| UI label | Filter token | DB `context_kind` |
|---|---|---|
| مشتری | `customer` | `customer` |
| تأمین‌کننده | `supplier` | `supplier` |
| کارمند | `staff_link` | `staff_link` (**not** `staff`) |
| طرف حساب خارجی | `accounting_party` | `accounting_party` (**not** `external_party`) |
| بدون ارتباط | `no_context` | sentinel — not a CHECK value |

Active link semantics: **`ended_at IS NULL`**. There is **no** `is_active` column on `person_context_links`.

### `person_identifiers.kind` / status

Kinds CHECK includes `mobile_e164`, `national_id_ir`, `asan_person_code`, ….  
Status: `provisional` \| `confirmed` \| `revoked`. Live rows today are all `provisional` (39).  
“Present” for missing filters = `status <> 'revoked'` (same as Phase 2 search). No `revoked_at` column.

## 3. RLS implications

- Keep **SECURITY INVOKER**.
- Context `EXISTS` on `person_context_links` inherits SELECT via `can_read_person(person_id)`.
- Missing-identifier `NOT EXISTS` on `person_identifiers` inherits **viewer_restricted (281)**.
- **Leak if naive:** under INVOKER, viewer sees zero identifier rows ⇒ every person looks “missing mobile/nid/asan”. That **exposes** that the filter ran against an empty visible set vs true missing data for privileged roles — and if compared to admin counts, leaks presence.

### Viewer privacy decision (chosen)

1. **UI:** hide «اطلاعات ناقص» multi-select when `is_viewer_only` / sole viewer role.  
2. **RPC:** if `public.is_viewer_only(auth.uid())` then **ignore** `p_missing_identifier_kinds` (treat as NULL). Same empty-directory semantics as no missing filter — no special error. Direct PostgREST callers cannot use missing filters as an oracle.

Context + active filters remain available to viewers (no identifier leakage).

## 4. Indexes

| Need | Status | Action |
|---|---|---|
| `persons(is_active)` | `idx_persons_is_active` exists | reuse |
| `person_context_links(person_id)` | exists | reuse for EXISTS |
| `person_context_links(context_kind)` | exists | reuse |
| composite `(person_id, context_kind) WHERE ended_at IS NULL` | missing | **avoid** — ~70 persons; EXISTS plans fine |
| `person_identifiers(person_id, kind)` | person_id + kind indexes exist | reuse |
| search indexes from 298 | unchanged | reuse |

**No new indexes in 299.**

## 5. Recommended RPC extension

Replace 298 signature in place (single overload; DROP old 4-arg before CREATE if needed):

```sql
search_visible_persons(
  p_query text DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_kind text DEFAULT NULL,
  p_context_kinds text[] DEFAULT NULL,
  p_active_status text DEFAULT 'all',  -- all|active|inactive
  p_missing_identifier_kinds text[] DEFAULT NULL
  -- allowed: mobile_e164, national_id_ir, asan_person_code
)
```

Semantics:

- NULL / empty arrays = no filter for that dimension.
- Context OR within group; `no_context` OR’d with concrete kinds when both selected.
- Active AND search AND context AND missing (after viewer gate).
- Invalid tokens stripped (no error).
- Existing call sites omit new args → defaults → Phase 2 behavior preserved.

## 6. Optional collision/merge filters

Skip — would need extra joins to `person_merge_candidates` / collision views and are not required for P1.

## 7. Hard-stop assessment

| Gate | Result |
|---|---|
| Context kinds clear | PASS (CHECK + live counts) |
| Active semantics clear | PASS (`persons.is_active`; links use `ended_at`) |
| Filters require broader RLS? | NO |
| RPC extendable without changing visible-row semantics? | PASS (AND filters after RLS) |

**No hard stop. Proceed to Phase 3.1.**
