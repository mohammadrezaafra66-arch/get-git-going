# AGENTS.md — AfraKala Development Rules

This repository belongs to the AfraKala smart assistant project.

Two agents work in this repo: **Codex** and **Claude Code**. Both read this
file. `CLAUDE.md` is an exact copy so Claude Code picks it up automatically —
**if you edit one, edit the other.**

Before any change, read:
- `PROGRESS.md` — the shared notebook: what the other agent did last (see
  "Coordination" below). Read it *first*.
- `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`
- `README.md`
- `.lovable/plan.md` if present

## Mandatory principles

1. Keep the project self-hostable on Linux + Docker + Supabase Self-host.
2. Do not add critical dependency on CDN, online fonts, external APIs, or non-self-hostable cloud services.
3. External integrations must be optional, feature-flagged, server-side secret safe, and have manual fallback.
4. Never commit real secrets, .env files, service role keys, JWT secrets, passwords, certificates, backups, dumps, or storage exports.
5. No server secret may use VITE_ prefix.
6. Frontend-only authorization is not acceptable.
7. Sensitive features require UI guard, route/server guard, and database RLS/RBAC/backend permission.
8. Database changes require timestamped migrations.
9. Sensitive tables require RLS.
10. Sensitive actions require audit logs.
11. Large queries require limit, pagination, indexes, and debounced search/filter.
12. UI must remain Persian, RTL, mobile-first, and responsive.
13. Fonts and critical assets must be local.
14. Do not create parallel modules, routes, tables, services, hooks, or components if an existing implementation exists.
15. Do not redesign architecture, rename tables/fields, delete code, or refactor broadly unless explicitly approved.
16. Keep every change small, incremental, low-risk, and testable.

## Phase rule

Phase 1 architecture is already implemented/stabilizing.
Future work must extend existing architecture.

Any customer, supplier, account party, receiver, driver, referrer, marketer, representative, complainant, return-related person, staff member, or credit-related person belongs to Phase 2: unified persons core. Do not create separate person systems.

---

## Branch flow

Nobody works directly on `main` or `staging`. This mirrors
`docs/process/branch-policy.md`, which is the authority if the two disagree.

```
feature/<task>  ──PR──►  staging  ──PR──►  main
                            │                │
                     test computer    production laptop
```

- `main` — the code production runs. Protected; PR only.
- `staging` — the code the test computer runs. Protected; PR only.
- `feature/*`, `hotfix/*`, `cursor/*`, `lovable/*` — where work actually happens.

Boundary Guard enforces this on every PR, and it is a required status check: a
PR into `main` must come from `staging` or an approved `hotfix/*` branch.

Start every task from a fresh `staging`:

```powershell
git fetch origin; git switch staging; git pull; git switch -c feature/<short-name>
```

> Until 2026-08-14 this file named `feature/navigation-modernization` as *the*
> working branch. That branch had grown into a 1600-commit parallel `main` and
> is being retired — do not start new work on it.

## Working environments

Two machines run this project, and they are not interchangeable. One is where
you work; the other holds the company's real records.

| | Test computer | Production laptop |
|---|---|---|
| Address | `192.168.170.8:3100` | `192.168.170.10:3000` |
| Repo folder | `D:\AfraKalaTest\app` | `C:\afrakala` |
| Branch it tracks | `staging` | `main` |
| **Database name** | `afrakala` | **`postgres`** |
| DB container | `afrakala-lan-db` | `afrakala-lan-db` |
| Web container | `afrakala-lan-web` | `afrakala-lan-web` |
| What you may do | develop, test, break things | **pull and build only** |
| Ollama | Windows host: `http://192.168.170.8:11434` | — |

**The database name differs between the two machines.** On production it is
`postgres`. Running `psql -d afrakala` there fails with `database "afrakala"
does not exist` — that means you copied a command written for the test server,
not that production is broken. This exact mistake cost a round-trip on
2026-08-14.

