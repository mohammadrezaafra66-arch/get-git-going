# BUILD — Torob Eye: make the Torob section of دستیار see Torob by itself · CHAINED · UNATTENDED AFTER ONE QUESTION BATCH

- **Target:** Cursor Agent mode (or Claude Code) on the test computer, workspace `D:\AfraKalaTest`.
- **Run folder:** `D:\AfraKalaTest\research\torob-ops\build-01\`. Keep `HANDOFF.md` current after every step (done / next / blockers / exact resume point), raw outputs under `evidence\<stage>\`, and finish with `REPORT.md`. If a session dies, a fresh session reads `BUILD-PROMPT.md` + `HANDOFF.md` and resumes from the recorded point without redoing finished work.
- **Output language:** English in terminal and chat (the terminal reverses Persian). Persian only inside files, as UI strings.
- **Shape:** Stage 0 is read-only research. Then ONE question batch to the owner. Then Stages 1–5 run to the end without pausing. Research and building never mix: no file in the repo changes before the owner has answered the batch.

## 1. Ground truth

### 1.1 Owner decisions (confirmed in interview, 4 Mehr 1405 — do not re-ask)
1. The Torob section must be fully self-sufficient inside دستیار: دستیار reads Torob itself. No dependency on any outside bot (the Purchista bot, AfraAgent, or a separately running `D:\TorobBot`).
2. The existing operations desk (`/torob-ops`, runs, findings, shops, accounts, settings, templates, kill switch, report path) is **kept and completed, not rebuilt**.
3. Wanted outputs, all six: (a) per product, the cheapest Torob seller **with name and price**; (b) suspected-bait queue and reporting to Torob; (c) the price observatory's Torob columns filled, so sales and pricing see market prices; (d) an alert when someone becomes cheaper than us; (e) competitor price history and a chart over time; (f) automatic discovery of the Torob link for products that have none.
4. Frequency: several times a day, automatic.
5. The proven Torob-reading logic in `D:\TorobBot` (on this same test computer) is **ported** into the repo, not rewritten from scratch.
6. Scope of monitoring: only products whose observatory column «پایش فعال» is on.
7. Link discovery writes links automatically, with no human approval step.
8. Automatic reporting to Torob is wanted from day one (on production). The owner was warned that auto-link + auto-report forms a chain with no human in it and **accepted that risk explicitly**. Do not add a human-approval gate. Existing safeguards (kill switch, hourly cap, repeat window) stay.
9. Hard prerequisite accepted by the owner: automatic reporting stays OFF until the own-shops list (`torob_ops_own_shops`) is filled. Enforce it in code, not in documentation.
10. Alerts go to the owner only, as an in-app دستیار notification. The in-app notification system has a history of silently stopping; prove it delivers before relying on it.
11. When Torob blocks (HTTP 490, CAPTCHA, ban page): retry with growing back-off; alert the owner only if blocking persists for several hours.
12. Network: read Torob from the company IP, start slow, observe (no proxy now).
13. The owner has Torob accounts and will enter them into the account pool himself.
14. Build order: Stage 1 the eye + observatory filled → Stage 2 seller-level findings + alert + history → Stage 3 link discovery → Stage 4 auto-report switched on. Each stage tested on 3100 before the next.

### 1.2 Measured facts (evidence: `D:\AfraKalaTest\research\torob-ops\audit-01\RESEARCH.md` and its `evidence\`)
- 3100 ran `APP_GIT_SHA=c8396231` on 4 Mehr; `D:\AfraKalaTest\app` HEAD was `8f4ef3ee` on `test/collab-e2e-20260921-2352`. The `app` tree's "modified" files are CRLF-only noise except `docs/plans/collab-rollout-plan-20260922.md`; 15 stashes exist. Do not touch `app`'s branch, stashes or files.
- Scan chain: `TorobOpsRunsPage.tsx` «شروع اسکن» → `torobOpsCreateScan` (`src/lib/torob-ops/functions.ts`) → `createAndRunTorobOpsScan` (`src/lib/torob-ops/scan.server.ts`) **inside the web process**. Our price from `product_computed_prices_public.rounded_sale_price` (BASE sale price type). Market price from dynamic table slug `afrakala-product-price-observatory` via RPC `query_dynamic_table_rows_v2`, field `torob_min_price_toman`. Bait check: `src/lib/torob-ops/bait.server.ts`, plain `fetch`, no cookies, cap `MAX_BAIT_CHECKS_PER_SCAN = 2`.
- Observatory Torob columns (bot-editable): `torob_avg_price_toman`, `torob_min_price_toman`, `torob_max_price_toman`, `torob_seller_count`, `torob_last_seen_at`. Empty in every row on test and production. The observatory holds only an aggregate min, never seller identity.
- Bot upsert route exists and has never been called: `src/routes/api.public.bot.dynamic-tables.$tableId.rows.upsert.ts` (Bearer + `authenticateBot`). Raw table «داده‌های استخراج‌شده ترب - پورچیستا» (`torob-purchista-extracted-data`) has 0 rows.
- Path A is in the deployed build: `path-a.server.ts`, hook `/api/public/hooks/process-torob-ops-report-queue`, host script `deploy/lan/scripts/torob-ops-report-worker.ps1` (not known to be scheduled), settings row `auto_report_enabled=false`, `kill_switch=false`, hourly cap 10, repeat window 72h. Env name `TOROB_OPS_SIMULATE_SUBMIT` exists on the test box.
- Old Phase-2 path: job type `TOROB_LIMITED_READONLY`, `automation/worker-runtime/src/drivers/torob_limited_readonly.py`, paused by a Python constant; no consumer deployed.
- Security gaps: `torob_ops_findings` write policy is `ALL` for admin/manager/sales, so a direct PostgREST PATCH can set any status (including `queued_for_report`/`reported`) bypassing `updateFindingStatus`. `torob_ops_sessions` and `torob_ops_report_logs` have no DELETE policy while `authenticated` holds the DELETE grant.
- Production (4 Mehr): 7 scans of 82–85 products, 0 findings; own shops 0; account pool 0; one user with module access. Live check: two products were 18% and 22% cheaper on Torob. One product link points to the wrong colour variant (LG fridge: ours white, link silver).
- Torob history: SPA; plain HTTP scraping hit HTTP 490; Playwright is the path that worked in `D:\TorobBot`. Outbound `https://torob.com/` returned 200 from the web container on 4 Mehr.

