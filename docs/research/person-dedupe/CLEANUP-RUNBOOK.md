# Person dedupe cleanup — test then production

## Test machine (`192.168.170.8`, DB `afrakala`)

1. Open `/persons/merge` as admin/manager → **بازخوانی صف تشخیص**.
2. Open `/admin/persons-cleanup` → complete or delete active people with neither mobile nor Asan code.
3. Use row select + **حذف گروهی** for zero-blocker incompletes; complete identifiers for the rest.
4. Merge or dismiss pending pairs. Strong reasons (`shared_identifier`, `same_name_incomplete`) require a written dismiss reason.
5. In ledger receive, search by Asan/mobile first; ambiguous names now show a picker.

### Migrations on test (applied)

| version | what |
|---|---|
| `20260916120000` | 548 person create hard identity gate |
| `20260916121000` | 549 continuous merge-candidate detect |
| `20260916122000` | 550 deferred hard-identity gate (all writers) |
| `20260916123000` | 551 person_delete audit `entity_type = 'person'` |
| `20260916160000`–`162000` | 552–554 `call_ring_events` (+ source/direction) |

> Note: 550/551 person files were renamed from `…140000` / `…150000` so they do not collide with work-calm-mind migrations that already own those timestamps.

## Production laptop (`192.168.170.10`, DB `postgres`)

Do **not** invent data on production.

1. Merge `feature/sales-desk` → `staging` → `main` as usual; pull on the production laptop.
2. With owner approval, apply in order using the stdin delivery path from AGENTS.md; record ledger rows in the same breath:
   - `20260916120000_548_person_create_hard_identity_gate.sql`
   - `20260916121000_549_person_detect_merge_candidates.sql`
   - `20260916122000_550_person_hard_identity_deferred_gate.sql`
   - `20260916123000_551_person_delete_audit_entity_type.sql`
   - `20260916160000_552_call_ring_events.sql`
   - `20260916161000_553_call_ring_events_source.sql`
   - `20260916162000_554_call_ring_events_direction.sql`
3. Run `SELECT public.person_detect_merge_candidates(NULL);` once.
4. Deploy web with `--no-deps` only after migrations are verified (build on the production machine — do not reuse the LAN image).
5. Humans complete incompletes and review `/persons/merge` — no auto-merge.

Never `docker compose down -v` on either machine.