This is also *not* the Cursor Cloud / `deploy/local/` setup documented at the
end of this file.

### Production is deploy-only, not untouchable

This file used to say "never touch production, for any reason". That was true
while production ran two-month-old code and had no migration ledger; it stopped
being the rule on 2026-08-11, when the owner approved the cutover. What replaces
it is narrower and stricter where it counts:

- **Never develop on the production laptop.** Code is edited only on the test
  computer. A commit made in `C:\afrakala` exists nowhere else, and the next
  `git pull` there will either destroy it or conflict.
- **Never modify production data** — no `INSERT`/`UPDATE`/`DELETE`, no importing
  test persons, products, or pre-invoices. Those are the company's real records.
- **Never run a migration on production without explicit owner approval**, and
  never as a side effect of a deploy.
- **Never `docker compose down -v`.** The `-v` deletes the database volume.
- A deploy touches the `web` service only. **The command MUST carry `--no-deps`:**

  ```powershell
  $env:GIT_SHA = (git rev-parse --short HEAD)
  $env:BUILD_TIME = (Get-Date -Format o)
  docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml `
    up -d --no-deps --build web
  ```

  **`GIT_SHA` MUST be set on the command line — amended 2026-08-26.** The compose file reads
  `GIT_SHA: ${GIT_SHA:-local-unknown}` as a build arg, and `--env-file deploy/lan/.env.lan`
  supplies a value that was pinned there long ago. Without the export the build is CORRECT and
  the label LIES: measured on 2026-08-26, a rebuild of current code stamped
  `APP_GIT_SHA=1ca72316` — a real commit, but not `HEAD`. The verification step below
  ("`APP_GIT_SHA` must equal `git rev-parse --short HEAD`") is the only check that the right
  code is running, so a stale label silently disables the one thing that would catch a failed
  deploy. To tell them apart when it happens, look for a string only your change contains:
  `docker exec afrakala-lan-web sh -c "grep -rl '<your new symbol>' /app/.output"`.

  **Without `--no-deps` the app goes DOWN.** Measured on 2026-08-26: `web` depends on
  `kong`, and `auth`, `rest`, `storage` and `meta` all declare `depends_on: db-role-fix`,
  so a plain `up -d web` pulls the one-shot `db-role-fix` container into the start-up
  graph. On this machine that container cannot start — it bind-mounts a script through
  the same broken Docker Desktop mount layer as OG-68:

  ```
  Container afrakala-lan-db-role-fix Starting
  Error response from daemon: error while creating mount source path
  '/run/desktop/mnt/host/d/AfraKalaTest/app/deploy/lan/scripts/db-role-fix.sh':
  mkdir /run/desktop/mnt/host/d: file exists

  $ docker ps -a
  afrakala-lan-web        Created                    <-- never started
  afrakala-lan-db-role-fix Exited (128)

  $ curl http://192.168.170.8:3100/login
  login 000 2.058970s                                <-- the app is down
  ```

  Recovery, if it happens: `docker start afrakala-lan-web` — verified to bring it back
  `Up (healthy)` with `/login` 200 in 0.09s. Then use `--no-deps` from then on.

  **`db-role-fix` is NOT vestigial — do not delete it.** Checked 2026-08-26 because it
  looked like a leftover: four services declare it as a dependency, and it re-applies the
  service-role passwords that the documented `zz-10` init failure would otherwise leave
  unset. It is a load-bearing workaround that happens to be unstartable while OG-68 lasts;
  `--no-deps` steps around it without removing it. See OG-68.
- Take a rollback tag on the current image before every deploy.

`deploy/lan/scripts/update-lan.ps1` automates the safe path and pulls whatever
branch the checkout is on.

After a deploy, confirm the running code is the code you think it is:

```powershell
docker inspect afrakala-lan-web --format "{{range .Config.Env}}{{println .}}{{end}}" | Select-String "APP_GIT_SHA"
```

`APP_GIT_SHA` must equal `git rev-parse --short HEAD`. Expect
`afrakala-lan-db-role-fix` to show `Exited (0)`; every other `afrakala-lan-*`
service must be `Up`.

> Note on PowerShell: `build.ps1` / `up.ps1` and `psql` often return exit code 1
> purely because Windows PowerShell 5.1 treats a native command's stderr as an
> error (progress output, `NOTICE:` lines). Do not read that as failure —
> verify the real outcome independently (image timestamp, `APP_GIT_SHA`, a
> `SELECT`).

## Safety rules for database work

These are not style preferences. Each one exists because breaking it has
already cost this project real damage.

1. **Persian SQL must never go through a PowerShell pipe.** On 2026-07-11 a
   piped migration replaced every non-ASCII byte with `?` and destroyed the
   Persian text inside 44 database functions.

   **`docker cp` is NO LONGER the delivery path — amended 2026-08-26.** It is
   broken on this machine at the Docker Desktop mount layer and cannot be
   relied on:
   ```
   docker cp <file> afrakala-lan-db:/tmp/x.sql
   Error response from daemon: error while creating mount source path
   '/run/desktop/mnt/host/d/.../db/init/00-afrakala-pre-supabase-admin.sh':
   mkdir /run/desktop/mnt/host/d: file exists
   ```
   `docker cp` re-resolves the container's binds, and `afrakala-lan-db` carries
   four of them recorded in already-translated VM form. It fails every time; it
   is not transient.

   **Deliver over stdin instead — it never touches the mount layer:**
   ```bash
   # from Git Bash (MSYS_NO_PATHCONV=1 so /tmp is not path-translated)
   cat <migration>.sql | docker exec -i afrakala-lan-db sh -c 'cat > /tmp/mig.sql'
   docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala \
     -v ON_ERROR_STOP=1 --single-transaction -f /tmp/mig.sql
   ```
   From Node, pass a **Buffer** so no shell or encoding layer sees the bytes —
   this is what `e2e/helpers/db-write.ts` now does:
   ```ts
   execFileSync("docker", ["exec","-i","afrakala-lan-db","sh","-c",`cat > ${remote}`],
                { input: readFileSync(local) });   // Buffer in, byte-exact
   ```

   **Verify with `md5sum` on both sides every time. Nothing less counts.**
   Measured 2026-08-26 on the same Persian file: the Git Bash and Node/Buffer
   routes both produced identical md5, while
   `Get-Content -Raw -Encoding UTF8 | docker exec -i` produced **167 bytes
   against 165** — PowerShell appended a trailing `\r\n`. Note precisely what
   that was and was not: the Persian bytes were intact, the damage was a line
   ending. It still fails, because md5-or-nothing is the rule that would have
   caught 2026-07-11.

   **base64 is the fallback** when a transport must be provably ASCII-only:
   `base64 -w0 f.sql | docker exec -i afrakala-lan-db sh -c 'base64 -d > /tmp/f.sql'`
   — also verified byte-identical.

   Every migration file still starts with `SET client_encoding='UTF8';` and is
   saved as UTF-8 without BOM.
2. **`--single-transaction` + `-v ON_ERROR_STOP=1` always**, so a partial
   failure rolls back instead of leaving the schema half-applied.
3. **No `DROP TABLE`, `TRUNCATE`, or `DELETE` on a table holding data.**
   Permitted: `CREATE OR REPLACE`, `ALTER TABLE ... ADD COLUMN`,
   `CREATE POLICY`, `INSERT`. (`DROP FUNCTION` is fine — see rule 5.)
4. **Before `CREATE OR REPLACE FUNCTION`, read the live definition first**
   (`pg_get_functiondef`) and change only what must change. The database
   sometimes holds an *older* definition than git; re-applying the git version
   wholesale can silently change a signature or behaviour.
5. **Adding a defaulted parameter does not replace a function — it overloads
   it.** The old signature stays, existing calls become ambiguous, and the
   feature breaks at runtime. `DROP FUNCTION` the previous signature in the
   same migration.
6. **Never edit an existing migration file.** Add a new one. Naming:
   `2026MMDD<HHMMSS>_<NNN>_<name>.sql`, continuing the existing number series
   (`ls supabase/migrations | tail`).
7. Test behavioural changes inside `BEGIN … ROLLBACK` with a simulated JWT
   (`SET LOCAL "request.jwt.claims" = '{"sub":"<uuid>","role":"authenticated"}'`)
   so nothing is written permanently.
8. Never print a key, password, or token. Report host/port/name only.
9. **Adding a foreign key to `persons` is never "just adding a column."** `person_merge`
   reads its worklist from `pg_constraint` and stops dead on any persons-referencing
   column with no policy in its internal `_registry` — so an unregistered FK does not
   degrade one feature, it **disables merging for every person in the system**. This
   shipped three times (migrations 271, 287, 319), each author having read the previous
   incident. Migration **328** turned it into a mechanical gate: an event trigger on
   `CREATE TABLE` / `ALTER TABLE` / `DROP TABLE` aborts the DDL — and therefore the whole
   migration — the moment the FK set and the registry disagree, in either direction.

   **Order matters, because the gate checks after every statement:**
   - Adding an FK to `persons` → `CREATE OR REPLACE` `person_merge` **with** the new
     registry key *first*, then `ALTER TABLE … ADD`.
   - Dropping a table that owns one → `CREATE OR REPLACE` `person_merge` **without** the
     key *first*, then `DROP TABLE`.

   To see the current state at any time: `SELECT * FROM public.person_fk_registry_report();`
   If you are ever tempted to disable the trigger, read `docs/verification/328-down.sql`
   first — the usual correct fix is to update the extractor, not remove the gate.

## Coordination — Codex ↔ Claude Code

`PROGRESS.md` in the repo root is the shared notebook. It exists so neither
agent undoes the other's work.

- **Before starting:** read `PROGRESS.md` and `git log --oneline -10`.
- **After finishing:** add a row to the top of its history table —
  `date | tool | what changed | commit`.
- Keep `PROGRESS.md` factual and short. Long write-ups belong in `docs/`.
- Commit checkpoints per phase so any single phase can be reverted alone.

---

## Verification

For code changes, run and report:

| Command | Status |
|---|---|
| `bun run build` (or `npm run build`) | must pass |
| `npx tsc --noEmit` | **baseline is 70 pre-existing errors** — your change must not raise it |
| `npm run lint` | fails on a known legacy baseline (~13 prettier errors); CI tolerates it. Only lint files you touched. |
| tests | **there is no test script in this project** — say so rather than implying tests ran |

Take the typecheck baseline *before* you start so you can prove you did not
add to it. If a script does not exist, report that explicitly. Do not claim it
passed.

## Required delivery report

Every delivery must include:
- Files inspected
- Files changed
- Why each file changed
- Migration impact
- RLS/RBAC impact
- Audit log impact
- Build/lint/typecheck/test results
- Manual test path
- Self-Host Acceptance Check
- Remaining risks

Anything only a human can do (browser-only checks, business data entry) must be
listed explicitly as a remaining manual step, not quietly omitted.

---

## Cursor Cloud specific instructions

> **Scope:** this section describes the Cursor Cloud VM and the
> `deploy/local/` stack. It is a *different* environment from the LAN test
> server above — do not mix the two. `deploy/local/` uses Kong on port 8000 and
> containers named `afrakala-local-*`; the LAN server uses port 9000 and
> `afrakala-lan-*`.

Dependencies install automatically on VM startup (`npm install`). Node 22 + npm
is the toolchain (CI uses `npm install`; `bun.lock` also exists but npm is the
canonical path here). Commands live in `package.json`:

- `npm run dev` — Vite dev server (frontend + SSR). It serves on **port 8080**
  (the `@lovable.dev/vite-tanstack-config` plugin forces this), not Vite's
  default 5173.
- `npm run build` — production build (passes).
- `npm run lint` — eslint. It currently **fails on a known legacy baseline**
  (~13 prettier errors); CI explicitly tolerates this (`npm run lint || echo
  "::warning::..."`). Do not "fix" the whole baseline; only lint files you
  touch.
- `npm run typecheck` — `tsc --noEmit`. See the baseline note under
  "Verification". There is still no `test` script.

### Backend: the app requires Supabase

The app is fully auth-gated and reads/writes through Supabase. By default
`vite.config.ts` falls back to a live **cloud** project — do not sign up / write
test data there. For real local development use the self-hosted stack under
`deploy/local/` (Postgres + GoTrue auth + PostgREST + Storage + Kong). See
`deploy/local/README.md` for the canonical commands. Requires Docker (install
once; not part of the update script). Start the daemon with the
fuse-overlayfs + iptables-legacy workaround required in this VM, then bring up
only the backend services: `docker compose --env-file .env.local -f
deploy/local/docker-compose.yml up -d db auth rest storage meta kong` (skip the
heavy `web` image build — run `npm run dev` instead for development).

Non-obvious gotchas (these will silently break the stack if missed):

- **`.env.local` keys must be real JWTs.** `deploy/local/.env.local` needs
  `ANON_KEY`/`SERVICE_ROLE_KEY` that are HS256 JWTs signed with `JWT_SECRET`
  (claims `{"role":"anon"|"service_role","iss":"supabase"}`), and
  `deploy/local/kong.yml` must contain those same key strings (the repo only
  ships `kong.yml.example` with `$SUPABASE_*` placeholders that are NOT
  auto-substituted). `.env.local` and `kong.yml` hold secrets — never commit
  them.
- **DB init scripts fail on a fresh volume.** The `supabase/postgres` image runs
  its own `migrate.sh` (which demotes `postgres` from superuser and loads
  supautils) *before* the repo's `zz-10/zz-20/zz-30` init scripts. As a result
  `zz-10` dies with `"authenticator" is a reserved role, only superusers can
  modify it`, so the service LOGIN roles never get `POSTGRES_PASSWORD` and
  `auth`/`rest`/`storage` crash-loop with `password authentication failed`. Fix
  after first `up`: connect as the superuser `supabase_admin` (password =
  `POSTGRES_PASSWORD`) and re-apply the role-password + jwt + schema bootstrap
  (`ALTER ROLE authenticator/supabase_auth_admin/supabase_storage_admin ...
  PASSWORD <pgpass>`, `ALTER DATABASE postgres SET app.settings.jwt_secret`, and
  `zz-20-afrakala-schemas.sql`), then `docker compose restart auth rest
  storage`. `postgres` cannot do this — it must be `supabase_admin`.
- **Migrations.** Apply all `supabase/migrations/*.sql` in filename order. The
  repo's `deploy/local/scripts/local-apply-migrations.sh` needs host `psql` and
  prompts interactively (`read`); easiest in-VM path is looping the files
  through `docker exec -i afrakala-local-db psql -U postgres -d postgres`.
- **Dev server env.** When running `npm run dev` on the host against the local
  stack, point both `VITE_SUPABASE_URL` and server-side `SUPABASE_URL` at
  `http://localhost:8000` (the published Kong port). The compose-internal
  `http://kong:8000` only resolves inside the Docker network, not from the host
  dev process. Also set `SUPABASE_PUBLISHABLE_KEY`=ANON_KEY and
  `SUPABASE_SERVICE_ROLE_KEY`=SERVICE_ROLE_KEY for SSR/server routes.
- **First admin bootstrap.** New registrations land with `profiles.status =
  'pending'` and do not reliably get a `user_roles` row. To get a working admin,
  set `profiles.status='active'` and `insert into user_roles(user_id, role)
  values (<id>, 'admin')` via SQL. `app_role` enum = admin/manager/sales/
  accountant/viewer.

## Release notes: every user-facing commit carries a Persian trailer

The `/updates` page is generated automatically from git history at build time
(`scripts/generate-release-notes.mjs`). There is **no manual approval step** —
whatever is generated is published to end users on the next deploy.

That only works if the Persian text exists at commit time. So:

**If a commit changes anything a user can see, its message must end with a
`Release-note-fa:` trailer** written for that user — not for a developer.

```
feat(products): add Torob URL field

Release-note-fa: امکان ثبت لینک ترب برای هر محصول اضافه شد.
```

Rules:
- One trailer per commit. Plain Persian, one or two sentences, no jargon, no
  file names, no migration numbers, no commit SHAs.
- Describe what the user can now do, not how it was built.
- **Commits with no trailer are not published.** That is the correct outcome for
  internal work — migrations, refactors, docs, tests, tooling. Do not add a
  trailer to make internal work visible.
- Never write the trailer in English. The page and its audience are Persian.

The generator is strict on purpose: without a trailer it publishes nothing,
rather than gluing a Persian label onto an English subject. `--allow-fallback`
exists only to preview what history would produce; never ship its output.

## Auto-push after every commit (all AI agents)
After every `git commit`, immediately run `git push origin HEAD`.
This applies to every AI agent working in this repo — Claude Code, Codex, Cursor, or any other.
The goal: GitHub must always mirror the local project's committed state.
Push only after a commit (which happens at the end of a completed, tested phase), never mid-phase.
If the push fails (e.g. non-fast-forward), stop and report it — do not force-push.

## When several agents run at once, they share ONE working tree

Parallel missions do **not** get separate clones. Every agent edits the same
files in `D:\AfraKalaTest\app` and shares the same git index. All of the
following were observed on 2026-08-08 with six agents running:

**1. Stage and commit in a single shell invocation.** The index is shared
process-wide, so this is racy:

```powershell
git add -- path/to/file.sql      # another agent runs `git reset` here…
git commit -m "..."              # …and your message lands on THEIR staged work
```

That is not hypothetical: it put one agent's ~1850 lines under another agent's
commit message, and the result was pushed. Do both in one command, with the
pathspec repeated on the commit:

```powershell
git add -- $paths; git commit -q -m $msg -- $paths
```

The pathspec on `commit` restricts the commit to exactly those paths no matter
what else is staged. The `git add` is still required — `git commit -- <paths>`
alone fails for a new file with *"did not match any file(s) known to git"*.

**2. Never `git add -A` or `git add .`.** It sweeps up whatever other missions
have in flight.

**3. If your commit captures someone else's work anyway: do not fix it.** Do
not force-push, revert, or reset. Their content is intact on the remote and
rewriting shared history destroys real work. Report the wrong commit message
and move on.

**4. `git pull --rebase` will usually refuse**, with *"cannot pull with rebase:
You have unstaged changes"* — caused by other missions' files, not yours. **Do
not `git stash`**: that yanks another agent's in-flight work out from under
them. Check divergence without touching the tree instead:

```powershell
git fetch origin $(git rev-parse --abbrev-ref HEAD)
git rev-list --count HEAD..FETCH_HEAD    # 0 ⇒ a rebase would be a no-op
```

If it is non-zero, stop and report rather than improvising.

**5. Uncommitted work gets destroyed.** Edits were wiped twice by other agents'
git operations. Commit each phase the moment it is verified; do not hold a
finished phase in the working tree.

**6. Take the migration number at the moment you write the file, from disk AND
from the remote.** Other agents' migration files sit in the tree **untracked**,
so `git ls-tree` alone under-counts and `ls supabase/migrations` alone can show
numbers that were never pushed. Check both, and re-check before applying — 313
was claimed twice on the same day, and one agent had to renumber 313 → 316
mid-flight.

**7. The live database is shared too.** Business data moves under your tests
while they run: a customer's `accounting_code` was cleared by another mission
and turned five unrelated specs red. Before blaming your own change for a red
test, check whether the data it depends on still exists.