### 1.3 Environment and hard rules (every one comes from a real incident)
- Test server `192.168.170.8`: app `:3100`, Kong `:9000`. Containers `afrakala-lan-*`. Live DB is `afrakala` (never `postgres`), owner role `supabase_admin`.
- **Production is untouchable:** no connection of any kind to `192.168.170.10`, `192.168.1.43`, or `C:\afrakala`; never run `release/build.ps1`, `release/apply-release.ps1`, or any `prod-*` script.
- Git flow: new branch `feature/torob-eye` from `origin/staging` in worktree `D:\AfraKalaTest\wt-torob-eye`. Never edit inside `D:\AfraKalaTest\app`. PRs go to `staging` only, merged with `gh pr merge <n> --merge`. Never `--admin`, never `/autofix-pr`, never change repo settings or `.github/workflows/**`. Verify every PR claim with `gh pr view <n> --json state,mergedAt,files`.
- Migrations: numbered after the highest existing number on `origin/staging`, idempotent, each with a matching `docs/verification/<n>-down.sql`. Apply to the test DB **only after the migration is committed**, and only via `docker cp` + `docker exec -e PGPASSWORD=... afrakala-lan-db psql -U supabase_admin -d afrakala -v ON_ERROR_STOP=1 -f /tmp/<file>.sql`. Never pipe SQL through PowerShell, never `psql -c` with multi-line SQL. Any Persian text in SQL: from the file only, then verify it round-tripped by comparing `encode(convert_to(col,'UTF8'),'hex')` against the expected hex.
- Before redefining any existing function: `pg_get_functiondef` from the live DB, save it, diff against the repo file, and build on the live version.
- After every migration: `docker restart afrakala-lan-rest`.
- Every new permission module key gets explicit `role_permissions` rows (no row = open to all roles via the `has_dynamic_permission` fallback).
- Business rules that must hold go in triggers/constraints, not only in RPCs or server functions. CHECK comparisons on JSONB/nullable values are wrapped in `COALESCE(..., false)` / `IS DISTINCT FROM`.
- Do not call `has_role` / `has_any_role` through `supabase.rpc(...)` (PGRST203 overloads); read `user_roles` with the admin client.
- Specs count rows; never trust a 204 or a 200 alone.
- Typecheck: `scripts/ci/typecheck-against-baseline.mjs` (baseline `ci/typecheck-baseline.txt`), once at the end of each stage, not repeatedly. No new baseline entries without a separate commit and a written reason.
- Windows `npm run build` is broken; build inside Docker. Set `$env:DISABLE_LOVABLE_MCP="1"` before any build. `docker compose` always with `--env-file` pointing at the LAN env file. After deploy, `docker exec afrakala-lan-web printenv APP_GIT_SHA` must equal the commit you built; if not, rebuild with `--no-cache` and `--force-recreate`.
- Never write secrets (passwords, JWTs, API keys, bot keys, Torob cookies/sessions, password hashes) into any file, log, commit or chat.
- Never weaken, skip or delete a test to get green; no `@ts-ignore` escapes.
- **D:\TorobBot is read-only.** Read and copy from it; never modify, run migrations on, or start it.

