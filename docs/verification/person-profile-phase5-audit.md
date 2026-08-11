# Person profile Phase 5 — read-only audit

Date: 2026-08-05  
Branch: `feature/navigation-modernization`  
HEAD: `b9be7bb7`  
Migration: **none** (no new RPC/RLS/index required)

## 1. Existing profile sections

`/persons/$personId` already has: identity card, identifiers (read-only), aliases (`PersonAliasesManager`), context links (`PersonContextLinksForm` text-only refs), merge/collision banners for admin/manager.

## 2. Context → route map (live)

| context_kind | ref_table | Target route | Notes |
|---|---|---|---|
| `customer` | `customers` | `/sales/customers/$id/edit` | No read-only detail route exists |
| `supplier` | `suppliers` | `/suppliers/$id` | Detail exists |
| `staff_link` | `profiles` | `/users/$id` | Admin-only page |
| `accounting_party` | `external_parties` | `/accounting/external-parties` | List only — no `$id` detail |

Other context kinds (driver, referrer, …): no dedicated dossier route → show type + «مسیر پرونده تعریف نشده» (no dead link).

## 3. Persons metadata (live columns)

`id, kind, display_name, legal_name, visibility_scope, is_active, notes, created_by, created_at, updated_at`  
**No** `updated_by`, `merged_into_person_id`, `deactivated_at`.

## 4. Merge candidates

Statuses CHECK: `pending | merged | rejected | not_duplicate | dismissed`  
Columns: `person_id_a/b, reason, detail, status, reviewed_by, reviewed_at, created_at`  
Live sample: 1 `dismissed`. Profile shows pending today; expand to list pending + recent dismissed.

RLS: admin/manager (existing merge UI). Others: no rows / no privileged evidence.

## 5. Phone collisions

Statuses: `pending | resolved | ignored`  
`entity_refs` jsonb array of `{table, id, label}` (customers/suppliers/profiles/external_parties/visitors — not persons.id directly).  
Link person via: mobile identifiers → normalize to local `09…` → match `normalized_phone`, **or** resolve customer/supplier/profile refs that share this `person_id`.

RLS: admin/manager (281 viewer_restricted).

## 6. Audit

Live actions: `person.create/update`, `person.identifier.add`, `person.context_link.add`, `person_alias.create/update/delete`.  
Frontend permission matrix: `audit-logs.view` (static: admin). Live PostgREST may also allow accountant SELECT — dossier UI still uses `hasPermissionEx(..., "audit-logs", "view")`. Do **not** weaken RLS.  
Query: `audit_logs` where `entity_id = personId` OR `diff->>'person_id' = personId`, order `created_at desc`, limit 10. Redact: never show `diff` values for identifier/alias payloads — field-name / action-label summaries only.

Indexes: `audit_logs_entity_idx` exists — sufficient.

## 7. Hard-stop assessment

| Gate | Result |
|---|---|
| Context→target mappable | PASS (with honest unavailable routes) |
| Audit without RLS bypass | PASS (admin-only read) |
| Merge/collision semantics clear | PASS |
| Deep link existence leak | PASS (neutral copy when RLS hides target) |
| Need broader permissions? | NO |

**No hard stop. No migration. Proceed.**
