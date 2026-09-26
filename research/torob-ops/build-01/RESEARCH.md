# RESEARCH — Torob Eye build-01 Stage 0

Run folder: `D:\AfraKalaTest\research\torob-ops\build-01\`. Read-only. No repo / DB / container writes.

## Facts from §1.2 that turned out wrong

1. **Deployed SHA.** §1.2 recorded `APP_GIT_SHA=c8396231`. Live now: `4ec3b7ef` (2026-09-26 18:41 +0330, merge PR #482). Equals `origin/staging` tip. `app` HEAD is still `8f4ef3ee` on `test/collab-e2e-20260921-2352`. Evidence: `evidence/R1/R1-git.txt`.
2. **Own shops / accounts on test.** §1.2 said 0 / 0 (that was the production note). Test DB: `torob_ops_own_shops=1`, `torob_ops_accounts=2`, credentials=4. Evidence: `evidence/R6/R6-data.out.txt`.
3. **Scan volume on test.** Audit-01 (not this probe) recorded 17 completed runs of ~1 product on 2026-09-16, not “7 scans of 82–85”. The 7×82–85 figure is the production claim in §1.2 and was not re-checked (production is untouchable).
4. **`product_computed_prices_public` is empty for the service role.** The table `product_computed_prices` has 9682 rows; 321 active products have `cash_price` (`BASE_SALE_PRICE_TYPE_CODE`). The public view adds `WHERE uid() IS NOT NULL AND NOT is_viewer_only(uid())`, so `supabase_admin` / the web admin client sees 0 rows. Scan hop “our price” is broken for that reason, not because products lack prices. Evidence: `evidence/R6/R6-prices2.out.txt`; `scan.server.ts:87-91`.
5. **TorobBot does not call** `api.torob.com/v4/base-product/sellers`. Seller rows are Playwright DOM. **`trb_clearance` does not exist.** Evidence: `evidence/R3/R3-inventory.md`.
6. **`TOROB_OPS_SIMULATE_SUBMIT` is already `1`** in `deploy/lan/.env.lan` and that is the only success path for `mode=auto`. Path A never posts a real Torob form. Evidence: `evidence/R4/R4-simulate-flag.txt`; `wt-parity-deals-3b/src/lib/torob-ops/path-a.server.ts:435-462`.
7. **`torob-ops-report-worker.ps1` is not in Task Scheduler.** The only Torob-named tasks are `\TorobBotLocalRuntime` and `\TorobBotLocalWatchdog` pointing at `D:\TorobBot-integration` (out of scope; do not start). Evidence: `evidence/R4/R4-schtasks.txt`.
8. **«پایش فعال» has 0 cells.** Column key `is_watch_active` exists, not bot-editable. No product is stored as on. Treat missing as off (owner decision §1.1.6 is “on”, not “default”). Evidence: `evidence/R5/R5-obs.out.txt`, `evidence/R6/R6-watch-base.out.txt`.

## Baseline (R1)

| Item | Value | Evidence |
|---|---|---|
| `origin/staging` tip | `4ec3b7ef` 2026-09-26 18:41 +0330 — Merge PR #482 didar-parity-deals-3b | `evidence/R1/R1-git.txt` |
| 3100 `APP_GIT_SHA` | `4ec3b7ef` — **same as staging** | `evidence/R1/R1-git.txt` |
| `git log c8396231..origin/staging` | didar-parity deals 3 / 3b line (not torob) | `evidence/R1/R1-range.txt` |
| `app` HEAD | `8f4ef3ee` `test/collab-e2e-20260921-2352` — do not touch | `evidence/R1/R1-git.txt` |
| Highest migration on staging | `20260926223000_595_didar_deal_pass3b.sql` (next number **596**) | `evidence/R1/R1-mig.txt` |
| Typecheck | 73 raw errors, 39 unique keys, all ≤ baseline (43 keys; 4 cleared). Exit 0. Worktree `wt-parity-deals-3b` = deployed SHA | `evidence/R1/R1-typecheck.txt` |
| Torob e2e | 14 tests against `:3100`: **12 passed, 2 skipped**, exit 0. Skips are unlock/preview without `TOROB_OPS_E2E_PASSWORD` | `evidence/R1/R1-e2e.txt` |

`BASE` sale price type code is `cash_price` (`src/lib/pricing/constants.ts:40`), not the string `BASE`.

## Deploy procedure (R2)

**Q1 dropped.** Established path does **not** switch `D:\AfraKalaTest\app`. Deploy from the worktree via compose override + `app/deploy/lan/.env.lan`. Exact commands: `evidence/R2/R2-deploy.md`. Latest proof: didar-parity PASS 3b from `wt-parity-deals-3b` → `APP_GIT_SHA=4ec3b7ef`.

Worktree for this build: `D:\AfraKalaTest\wt-torob-eye` on `feature/torob-eye` from `origin/staging` (create in Stage 1).

## Port inventory (R3)

See `evidence/R3/R3-inventory.md`.

Live read path is Playwright PDP DOM (`worker.py:79-87`, `scraper.py:212-256`). Search is Playwright (`search.py:62-80`); HTTP `__NEXT_DATA__` was abandoned because the second request gets HTTP 490 (`search.py:6-8`). No 490 status branch to port — block is content-based (`antidetect.looks_blocked`). Reporter exists but is dry-run by default; we will not port it (Path A + worker browser will own submit later).

Smallest copy set: `scraper.py`, `search.py`, `antidetect.py`, `browser.py`, `browser_manager.py`, `resource_policy.py`, `runtime_settings.py`, `fetch_errors.py`, stripped `config.py`, `utils.py`. Deps: `playwright` (Chromium). Python 3.10+.

## Path A reality (R4)

`submitTorobReportAdapter` (`path-a.server.ts:435-462`):

- `mode=dry_run` → fake ok.
- `TOROB_OPS_SIMULATE_SUBMIT=1` → fake ok for `auto`.
- otherwise → **hard fail**: adapter “not wired to the live Torob form”.

No outbound POST/form to Torob. Account `session_ciphertext` is AES-GCM JSON; never sent as a Cookie header. Web-container bait `fetch` can GET `torob.com` (audit D3 HTTP 200) but cannot submit a report.

PS1 (`deploy/lan/scripts/torob-ops-report-worker.ps1:32-43`) POSTs `http://127.0.0.1:3100/api/public/hooks/process-torob-ops-report-queue` with `TOROB_OPS_WORKER_TOKEN`. **Not scheduled.** Queue can also be drained from the UI.

