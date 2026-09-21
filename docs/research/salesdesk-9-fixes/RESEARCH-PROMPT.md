# RESEARCH — Sales desk: nine fixes (read-only discovery audit)

- Target: Cursor, Agent mode, on the test computer; workspace `D:\AfraKalaTest\app`.
- This prompt lives at `docs/research/salesdesk-9-fixes/RESEARCH-PROMPT.md`. If you received it as a chat paste and that file does not exist, save it there verbatim first — a resumed session re-reads it from disk.
- Date: 2026-09-21. Type: **read-only forensic audit. You find and prove; you do not fix anything.**

## 0. Mission

The owner (Mohammad Reza Afra) will fix nine problems in AfraKala — a Persian RTL ERP/CRM for B2B home-appliance distribution — and wants the sales area to behave as close as possible to Didar CRM, which the sales team used for years. Before any code is written, we need hard evidence of what already exists, including half-built, unwired and forgotten code, so the build completes what exists instead of duplicating it.

Your job: give every one of the 31 nodes (N1–N31, §5), 4 decision gates (G1–G4, §6) and 7 cross-cutting checks (X1–X7, §7) a verdict backed by evidence, written to `docs/research/salesdesk-9-fixes/FINDINGS.md` in the contract of §10.

A plausible guess written as a finding poisons the build prompt that will be written from this file. If you did not read it or run it in this session, it is UNKNOWN or UNVERIFIED — say so plainly. That is an honest verdict, not a failure.

## 1. Ground truth

Stated by the owner or established in earlier verified sessions. Do not re-derive these; if you find a contradiction, report it — do not correct it silently.

1. Repo `D:\AfraKalaTest\app` (GitHub `mohammadrezaafra66-arch/get-git-going`). Test server `192.168.170.8`: app port `3100`, Kong `9000`. Containers: `afrakala-lan-db`, `afrakala-lan-web`, `afrakala-lan-rest`, `afrakala-lan-auth`, `afrakala-lan-kong`, `afrakala-lan-storage`, `afrakala-lan-meta`.
2. Live test database: `afrakala` (PostgreSQL 15.6), objects owned by `supabase_admin`. The `postgres` database on the test machine is a stale copy — never use it (single exception in §3.9).
3. Production (`192.168.170.10`) is off-limits: no connection, command or query, by any tool.
4. Stack: React 19, TanStack Start/Router, Supabase self-hosted on Docker/Windows, Tailwind 4, shadcn/ui.
5. The business runs on `sales_quotes`; a «پیش‌فاکتور» is a `sales_quotes` row. `invoices` is a dead design — ignore it.
6. The owner built the incoming-call popup, «میز فروش» and «تیکت» himself with Cursor; they are deployed on both 3000 and 3100.
7. The phone system is Issabel (Asterisk-based PBX).
8. A copy of the Didar CRM audit is reported at `docs/research/didar-crm` (origin `C:\Users\AFRA\didar-audit`). Its git status is unknown (X5).
9. Screenshots from production, 2026-09-21:
   - `/pricing/sale-price-types`: four «تماس ورودی» popups — three identical for one caller, the fourth for another caller; four app tabs open; phone formats differ (10 digits without the leading 0 vs 12 digits with prefix 98); the logged-in user is «مدیر کل».
   - `/operations/work/<id>` (ticket detail): fields «عنوان», «شرح», «وضعیت», «نوع», «اولویت», «گروه», «بخش», «معیار پذیرش», «خلاصهٔ پذیرش اولیه»; no creator, creation time or assignee visible.
   - `/accounting/purchase-payments`: a row for product «رنگ سفید X287 یخچال ساید بای ساید ال جی», purchase date 26 Shahrivar 1405, 425,000,000 Toman, settlement «تسویه 2 روزه», 2 days overdue, supplier column «—».

## 2. Boundaries — read-only, enforced twice

**Allowed**
- Reading files; your built-in search tools.
- git read commands: `status`, `log`, `show`, `diff`, `grep`, `ls-files`, `cat-file`, `branch -a`, `rev-parse`, and `git fetch origin` (updates remote refs only).
- `docker ps`; `docker logs --tail 300 <container>`; `docker exec` for `printenv` of non-secret variables and for `psql` in a read-only session (§3); `docker cp` of research files to and from `/tmp` of `afrakala-lan-db`.
- Outbound HTTP probes to Google hosts in R7 only.
- Creating and editing files **only** under `docs/research/salesdesk-9-fixes/`.