## 2. Stage 0 — Research (read-only) → `RESEARCH.md`

Nothing in any repo, DB, or container changes in this stage. Evidence rules: code as `path:line` quotes; SQL as ASCII `.sql` files run with `psql -f`, output saved; counts, never secret rows.

- **R1. Baseline.** `origin/staging` tip SHA and date; deployed `APP_GIT_SHA` on 3100; whether they differ and what differs (`git log --oneline <deployed>..origin/staging`). Highest migration number on `origin/staging`. Run the typecheck baseline script and the existing torob e2e specs against 3100; record the numbers.
- **R2. How 3100 is deployed.** Read the recent deploy logs and runbooks (for example `docs/research/_torob_3100_ready_deploy.out`, `_torob_staging_3100_deploy.out`, `deploy/lan/*`, `README`/runbook files) and determine the established procedure for putting a branch onto 3100: from `D:\AfraKalaTest\app` after merge, or from a worktree's own compose file. Write the exact command sequence you will use. If the only established path requires changing `D:\AfraKalaTest\app`'s branch, that becomes question Q1.
- **R3. Port inventory of `D:\TorobBot`.** Map its Torob-reading core: product page fetch, seller-list extraction (including `api.torob.com/v4/base-product/sellers/?prk=...` if used), search/lookup, cookie/`trb_clearance` handling, 490/CAPTCHA detection, rate limiting, Playwright setup, login/OTP, and report submission if present. For each: file:line, dependencies, tests, whether it touches its own DB. Record its Python version and requirements. Identify the smallest self-contained set of modules to port. Do not run it.
- **R4. Path A reality.** Trace auto-report end to end: what `path-a.server.ts` does when it "submits" (a real HTTP/browser action on Torob, or simulated), what `TOROB_OPS_SIMULATE_SUBMIT` changes, how accounts/sessions/cookies are used, what `torob-ops-report-worker.ps1` calls and whether it is registered in Windows Task Scheduler (`schtasks /query /fo LIST /v`, read only). Can the current web container perform a real Torob submission at all?
- **R5. Observatory write path.** Prove how the bot upsert route authenticates and what payload it accepts for `afrakala-product-price-observatory` (quote the code); list active bot keys by name/scope only (never values). Determine the observatory's «پایش فعال» field key and how to read "monitoring on" products. Count them on test.
- **R6. Test data.** On `afrakala` (test): active products; with `torob_url`; with a computed BASE sale price; «پایش فعال» on; own shops; accounts; notification tables (discover their names) with the most recent notification delivered to any user and when.
- **R7. Notifications.** Find the in-app notification mechanism(s): tables, insert path, UI bell/list, realtime or polling. Prove whether a notification inserted now for the owner's user reaches the UI — design the probe here, run it in Stage 1.
- **R8. Host capacity.** Host RAM/CPU free, Docker memory limits, current container footprint (`docker stats --no-stream`). Can a Playwright Chromium worker (plan ~1–1.5 GB) run beside the stack?
- **R9. Duplicates.** Every existing piece that already does any part of the plan: the Phase-2 `TOROB_LIMITED_READONLY` path, `market_product_matches` and its resolve API, the Purchista raw table, any price-history or chart component, any scheduler/cron/worker container, any link-matching code. For each: reuse, extend, or retire — with reason.
- **R10. Action plan.** Produce the table in §4 filled with real paths, each row with exactly one action (FIX / EXTEND / CONNECT / BUILD / CONSOLIDATE) and the evidence id that justifies it. Anything the research proves wrong in §1.2 is flagged at the top of `RESEARCH.md`.