Can the web container submit a real Torob report? **No.**

## Observatory write path (R5)

Auth: `Authorization: Bearer` → `authenticateBot` → RPC `bot_authenticate_key` (`src/server/bot-api.ts:277-295`; upsert route `:42`).

Observatory upsert requires `source_match` (`torob|purchista|other` + url or id) and an **approved** `market_product_matches` row or it returns 403 `approved_match_required`. Payload keys: `unique_by: ["afrakala_product_id"]`, `values` with the five Torob columns. `is_watch_active` is **not** bot-editable.

Deviation from §4 CONNECT-only: the worker must also **EXTEND** `market_product_matches` (upsert + auto-approve as source `torob`) or every observatory write fails. 0 match rows today.

«پایش فعال» key: **`is_watch_active`**. Watch-on count: **0 cells / 0 true**.

Active bot keys (name / scope only, 13): most have `allowed_table_n=0` (no table restriction). Only `google-maps-extracted-businesses` is scoped to that slug. **No `torob-eye` key.** Last observatory-related bot usage remains unused (audit).

## Test data (R6)

`tehran_today() = 2026-09-26`.

| metric | n |
|---|---|
| active products | 356 |
| active with `torob_url` | 1 |
| `product_computed_prices` rows | 9682 |
| active products with `cash_price` > 0 | 321 |
| `product_computed_prices_public` as supabase_admin | 0 |
| observatory rows (audit) | 341 skeleton |
| `is_watch_active` true | 0 |
| own shops | 1 |
| accounts | 2 |
| credentials | 4 |
| settings auto_report / kill_switch | false / false |
| `notification_queue` | 6426 (11 read, 6415 unread) |
| most recent notification | `sales_interaction_assigned` 2026-09-26 15:26:11+00 |
| most recent **read** notification | `quote_rejected` 2026-09-26 14:58:29+00 (`is_read=t`) |