**Forbidden — no exceptions.** If a step seems to need one of these, do not do it; record it as a blocker and continue with what you can.
- Creating, editing or deleting anything outside `docs/research/salesdesk-9-fixes/` — including rule files and configs.
- Any SQL that writes or changes state: `INSERT`, `UPDATE`, `DELETE`, `ALTER`, `CREATE`, `DROP`, `TRUNCATE`, `GRANT`, `REVOKE`, `COMMENT`, `REFRESH`, `VACUUM`, `NOTIFY` — and calling any application function or RPC, unless you have read its definition and it is `STABLE` or `IMMUTABLE` with no writes.
- `docker restart|stop|start|compose|build|rm`; `npm install|ci|run build|run dev`; `npx supabase`; migrations; seeds.
- `git commit|push|checkout|switch|reset|stash|merge|rebase|pull|clean|branch -d`, or anything else that moves HEAD or changes the working tree.
- Interacting with the running app's UI (forms, buttons, actions).
- Anything that touches production.
- Printing secret values — passwords, JWT secrets, API keys, tokens — to the terminal, into files or into the chat. Refer to variables by name only. (A JWT secret once leaked into a session log.)
- Customer names or phone numbers in findings. Use counts and masked patterns (§3.6).

Record in `STATE.md` which Cursor mode and auto-run setting you run under. These rules are text; the database session is additionally forced read-only in §3.

## 3. Mechanics — Windows, PowerShell 5.1 and project traps

1. **Read-only DB session, one-line ASCII query:**
   `docker exec afrakala-lan-db psql -U supabase_admin -d afrakala -At -c "SET default_transaction_read_only = on" -c "<ASCII SELECT>"`
2. **Multi-line SQL, or any Persian in the SQL or its output:** write `docs/research/salesdesk-9-fixes/sql/qNN.sql` whose first line is `SET default_transaction_read_only = on;` → `docker cp docs/research/salesdesk-9-fixes/sql/qNN.sql afrakala-lan-db:/tmp/qNN.sql` → `docker exec afrakala-lan-db psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 -f /tmp/qNN.sql -o /tmp/qNN.out` → `docker cp afrakala-lan-db:/tmp/qNN.out docs/research/salesdesk-9-fixes/out/qNN.out` → read the `.out` file with the editor. Never pipe Persian SQL through PowerShell and never pass it with `-c`.
3. **If psql asks for a password:** list only the variable *names* in `deploy/lan/.env.lan` (never values), then read the value into a shell variable in the same command that uses it, without echoing it, for example:
   `$pw = (Select-String -Path deploy/lan/.env.lan -Pattern '^POSTGRES_PASSWORD=(.*)$').Matches[0].Groups[1].Value; docker exec -e PGPASSWORD=$pw afrakala-lan-db psql -U supabase_admin -d afrakala -At -c "SET default_transaction_read_only = on" -c "select 1"`
   Adjust the variable name to what the file actually contains. Try without a password first.
4. Always `-d afrakala` and `-U supabase_admin` — it bypasses RLS, so counts are real. (Under RLS, a SELECT silently returns zero rows instead of failing.)
5. Keep terminal output English: the terminal reverses Persian for the human watching. Anything Persian goes into files.
6. Mask personal data: group by raw values inside SQL if you must, but output only aggregates; show phone formats as `regexp_replace(<col>, '[0-9]', 'x', 'g')` plus length and count. Never raw numbers or customer names.
7. **Persian string search:** use your built-in text search (UTF-8 safe), not PowerShell. Record the exact pattern and the hit count. Try spelling variants: «تامین» and «تأمین»; «ی» and «ي»; «ک» and «ك»; with and without the zero-width non-joiner («پیش‌فاکتور», «پیش فاکتور», «پیشفاکتور»).
8. **ASCII search with counts:** `git grep -n -I -e "<pattern>"` and `git grep -c -I -e "<pattern>"`; add `-w` for short words (`ami`, `won`, `lost`, `task`, `deal`). `git grep` sees tracked files only — also list untracked sources with `git status --porcelain` and search them with your built-in tool.
9. **pg_cron exception:** find where pg_cron lives with `SHOW cron.database_name` from `afrakala`. If it is `postgres`, you may read `cron.job` and `cron.job_run_details` there, read-only, and nothing else in that database.
10. Never guess table or column names; take them from `information_schema` or `pg_catalog`. Known wrong guesses from the past: `persons.full_name` (real: `display_name`), `products.title` (real: `name`).
11. `schema_full_export.sql` is unreliable. Use the live catalog: `pg_get_functiondef`, `pg_get_triggerdef`, `pg_get_constraintdef`, `pg_policies`.
12. The server timezone is UTC; calendar-day logic uses `public.tehran_today()`.
13. `curl` in PowerShell 5.1 is an alias of `Invoke-WebRequest` — use `curl.exe`.
14. Keep outputs small: aggregate, and `LIMIT 50` on listings.

