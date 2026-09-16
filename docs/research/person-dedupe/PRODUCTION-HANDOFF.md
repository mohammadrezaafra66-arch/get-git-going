# Production handoff — sales-desk / person-dedupe / ring events

Prepared from test (`192.168.170.8:3100`) for transfer to production laptop (`192.168.170.10`).

## Already done on test

- Web on `:3100` rebuilt and healthy (`06906195-dirty` at handoff; push will move to a clean SHA).
- Person identity migrations + `call_ring_events` applied on DB `afrakala`.
- UI: bulk delete on `/admin/persons-cleanup`, cross-links with `/persons/merge`, AMI/CEL ring popup.

## Do on production laptop (in order)

### A. Code

```powershell
cd C:\afrakala   # or the production clone path
git fetch origin
git checkout main
git pull
# after PR merge: pull the merge commit that contains feature/sales-desk
```

### B. Migrations (owner-approved; DB name `postgres`)

Apply with `supabase_admin` + stdin path from AGENTS.md, ledger row each time:

1. `20260916120000_548_person_create_hard_identity_gate.sql`
2. `20260916121000_549_person_detect_merge_candidates.sql`
3. `20260916122000_550_person_hard_identity_deferred_gate.sql`
4. `20260916123000_551_person_delete_audit_entity_type.sql`
5. `20260916160000_552_call_ring_events.sql`
6. `20260916161000_553_call_ring_events_source.sql`
7. `20260916162000_554_call_ring_events_direction.sql`

Then:

```sql
SELECT public.person_detect_merge_candidates(NULL);
```

### C. Web (build on production — never copy LAN image)

```powershell
$env:GIT_SHA = (git rev-parse --short HEAD)
$env:BUILD_TIME = (Get-Date -Format o)
docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml `
  up -d --no-deps --build web
```

Verify:

```powershell
curl http://127.0.0.1:3100/api/version
# APP_GIT_SHA must match HEAD
```

### D. Optional host tasks (Issabel)

- Register AMI listener / CEL ring poller tasks only if production Issabel is wired (see `docs/ops/issabel-ami-listener-setup.md`).

## Do not

- Reuse `afrakala-app:lan` built on the test PC.
- `docker compose down -v`.
- Auto-merge persons.
