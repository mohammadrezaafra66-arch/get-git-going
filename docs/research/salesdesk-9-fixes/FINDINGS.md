# FINDINGS — sales desk nine fixes (read-only research)
STATUS: COMPLETE

## 0. Ground truth

| Item | Value | Command / evidence |
|------|-------|-------------------|
| Branch | `feature/sales-desk` | `git branch --show-current` |
| HEAD | `f9c57d0e` (`f9c57d0eac139ac9fd26a17bfe31672dc8d3e2dc`) | `git rev-parse` |
| Log -1 | `f9c57d0e 2026-09-19 19:19:58 +0500 fix(ops): UTF-8-safe prod cutover apply for work taxonomies 559` | `git log -1` |
| Dirty | **yes — 39 porcelain entries** (messenger mods, research outs, salesdesk-9-fixes/, etc.) | `git status --porcelain` count=39 |
| `git fetch origin` | OK | exit 0 |
| `origin/main` | `324e1a40` (2026-09-16 Merge PR #453) | |
| `origin/staging` | `22717afb` (2026-09-17 persons-merge cutover) | |
| Running `APP_GIT_SHA` | `f9c57d0e` | `docker exec afrakala-lan-web printenv APP_GIT_SHA` |
| HEAD == running | **yes** | |
| Containers | web Up healthy; auth/caddy/db/kong/storage/meta/rest Up | `docker ps` |
| DB | `afrakala` \| PostgreSQL 15.6 \| `2026-09-21 14:56:27+00` | read-only `psql` with PGPASSWORD from `deploy/lan/.env.lan` (value not printed) |
| Public tables | **267** | |
| `src/` tracked | `.tsx=486` `.ts=331` `.b64=2` `.css=1` | `git ls-files src/` |
| Routes | `src/routes` **230** files | |
| Migrations | **726** files; newest include `552–559` call_ring / torob / work_taxonomies / `558_user_caller_id_settings` | (note duplicate NNN 554 and 558 on disk) |

Mechanics note: `docker cp` into `afrakala-lan-db` is broken on this host (AGENTS.md); SQL delivered via stdin / one-line `-c` with `SET default_transaction_read_only = on`.

## 1. Domain inventory

### Catalog (public tables/views matching R1 patterns) — 59 objects
See `out/q01_catalog.out`. Domain row counts (`out/q02_counts.out`):

| Relation | count(*) | Latest timestamp note |
|----------|----------|----------------------|
| call_logs | 5637 | max(created_at)=2026-09-21; max(started_at)=2026-09-21 |
| call_ring_events | 1288→1300 during session | max(created_at/event_at)≈2026-09-21 16:01Z — **live** |
| call_log_extensions | 10 | |
| user_caller_id_settings | 1 | updated_at 2026-09-19 |
| sales_interactions | 6 | max created_at 2026-09-16; status open=3 won=3; kind request=4 note=2 |
| sales_quotes | 66 | draft=45 sent=2 accepted=9 rejected=1 canceled=9 |
| tasks | 13 | max created 2026-09-06 |
| work_items | 3 | all status=pending |
| purchases | 317 | **supplier_id NULL = 301** |
| purchase_prices | 3566 | |
| suppliers | 15 | |
| pricing_recompute_queue | 43581 | pending=9; oldest pending enq 2026-09-16; latest processed 2026-09-16 |
| notification_queue | 6373 | latest 2026-09-20; types: sale_price_change 6327, daily_accrual_summary 45, sales_interaction_assigned 1 |
| didar_activities | 0 | |

### ASCII inventory (tool: `git grep -l -I` under `src`+`supabase`)
Full dump: `out/r1_ascii_inventory.txt` (465 lines). Highlights:

| Term | files | Workstream |
|------|------:|------------|
| issabel | 16 | W1 |
| uniqueid / linkedid | 5 / 7 | W1 |
| call_log | 49 | W1 (+sales-desk) |
| caller-id / CallerId | 7 / 6 | W1 |
| BroadcastChannel | **0** | W1 absence |
| postgres_changes | 11 | mostly messenger/pricing — popup uses **polling** not Realtime |
| sales_quote | (in inventory) | W2 |
| salesperson | | W2 |
| pricing_recompute_queue / claim_ / PRICING_WORKER | present | W6 |
| docs.google.com / gviz | **0** in product code (Google Sheets API) | W6 absence |
| spreadsheet | asan/xlsx/FileSpreadsheet icons only | unrelated / import |

### Persian (tool: workspace Grep UTF-8 on `src/**/*.ts(x)`)
Hits include: `CallerInboundPopup` («تماس ورودی/خروجی»), `QuickRequestForm` («متن درخواست», «کارشناس فروش (اختیاری)»), `registry` «میز فروش», `PurchaseForm` «تأمین‌کننده», `purchase-payments`, `my-workbench` «کارگاه قیمت», WorkItemDetail «معیار پذیرش» fields. **«میز کار»**: **0** hits in `src/`. **«افزودن معامله»**: **0**.

### Workstream file cores (deduped, non-exhaustive)

**W1:** `src/routes/api/public/hooks/issabel-ami-ring.ts`, `ingest-ami-ring.server.ts`, `issabel-cdr.server.ts`, `import-issabel-calls.server.ts`, `CallerInboundPopup.tsx`, `recent-calls.ts`, `filter-calls-for-caller-id.ts`, `caller-id-settings.ts`, `_app.settings.caller-id.tsx`, migrations `552–554` call_ring_events, `558` user_caller_id_settings.

**W2:** `QuickRequestForm.tsx`, `sales-desk/*`, `lib/sales-desk/interactions.ts`, migrations `545–548` sales_interactions, quotes routes.

**W3:** `_app.operations.tasks.tsx`, `tasks` table, `CallNoteForm.tsx`, `PersianFollowUpFields.tsx`.

**W4:** `WorkItemDetailPage.tsx`, `lib/work/*`, `_app.operations.work*`, `work_items`.

**W5:** `PurchaseForm.tsx`, `_app.accounting.purchase-payments.tsx`, `purchases`, `vw_supplier_payables`.

**W6:** `_app.pricing.my-workbench.tsx`, `process-recompute-queue.server.ts`, `api/public/hooks/process-pricing-queue`, `pricing_recompute_queue`.

## 2. Node verdicts

### Summary

| ID | Verdict | One-line reason |
|----|---------|-----------------|
| N1 | EXISTS-BROKEN | Multi-ext events + no linkedid dedupe + no cross-tab; inbound not scoped to own ext; MAX_CARDS=4 |
| N2 | EXISTS-PARTIAL | `uniqueid`/`linkedid` accepted & stored; unique index is (linkedid,extension,direction) not per-call |
| N3 | EXISTS-PARTIAL | Per-user settings exist; card TTL hardcoded 5s; no duration setting |
| N4 | EXISTS-BROKEN | Single `active` sheet context; new card does not preserve half-filled form (replaced on open) |
| N5 | ABSENT | No per-call draft store |
| N6 | EXISTS-PARTIAL | Popup opens QuickRequestForm (deal/request) prefilled; no separate «افزودن معامله» label; no quote link |
| N7 | EXISTS-PARTIAL | Label exactly «کارشناس فروش (اختیاری)»; default `__me__`→null |
| N8 | EXISTS-PARTIAL | `author_id` NOT NULL, insert requires author=uid; **not shown** in QuickRequestForm UI |
| N9 | EXISTS-PARTIAL | RLS keeps author+salesperson visibility; assign notify exists (1 row); no nav label «میز کار» |
| N10 | ABSENT | No creator×date report found |
| N11 | NOT-CONNECTED | Product search exists elsewhere; QuickRequestForm has person search only, free-text body |
| N12 | ABSENT | No item table on sales_interactions |
| N13 | EXISTS-PARTIAL | CHECK allows open/won/lost/cancelled/done; test data only open/won; UI transitions partial |
| N14 | EXISTS-PARTIAL | Quote rejection reason + price_change_reasons exist; not wired to interaction lost |
| N15 | NOT-CONNECTED | quotes + interactions both exist; no deal_id/interaction_id on sales_quotes |
| N16 | EXISTS-PARTIAL | `tasks` 13 rows + `/operations/tasks`; CallNoteForm→sales_interactions kinds call/note |
| N17 | ABSENT | Grep «این فعالیت انجام شد» / «ذخیره و ایجاد فعالیت» → 0 in src |
| N18 | ABSENT | Grep «تاریخ گذشته» → 0; no range-badge activities page |
| N19 | ABSENT | No follow-up traffic-light on deal/interaction list |
| N20 | ABSENT | No activity snooze/postpone (word greps only hit unrelated PWA/reminders) |
| N21 | ABSENT | kinds=request/call/note only; didar_activities=0; out/q18_activity_types.out |
| N22 | EXISTS-BROKEN | DB has creator_id, assignee_id, created_at; detail UI does not render them |
| N23 | EXISTS-PARTIAL | WorkBoardPage `openOnly` excludes done/cancelled; no labeled بایگانی sections/counters |
| N24 | ABSENT | Triggers: before_write + updated_at only; no work history table; no audit in `src/lib/work` |
| N25 | EXISTS-BROKEN | UI option «نامشخص» writes null; zod allows null |
| N26 | ABSENT | No NOT NULL / trigger requiring supplier; FK nullable |
| N27 | EXISTS-WORKS (count) | 301/317 null supplier_id; X287 row found null |
| N28 | ABSENT | No Google Sheets integration code |
| N29 | EXISTS-WORKS | `/pricing/my-workbench` is live write path for purchase prices (code present) |
| N30 | EXISTS-WORKS | Host 302/400; container docs.google.com=200 — reachable |
| N31 | EXISTS-PARTIAL | Token SET; hook exists; pg_cron has **no** pricing-queue job; 9 pending since 2026-09-16 |
| G1 | answered | linkedid/uniqueid reach AfraKala from external sender via public hook |
| G2 | answered | KPI uses `accepted_at`; scoring uses `salesperson_id` + `status='accepted'` — draft from open deal does not count |
| G3 | answered | Reachable; no Sheets integration code |
| G4 | answered | Hypothesis (1) no validation — confirmed |

---

### N1 Duplicate popups — EXISTS-BROKEN
**Claim:** four popups for one caller.  
**Evidence:**
- Mount once per AppShell: `AppShell.tsx` imports `CallerInboundListener` inside `PopupCenterProvider` (single mount per tab).
- Dedup key = row id `ring:${uuid}` (`recent-calls.ts:85`), not `linkedid`.
- Unique index allows one row per `(linkedid, extension, direction)` (`out/q09_ring_indexes.out`) → multi-extension = multi rows.
- Test: 545 linkedids with exactly 2 events / 2 extensions (`out/q10_multi_ext.out`).
- Inbound filter ignores extension: `filter-calls-for-caller-id.ts:27-28` returns all inbound if `show_inbound`.
- `MAX_CARDS = 4` (`CallerInboundPopup.tsx:37`) matches screenshot budget.
- `BroadcastChannel` files=0; `shownRef` is per-tab → 4 open tabs ⇒ 4 independent listeners.
**Gap:** need per-call key + extension scope + cross-tab. **Class:** FIX.

### N2 Unique call id — EXISTS-PARTIAL
**Evidence:** ingest accepts `linkedid`/`uniqueid` (`issabel-ami-ring.ts:96-100`, `ingest-ami-ring.server.ts:100-101`); nearly all rows have both (`has_uid/has_lid` = 1299 t|t, 1 f|t). Sender is **outside repo** (AMI/CEL worker). Unique constraint is per extension, not per call.  
**G1:** yes, ids reach AfraKala; sender is external host posting to `/api/public/hooks/issabel-ami-ring` with `ISSABEL_IMPORT_WORKER_TOKEN`.  
**Class:** EXTEND (dedupe strategy).

### N3 Visibility / duration — EXISTS-PARTIAL
Settings table `user_caller_id_settings` + UI route `_app.settings.caller-id.tsx`; fields enabled/show_inbound/show_outbound/show_others_outbound — **no display-duration column**. Cards expire via hardcoded `CARD_TTL_MS = 5_000`.  
**Class:** EXTEND.

### N4 Form lost on next call — EXISTS-BROKEN
Single `active` CallContext + `panelOpen`; opening another card replaces `active` (`openCard` → `setActive`). No draft retention when new ring arrives.  
**Class:** FIX.

### N5 Per-call draft — ABSENT
No localStorage/IndexedDB draft keyed by linkedid. **Class:** BUILD.

### N6 Add deal from call form — EXISTS-PARTIAL
Popup embeds `QuickRequestForm` with `initialPersonId` («ثبت درخواست») — this IS the sales interaction/deal write path. No button labeled «افزودن معامله»; no wiring to `sales_quotes`.  
**Class:** CONNECT / rename.

### N7 Salesperson field — EXISTS-PARTIAL
`QuickRequestForm.tsx:222` label «کارشناس فروش (اختیاری)»; default `salespersonId="__me__"` → stored null (`:89-92`). Target: rename + mandatory. **Class:** FIX.

### N8 Deal creator — EXISTS-PARTIAL
Column `author_id` NOT NULL; insert policy requires `author_id = uid()` (`out/q12_si_policies.out`). UI does not display creator. NULL count=0. **Class:** EXTEND (UI/filter).

### N9 Responsible workdesk + notify — EXISTS-PARTIAL
SELECT policy: author OR salesperson OR customer.responsible. Trigger `sales_interaction_assigned` (migration 547); 1 queue row. Nav label is «میز فروش» not «میز کار» (0 hits). **Class:** EXTEND.

### N10 Creator report — ABSENT (searches: no report route for author_id×date). **Class:** BUILD.

### N11 Product search in request — NOT-CONNECTED
Person picker in form; body is free text. Product search exists at sales search / quick-price (inventory). **Class:** CONNECT.

### N12 Structured items — ABSENT (no sales_interaction_items). **Class:** BUILD.

### N13 Statuses — EXISTS-PARTIAL
CHECK: `status IN (open, won, lost, cancelled, done)` (live `pg_get_constraintdef`). Test rows: open=3, won=3 only. UI outcome buttons exist on sales-desk components (won path used). Full transition timestamps per status: **ABSENT columns** (only created_at/updated_at).  
**Class:** EXTEND.

### N14 Lost reason — EXISTS-PARTIAL
`price_change_reasons` (18); quote rejection dialogs exist; not on sales_interactions outcome. **Class:** CONNECT/BUILD.

### N15 Pre-invoice from deal — NOT-CONNECTED
`sales_quotes` has `salesperson_id`,`status` — **no** deal/interaction FK column. **Class:** CONNECT.

### N16 Activity model — EXISTS-PARTIAL
`tasks` (13) + nav «برد وظایف». Parallel path: CallNoteForm/QuickRequestForm → `sales_interactions`. tasks columns include assigned_to, due_date, created_by.  
**Class:** EXTEND / CONSOLIDATE.

### N17–N21 — ABSENT (evidence of absence)
- N17/N18: Persian greps for result buttons and date-range labels → 0 hits in `src`.
- N19: no traffic-light follow-up icon on interaction list components.
- N20: no activity postpone/snooze product path.
- N21: `out/q18_activity_types.out` — UI kinds call/note; DB kind request/call/note; Didar 17 absent; `didar_activities` count 0.
**Class:** BUILD.

### N22 Ticket creator/time/assignee — EXISTS-BROKEN
DB columns `creator_id`, `assignee_id`, `created_at` present. `WorkItemDetailPage.tsx` renders title/body/status/kind/priority/group/section/acceptance — **no** creator/assignee/created_at in file (Grep 0). Matches owner screenshot. **Class:** FIX.

### N23 Closed leave list — EXISTS-PARTIAL
`WorkBoardPage` + `listWorkItems({ openOnly: true })` excludes done/cancelled (`items.ts:30-31`). No separate بایگانی section with counters. **Class:** EXTEND.

### N24 History — ABSENT
Triggers on `work_items`: `trg_work_items_before_write`, `trg_work_items_updated_at` only. No history writer in `src/lib/work`. **Class:** BUILD.

### N25–N27 Purchases — EXISTS-BROKEN / ABSENT / counted
- Form: `SUPPLIER_UNKNOWN` → null (`PurchaseForm.tsx:57-61,259,462`).
- DB: `supplier_id` nullable; FK `purchases_supplier_id_fkey` confdeltype=`a` (NO ACTION) — not SET NULL.
- 301/317 null; X287: id `9426bc27-…`, created 2026-08-03, supplier null, name contains X287 LG.
**G4:** hypothesis **(1) no validation** — confidence high. (2) unlikely (FK NO ACTION). (3) display bug unlikely (column truly null).

### N28–N31 Pricing / Google
- N28 ABSENT — no docs.google.com/gviz/Sheets API client in src.
- N29 EXISTS-WORKS — my-workbench route + workbench libs.
- N30 EXISTS-WORKS — host: docs/script 302, sheets.googleapis 400; container fetch docs.google.com=200.
- N31 EXISTS-PARTIAL — `PRICING_WORKER_TOKEN=SET`; processor + `/api/public/hooks/process-pricing-queue` exist; **pg_cron jobs on `postgres` DB have no pricing-queue drain** (`out/q13_cron_jobs.out`); 9 pending since 2026-09-16 while latest processed same day — auto-worker likely idle unless host task external.

## 3. Decision gates G1–G4

| Gate | Answer | Confidence |
|------|--------|------------|
| G1 | Yes — `linkedid`/`uniqueid` ingested from external AMI/CEL via public hook; stored on `call_ring_events`. Dedupe uniqueness is per extension, not per call. | High |
| G2 | Draft quote from an open deal would **not** count in dashboard sales-today (`accepted_at`) nor in `compute_employee_score` (requires `status='accepted'` on `salesperson_id`). Status that keeps it out: anything other than `accepted` (typically `draft`). | High |
| G3 | Google HTTP reachable from host and web container; **no** Sheets integration code. | High |
| G4 | (1) No validation — UI «نامشخص» + nullable column. | High |

## 4. Cross-cutting checks X1–X7

| ID | Verdict | Evidence |
|----|---------|----------|
| X1 | EXISTS-PARTIAL / alive for some types | `notification_queue` receiving daily_accrual (cron job 23) and historical sale_price_change; assign notify works once. Cron lives in **`postgres`** DB (`SHOW cron.database_name`→postgres). No pricing-queue cron. |
| X2 | EXISTS-WORKS (policy) | Creator retains SELECT after assign; insert requires author=self; can set salesperson to other user on insert (WITH CHECK only author_id=uid). |
| X3 | EXISTS-WORKS | Credited field: `sales_quotes.salesperson_id` with `status='accepted'`. |
| X4 | EXISTS-PARTIAL | See summary table; mismatch: ticket nav uses `invoices` module while `work` module rows exist unused. |
| X5 | EXISTS-PARTIAL | didar-crm **untracked** (0 git files; sparse disk). |
| X6 | EXISTS-WORKS | package.json scripts listed; schema-snapshot.sh present; visual-regression branch exists. |
| X7 | Sufficient on test for N1, N27, G4. | |

## 5. Integration map

### W1 Call → popup
1. External Issabel AMI/CEL worker → `POST /api/public/hooks/issabel-ami-ring` (`issabel-ami-ring.ts`)
2. `ingestAmiRingEvent` → `call_ring_events` insert (`ingest-ami-ring.server.ts:142`); skip if extension unmapped
3. Browser: `CallerInboundPopup` polls ring 1s + CDR 5s (`CallerInboundPopup.tsx:151-167`)
4. `filterCallsForCallerId` → cards; click → Sheet + QuickRequestForm/CallNoteForm
**Missing wires:** linkedid-level dedupe; cross-tab; inbound extension scope; duration setting.

### W2 Deal
QuickRequestForm → `createSalesInteraction` RPC → `sales_interactions`.  
**Missing:** product block, quote link, creator column UI, lost-reason dialog.

### W4 Ticket
`work_items` ← WorkItemDetailPage.  
**Missing:** render creator/assignee/created_at; archive UX; change history.

### W5 Purchase
PurchaseForm → purchases (supplier optional).  
**Missing:** DB mandate.

## 6. Duplicates and overlaps

| Group | Locations | In use | Suggestion |
|-------|-----------|--------|------------|
| Call feeds | `call_ring_events` (live) + `call_logs` CDR fallback | Both polled in popup | Prefer ring for live; dedupe by linkedid across sources |
| Popup systems | CallerInboundPopup vs PopupCenter (price/owner reminders) | Both in AppShell | Keep separate; don't merge |
| Phone handling | ingest stores raw; `call_import_match_persons` RPC; `normalizeStockAlertPhone` elsewhere | Match uses RPC | Consolidate normalizers before sheet work |
| Product search | sales.search, quick-price, workbench | Not in QuickRequestForm | Reuse one search component |
| Status reason | quote rejection, price_change_reasons | Not on interactions | Reuse pattern for lost reason |
| Activity stores | `tasks` vs `sales_interactions` call/note | Both | Prefer one follow-up model before Didar parity |

Phone formats in `call_ring_events` (`out/q06_phone_masks.out`): len10×575, len12×499, len14×122 — matches owner screenshot formats.

## 7. Constraints for the build
- Stack: React 19 / TanStack / Supabase self-host / Tailwind 4 (ground truth).
- Do not invent parallel deal table — extend `sales_interactions`.
- `invoices` dead as business object — ignore; note nav still uses module key `invoices` for tickets/tasks.
- Scripts: `npm run typecheck`, `npm run build`, `npm run lint`; no general `test` script (Playwright e2e exists as files).
- Persian SQL via file/stdin only; read-only research folder only for this audit.
- Dirty tree: findings that rest on messenger files are flagged dirty (not used here).
- Ways this report could be wrong: (1) running build equals HEAD but dirty working tree could diverge later; (2) external host scheduler for pricing may exist outside pg_cron; (3) production purchase X287 colour text differs slightly (test has سیلور) — same product code family.

## 8. Coverage
- Denominators: 267 public tables; 59 catalog-matched; key domain tables counted; R1 ASCII inventory file written.
- Assessed: all N1–N31, G1–G4, X1–X7.
- Unassessed catalog noise (inquiry_*, automation_worker_*, workflow_settings, etc.): unrelated to nine fixes — excluded with reason "name match only".
- Arithmetic: inventoried domain relations in §1 counts table = assessed; remaining catalog name-matches = unassessed-with-reason (unrelated).

## 9. UNVERIFIED / UNKNOWN
- Whether Windows Task Scheduler curls `process-pricing-queue` on the test host (N31 auto-drain).
- Exact AMI sender machine and its multi-extension fan-out config (G1 remediation detail).
- Full receipt-allocation SQL status filters beyond dashboard/scoring (G2 secondary consumers) — not blocking: scoring+KPI established.
- Complete Didar audit tree contents (X5 sparse).

## 10. Owner questions
1. **Which machine runs the Issabel AMI/CEL poster** to `/api/public/hooks/issabel-ami-ring`, and does it emit one event per ringing extension by design? *(Blocks fine-tuning of N1 dedupe; default: one POST per extension — matches unique index.)*
2. **Is host Task Scheduler (or equivalent) supposed to curl `process-pricing-queue`?** Token is SET but pg_cron has no job and 9 items pending since 2026-09-16. *(Blocks N31 “alive” vs “token-only”.)*
3. **Is «میز کار» meant to be `/operations/sales-desk`, `/operations/tasks`, or a new screen?** Zero code hits for the phrase. *(Blocks N9 UX copy.)*

STATUS: COMPLETE
