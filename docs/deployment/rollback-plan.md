# Rollback plan

Every phase has a real, tested way back. "Revert the commit" is not a rollback when a migration has
already run — the schema does not un-apply itself.

## Two kinds of rollback

**Code rollback** — revert the merge commit and rebuild. Fast, safe, always available.

**Schema rollback** — run a `down` migration. Every migration in this programme ships with one at
`docs/verification/<N>-down.sql`, written **at the same time** as the migration, not afterwards.

**Ordering rule:** roll back schema first, then code. Code that expects a column which no longer
exists fails loudly; a column whose code has already gone is harmless.

---

## Standing safety net

Before the first migration of every phase, on the test machine:

```powershell
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$pw = (docker exec afrakala-lan-db printenv POSTGRES_PASSWORD).Trim()
docker exec -e PGPASSWORD=$pw afrakala-lan-db pg_dump -U supabase_admin -d afrakala -Fc -f /tmp/pre-phase.dump
docker cp afrakala-lan-db:/tmp/pre-phase.dump "D:\AfraKalaBackups\pre-phase-$stamp.dump"
```

Keep backups **outside any git directory** — a dump contains real customer data and must never enter
history via a stray `git add`. (This has already happened once in this project: an exported
spreadsheet with real customer names reached git history and could not be removed without a
force-push.)

Record the dump path in the phase progress file. A backup nobody can find is not a backup.

**Never `docker compose down -v`.** The `-v` destroys the database volume.

---

## Per-phase rollback

### Phase 0 — documents only
Delete the files. No schema, no code.

### Phase 1 — foundations
Highest-risk phase, because everything later depends on it.

| Task | Down |
|---|---|
| 1.1 dead path removed | Recreate the trigger and the no-op function from the definitions captured in the progress file **before** dropping. If they were not captured, this is unrecoverable from the repo — capture first. |
| 1.2 document numbers | `DROP FUNCTION assign_document_number; DROP TABLE document_numbers;` — safe while nothing references it |
| 1.3 `require_asan_code` | `DROP FUNCTION require_asan_code;` |
| 1.4 `account_kind` + `doc_kind` | Restore the original CHECK; `ALTER TABLE journal_entries DROP COLUMN doc_kind;` **Only safe before phase 5 rewires the export.** After that, roll phase 5 back first. |
| 1.5 attachments | `DROP TABLE document_attachments CASCADE;` |
| 1.6 immutability | `DROP TRIGGER` both. Note this re-opens editing of posted entries. |
| 1.7 permissions | `DELETE FROM role_permissions WHERE module='<new>';` — **only if the module itself is being removed**, since an absent module is open to all roles, not closed |

### Phases 2, 3, 4 — the three RPCs
These create real ledger rows, so rollback has two halves.

**Code half:** `DROP FUNCTION create_receipt(...);` etc. The old client path still exists until task
6.9, so dropping an RPC restores the previous behaviour rather than breaking creation.

**Data half:** documents created during the phase must be reversed, not deleted — deleting a
`journal_entries` row orphans nothing (there is no FK on `source_id`) but does burn its document
number, and burned numbers are deliberately never reused.

```sql
-- List what the phase created, before deciding
SELECT id, doc_kind, entry_date, created_at
  FROM journal_entries
 WHERE created_at > '<phase start timestamp>'
 ORDER BY created_at;
```

For test data, restoring the pre-phase dump is cleaner than reversing row by row.

### Phase 5 — export rewiring
`asan_list_journal_export` is replaced, not extended. Down = `CREATE OR REPLACE` with the previous
body, captured via `pg_get_functiondef` **before** the change and stored in the progress file.

Rolling this back while `doc_kind` still exists is harmless: the old body simply ignores the column.

### Phase 6 — front end
Code-only. Revert the merge and rebuild:

```powershell
git revert -m 1 <merge-sha>
docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml up -d --build web
docker restart afrakala-lan-rest
```

Task 6.9 deletes the old create path. **Before deleting, list every importer of
`PaymentReceiptForm`** — other routes may render it, and the component disappearing from one merge is
exactly how a feature has silently vanished in this project before.

### Phase 7 — OCR
Code-only, plus `document_attachments.ocr_payload` rows. Disabling the OCR call restores manual
entry, which by requirement 7.7 always works anyway.

### Phase 8 — tests
Nothing to roll back. Test data is removed by restoring the pre-phase dump.

### Phase 9 — production
The only phase where rollback matters commercially.

1. **Before anything:** `pg_dump` production, verified restorable into a scratch database. A backup
   that has not been test-restored is a hope, not a backup.
2. **Image rollback** — tag the current image before deploying, then:
   ```powershell
   docker tag afrakala-app:lan-rollback afrakala-app:lan
   docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan up -d web
   ```
   Deployment touches only the `web` service; the database is never involved.
3. **Schema rollback** — run the accumulated `down` migrations in reverse order, then restart
   PostgREST.
4. If both fail, restore the dump. Downtime, but no data invented.

---

## Rollback rehearsal

Before phase 9, rehearse once on test: apply every migration to a clone, roll every one back, confirm
the schema matches the starting point.

```powershell
# Compare schema before and after a full apply+rollback cycle
docker exec -e PGPASSWORD=$pw afrakala-lan-db pg_dump -U supabase_admin -d afrakala -s -f /tmp/before.sql
# ... apply all, then roll all back ...
docker exec -e PGPASSWORD=$pw afrakala-lan-db pg_dump -U supabase_admin -d afrakala -s -f /tmp/after.sql
# diff before.sql after.sql  -> expect no differences
```

An untested rollback is not a rollback.

---

## When not to roll back

Rollback is for **broken**, not for **incomplete**. If a phase merged and works but one task is
unfinished, finish the task in a new branch. Rolling back a working phase to redo it costs the
verification already done and risks re-introducing what was fixed.
