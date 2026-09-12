# Issabel CDR import — production configuration gap (E-5, mission Convergence)

DOCUMENTATION ONLY. Nothing in this file was executed against production. It is
written to be copy-pasted into `RELEASE.md` (or run by hand by whoever holds
production access) — the owner or an agent with production write access
executes it, this mission does not.

## The fact this is built on (owner-supplied, 2026-09-13, read-only)

Production runs **two** compose trees on `192.168.170.10`:

1. `C:\afrakala` — the tree named throughout `CLAUDE.md`'s environment table.
2. `C:\AfraKalaServer\get-git-going01lan\deploy\lan` — the tree the machine
   **actually autostarts**. This is the one whose running container's
   environment is real.

**Neither tree defines `ISSABEL_*` or `OLLAMA_*` keys at all.** That is a
distinct failure mode from "defined but wrong": `docker inspect
afrakala-lan-web` on production would show `ISSABEL_CDR_HOST`, `ISSABEL_
IMPORT_WORKER_TOKEN` etc. simply **absent** from the container's environment,
not present-and-empty. Consequence, already measured by the owner: `call_logs`
and `call_log_extensions` are **both 0 rows** on production — the importer has
never run there, ever, because the token it needs to authenticate its own
POST to itself was never configured.

This mission (E-5) did not and could not verify either tree's file contents
directly — no production filesystem access from the test host. What follows
is written from (a) this repo's own `deploy/lan/docker-compose.yml`, which
already carries the `ISSABEL_*`/`OLLAMA_*` plumbing (added for the TEST
server by an earlier mission — see the block comments at
`deploy/lan/docker-compose.yml:71-84` and `:54-60`), and (b) the owner's
direct report above. **Whoever applies this must diff against the two trees'
actual current files first** — this note tells you what the end state must
contain, not a blind patch to apply unread.

## 1) Which file(s) to edit

Both of the following need the same reconciliation — **name both, because the
owner's report says the machine runs the second one, and CLAUDE.md's table
still points at the first. They must not be allowed to silently diverge
further; whichever one is NOT autostarted should either be kept in lockstep or
retired on purpose, and that decision is the owner's, not this mission's** (see
"Out of scope" below).

| Tree | Compose file | Env file (values) |
|---|---|---|
| `C:\afrakala` | `deploy\lan\docker-compose.yml` | `deploy\lan\.env.lan` |
| `C:\AfraKalaServer\get-git-going01lan\deploy\lan` (the one that actually autostarts) | `deploy\lan\docker-compose.yml` | `deploy\lan\.env.lan` |

Both env files are gitignored on every machine (CLAUDE.md rule 4/5 — never
commit secrets) — that is expected and correct; it is *why* the two trees can
silently disagree in the first place, since a `git pull` never touches them.

## 2) Which keys to ADD — this is an addition, not a correction

Confirm first (read-only, no risk): on the production laptop,

```powershell
docker inspect afrakala-lan-web --format "{{range .Config.Env}}{{println .}}{{end}}" | Select-String "ISSABEL|OLLAMA"
```

Expected today, per the owner's report: **zero matches.** If that is what you
see, the keys are genuinely absent and the block below is additive.

**a) In `docker-compose.yml`'s `web:` service**, under `environment:` — copy
this repo's own block verbatim (already present and working on the TEST
server; production's compose file needs the equivalent section added if it is
missing it):

```yaml
      # C-4 — read-only connection to the Issabel PBX's MySQL, for CDR import.
      ISSABEL_CDR_HOST: ${ISSABEL_CDR_HOST:-}
      ISSABEL_CDR_PORT: ${ISSABEL_CDR_PORT:-3306}
      ISSABEL_CDR_USER: ${ISSABEL_CDR_USER:-}
      ISSABEL_CDR_PASSWORD: ${ISSABEL_CDR_PASSWORD:-}
      ISSABEL_CDR_DB: ${ISSABEL_CDR_DB:-}
      # C-6 — shared token for the import-hook endpoint
      # (POST /api/public/hooks/import-issabel-calls). Empty = the endpoint
      # answers 500 and does nothing — the correct default for an
      # unconfigured install.
      ISSABEL_IMPORT_WORKER_TOKEN: ${ISSABEL_IMPORT_WORKER_TOKEN:-}
      # Self-hosted Ollama, if in use on this host.
      OLLAMA_API_URL: ${OLLAMA_API_URL:-}
      OLLAMA_API_KEY: ${OLLAMA_API_KEY:-}
      OLLAMA_MODEL: ${OLLAMA_MODEL:-}
      OLLAMA_EMBED_MODEL: ${OLLAMA_EMBED_MODEL:-}
      OLLAMA_VISION_MODEL: ${OLLAMA_VISION_MODEL:-}
```

