# Hard-identity gate (all writers) — 550

## Rule (live on test DB `afrakala`)

An **active** person must always hold at least one non-revoked:

- `mobile_e164`, or
- `asan_person_code`

## Enforcement layers

| Layer | What it covers |
|-------|----------------|
| `person_create_full` (548) | UI / inline create RPCs — fails before INSERT |
| `asan_person_import_rejection` (430) | Asan import — requires **both** code and mobile |
| Deferred constraint triggers (550) | **Every** writer: direct SQL, DEFINER RPCs, PostgREST, future code |

Triggers:

- `trg_persons_require_hard_identity` on `persons`
- `trg_person_identifiers_require_hard_identity` on `person_identifiers`

Deferred to COMMIT so create+identifier in one transaction still works.

## What is still allowed

- **Inactive** persons without hard id (needed for `person_merge` losers)
- Legacy incomplete **active** rows already in the DB until cleaned via `/admin/persons-cleanup`
- Two different mobiles / two different Asan codes → two persons (not the same identity key)

## What is blocked 100% for *new* active people

- Active person with neither mobile nor Asan, on any path
- Stripping the last hard id from an active person

## Migrations

- `20260916120000` (548)
- `20260916121000` (549)
- `20260916122000` (550)