## 4. Stages

Run in order. Once a stage's exit condition is met, continue to the next without asking. After each stage, append its results to `FINDINGS.md` and update `STATE.md` (stage status, what was done, next action, blockers, UTC time).

If your context is getting long, finish the current stage, update `STATE.md`, and stop with the single line `PAUSED — resume from docs/research/salesdesk-9-fixes/STATE.md`. On resume: re-read this prompt and `STATE.md`, confirm the previous stage's files exist on disk, and continue from the first incomplete stage.

Do not stop to ask questions. Collect genuinely blocking questions for §9 of the findings, continue with the stated default, and stop only on a hard blocker: the database unreachable after §3.3 (then finish all code-only work and mark DB-dependent items UNVERIFIED), a step that needs a forbidden action, or containers that are down (record; do not start them).

### R0 — Setup and ground truth
1. Create `docs/research/salesdesk-9-fixes/` with `STATE.md`, `FINDINGS.md`, `sql/`, `out/`.
2. Record: current branch; `git rev-parse --short HEAD`; `git status --porcelain` (count and list); `git log -1 --format="%h %ci %s"`; after `git fetch origin` (if it fails, record the error and use the local remote-tracking refs, stating their age), the short SHAs of `origin/main` and `origin/staging`; the running build `docker exec afrakala-lan-web printenv APP_GIT_SHA`. State whether HEAD equals the running build and whether the tree is dirty. If they differ, list the differing files (`git diff --stat <running>..HEAD`) and flag every later finding that rests on a differing file.
3. `docker ps --format "{{.Names}} {{.Status}}"` for the `afrakala-lan-*` containers.
4. Read-only DB check: `select current_database(), version(), now()`.
5. Denominators: tracked files under `src/` by extension; the TanStack route directory (discover it) and its route-file count; the migrations directory (discover it), its file count and newest 10 names; `select count(*) from information_schema.tables where table_schema = 'public'`.

Exit: ground-truth block and denominators written, each with its command.

