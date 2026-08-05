# Person aliases Phase 4 — read-only audit

Date: 2026-08-05  
Branch: `feature/navigation-modernization`  
HEAD: `d949f99e`  
Migration if needed: **300**

## 1. Schema (live `\d+`)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `person_id` | uuid NOT NULL | FK → `persons` ON DELETE CASCADE |
| `alias` | text NOT NULL | CHECK `length(btrim(alias)) > 0` |
| `alias_normalized` | text | **GENERATED** `normalize_fa_text(alias)` STORED — never write |
| `alias_kind` | text NOT NULL | default `other`; CHECK: legal\|trade\|former\|nickname\|transliteration\|misspelling\|other |
| `source` | text NULL | optional provenance |
| `created_by` | uuid NULL | |
| `created_at` / `updated_at` | timestamptz | `set_updated_at` on UPDATE |

**No** soft-delete columns (`revoked_at`, `ended_at`, `is_active`).

## 2. Delete semantics

**Hard DELETE.** Row removed; search stops matching immediately (RPC EXISTS on table).  
Confirmed by migration 239 delete policy + unique index on live normalized alias.

## 3. RLS (live)

| Policy | Op | Predicate |
|---|---|---|
| `person_aliases_select_via_person` | SELECT | `can_read_person(person_id)` (298) |
| `person_aliases_insert_identity_authors` | INSERT | admin\|manager\|**sales\|accountant** + EXISTS persons |
| `person_aliases_update_admin_manager` | UPDATE | admin\|manager only |
| `person_aliases_delete_admin_manager` | DELETE | admin\|manager only (239) |

Grants: authenticated SELECT/INSERT/UPDATE/**DELETE**.

## 4. Audit

Trigger `trg_person_aliases_audit` AFTER **INSERT OR UPDATE** only → `audit_person_aliases()`.  
Actions: `person_alias.create` / `person_alias.update`. Diff includes person_id, alias, alias_normalized, alias_kind.  
**Gap:** DELETE is not audited.

## 5. Indexes

- `uq_person_aliases_person_normalized` (person_id, alias_normalized) UNIQUE  
- `idx_person_aliases_person_id`, `idx_person_aliases_normalized`, trgm  

No new indexes needed.

## 6. Call sites

| Surface | Status |
|---|---|
| Profile `/persons/$id` | read-only list (`as never` — types omit table) |
| Edit page | **no** alias UI |
| `search_visible_persons` | EXISTS on `alias_normalized` — hard delete OK |
| `person_merge` | special_move aliases |

## 7. Permission matrix (target)

| Role | Read | Create/Update/Delete |
|---|---|---|
| admin, manager | if `can_read_person` | yes (`persons.update`) |
| sales, accountant, viewer | if `can_read_person` | **no** |
| anonymous | no | no |

Live INSERT allows sales/accountant — **wider than `persons.update`**. Phase 4 migration **tightens** INSERT to admin/manager + `can_read_person` (strengthen only). UPDATE/DELETE gain `can_read_person`.

## 8. Types

`Database["public"]["Tables"]` **lacks** `person_aliases`. Manual minimal add (no codegen command).

## 9. Hard-stop assessment

| Gate | Result |
|---|---|
| Write RLS present | PASS (will tighten) |
| Audit present | PARTIAL — add DELETE |
| Delete semantics clear | PASS (hard DELETE) |
| Structure clear | PASS |
| Need service role? | NO |
| Bypass person visibility? | NO if WITH CHECK uses `can_read_person` |

**No hard stop.** Proceed with migration **300** (RLS tighten + DELETE audit) + UI.
