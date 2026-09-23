# EXECUTION — Sales desk: nine fixes, waves 0–4 · UNATTENDED (v2)

- Target: Cursor, Agent mode, Auto-review, on the test computer. **The owner is not present.** Run Wave 0 through Wave 4 to the end without asking questions and without waiting for approval. Stop only on a hard stop (§10).
- **Work location: an isolated git worktree `D:\AfraKalaTest\wt-salesdesk-9-fixes`** on branch `feature/salesdesk-9-fixes`, created in step 0.1. Every relative path in this prompt is relative to that worktree root: start every terminal command with `Set-Location D:\AfraKalaTest\wt-salesdesk-9-fixes` (before step 0.1 exists, use `D:\AfraKalaTest\app` for read-only git commands only). Give file tools absolute paths.
- **Never modify anything in `D:\AfraKalaTest\app`.** Read from it only: `deploy\lan\.env.lan` (secrets — never print), `docs\research\salesdesk-9-fixes\` (copied into the worktree in 0.2), and `deploy\lan\docker-compose.yml` (used for deploys, §8.8).
- This prompt's home: `D:\AfraKalaTest\wt-salesdesk-9-fixes\docs\missions\salesdesk-9-fixes\EXECUTION-PROMPT.md`. Save it there verbatim in step 0.2.
- State: `docs/missions/salesdesk-9-fixes/HANDOFF.md` · contracts: `CONTRACTS.md` · evidence: `evidence/W<n>/` · revert scripts: `revert/` · all inside the worktree.
- **Resume rule.** On every start: if `D:\AfraKalaTest\wt-salesdesk-9-fixes\docs\missions\salesdesk-9-fixes\HANDOFF.md` exists, read it and this prompt, confirm the last recorded step's artifacts exist, and continue from the first incomplete step. Otherwise start at Wave 0.
- **Scope lock.** Only this mission. Do not act on other tasks found in folders, worktrees, TODO lists, docs or Cursor agent transcripts; do not read Cursor agent transcripts.
- **Execution model.** One agent, wave by wave — the waves share one test database and one test deployment. Chat output: one checkpoint line per step; details go into files.

## 0. Mission and definition of done

Implement the owner-confirmed plan for the sales desk (calls, deals, activities), tickets and purchases, mirroring Didar CRM's behavior and Persian labels where decided — building onto the code the research located, never creating a parallel implementation.

The owner's non-negotiable: «برای اصلاح این موارد، هیچ‌جای دیگر نباید خراب شود».

Done = every action row in §5 closed with its evidence, or recorded as BLOCKED/SKIPPED with evidence and reason; every wave passed its automated gate (§9); typecheck errors never above the Wave 0 baseline; schema changes limited to planned objects; visual regression shows no unintended change outside each wave's pages; 3100 runs the final commit and is healthy; `REPORT.md`, `PRODUCTION-NOTES.md` and one `ACCEPTANCE.md` per wave written for the owner's test after the run. A clean `PARTIAL` with an honest remainder outranks a padded `COMPLETE`.

## 1. Read first (Wave 0)

- `docs/research/salesdesk-9-fixes/FINDINGS.md` — the evidence base (nodes N1–N31, gates G1–G4, checks X1–X7). Every row in §5 cites the node that justifies it.
- `AGENTS.md` at the worktree root — in particular how Persian SQL is applied safely (`docker cp` into the DB container is broken on this host).
- `docs/research/sales-desk-9-needs/` — earlier design notes for the sales desk; audit them against the findings in 0.4.

## 2. Ground truth

Evidence from `FINDINGS.md` unless marked otherwise.

1. **Branches.** Base: `feature/sales-desk`. At research time 3100 ran `f9c57d0e`. On 2026-09-21 another agent added `c1ea61a1` (`feat(collaboration): sidebar pin and in-app usage help hints`) on top, pushed `feature/sales-desk`, and **production was deployed from `feature/sales-desk` at `c1ea61a1`** (owner-confirmed). Expected base for this mission: `c1ea61a1` or later — record the actual SHA. 3100 may still run `f9c57d0e` until this mission's first deploy. `origin/main` and `origin/staging` are not bases.
2. **Production is reachable from this machine over SSH** (the other agent used key-based SSH to the production laptop). This mission never uses SSH, SCP or any remote command.
3. **Repo:** `src/routes` 230 files; 726 migrations named `NNN_name`, duplicates at 554 and 558, newest 559; 267 public tables.
4. **Existing building blocks — extend these, never duplicate them:**
   - **Calls:** hook `src/routes/api/public/hooks/issabel-ami-ring.ts` → `ingest-ami-ring.server.ts` → `call_ring_events` (unique index `(linkedid, extension, direction)`: one row per ringing extension); CDR `call_logs`; popup `CallerInboundPopup.tsx` polls ring every 1 s and CDR every 5 s, `MAX_CARDS = 4`, `CARD_TTL_MS = 5_000`, card key `ring:${uuid}` (`recent-calls.ts:85`); `filter-calls-for-caller-id.ts:27-28` shows all inbound calls when `show_inbound` is on, ignoring extension; settings `user_caller_id_settings` (enabled, show_inbound, show_outbound, show_others_outbound), route `_app.settings.caller-id.tsx`, lib `caller-id-settings.ts`; extension map `call_log_extensions`; a card opens a sheet with `QuickRequestForm` or `CallNoteForm`; one `active` call context (`openCard` → `setActive` replaces the open form). `linkedid`/`uniqueid` are present on almost all ring rows. Stored phone formats: lengths 10, 12 and 14.
   - **Deals:** `sales_interactions` — `kind` request / call / note; status CHECK `open, won, lost, cancelled, done`; `author_id` NOT NULL with insert policy `author_id = auth.uid()`; SELECT policy author OR salesperson OR the customer's responsible. Write path: RPC `createSalesInteraction` (`src/lib/sales-desk/interactions.ts`). `QuickRequestForm.tsx`: title «ثبت درخواست», field «متن درخواست», field «کارشناس فروش (اختیاری)» (~line 222) whose default `salespersonId="__me__"` is stored as NULL (~lines 89–92). Components `src/components/sales-desk/*`; migrations 545–548; trigger `sales_interaction_assigned` (migration 547) writes to `notification_queue`. Nav label «میز فروش»; «میز کار» appears nowhere in `src`.
   - **Quotes:** `sales_quotes` (`salesperson_id`; status draft, sent, accepted, rejected, canceled); KPI uses `accepted_at`; `compute_employee_score` credits `salesperson_id` only when `status = 'accepted'`. A quote-rejection dialog pattern exists; `price_change_reasons` exists.
   - **Product search:** exists in sales search, quick-price and the workbench; not in `QuickRequestForm`.
   - **Activities:** `tasks` (13 rows, «برد وظایف», nav gated by module `invoices`) is out of scope. `CallNoteForm.tsx` and `PersianFollowUpFields.tsx` write `sales_interactions` kinds call / note.
   - **Tickets:** `work_items` has `creator_id`, `assignee_id`, `created_at`; only triggers `trg_work_items_before_write`, `trg_work_items_updated_at`; `WorkItemDetailPage.tsx` renders none of creator, assignee or creation time; `WorkBoardPage` lists `openOnly` (excludes done / cancelled) via `src/lib/work/items.ts:30-31`.
   - **Purchases:** `purchases.supplier_id` nullable, FK `purchases_supplier_id_fkey` NO ACTION; `PurchaseForm.tsx:57-61,259,462` offers `SUPPLIER_UNKNOWN` «نامشخص» which saves NULL; zod allows NULL; 301 of 317 test rows NULL; `suppliers` 15 rows; page `_app.accounting.purchase-payments.tsx`, view `vw_supplier_payables`.
   - **Notifications:** `notification_queue` alive for some types; pg_cron lives in the `postgres` database.
5. **Test environment** (owner-stated): app on `192.168.170.8:3100`, Kong `9000`; take the base URL, TLS settings and login flow from the repo's Playwright configs. Accounts `test.<role>@afrakala.local`, password `AfraTest!1404`, roles admin, manager, sales, accountant, viewer, purchase_specialist.
6. **Known untracked leftovers in `D:\AfraKalaTest\app`:** `e2e/torob-ops/*.spec.ts`, `tsc-out.txt` and research folders — not this mission's business.

## 3. Owner decisions — binding (no further questions)

1. Mirror Didar's behavior and exact Persian labels (§6); keep data on AfraKala's existing tables; never copy Didar's schema.
2. «میز کار» = «میز فروش» with a view «کارهای من»: deals whose «مسئول معامله» is me, plus (Wave 4) my activities due today or overdue.
3. «مسئول معامله» replaces «کارشناس فروش (اختیاری)»: empty by default, mandatory for new deals and edits.
4. «ایجاد کننده معامله» = `author_id`: automatic, read-only, on the form and deal view, and as a list column with a filter.
5. Credit and score go only to the responsible. The creator appears only in the report «معاملات ثبت‌شده برای دیگران» (user × Tehran day × count, drill-down); no points for creators.
6. Deal products: several items with quantity and a per-item note; «متن درخواست» stays.
7. «ایجاد پیش‌فاکتور» on any deal with a customer and at least one item; several quotes per deal; the quote's `salesperson_id` = the deal's responsible (safe per G2: drafts count in neither KPI nor score).
8. No pipeline or kanban; only «جاری / موفق / ناموفق».
9. Out of scope: comments and reactions on history, recurring activities, periodic follow-up, stale/rotten indicators, browser notifications outside the page, points for creators, «کاربران مرتبط».
10. Lost reasons: admin-managed list; seed only «سایر» (the owner will add Didar's 21 titles later).
11. Supplier mandatory from now on; remove «نامشخص»; quick-create a supplier in the purchase form; legacy supplier-less rows untouched plus a «بدون تأمین‌کننده» filter.
12. Google Sheet (N28) and the pricing-queue worker (N31) are deferred.
13. UI term «ثبت درخواست» → «افزودن معامله» in the sales desk and call popup; `kind = 'request'` and «متن درخواست» unchanged.
14. Legacy deals with `salesperson_id IS NULL` are backfilled to `author_id` — unless step 0.6 finds the form ever offered an explicit "no salesperson" choice that also stored NULL; then skip the backfill and record it.
15. Caller-ID settings keep current options and add «فقط تماس‌های داخلی خودم», «فقط تماس‌های مربوط به خودم», and «مدت زمان نمایش پنجره تماس (ثانیه)» (default 15).
16. Activities live on `sales_interactions` (ADR-4); `tasks` untouched.
17. **Unattended run:** no owner acceptance between waves. Automated gates replace it; the owner tests at the end with the `ACCEPTANCE.md` files. The mission never merges into `feature/sales-desk` — the owner does that after testing.

## 4. Boundaries

**Allowed:** creating the worktree and branch; editing files inside the worktree as the rows require; migrations applied to the test database `afrakala`; marked synthetic data on test (deleted afterwards); deploying the web service to 3100 per §8.8; committing on `feature/salesdesk-9-fixes` and pushing that branch.

**Forbidden:**
- Anything touching production; any `ssh`, `scp` or remote command to any host.
- Modifying anything in `D:\AfraKalaTest\app` or in any other worktree.
- Pushing to `main`, `staging` or `feature/sales-desk` (production deploys from it); merging; force-pushing; `git stash`; `git reset --hard`; `git clean`; rewriting history.
- Recreating, stopping or removing any container other than `afrakala-lan-web` (and restarting `afrakala-lan-rest`); `docker compose down`; volume or network changes.
- Changing the Issabel hook contract or the one-row-per-extension storage in `call_ring_events`.
- Editing scoring (`compute_employee_score` and related), the pricing engine or the pricing queue.
- `tasks` and its board; permission module keys of existing pages (the X4 mismatch is recorded, not changed).
- Kanban, pipeline and the §3.9 extras; `invoices`.
- A second implementation of anything in §2.4.
- `@ts-ignore`, new `@ts-expect-error`, skipped tests or blanket snapshot updates; for new columns missing from generated types, use a local typed cast.
- Printing secrets.
- Deleting real data; dropping tables or columns; `TRUNCATE`.

## 5. Action rows

Classes: FIX (exists, wrong → repair) · EXTEND (exists, incomplete → build onto it) · CONNECT (both sides exist → wire and prove) · BUILD (absent → create).
Evidence floor: **FIX** — the same probe failing before and passing after. **EXTEND** — old behavior still works, new behavior added. **CONNECT** — a real request through the real UI path, result rendered. **BUILD** — a test shown failing before the code existed, passing after.

### Wave 1 — tickets and purchases (rows independent)
- **A1 · N22 · FIX** — «ایجاد کننده», «مسئول», «تاریخ ثبت» (Jalali date and time, Asia/Tehran) on the ticket detail page and as ticket-list columns.
- **A2 · N23 · EXTEND** — ticket lists: sections «در حال اجرا» and «بسته شده» with counters; «تاریخ بسته شدن» (add `closed_at`, set/cleared by trigger, only if no equivalent exists); «بستن» and «بازگشایی»; every ticket list page, consistently.
- **A3 · N24 · BUILD** — ticket history table + trigger (actor, time, field, old, new) for status, assignee, priority, title, body; «سابقه» timeline on the detail page.
- **A4 · N25, N26 · FIX** — remove «نامشخص»; supplier required in zod and UI; trigger: INSERT requires `supplier_id`, UPDATE may not change non-null to NULL, legacy NULL rows stay editable; the trigger raises ASCII code `SUPPLIER_REQUIRED`, the UI shows «تأمین‌کننده الزامی است». Probe: a rolled-back NULL insert succeeds before, fails after.
- **A5 · N25 · EXTEND** — «+ تأمین‌کنندهٔ جدید» quick-create inside the supplier picker (minimum fields from the `suppliers` schema), selecting the new supplier.
- **A6 · N27 · EXTEND** — filter «بدون تأمین‌کننده» on the purchases list and `/accounting/purchase-payments`; UI count equals SQL count.

### Wave 2 — calls
- **B1 · N1, N2 · FIX** — one card per call: group by `linkedid` (fallback `uniqueid`, then normalized phone + minute) across ring and CDR; the card lists the extensions that rang; per-extension rows untouched. Probe: synthetic call via the real hook, two extensions, same `linkedid` — two cards before, one after.
- **B2 · N1 · EXTEND** — cross-tab sync with `BroadcastChannel`: opening or dismissing in one tab updates the others; no duplicate sound or notification.
- **B3 · N3 · EXTEND** — settings `display_seconds` (default 15, range 5–120) replacing the hardcoded 5 s; «فقط تماس‌های داخلی خودم» (user's extensions in `call_log_extensions`); «فقط تماس‌های مربوط به خودم» (customer's responsible = user); current options preserved.
- **B4 · N4, N5 · FIX + BUILD** — draft per call keyed by B1's call key (`localStorage`, 24 h expiry, cleared on save; if B1 is BLOCKED, key by the existing card key); opening another card never discards an open form; a switcher for active calls.
- **B5 · N6 · CONNECT** — «افزودن معامله» inside the call-note form → deal form with the caller's person prefilled; the note draft survives; the call note links to the new deal through `sales_interactions.deal_id` (created here if absent, per §7).

### Wave 3 — deals
- **C1 · term · EXTEND** — «ثبت درخواست» → «افزودن معامله» across the sales desk and popup; every changed string listed before → after.
- **C2 · N7 · FIX** — «مسئول معامله», empty default, mandatory: UI, zod, and a trigger for `kind = 'request'` on INSERT and on UPDATE to NULL (ASCII code `RESPONSIBLE_REQUIRED`); backfill per §3.14 with affected ids and a revert script.
- **C3 · N8 · EXTEND** — «ایجاد کننده معامله» read-only on form and deal view; list column and filter.
- **C4 · N9 · EXTEND** — view «کارهای من» in «میز فروش»; `sales_interaction_assigned` must fire on insert and on a change of responsible and show in the bell as «من مسئول شدم» — extend the trigger if needed.
- **C5 · N10 · BUILD** (depends on C2) — report «معاملات ثبت‌شده برای دیگران»: `author_id <> salesperson_id`, by author × Tehran day, count, click-through list; managers/admins see all, others their own; `role_permissions` rows for the route.
- **C6 · N11, N12 · CONNECT + BUILD** — block «محصولات درخواستی» above «متن درخواست», reusing one existing product search (partial code, name, brand; unavailable products included with a badge); item table (product, quantity default 1, note). Probe: «287» finds the X287 product.
- **C7 · N13 · EXTEND** — labels «جاری / موفق / ناموفق» for open / won / lost; buttons «موفق شد», «ناموفق شد»; `won_at`, `lost_at` by trigger; reopen to «جاری»; status CHECK unchanged.
- **C8 · N14 · BUILD + CONNECT** — `deal_lost_reasons` (deactivate, never delete) with settings page «دلایل شکست معامله» («ایجاد دلیل شکست جدید», columns «عنوان | فعال | غیرفعال»), seeded «سایر»; dialog on «ناموفق شد»: «دلیل شکست را انتخاب کنید», «توضیح دلیل شکست», confirm «این معامله موفق نشد»; «سایر» requires text; trigger enforces a reason on transition to lost (ASCII code `LOST_REASON_REQUIRED`); report «دلایل شکست». Reuse the quote-rejection dialog pattern.
- **C9 · N15 · CONNECT** (degrades without C6: prefill customer and responsible only) — `sales_quotes` link column; «ایجاد پیش‌فاکتور» on a deal with a customer and ≥ 1 item through the existing quote-creation path, prefilled with customer, items and `salesperson_id` = the responsible; several quotes per deal; tab «پیش‌فاکتورها» on the deal. Probe: the new quote is `draft`, linked both ways; KPI and score queries unchanged.

### Wave 4 — activities and follow-up (ADR-4) — order D2 → D1 → D3 → D4 → D5 → D6 → D7
- **D2 · N21 · BUILD** — `sales_activity_types` seeded with Didar's 17 types plus «یادداشت ساده» (§6), round-trip verified.
- **D1 · N16 · EXTEND** (depends on D2) — on `sales_interactions`: `activity_type_id`, `due_at`, `due_has_time`, `original_due_at`, `done_at`, `result_note`, `deal_id`; owner («مسئول انجام این فعالیت») = `salesperson_id`, creator = `author_id`; existing call/note rows keep working and map to «تماس ورودی», «تماس خروجی» or «یادداشت ساده» without changing `kind`.
- **D3 · N17 · BUILD** (depends on D1) — «این فعالیت انجام شده» → «نتیجه‌ی فعالیت خود را یادداشت کنید»; buttons «این فعالیت انجام شد», «ذخیره و ایجاد فعالیت دیگر» (new activity with same customer and deal); only the owner records a result; revert to «انجام نشده» allowed.
- **D4 · N18 · BUILD** (depends on D1) — page «فعالیت‌ها» with «گذشته تا امروز», «تاریخ گذشته (N)», «امروز (N)», «فردا», «تا آخر هفته», «تاریخ دیگر»; filters «انجام نشده | انجام شده | همه فعالیت ها»; red menu count = open activities due today or overdue (`public.tehran_today()`); `role_permissions` rows.
- **D5 · N19 · BUILD** (depends on D1) — follow-up icon on open deals in «میز فروش» and «کارهای من»: yellow nothing planned, red overdue, green today, grey future; filter «معاملاتی که فعالیتی روی آن‌ها نیست».
- **D6 · N20 · BUILD** (depends on D1) — «به تعویق انداختن» moves `due_at`, keeps `original_due_at`; «افزودن یادآور برای فعالیت» only when a time is set, delivered in-app as a read-time reminder in the bell's existing poll. Never add a pg_cron job; if read-time delivery is impossible, mark the reminder part BLOCKED and continue.
- **D7 · N9 · EXTEND** (depends on D1, C4) — «فعالیت‌های امروز و عقب‌افتاده» in «کارهای من».

## 6. Didar labels — use exactly

- **Calls and settings:** «مدت زمان نمایش پنجره تماس (ثانیه)» · «فقط تماس‌های داخلی خودم» · «فقط تماس‌های مربوط به خودم» · «افزودن معامله».
- **Deals:** «افزودن معامله» · «مسئول معامله» · «ایجاد کننده معامله» · «محصولات درخواستی» · «+ افزودن محصول» · «متن درخواست» · «جاری» · «موفق» · «ناموفق» · «موفق شد» · «ناموفق شد» · «ایجاد پیش‌فاکتور» · «پیش‌فاکتورها» · «کارهای من» · «معاملات ثبت‌شده برای دیگران» · «من مسئول شدم».
- **Lost reasons:** «دلایل شکست معامله» · «ایجاد دلیل شکست جدید» · «عنوان | فعال | غیرفعال» · «دلیل شکست را انتخاب کنید» · «دلیل شکست» · «توضیح دلیل شکست» · «سایر» · «این معامله موفق نشد» · «دلایل شکست».
- **Activities:** «فعالیت‌ها» · «نوع فعالیت» · «عنوان فعالیت» · «این فعالیت انجام شده» · «نتیجه‌ی فعالیت خود را یادداشت کنید» · «تاریخ» · «ساعت» · «ساعت مشخص نیست» · «مدت انجام فعالیت (دقیقه)» · «مسئول انجام این فعالیت» · «این فعالیت مرتبط است با» · «افزودن یادآور برای فعالیت» · «این فعالیت انجام شد» · «ذخیره و ایجاد فعالیت دیگر» · «به تعویق انداختن» · «گذشته تا امروز» · «تاریخ گذشته» · «امروز» · «فردا» · «تا آخر هفته» · «تاریخ دیگر» · «انجام نشده» · «انجام شده» · «همه فعالیت ها» · «معاملاتی که فعالیتی روی آن‌ها نیست» · «فعالیت‌های امروز و عقب‌افتاده».
- **Activity types, in this order, Didar's spelling kept verbatim:** «یادداشت ساده», then 1 «تماس ورودی» · 2 «تماس خروجی» · 3 «اعلام قیمت» · 4 «پیگیری و فعالیت یا حساب رسانی» · 5 «ویدئو چک» · 6 «تماس خروجی نا موفق» · 7 «وظیفه» · 8 «فیش چک» · 9 «پیام واتس اپ یا sms» · 10 «برسی اعتبار و مانده معوق مشتری برای اعلام قیمت» · 11 «خرید و چک کالا» · 12 «ارسال فاکتور در گروه مشتری و فاکتور دستی» · 13 «اکسل اجناس ارسال نشده» · 14 «ارسال نهایی» · 15 «ارسال بیجک یا رسید در گروه مشتری» · 16 «ثبت حسابداری» · 17 «فاکتورلاین».
- **Tickets:** «ایجاد کننده» · «مسئول» · «تاریخ ثبت» · «در حال اجرا» · «بسته شده» · «تاریخ بسته شدن» · «بستن» · «بازگشایی» · «سابقه».
- **Purchases:** «تأمین‌کننده» · «+ تأمین‌کنندهٔ جدید» · «بدون تأمین‌کننده» · «تأمین‌کننده الزامی است».
- **Error codes → UI text:** `SUPPLIER_REQUIRED` → «تأمین‌کننده الزامی است» · `RESPONSIBLE_REQUIRED` → «مسئول معامله الزامی است» · `LOST_REASON_REQUIRED` → «دلیل شکست را انتخاب کنید».

## 7. Contracts

Write `CONTRACTS.md` in Wave 0 before any code. For each proposed name, first check `FINDINGS.md` and the live catalog for an equivalent; if one exists, use it and record the mapping. Later changes only by editing `CONTRACTS.md` with a reason.

- `sales_interactions.deal_id` — uuid, nullable, FK → `sales_interactions.id`.
- `sales_interactions.won_at`, `lost_at` — timestamptz, trigger-maintained.
- `sales_interactions.lost_reason_id` (FK → `deal_lost_reasons`), `lost_reason_note`, `lost_reason_other`.
- `deal_lost_reasons` — id, title, is_active, sort_order, created_at.
- `sales_interaction_items` — id, interaction_id, product_id (FK → products), quantity (default 1), note, created_at.
- `sales_quotes.interaction_id` — uuid, nullable, FK → `sales_interactions.id`.
- `user_caller_id_settings.display_seconds` (int, default 15, CHECK 5–120), `only_my_extension` (bool, default false), `only_my_customers` (bool, default false).
- `work_items.closed_at` (only if no equivalent); `work_item_events` — id, work_item_id, actor_id, event_at, field, old_value, new_value.
- `sales_activity_types` — id, title, sort_order, is_active; on `sales_interactions`: `activity_type_id`, `due_at`, `due_has_time`, `original_due_at`, `done_at`, `result_note`.
- Business-rule errors raised by triggers use the ASCII codes in §6; the UI maps them to Persian.

## 8. Mechanics

1. **Worktree (0.1).** `git -C D:\AfraKalaTest\app fetch origin`; `git -C D:\AfraKalaTest\app worktree add D:\AfraKalaTest\wt-salesdesk-9-fixes -b feature/salesdesk-9-fixes origin/feature/sales-desk` (if the branch already exists from an earlier start, reuse it — never recreate). Record the base SHA.
2. **Dependencies.** If `package-lock.json` in the worktree is identical to the one in `D:\AfraKalaTest\app`, create a junction `node_modules` → `D:\AfraKalaTest\app\node_modules` (`New-Item -ItemType Junction`); otherwise run `npm ci` inside the worktree. Never install new dependencies unless a row cannot be done without one — then record why.
3. **Git.** Stage explicit paths only; print `git status --porcelain` before each commit. The first commit adds the copied research files (`docs/research/salesdesk-9-fixes/FINDINGS.md`, `RESEARCH-PROMPT.md`, `STATE.md`) and `docs/missions/salesdesk-9-fixes/`. Push only `feature/salesdesk-9-fixes`.
4. **Migrations.** Discover the directory and convention; next free number after the highest (≥ 560), confirmed unused. One migration per concern, each with a revert script in `docs/missions/salesdesk-9-fixes/revert/`. Before replacing an existing function: `pg_get_functiondef` → save to evidence → diff with the repo file. Business rules in triggers (a direct PostgREST PATCH must not bypass them). RLS policies for every new table and operation — without a DELETE policy an API delete silently removes nothing, so tests count rows. `role_permissions` rows for every new route or module (a module without rows is open to all roles). After each applied migration: `docker restart afrakala-lan-rest`. Commit each migration with its revert script right after it is applied and verified.
5. **Applying SQL.** `-U supabase_admin -d afrakala`; read the password from `D:\AfraKalaTest\app\deploy\lan\.env.lan` into a shell variable in the same command, never echoing it. Persian text: use the UTF-8-safe method in `AGENTS.md`. If `AGENTS.md` documents none, write Persian literals as Unicode escapes (`U&'\0633\0627\06CC\0631'`, generated with a Node one-liner) so the SQL file is pure ASCII. Either way, verify every Persian write: `encode(convert_to(<col>, 'UTF8'), 'hex')` equals the hex of the source string. Never pipe Persian through PowerShell.
6. **NULL safety.** CHECK constraints do not reject NULL — use `COALESCE(...)` and `IS DISTINCT FROM`.
7. **Types and time.** `types.ts` is not regenerated (Supabase CLI absent) — local typed casts for new columns. Typecheck (~3 minutes) once per wave, never above the Wave 0 baseline (expected 70). Server time is UTC; Tehran days via `public.tehran_today()`; Jalali display via the app's helpers.
8. **Deploy the web service from the worktree — safely.** Before the first deploy, read `D:\AfraKalaTest\app\deploy\lan\docker-compose.yml`. Write `docs/missions/salesdesk-9-fixes/compose.worktree.override.yml` that changes only `services.web.build.context` to `D:\AfraKalaTest\wt-salesdesk-9-fixes` (keep the Dockerfile path valid relative to that context). Then:
   ```
   Set-Location D:\AfraKalaTest\app\deploy\lan
   $env:DISABLE_LOVABLE_MCP="1"
   $env:GIT_SHA = (git -C D:\AfraKalaTest\wt-salesdesk-9-fixes rev-parse --short HEAD)
   $env:BUILD_TIME = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
   $o = "D:\AfraKalaTest\wt-salesdesk-9-fixes\docs\missions\salesdesk-9-fixes\compose.worktree.override.yml"
   docker compose --env-file .env.lan -f docker-compose.yml -f $o config > D:\AfraKalaTest\wt-salesdesk-9-fixes\docs\missions\salesdesk-9-fixes\evidence\compose-resolved.yml
   docker compose --env-file .env.lan -f docker-compose.yml -f $o up -d --build --no-deps web
   docker restart afrakala-lan-rest
   docker exec afrakala-lan-web printenv APP_GIT_SHA
   ```
   Safety check before `up`: in the resolved config, every service other than `web` must be identical to the config without the override (compare the two `config` outputs); otherwise do not deploy — hard stop. After `up`: `APP_GIT_SHA` equals the worktree HEAD, the app answers HTTP 200, and a Playwright smoke test (login + «میز فروش») passes. If unhealthy: redeploy the last good commit (at first: the base), then treat the wave per §10. `npm run build` is broken on Windows — never use it.
9. **Tests.** Playwright against the deployed 3100 build only, reusing the repo's configs and login. Each BUILD row gets a spec run once before its code exists (record the failure) and passing after. Each wave gets an automated acceptance spec covering its acceptance script (§9).
10. **Synthetic data.** Mark it (phones `09000000xxx`, titles `[TEST-9FIX]`), record ids, delete at wave end (`DELETE … WHERE` on the marker only).
11. **Output.** Terminal output in English; Persian goes into files; chat gets one checkpoint line per step.

## 9. Stages — run all without stopping

### Wave 0 — pre-flight and baseline (no product changes)
- **0.1** Create the worktree and branch (§8.1); record base SHA.
- **0.2** Save this prompt to its home; copy `D:\AfraKalaTest\app\docs\research\salesdesk-9-fixes\{FINDINGS.md,RESEARCH-PROMPT.md,STATE.md}` into the worktree; set up dependencies (§8.2).
- **0.3** Worktrees: `git worktree list`; for `wt-rtl-sales-desk`, `wt-bot-key-fix` and others: branch, merged into `feature/sales-desk`?, commits touching files this mission will change. Record them; if an unmerged commit touches a row's files, mark that row `SKIPPED — overlapping unmerged work` and continue.
- **0.4** Read `docs/research/sales-desk-9-needs/`; record its claims against `FINDINGS.md`.
- **0.5** `AGENTS.md`: record the Persian SQL method (or the §8.5 fallback) and run a harmless round-trip probe.
- **0.6** The §3.14 condition (current code and `git log -p` of `QuickRequestForm.tsx`).
- **0.7** Migrations: directory, convention, next free number.
- **0.8** Baselines into `evidence/W0/`: schema snapshot (`scripts/schema-snapshot.sh` or its documented equivalent); typecheck count; visual-regression baseline for «میز فروش», caller-ID settings, a ticket detail and the board, the purchase form, `/accounting/purchase-payments`, and control page `/pricing/my-workbench`.
- **0.9** Write `CONTRACTS.md` and `HANDOFF.md`; first docs-only commit; push the branch.

### Waves 1–4 — the same loop, then continue automatically
1. Inspect the rows' code paths and cite them.
2. BUILD rows: write the spec, record it failing.
3. Migrations + revert scripts → apply → restart `afrakala-lan-rest` → verify → commit.
4. Code changes.
5. **Automated gate:** typecheck ≤ baseline; schema diff limited to planned objects; deploy (§8.8); the wave's Playwright specs and acceptance spec pass on 3100; visual regression shows no unintended change outside the wave's pages; synthetic data deleted.
6. **Self-check (fresh eyes):** before reading your own evidence, re-derive one check and one refutation attempt per row from §3, §5 and §6 into `verify/W<n>-selfcheck.md`; run them; record results.
7. Commit (explicit paths), push, update `HANDOFF.md`, write `evidence/W<n>/ACCEPTANCE.md` (Persian script below), print one line `WAVE <n> DONE — <rows closed>/<rows> — continuing`, and start the next wave immediately.

### Acceptance scripts (automate each; also write it in Persian for the owner's final test)
- **Wave 1:** ثبت خرید بدون تأمین‌کننده خطا می‌دهد؛ ساخت سریع تأمین‌کننده در فرم کار می‌کند؛ فیلتر «بدون تأمین‌کننده» تعداد درست دارد؛ در تیکت ایجادکننده، مسئول و زمان ثبت دیده می‌شود؛ بستن تیکت آن را به «بسته شده» می‌برد و سابقه دارد؛ بازگشایی کار می‌کند.
- **Wave 2:** با چهار تب باز، تماسی که روی چند داخلی زنگ می‌خورد فقط یک کارت دارد؛ فرم نیمه‌کاره با تماس بعدی دست نمی‌خورد و قابل برگشت است؛ «مدت نمایش» و «فقط تماس‌های داخلی خودم» کار می‌کند؛ «افزودن معامله» از فرم تماس معامله را با مشتری پرشده می‌سازد و یادداشت تماس به آن وصل است.
- **Wave 3:** در فرم «افزودن معامله»، «مسئول معامله» اجباری و «ایجاد کننده معامله» خودکار است؛ جست‌وجوی «287» محصول X287 را می‌آورد؛ معامله در «کارهای من» مسئولش دیده می‌شود و اعلان «من مسئول شدم» می‌رسد؛ «ناموفق شد» دلیل می‌خواهد؛ «ایجاد پیش‌فاکتور» پیش‌فاکتور پیش‌نویس با همان اقلام و مسئول می‌سازد؛ گزارش «معاملات ثبت‌شده برای دیگران» عدد درست دارد.
- **Wave 4:** فعالیت با موعد ثبت می‌شود؛ «ذخیره و ایجاد فعالیت دیگر» کار می‌کند؛ صفحهٔ «فعالیت‌ها» و عدد قرمز منو درست است؛ آیکون زرد، قرمز، سبز و طوسی روی معامله‌ها درست است؛ «به تعویق انداختن» موعد اصلی را نگه می‌دارد؛ یادآور با ساعت می‌رسد.

## 10. Autonomy rules

- **Never ask the owner anything.** When a choice is not covered by §3, pick the option most consistent with §3 and §6 that is least invasive and reversible; record it in `HANDOFF.md` under «Decisions taken without the owner» with the reason.
- **Continue between steps and waves without waiting.** A checkpoint line is a trail, not a request.
- **Retries:** transient network, Docker or flaky Playwright failures — up to 3 attempts with backoff. Never retry type errors, SQL errors or failed assertions blindly; fix the cause instead (up to 3 fix attempts per failing check).
- **Row-level degrade (not a stop):** if a row still fails its checks after its fix attempts, revert that row's uncommitted code (`git restore` of the files it touched, inside the worktree) and run its migration's revert script if applied; mark it `BLOCKED` with evidence; mark rows that depend on it `SKIPPED — depends on <row>`; commit and deploy the rest; continue.
- **Hard stops — the only reasons to stop before the end:**
  1. The worktree or branch cannot be created, or the base commit is missing.
  2. The test database is unreachable after retries.
  3. A step would touch production, use SSH, or modify `D:\AfraKalaTest\app`.
  4. A migration fails and its revert script also fails.
  5. The deploy safety check shows a service other than `web` would change.
  6. 3100 is unhealthy after a deploy and redeploying the last good commit also fails.
  7. A Persian round-trip mismatch that the §8.5 fallback also cannot fix.
  On a hard stop: make sure 3100 runs the last good commit if at all possible, write `HANDOFF.md` with exactly what is needed, and stop with the single line `HARD STOP — see HANDOFF.md`. Reaching a hard stop cleanly is a successful outcome.
- **Context.** Keep chat output minimal; evidence goes to files. If the session must end early, finish the current step, update `HANDOFF.md` with the exact next action, and stop with `PAUSED — resume from HANDOFF.md`.

## 11. HANDOFF.md shape

```
# HANDOFF — salesdesk-9-fixes
Updated: <UTC time> · Worktree: D:\AfraKalaTest\wt-salesdesk-9-fixes · Branch: feature/salesdesk-9-fixes @ <sha> · Base: feature/sales-desk @ <sha>
Current: Wave <n> — step <x> — <in progress | done> · 3100 runs: <sha> (<healthy | unhealthy>)

## Rows
| Row | Node | Class | Status (DONE / BLOCKED / SKIPPED / TODO) | Evidence |

## Confirmed facts
- <fact> — <evidence>

## Migrations applied (in order)
- <NNN_name> — commit <sha> — revert: revert/<file>

## Decisions taken without the owner
- <decision> — <reason>

## Blockers
- <row or step> — <what happened> — <what would resolve it>

## Next action
- <one concrete step>
```

## 12. Final report — after Wave 4

- `docs/missions/salesdesk-9-fixes/REPORT.md` (English, with Persian labels quoted): every row expected versus actual; BLOCKED and SKIPPED rows with reasons; decisions taken without the owner; what was not verified; status of nodes N1–N27, N29, N30 (N28 and N31 deferred per §3.12); migrations in order with revert scripts; the final 3100 SHA.
- `PRODUCTION-NOTES.md`: how the owner ships after testing — merge `feature/salesdesk-9-fixes` into `feature/sales-desk`; apply the migrations on the production database **before** deploying the code, in order, with the Persian-safe method; pages to smoke-test. Do not do any of it yourself.
- `evidence/W1–W4/ACCEPTANCE.md` present.
- Last line of `REPORT.md` and the final chat line: `MISSION COMPLETE — see REPORT.md` only if every row is DONE; otherwise `MISSION PARTIAL — <n> rows BLOCKED/SKIPPED — see REPORT.md`.