### R1 — Domain inventory: find the forgotten code
For each term, record the tool or command, the hit count and the files. Assign every hit file to a workstream (W1–W6) or to "unrelated" with a reason. Expect noise from short or common terms; triage it.
- **W1 calls** — ASCII: `issabel`, `asterisk`, `ami`, `callerid`, `caller_id`, `caller-id`, `CallerId`, `incoming`, `call_log`, `call_event`, `calllog`, `uniqueid`, `linkedid`, `internalnumber`, `internal_number`, `extension`, `BroadcastChannel`, `supabase.channel(`, `postgres_changes`, `removeChannel`, `popup`, and `addEventListener` used with `storage`. Persian: «تماس ورودی», «تماس خروجی», «پاپ‌آپ», «مرکز پاپ‌آپ», «داخلی». Also the literal `Caller ID` (a sidebar item).
- **W2 deals** — ASCII: `deal`, `opportunit`, `inquir`, `interaction`, `salesperson`, `owner_id`, `responsible`, `created_by`, `assigned_to`, `lost_reason`, `won`, `lost`, `sales_quote`. Persian: «میز فروش», «معامله», «کارشناس فروش (اختیاری)», «متن درخواست», «موفق», «ناموفق», «علت», «دلیل», «پیش‌فاکتور», «جستجوی سریع فروش».
- **W3 activities** — ASCII: `task`, `activit`, `follow_up`, `followup`, `due_date`, `reminder`, `snooze`, `postpone`. Persian: «فعالیت», «پیگیری», «میز کار», «یادآور», «سررسید».
- **W4 tickets** — ASCII: `operations/work`, `work_item`, `ticket`, `topic`. Persian: «تیکت», «موضوع», «معیار پذیرش», «بایگانی».
- **W5 purchases** — ASCII: `purchase`, `supplier`, `vendor`, `purchase-payments`. Persian: «خرید», «تأمین‌کننده», «تامین کننده», «ثبت پرداخت خریدها», «پنل خرید».
- **W6 pricing and sheets** — ASCII: `google`, `sheets`, `spreadsheet`, `gviz`, `docs.google.com`, `purchase_price`, `my-workbench`, `pricing_recompute_queue`, `claim_pricing_recompute_jobs`, `PRICING_WORKER_TOKEN`, `availability`, `in_stock`, `stock`. Persian: «کارگاه قیمت», «موجود», «ناموجود».
- **Catalog**: every table or view in `public` whose name contains `call`, `deal`, `inquir`, `interaction`, `task`, `activit`, `ticket`, `work`, `purchase`, `supplier`, `quote`, `notif`, `lost`, `reason`, `pricing` or `sheet` — with `count(*)` and the latest value of its main timestamp column, if it has one.

Exit: the inventory table is written and every hit file is assigned.

### R2 — W1 calls: N1–N6 and G1
1. Trace one call event end to end, quoting each hop: the sender (in this repo or external?) → ingestion endpoint, route or function → storage tables (columns, constraints, indexes, triggers) → delivery to the browser (Realtime or polling) → the popup component and its store → dismissal.
2. Count mount points of the listener and popup components: every JSX usage and every place a subscription is created. More than one active subscription per tab is a prime suspect for N1.
3. Quote the subscription's cleanup on unmount and on route change — or show its absence.
4. Cross-tab mechanisms: `BroadcastChannel`, `storage` events, popups kept in shared or local storage, service workers.
5. Per-user visibility rules: how they are evaluated, and whether one event can match several rules for one user and so produce several popups (quote).
6. Phone normalization: list every normalization function (duplicates belong in §6 of the findings), which one the popup lookup uses, and the masked formats actually stored — in the event table and in the persons' phone columns — with counts per pattern.
7. If the event table has rows on test: the distribution of events per call, grouped by the best available key (a call id if one exists; otherwise phone plus minute, grouped inside SQL, output as aggregates only). Say whether events arrive once per ringing extension, once per state change, or otherwise.
8. The call-activity form: its component, where its state lives, and exactly what happens when a new call event arrives — state replaced, `key` changed, reset, navigation (quote the path). State what the user would see.
9. «افزودن معامله» from the call form: any existing wiring? Can the deal form open with a customer prefilled (quote its props or route params)?
10. G1: does any call event carry an Asterisk `uniqueid` or `linkedid`, or another per-call id? If the sender is outside the repo, say so, record exactly what the ingestion accepts, and add an owner question naming what to check on the sending machine.

Exit: N1–N6 and G1 have verdicts with evidence.

### R3 — W2 deals: N7–N15, G2, X2, X3
1. Find the form that contains «کارشناس فروش (اختیاری)» and «متن درخواست», and the table and write path behind it (quote). Establish whether «میز کار» and «میز فروش» are one screen or two (quote both routes).
2. Deal columns: responsible or salesperson; creator (`created_by` or equivalent) — present, defaulted, populated (count NULLs); timestamps; status values actually used (`select <status>, count(*) ... group by 1`); lost-reason columns; product linkage — an item table or free text.
3. How «میز کار» selects a user's deals (quote the filter).
4. X2 — RLS: quote `pg_policies` for every deal table. Decide, from the quoted expressions: after a creator sets someone else as responsible, can the creator still SELECT the deal? Can a user insert a deal whose responsible is another user?
5. Any trigger or function that notifies on assignment (link to X1).
6. N10: any existing report or filter by creator.
7. N11: every product-search component and function (including the one behind «جستجوی سریع فروش»): which fields it searches (name, code, brand), whether it returns inactive or unavailable products, and whether it is reusable inside a form (props). Duplicates go to §6 of the findings.
8. N14: any existing "mandatory reason" mechanism (a status plus reason) on any entity — an earlier audit reported one exists; quote it and name the entity.
9. N15 and G2: the UI's `sales_quotes` creation path (quote); the initial status of a new quote; whether any deal ↔ quote link exists (for example a `deal_id` column); and a table of every consumer of `sales_quotes` for KPIs, receipt allocation, credit and scoring — each with the status filter it applies (quote). Answer G2: would a quote created from a still-open deal count in KPIs, credit or scoring from the moment it is created? If this depends on status, name the status that keeps it out.
10. X3: the scoring or gamification functions that credit sales (`calculate_employee_score` and related): which deal or quote field identifies the credited employee (quote)?