Write `RESEARCH.md` (sections: baseline, deploy procedure, port inventory, path A reality, observatory write path, test data, notifications, capacity, duplicates, action plan, facts from §1.2 that turned out wrong) and `QUESTIONS.md`. Then stop and send the question batch.

## 3. The question batch (the only pause)

Post in chat, in English, numbered, each with options and a **default**. Include only what research could not settle. Start from this list; drop any question research already answered and add only genuinely new decision unknowns:

- **Q1. 3100 deploy route** if R2 found it needs `D:\AfraKalaTest\app` switched — default: deploy from the worktree's own compose context, `app` untouched.
- **Q2. Crawl pace** — default: one Torob page at a time, 30–60 s randomized between requests, cycle every 4 hours from 08:00 to 22:00 Tehran time.
- **Q3. Block alert threshold** — default: back-off 15 min doubling up to 2 h; alert the owner after 3 continuous hours blocked; notify again on recovery.
- **Q4. Existing `torob_url` values** — default: link discovery fills only empty links and never overwrites an existing one (the known wrong LG link is listed in the report for the owner, not changed).
- **Q5. Low-confidence matches** — default: if the best candidate's score is below the threshold, leave the link empty and record the candidate; never write a guess.
- **Q6. Test products** — default: turn «پایش فعال» on for up to 15 active products on the test DB that have a computed BASE sale price, spread across brands; list them in the report.
- **Q7. Real submission during testing** — default: on 3100 every report submission runs with `TOROB_OPS_SIMULATE_SUBMIT` on; zero real complaints are sent to Torob from the test box. Option: allow exactly one real submission against a finding the owner names.
- **Q8. Retire the Phase-2 `TOROB_LIMITED_READONLY` path** — default: leave code in place, mark deprecated in docs, point to the new worker.
- **Q9. Torob accounts on 3100** — default: none needed for Stages 1–3; Stage 4 is tested with the simulate flag. Option: the owner adds accounts to the 3100 pool before Stage 4.

Say: "Reply with answers, or reply 'defaults'. After this I will not ask again." Record the answers verbatim in `DECISIONS.md` and in `HANDOFF.md`. If the reply is "defaults", every default applies. Then continue to Stage 1 without further contact.

## 4. Architecture defaults (architect-default — Stage 0 may correct them with evidence; record every deviation)