Notification tables: `notification_queue`, `notification_events`, `price_alert_notifications`.

## Notifications (R7)

Inbox the header bell reads: **`notification_queue`**. RLS: SELECT/UPDATE own; **no INSERT policy** — writers are SECURITY DEFINER functions/triggers. Bell: `NotificationBell.tsx:43-66` polls every **30s**, no realtime. Types allowed (CHECK): `stock_alert, system, task, payment, sale_price_change, birthday, quote_rejected, daily_accrual_summary, sales_interaction_assigned, sales_activity_reminder`.

**Delivery is not dead:** a `quote_rejected` row from today is `is_read=true`. The silent-stop history is real enough to require a Stage 1 probe, but the table + UI path currently works.

### Stage 1 probe (design only — not run)

1. Resolve the owner’s `auth.users` id (admin with torob-ops access). Do not log email.
2. INSERT via a new DEFINER function `notify_torob_eye(...)` using `type='system'` (already in CHECK; no new type required unless we later add `torob_alert`).
3. SQL: row exists for that `user_id`, `is_read=false`.
4. Signed-in as that user: badge or `/notifications` shows the title within ≤30s.
5. Click → `mark_notification_read` → `is_read=true`.
6. If the row exists and the bell is empty: wrong user, RLS, or poll wait — not “system down”.

Do **not** client-insert; it will fail RLS.

## Capacity (R8)

Host: Windows 11 Pro, 13th-gen i5-13400 (10c/16t), **~128 GB RAM**, **~68 GB free** at probe. Docker mem_limit on `afrakala-lan-web` = 0 (unlimited). Snapshot: `afrakala-stt` 3.88 / 16 GB and **560% CPU**; LAN stack otherwise small (web 57 MiB). Playwright Chromium ~1–1.5 GB **fits in RAM**. CPU is contended by STT — keep the planned 30–60 s pace (Q2). Evidence: `evidence/R8/*`.

## Duplicates (R9)

| Surface | Verdict | Reason |
|---|---|---|
| Phase-2 `TOROB_LIMITED_READONLY` | **retire (leave code, deprecate)** | Paused Python constant; 0 jobs; no container. Overlaps the new eye. Q8 default. |
| `market_product_matches` + resolve | **EXTEND** | Hard gate on observatory upsert. 0 rows. Auto-approve `source_name=torob` from the eye (no human gate — §1.1.7). |
| Purchista raw table | **reuse as dump only** | 0 rows; not the sales-facing view. |
| `ProductPriceChart` / recharts | **reuse library** | Internal sale-price history. New torob-ops history view uses recharts, new data (`torob_offer_snapshots`). |
| Observatory daily skeleton cron | **leave** | Rebuilds skeleton, does not write Torob prices. `pg_cron` absent on test. |
| Path A PS1 + hook | **EXTEND / CONNECT** | Keep queue, settings, accounts, logs. Move real browser submit into `torob-eye`. Keep simulate on 3100. |
| `products.torob_url` | **reuse + BUILD discovery** | Scan and link-discovery source of truth. Do not add a third matcher. |
| Web `bait.server.ts` fetch | **EXTEND then CONSOLIDATE** | Cap 2; no cookies. Worker Playwright first; delete callers after proven. |
| `D:\TorobBot` / `D:\TorobBot-integration` | **port read-core only** | Read-only. Do not run. Integration watchdog is unrelated. |