Exit: N7–N15, G2, X2 and X3 have verdicts.

### R4 — W3 activities: N16–N21, X1
1. `tasks` and any activities, interactions or follow-ups table: columns, row count, latest row time, every writer in code, and the UI routes and menu entries that show it.
2. The current «ثبت فعالیت» for incoming and outgoing calls: its table; the activity types that exist today (write the list to an `.out` file); whether «تماس ورودی» and «تماس خروجی» are data or hardcoded.
3. Anything existing for reminders, postponing or overdue logic (quote).
4. X1 — notification pipeline: the queue table, generator functions and cron jobs (§3.9 — an earlier finding said the cron job ran on the wrong database), the latest generated row time, unread counts. Verdict: alive or dead on test, with evidence.

Exit: N16–N21 and X1 have verdicts.

### R5 — W4 tickets: N22–N24
The route `/operations/work/$id` and the ticket list: the table behind them; columns for creator, creation time and assignee, and which of them the UI renders (quote); status values in use with counts; how the list filters statuses today; any change-history mechanism for tickets — `audit_logs` or a dedicated table (quote its trigger or writer).

Exit: N22–N24 have verdicts.

### R6 — W5 purchases: N25–N27, G4
1. The data source of `/accounting/purchase-payments` (view or table); the supplier column, its nullability, its FK including the `ON DELETE` action, and every CHECK and trigger on the purchase tables (quote `pg_get_constraintdef` and `pg_get_triggerdef`).
2. Every code path that inserts purchases — UI forms, RPCs, imports, older Lovable-era code. For each: is a supplier required (quote the validation or show its absence)?
3. Rows without a supplier on test: count; for each, created time, creator if recorded, and source path if recorded. Look for the X287 purchase by product name `ILIKE '%X287%'` in the discovered name column.
4. G4 — which hypothesis explains the X287 row: (1) no validation; (2) the supplier was deleted or merged and `ON DELETE SET NULL` emptied it; (3) a display bug — the supplier is stored where the list does not read. Give the evidence for your verdict. If production data is required, say so and add the query to `PROD-PROBES.sql` (X7).

Exit: N25–N27 and G4 have verdicts.

### R7 — W6 pricing and Google Sheet: N28–N31, G3
1. The write path of «کارگاه قیمت من» (`/pricing/my-workbench`): component → RPC or table (quote) → triggers fired (quote) → how sale prices get recomputed (synchronously, or through `pricing_recompute_queue`).
2. N31 — `pricing_recompute_queue` on test: pending count, oldest `enqueued_at`, latest `processed_at`; any worker or schedule: whether `PRICING_WORKER_TOKEN` exists in the web container (`docker exec afrakala-lan-web sh -c "printenv PRICING_WORKER_TOKEN >/dev/null && echo SET || echo UNSET"`), pg_cron jobs, scheduled tasks referenced in the repo.
3. Product identity and availability: the product code column an outsider would use; where «موجود» / «ناموجود» is stored and every writer of it (quote).
4. Any existing Google integration code — Sheets, Apps Script, `gviz`, CSV export: quote it, or show the searches that found none.
5. G3 — outbound reachability from the test host: `curl.exe -sS -o NUL -w "%{http_code}" --max-time 10 https://docs.google.com/`, the same for `https://script.google.com/` and `https://sheets.googleapis.com/`; and from inside the web container: `docker exec afrakala-lan-web node -e "fetch('https://docs.google.com/').then(r=>console.log(r.status)).catch(e=>console.log('ERR '+e.message))"`. Record codes or errors verbatim. If blocked, record it; do not try proxies or workarounds.