- **The eye:** a new service `torob-eye` in the LAN docker-compose stack, source under a new repo directory (for example `workers/torob-eye/`), Python + Playwright Chromium, containing only the ported reading core from `D:\TorobBot`. It runs its own scheduler, reads its settings from the DB each cycle, and survives container restarts. Container name follows `afrakala-lan-*`.
- **Settings:** EXTEND `torob_ops_settings` (not a new settings table) with eye settings: enabled, pace, cycle hours, back-off, block-alert hours, link-discovery enabled, bait-check page cap. Editable on the existing `/torob-ops/settings` page by admin.
- **Data (BUILD):** `torob_eye_runs` (cycle id, started/finished, status, products attempted/succeeded/failed/skipped with reasons, block events) and `torob_offer_snapshots` (product id, torob url, seller name, seller shop id/url, price in toman, availability, is-own-shop flag, fetched_at, run id) — this is both seller identity and price history. Index for "latest per product per seller" and time-series reads. RLS: SELECT for the torob-ops roles; writes by `service_role` only.
- **Observatory (CONNECT):** after each product is read, write the five Torob columns through the existing bot upsert route with a dedicated bot key named `torob-eye` (created in Stage 1, value stored only in the env file, never in git).
- **Scan (EXTEND):** `scan.server.ts` uses the latest snapshots per seller (not only the observatory min): cheapest non-own seller vs our price → finding carries seller name, seller price, our price, gap. Keep the observatory fallback. Findings are created automatically after each eye cycle, not only by the button. Every scan run records why products were skipped, and `/torob-ops/runs` shows it plus a per-run detail view (a run with 0 findings must say why).
- **Bait check (EXTEND):** moves into the worker (Playwright, real page render); page cap from settings; the web-process `fetch` path is retired only after the worker path is proven (CONSOLIDATE, zero remaining callers).
- **Alerts (BUILD, onto the existing notification mechanism found in R7 — FIX it first if it does not deliver):** owner-only in-app notification when a product's cheapest non-own Torob seller drops below our price, with dedupe (one alert per product per seller per price level per 24 h), plus block-persisting and recovered notifications.
- **History (BUILD UI):** a product view in the torob-ops area with a price-over-time chart per seller and our price line, reachable from findings and dashboard; use the chart library already in the app.
- **Link discovery (BUILD):** the worker searches Torob for products with «پایش فعال» on and an empty `torob_url`, scores candidates (brand, model code, capacity, colour must match; colour mismatch is a hard reject — the LG case), writes the best match automatically when it clears the threshold, and logs every assignment and rejection in a `torob_link_assignments` table (product, url, score, reasons, assigned_at, source=`torob-eye`) so any link can be traced and reverted.
- **Auto-report (CONNECT + EXTEND path A):** reports run from the worker (it has the browser); reuse path A's queue, accounts, templates, kill switch, hourly cap, repeat window, and report logs. Enforce in the DB and the server: auto-report cannot be enabled, and the queue will not process, while `torob_ops_own_shops` is empty. On 3100, simulate per Q7.
- **Security (FIX):** `torob_ops_findings` — direct client writes limited so status can only change through the server path; enforce allowed status transitions in a trigger. Add explicit DELETE policies (or revoke the DELETE grant) on `torob_ops_sessions` and `torob_ops_report_logs`. Prove each with a PostgREST probe as `test.sales` that fails, and the legitimate UI path that succeeds.
- **Menu:** shops, accounts, settings, and the new history view reachable from the «عملیات ترب» area; page headers show the real page name instead of «جزئیات».

## 5. Stages 1–5 (continue between stages without asking)

For every stage: commit on `feature/torob-eye` → open PR to `staging` → merge → deploy to 3100 by the R2/Q1 route → apply that stage's migrations (after commit) → restart `afrakala-lan-rest` → verify `APP_GIT_SHA` → run the stage's tests on 3100 → write evidence → update `HANDOFF.md`. A stage is closed only when every exit condition below is shown with evidence.