## Action plan (R10) — §4 with one action each

| # | Piece | Action | Evidence |
|---|---|---|---|
| 1 | `workers/torob-eye` + `afrakala-lan-torob-eye` | **BUILD** | R3: Playwright DOM is the working reader; no sellers API. |
| 2 | `torob_ops_settings` eye columns + `/torob-ops/settings` | **EXTEND** | R4 settings row already exists; do not add a second table. |
| 3 | `torob_eye_runs`, `torob_offer_snapshots` | **BUILD** | Observatory holds only aggregates (R5); seller identity needs a new table. |
| 4 | Observatory five Torob columns via bot upsert | **CONNECT** | R5 upsert + `authenticateBot`; create key `torob-eye`. |
| 5 | Auto-approve `market_product_matches` for those writes | **EXTEND** | R5 403 without approved match; 0 rows today. §4 deviation recorded. |
| 6 | `scan.server.ts` our-price loader | **FIX** | R6: public view hides all rows from admin client; read `product_computed_prices` (or DEFINER) with `cash_price`. |
| 7 | Scan uses snapshots + skip reasons + auto after cycle | **EXTEND** | §4; current scan is button-only, observatory-min only, 0 evaluable products. |
| 8 | `/torob-ops/runs` detail + skip reasons | **EXTEND** | Exit Stage 2. |
| 9 | Bait in worker | **EXTEND** | R3 Playwright; R4 web cannot render SPA. |
| 10 | Web `bait.server.ts` | **CONSOLIDATE** after worker proven | Zero remaining callers. |
| 11 | Owner alerts on `notification_queue` | **BUILD** | R7; use `type=system` + DEFINER insert; probe in Stage 1. |
| 12 | History chart (recharts) | **BUILD** | R9 existing `ProductPriceChart` library. |
| 13 | Link discovery + `torob_link_assignments` | **BUILD** | R3 `search.py`; §1.1.7 no human gate; colour hard-reject. |
| 14 | Auto-report from worker + own-shop trigger | **CONNECT** + **EXTEND** | R4 adapter is simulate-only; §1.1.9 enforce in DB. Test already has 1 shop — prove empty-guard in a rolled-back transaction, then enable against the existing row (do not delete it). |
| 15 | Findings status + DELETE grants | **FIX** | Audit-01 C3/C7; still live. |
| 16 | Menu shops/accounts/settings/history + real titles | **EXTEND** | Sidebar seed omits shops/settings/accounts (audit #17). |
| 17 | Phase-2 job path | **CONSOLIDATE** (deprecate in docs) | R9 / Q8. |
| 18 | `product_computed_prices_public` service-role 0 rows | **FIX** (binding A, Stage 1) | R6-prices2; save view/fn/grants first; no pricing-math change. |
| 19 | Q6 product pick | **CONNECT** (binding B) | Only products the post-A scan our-price loader returns. |
| 20 | Real Torob submit in `torob-eye` | **BUILD** (binding C, Stage 4) | Path A adapter is simulate-only. Simulate flag gates only the final click. |

### §4 deviations (architect-default corrected)

- Observatory CONNECT requires an extra EXTEND of `market_product_matches` (approved match gate).
- Scan FIX of the public-view our-price loader is required before findings can exist; §4 assumed the loader already worked.
- Path A “submit” stays simulated on 3100 until a real adapter exists in the worker; the current Node adapter cannot submit.
- Missing `is_watch_active` cell = off (not default-true), so Q6 must turn cells on or the eye watches nothing.
- Test already has one own shop; Stage 4 empty-guard is proven without deleting that row.

## Stage 1 prerequisites (for the next session)

1. Owner answers Q2–Q9 (or `defaults`). Q1 is not asked.
2. Create worktree `D:\AfraKalaTest\wt-torob-eye` from `origin/staging`.
3. First migration number: **596**.