Exit: N28–N31 and G3 have verdicts.

### R8 — Cross-cutting: X4–X7, duplicates, integration map
1. X4 — permissions: for each route touched by W1–W4, its module key and whether `role_permissions` rows exist for it. `has_dynamic_permission` grants access to all roles when a module has no rows, so a module without rows is open.
2. X5 — the Didar audit copy: `git ls-files docs/research/didar-crm | Measure-Object -Line` versus `(Get-ChildItem -Recurse -File docs/research/didar-crm).Count`. Tracked, partially tracked, or untracked?
3. X6 — commands and safety net, discovered, not run: test, typecheck and build commands from `package.json` and Playwright configs; whether `scripts/schema-snapshot.sh` exists; whether a visual-regression branch exists (`git branch -a --list "*visual-regression*"`). Known facts: typecheck takes about 3 minutes with a baseline of 70 errors; `npm run build` is broken on Windows.
4. X7 — data sufficiency: can test data answer N1, N27 and G4? If not, write `docs/research/salesdesk-9-fixes/PROD-PROBES.sql`: ASCII only, first line `SET default_transaction_read_only = on;`, SELECT only, each query preceded by a comment stating its purpose, aimed at the production database (named `postgres` on production). Do not run it — the owner decides whether and how.
5. Duplicates and overlaps: every group of implementations doing the same job found in R1–R7 — phone normalizers, product searches, popup stores, notification writers, status vocabularies. For each: locations, which one is in use (its importers), and a consolidation suggestion. This section may be empty only if you show the searches that found nothing.
6. Integration map: for each of W1–W4, the flow as hops with file:line, the missing wires marked, and every mismatch between the two sides quoted from both.

Exit: X4–X7 have verdicts; duplicates and integration map are written.

### R9 — Self-check and close
1. Re-list N1–N31, G1–G4 and X1–X7; confirm each has a verdict and evidence, or UNVERIFIED with a reason.
2. Coverage arithmetic: files inventoried in R1 = assessed + unassessed-with-reason; tables inventoried = assessed + unassessed-with-reason.
3. Name three ways this report could be wrong — for example, the audited tree differs from the running build — and check each.
4. The final line of `FINDINGS.md`: `STATUS: COMPLETE` only if every item has a verdict and the arithmetic closes; otherwise `STATUS: PARTIAL — <what remains>`.
5. Reply in chat, in English: the path of `FINDINGS.md`, the status line, and the owner questions (or "None").

## 5. Nodes to verdict

Verdicts: `EXISTS-WORKS` · `EXISTS-BROKEN` · `EXISTS-PARTIAL` · `NOT-CONNECTED` (both sides exist, the wire is missing) · `ABSENT` · `UNVERIFIED` (could not establish — say why).

"Claim" is what the owner or the sales team said, quoted verbatim, or a hypothesis marked as such. "Target" is the confirmed future behavior, given only so you can describe the gap — do not build it.

**W1 — calls**
- **N1 Duplicate popups.** Claim (owner): «وقتی یک نفر زنگ میزنه 4تا پاپ پاپ به اسمش باز میشه در صورتی که باید یدونه باز بشه». Target: exactly one popup per call, across all open tabs.
- **N2 Unique call id.** Claim (hypothesis): Issabel may emit several events per call; unknown whether a per-call id is carried. Target: a per-call id available end to end.
- **N3 Per-user visibility and display duration.** Claim (owner): «تنظیمات اینکه چه کسس ببیند را قبلا انجام داده ایم هر کاربر برای خودش میتواند تنظیم بکند». Target: current per-user settings kept; auto-close after a per-user duration.
- **N4 Call-activity form lost on the next call.** Claim (sales team): «وقتی نفر بعدی زنگ میزنه کلا همه چی میپره». Target: the half-filled form is never touched; a new call is a separate popup.
- **N5 Per-call auto-saved draft.** Claim (hypothesis): absent. Target: a draft per call; the user can switch between calls.
- **N6 «افزودن معامله» from the incoming-call form.** Claim (sales team): «موقع ثبت ورودی افزودن معامله هم اون جا داشته باشیم». Hypothesis: both forms exist but are not wired. Target: the button opens the deal form with the customer prefilled; the call activity is linked to the new deal.