If production's compose file is new enough to already have this section, skip
this step — only the `.env.lan` values (below) are the actual gap. **Diff,
don't assume.**

**b) In `.env.lan`** (values; never printed here, never committed — copy the
shape, fill the real values by hand on the production laptop only):

```
ISSABEL_CDR_HOST=192.168.170.252
ISSABEL_CDR_PORT=3306
ISSABEL_CDR_USER=afrakala_cdr_ro
ISSABEL_CDR_PASSWORD=<the password chosen in step 3 of the MySQL grant below>
ISSABEL_CDR_DB=asteriskcdrdb
ISSABEL_IMPORT_WORKER_TOKEN=<a freshly generated random token — see below>
```

`ISSABEL_IMPORT_WORKER_TOKEN` is not a PBX credential — it is a secret this
project mints itself, shared between the web container (which checks it,
`src/routes/api/public/hooks/import-issabel-calls.ts:34-49`) and whatever
calls the hook. Generate one with, e.g., `openssl rand -hex 32` on the
production laptop and paste the result into `.env.lan` directly — never
through a chat message, never through a file inside the repo (CLAUDE.md rule
4).

**c) After editing either file, the `web` container needs a restart that
picks up the new environment** — a plain `docker compose ... up -d --no-deps
web` is sufficient for an env-only change (no rebuild needed unless the image
itself changed), but confirm with `docker inspect` afterward exactly as
CLAUDE.md's deploy section already prescribes.

## 3) The MySQL GRANT on the Issabel PBX (`192.168.170.252`)

This is the production analogue of the read-only user this project already
created for the **test** computer — see `docs/research/issabel-groundwork-
20260906.md:715-728` for the full walkthrough (firewall check, the "what to
never do" table, the verification query). The commands below are the same
shape, addressed to the **production** laptop's IP instead of the test
computer's.

**On the PBX itself** (`192.168.170.252`, via SSH/console as an admin who has
access there — never via the web UI, and this mission never logged into it):

```sql
CREATE USER 'afrakala_cdr_ro_prod'@'192.168.170.10'
  IDENTIFIED BY '<a strong password the PBX admin generates>';
GRANT SELECT ON asteriskcdrdb.* TO 'afrakala_cdr_ro_prod'@'192.168.170.10';
FLUSH PRIVILEGES;
```

Notes, carried over from the test-server precedent because they still apply
word for word:

- **A separate username from the test user** (`afrakala_cdr_ro_prod` vs.
  `afrakala_cdr_ro`) is deliberate, not required by MySQL — it keeps the two
  environments' access individually revocable, and makes `SHOW GRANTS`
  self-describing about which host it belongs to.
- `GRANT SELECT`, never `GRANT ALL` — this user must not be able to write or
  delete call records even if its password leaks.
- The host clause is `'192.168.170.10'`, not `'%'` — this scopes the user to
  exactly the production laptop, not the whole network.
- **Never send the password itself through chat, ordinary email, or a file
  inside this repository.** Whoever runs the `CREATE USER` line should hand
  the production laptop's operator the password directly (or through
  whatever secret channel this company already uses) — this document does not
  carry it and never should.

**Verify on the PBX** (no secret revealed):

```sql
SELECT user, host FROM mysql.user WHERE user = 'afrakala_cdr_ro_prod';
SHOW GRANTS FOR 'afrakala_cdr_ro_prod'@'192.168.170.10';
```

The second line's output must show only `SELECT` and only on `asteriskcdrdb`.

**Verify from the production laptop** (after `.env.lan` is filled in):

```powershell
docker exec afrakala-lan-web sh -c 'env | grep -c "^ISSABEL_IMPORT_WORKER_TOKEN=."'
```