**Stage 1 — The eye and the observatory.**
Exit: `afrakala-lan-torob-eye` running; at least one full cycle over the Q6 products recorded in `torob_eye_runs`; snapshots with real seller names and prices for ≥ 80% of those products (list failures with reasons); the five observatory columns filled for those products via the bot route (row counts before/after); a forced-block simulation (worker pointed at a stub returning 490) shows back-off and, with a shortened threshold in a test setting, the owner notification; notification delivery to the owner's UI proven (R7 probe); security fixes proven by failing sales-role PATCH/DELETE probes.

**Stage 2 — Seller-level findings, alert, history.**
Exit: an automatic scan after a cycle creates findings carrying seller name and price; own shops excluded (prove with a snapshot whose seller is in `torob_ops_own_shops`); a run with 0 findings shows its skip reasons on `/torob-ops/runs`; the owner receives exactly one alert for a cheaper seller and none on the repeat within 24 h; the history chart renders real snapshots for a product; bait check runs in the worker and its result appears on the finding.

**Stage 3 — Link discovery.**
Exit: on products with «پایش فعال» and empty `torob_url`, links are written automatically and logged; at least one colour-mismatch candidate is shown rejected in `torob_link_assignments`; no pre-existing `torob_url` changed (count before/after); newly linked products get snapshots in the next cycle.

**Stage 4 — Auto-report on.**
Exit: with own shops empty, enabling auto-report is refused (UI and a direct DB update both); after adding one own shop on test, it can be enabled; a confirmed-bait finding flows queue → worker → simulated submission (or the single real one per Q7) → `torob_ops_report_logs` row → finding status `reported`; kill switch stops the queue within one cycle; hourly cap and repeat window honoured (prove with counts).

**Stage 5 — Full test pass and handover.**
1. E2E specs under `e2e/torob-ops/` covering: gate unlock with `TOROB_OPS_E2E_PASSWORD` (set it in the test env file only), settings, runs + run detail, findings with seller data, history chart, notification bell, own-shop guard, kill switch. These specs must render past the lock screen; an assertion that can pass on the lock screen (`gate.or(heading)`) does not count.
2. The whole torob e2e set green against 3100; typecheck no worse than the R1 baseline; every new unit test was seen failing before its code existed (record it).
3. `OWNER-CHECK-CHROME.md`: a ready-to-paste Claude in Chrome prompt, observe-only, for the owner to walk through the finished module on 3100 and report what he sees.
4. `VERIFY-PROMPT.md`: a read-only prompt for a fresh session that re-derives checks from §1.1 and §5 (not from this run's report), re-runs the probes, and verdicts each exit condition confirmed / refuted / indeterminate.
5. `PRODUCTION-NOTES.md`: what the owner must do to take this to production himself (migration list in order, new env keys by name, new container, bot key creation, own-shops fill, accounts, when to switch auto-report on). Do not touch production.
6. `REPORT.md`: per stage expected vs actual with evidence paths; the §4 action table with final status per row; deviations from §4 and why; unresolved; not verified. Status line `COMPLETE` only if every exit condition in Stages 1–5 is evidenced; otherwise `PARTIAL` with the honest remainder. A clean `PARTIAL` outranks a padded `COMPLETE`.

## 6. Stops, retries, failure handling

- Transient failure (network, container start, flaky test): retry up to 3 times with growing wait; then record and continue with work that does not depend on it.
- Torob blocks the test IP during development for more than 6 continuous hours: stop crawling, finish everything that does not need live Torob (security, UI, alerts with stubbed data, report path with simulation), mark dependent exit conditions `BLOCKED — Torob access`, and finish with `PARTIAL`.
- Hard stop (write state to `HANDOFF.md`, report, end): anything that would touch production; a destructive operation on existing data beyond this plan (dropping or rewriting existing rows/columns, deleting non-test data); a finding that invalidates an owner decision in §1.1; missing credentials that no default covers.
- Never solve a blocker by weakening a guardrail: no disabling of RLS, no `--admin`, no skipping checks, no committing secrets.
- Before claiming any exit condition, read your own evidence file again and confirm it shows what you claim.