**W2 — deals**
- **N7 The field «کارشناس فروش (اختیاری)».** Claim (owner): «الان اسم این فیلد کارشناس فروش اختیاری هستش این عنوان باید به مسئول معامله تغییر بکند». Target: renamed «مسئول معامله», empty by default and mandatory.
- **N8 Deal creator.** Claim (owner, requirement): «ایجاد کننده معامله میتونه اتومات مشخص بشود»; current state unknown. Target: recorded automatically, read-only, shown as a column and filterable.
- **N9 Deal reaches the responsible's «میز کار».** Claim (owner, requirement): «باید ان معامله به میز کار ان شخص منتقل شود». Target: appears in the responsible's workdesk; a «من مسئول شدم» notification; the creator keeps visibility.
- **N10 "Registered for others" report.** Claim (hypothesis): absent. Target: per creator × date × count, drilling down to the deals.
- **N11 Product search in the request section.** Claim (owner, requirement): «یه کادر یا بلاکی قبل از متن درخواست داشته باشیم که حالت سرچ داشته باشد». Hypothesis: a product search exists elsewhere (e.g. «جستجوی سریع فروش») but not in this form. Target: search by partial code, name or brand over all defined products, available or not.
- **N12 Structured deal items.** Claim: unknown. Target: several items with quantity and a per-item note; the free text stays.
- **N13 Deal statuses.** Claim: unknown. Target: «جاری / موفق / ناموفق» with a timestamp per transition; reopening to «جاری» allowed.
- **N14 Lost reason.** Claim (sales team): «افزودن علت ناموفق شدن معامله». An earlier audit (2026-09-16) reported a mandatory status reason on some entity. Target: a mandatory dialog on «ناموفق شد» choosing from an admin-managed list, plus an optional note and «سایر»; one report.
- **N15 Pre-invoice from a deal.** Claim (sales team): «بشه از داخل معامله موفق پیش فاکتور ثبت کرد»; the owner later chose: from any deal that has a customer and at least one product. Hypothesis: both sides exist, not wired. Target: many quotes per deal, linked both ways.

**W3 — activities and follow-up**
- **N16 Activity model.** Claim (sales team): «قسمت فعالیت باز برای کارشناس فروش مخصوص مواقع پیگیری گزاشتن برای مشتری». An earlier audit reported `tasks` exists (about 11 rows, in the menu). Target: type, title, due date with optional time, owner, creator, links to customer and deal, done flag with result.
- **N17 Result buttons.** Claim (hypothesis): absent. Target: «این فعالیت انجام شد» and «ذخیره و ایجاد فعالیت دیگر».
- **N18 Activities page and red badge.** Claim (hypothesis): absent. Target: ranges «تاریخ گذشته», «امروز», «فردا», «تا آخر هفته», «تاریخ دیگر»; the menu badge counts today's plus overdue open activities.
- **N19 Follow-up icon on deals.** Claim (hypothesis): absent. Target: yellow = nothing planned, red = overdue, green = today, grey = future; a filter for deals with no activity.
- **N20 Postpone and reminders.** Claim (hypothesis): absent. Target: postponing keeps the original due date; an in-app reminder only when a time is set.
- **N21 Activity types.** Claim: unknown. Target: Didar's 17 types plus «یادداشت ساده».

**W4 — tickets**
- **N22 Ticket creator, time and assignee.** Claim (owner): «میخواهم مشخص باشد که تیکت را چه کسی چه تاریخی چه ساعتی برای یک نفر گذاشته است». Target: shown on the detail page and in the list.
- **N23 Closed tickets leave the active list.** Claim (owner): «وقتی انجام شد ... دیگه اونجا نمایش داده نشود بره توی بایگانی و ذخیره بشه لاگش». Target: «در حال اجرا» and «بسته شده» sections with counters; a closed date; reopening allowed with history.
- **N24 Ticket change history.** Claim: unknown. Target: who, when and what for every change.