expect `1`. Never print the value itself.

**Firewall on the PBX**, same shape as the test-server precedent
(`docs/research/issabel-groundwork-20260906.md:760-765`), scoped to the
production laptop's `/32` this time:

```bash
firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="192.168.170.10/32" port port="3306" protocol="tcp" accept'
firewall-cmd --reload
```

## 4) The vault secret migration 533 reads (a SEPARATE step from the two above)

Migration `533_pg_cron_http_scheduler.sql`'s `run_issabel_import()` procedure
reads its bearer token from `vault.decrypted_secrets` (name
`issabel_import_worker_token`), on the database `pg_cron` actually runs jobs
from — on production that is `postgres` (production's app database IS
`postgres`; see `CLAUDE.md`'s environment table). **This vault secret does not
get created by applying 533 or 534** — it is a one-time manual mirror of
whatever value step 2(b) above put in `ISSABEL_IMPORT_WORKER_TOKEN`, following
`docs/missions/prodprep/C2-cron-verdict.md` §"Store the token" (lines
212-243), reproduced here for the production host:

```bash
docker exec afrakala-lan-web printenv ISSABEL_IMPORT_WORKER_TOKEN \
| docker exec -i afrakala-lan-db sh -c '
    read -r TOK
    printf "SELECT vault.create_secret(%s, %s, %s);\n" \
      "\$tok\$$TOK\$tok\$" \
      "\$\$issabel_import_worker_token\$\$" \
      "\$\$C-2 / D-39 issabel CDR import worker token\$\$" \
    | PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -f -'
```

Verify without printing it:

```bash
docker exec afrakala-lan-db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U supabase_admin -d postgres \
  -tAc "SELECT name, length(decrypted_secret) > 0 AS has_value FROM vault.decrypted_secrets \
        WHERE name = '"'"'issabel_import_worker_token'"'"';"'
```

expect one row, `has_value = t`.

Order matters: step 2(b)/2(c) (the env var reaches the running web container)
must happen **before** this step, since it reads the value out of the running
container's own environment.

## 5) Order of operations, end to end

1. Diff both compose trees against this repo's current `deploy/lan/
   docker-compose.yml` and `.env.lan.example`; add the missing `environment:`
   keys to whichever tree(s) need them (§2a).
2. Fill in real values in `.env.lan` for the tree that actually autostarts —
   `ISSABEL_CDR_*` from the MySQL grant (§3) and a freshly generated
   `ISSABEL_IMPORT_WORKER_TOKEN` (§2b).
3. Run the `CREATE USER`/`GRANT SELECT` on the PBX (§3) and open the firewall
   rule for `192.168.170.10/32`.
4. Restart `web` with `--no-deps` so it picks up the new environment (§2c);
   confirm with `docker inspect`.
5. Mirror the token into `postgres` database's vault (§4) — required only if/
   when migrations 533+534 are applied to production's `postgres` database.
6. Only then does applying 533+534 against `postgres` register the two
   `afrakala-issabel-import-h*` pg_cron jobs meaningfully — before this, the
   jobs would exist but every run would fail with "issabel_import_worker_token
   is missing from the vault" (exactly what E-5 reproduced live on
   `prod_rehearsal_e5` — see `docs/research/convergence/E-5-proof.md`).

## Out of scope (recorded, not done)

- **Deciding whether `C:\afrakala` should be retired or kept in lockstep with
  `C:\AfraKalaServer\get-git-going01lan\deploy\lan`.** Two trees for one
  running service is a standing hazard (this very gap — keys present in the
  repo's compose template but absent from what's actually deployed — is a
  symptom of it), but which tree is canonical is an infrastructure decision
  for the owner, not something this migration mission should decide by
  editing files it cannot even read from here.
- Applying migrations 533/534 to production's `postgres` database. E-5's
  partition is proof-on-a-copy; production application needs the owner's
  explicit approval and happens outside this mission, following CLAUDE.md's
  migration-application rules (`--single-transaction`, record the ledger row
  in the same breath, etc.).
- Generating the actual `ISSABEL_IMPORT_WORKER_TOKEN` value or the PBX
  password — those must be created by whoever has production/PBX access, not
  echoed through this document or this session.