**W5 — purchases**
- **N25 A purchase can be saved without a supplier.** Claim (owner): «مسئول خرید یه خریدی ثبت کرده ... تامیین کننده هیچ اسمی ندارد». Target: impossible.
- **N26 Supplier rule at database level.** Claim (owner, requirement): «هیچکس بدون نوشتن اسم تامیین کننده نتواند سند خرید ثبت بکند». Target: a trigger, so a direct PostgREST PATCH cannot bypass it.
- **N27 Existing purchases without a supplier.** Claim: unknown. Target: counted and traced.

**W6 — pricing and Google Sheet**
- **N28 Sheet → purchase price and availability.** Claim (owner, requirement, summarized): outsiders edit a price column (Persian or Latin digits) and an available/unavailable dropdown per product code. Target: designed after this research.
- **N29 The write path of «کارگاه قیمت من».** Claim: `/pricing/my-workbench` is where purchase prices are updated today. Target: reused by the sheet — no parallel write path.
- **N30 Test host → Google reachability.** Claim: unknown. Target: known.
- **N31 Pricing recompute worker.** Claim (last known, 2026-09-14, production): `pricing_recompute_queue` had no automatic worker; `PRICING_WORKER_TOKEN` was not passed to the web container. Target: known state on test.

## 6. Decision gates

- **G1** — Does a unique per-call id reach AfraKala, and from where? (Decides how popup duplicates are prevented.)
- **G2** — Would a `sales_quotes` row created from a still-open deal count in KPIs, credit or scoring immediately? Which status would keep it out? (Decides whether the owner is asked again before building N15.)
- **G3** — Is Google reachable from the test host and from the web container, and does any Google integration code exist? (Input to the sheet design.)
- **G4** — Which hypothesis explains the supplier-less X287 purchase?

## 7. Cross-cutting checks

- **X1** Notification pipeline alive or dead (R4).
- **X2** RLS: creator versus responsible visibility on deals (R3).
- **X3** The deal or quote field that scoring credits (R3).
- **X4** Module permissions and `role_permissions` rows for routes touched by W1–W4 (R8).
- **X5** Git status of `docs/research/didar-crm` (R8).
- **X6** Test, typecheck and build commands and safety-net tools — discovered, not run (R8).
- **X7** Whether test data suffices; `PROD-PROBES.sql` if not (R8).

## 8. Evidence rules

- A claim about what code or configuration says needs the file path, the line range and the verbatim excerpt (at most 15 lines).
- A claim about system state — row counts, environment, running build, HTTP reachability — needs the exact command, its verbatim output and the exit code, or the path of the `.out` file.
- A claim of absence needs the searches that came up empty: the tool or command and a zero count.
- Anything else is `UNVERIFIED`, with the reason.

## 9. Owner questions

Only questions that genuinely block a verdict — for example, which machine sends call events. At most five; each states what it blocks and the default you assumed. If none, write "None."

## 10. FINDINGS.md contract

English; Persian UI strings quoted verbatim; masked personal data only.

```
# FINDINGS — sales desk nine fixes (read-only research)
STATUS: COMPLETE | PARTIAL — <reason>

## 0. Ground truth
branch · HEAD · running APP_GIT_SHA · dirty state · origin/main · origin/staging · containers · DB check

## 1. Domain inventory
per term: tool/command · hit count · files; per workstream: file list

## 2. Node verdicts
summary table N1–N31: ID · verdict · one-line reason
then per node: ID · node · claim (quoted) · verdict · evidence · gap vs target ·
suggested class FIX / EXTEND / CONNECT / BUILD / CONSOLIDATE (non-binding)

## 3. Decision gates G1–G4
answer · evidence · confidence

## 4. Cross-cutting checks X1–X7
verdict · evidence

## 5. Integration map
per flow: hops with file:line · missing wires · mismatches quoted from both sides

## 6. Duplicates and overlaps
locations · which is in use (importers) · consolidation suggestion — or the searches that found none

## 7. Constraints for the build
stack and versions from manifests · test/typecheck/build commands (discovered, not run) ·
conventions observed · anything contradicting the ground truth

## 8. Coverage
denominators · assessed · unassessed with reason · the arithmetic

## 9. UNVERIFIED / UNKNOWN

## 10. Owner questions

STATUS: COMPLETE | PARTIAL — <reason>
```
