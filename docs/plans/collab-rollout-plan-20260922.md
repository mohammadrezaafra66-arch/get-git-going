# Collaboration rollout investigation plan (2026-09-22)

**STATUS: COMPLETE** (investigation read-only; deliverable for later execution)

**Branch note:** Prefer committing from `test/collab-e2e-20260921-2352` when the repo is free. Report source: `docs/qa/collab-e2e-report-20260921-2352.md` (commit `4c4a8e83`).

---

## 1. خلاصه برای مالک

- ماژول همکاری برای نقش‌های غیر-viewer روی منطق اصلی (گروه، پیام متنی، استعلام قیمت، RLS) سالم است؛ E2E غیر-slow تقریباً سبز بود.
- **بلاکر واقعی برای «روز اول»:** زمان‌بند SLA نیست (`tick_inquiries` ساخته شده ولی در `cron.job` نیست) → وضعیت استعلام خودکار عوض نمی‌شود مگر کسی RPC را صدا بزند.
- **ریدایرکت لاگین بدون session (A6)** نقص سراسری guard است (SSR بدون redirect)، نه فقط collaboration؛ شواهد فعلی نشت دادهٔ کسب‌وکار از API ناشناس نشان نداد → شدت پیشنهادی **P1** نه P0.
- **کارت پیام‌ها برای viewer** با route نمی‌خواند: hub نقش را hardcode می‌کند؛ `/messages` از `role_permissions` می‌خواند که RLS `viewer_restricted` جلوی خواندنش را برای viewer-only می‌گیرد → `/unauthorized`.
- **ثبت کار از پیام** اشتباه تست است: عمداً به `work_items` می‌رود و در `/operations/work` دیده می‌شود، نه `tasks`.
- آپلود فایل در E2E بیشتر به خاطر `SUPABASE_URL=http://kong:...` روی ماشین تست شکسته؛ روی UI دیپلوی‌شده باید جدا verify شود (HTTP لزوماً علت نیست).
- کامیت راهنما/پین `c1ea61a1` هنوز روی 3100 نیست (`f9c57d0e`).
- بک‌لاگ باز >۱۰ دقیقه: **۱۱** استعلام، همه `transfer_available` و assignee=`test.manager` — فعال‌کردن cron الان سیل کارت قرمز جدید نمی‌سازد (قبلاً penalty خورده‌اند؛ tick بعدی آن‌ها را `expired` می‌کند).

---

## I1 — Inquiry SLA not scheduled (D6)

**E2E claimed:** FAIL P1 — SLA با tick دستی کار می‌کند؛ `cron.job` ندارد.

**Found:** Confirmed. Live `tick_inquiries` (via `pg_get_functiondef`):

- `pending` + age>5m → `warning_5min` + `inquiry_status_history` (`reason=auto-tick`)
- `warning_5min` + age>8m → `danger_8min` + history
- `danger_8min` + age>10m → `critical_10min` + history + `auto_submit_penalty(...)`
- `critical_10min` + age>10m → `transfer_available` + history
- any non-terminal + age>30m → `expired` + `closed_at`
- side effects: `expire_pending_documents()`, `expire_pending_delivery_receipts()`

`auto_submit_penalty` inserts:
- `performance_penalties` (type `no_response_primary`, severity `medium`) — **idempotent** if same inquiry/user/type already active
- `audit_logs`, `notification_events` (`red_card_issued`)
- `employee_score_events` (`ON CONFLICT DO NOTHING`)

**Idempotent / every minute:** Status loops only match exact prior status + age; penalty insert short-circuits if active row exists. Safe every minute. Nested expire_* may add load — watch after enable.

**EXPLAIN (no CALL):** open pending scan uses bitmap on `idx_inquiries_product_open` (cheap on current small open set). Full function duration not measured without executing (forbidden).

**Backlog >10m open:** **11** rows, all `status=transfer_available`, all `assigned_to` / email = `a0a4afe5-…` / `test.manager@afrakala.local`, age ~15h. Count in `pending|warning|danger|critical` older than 10m: **0**. These should already be `expired` at 30m if any periodic caller existed — **prove no live ticker**: they are stuck past the expire threshold. Enabling schedule now → primarily **expire** these 11; **no new critical penalties** expected (already past critical; `auto_submit_penalty` idempotent). Pattern/script reference also: `deploy/lan/scripts/cron-445-schedule-afrakala-jobs.sql`.

**Same as `/my-penalties`?** Yes. Page uses `MyPenaltiesPanel` → `useMyPenalties` → RPC `get_user_penalties`; hub badge reads `performance_penalties` (`useActivePenaltyCount`). Auto path inserts into `performance_penalties`.

**Fix options:**
1. Migration scheduling `cron.schedule_in_database('afrakala-tick-inquiries-1min', '* * * * *', 'SELECT public.tick_inquiries();', 'afrakala', 'supabase_admin', true)` — low risk if backlog cleaned/expired first.
2. App worker / browser poll only — weaker, misses offline.
3. Warnings-only patch (no auto_submit) — product change, higher cost.

**Recommended:** Option 1 as tracked migration; on production same SQL with database `'postgres'` (owner verify). Pattern from `supabase/migrations/20260913101000_533_pg_cron_http_scheduler.sql`.

**Draft SQL (do not run here):**
```sql
-- register from DB postgres (pg_cron catalog), command runs in afrakala
SELECT cron.schedule_in_database(
  'afrakala-tick-inquiries-1min',
  '* * * * *',
  'SELECT public.tick_inquiries();',
  'afrakala',
  'supabase_admin',
  true
);
```
Prod: 4th arg `'postgres'`. Prefer migration over manual.

**Avoid penalty flood:** (a) expire/cancel open backlog before first schedule; (b) cutoff `created_at > enable_time`; (c) today: only test.manager transfer_available leftovers — expire is enough. Default recommend: expire/cancel E2E+stale open inquiries on test before enable.

**Tests:** extend SLA slow spec to assert cron.job row exists; regression that second tick does not duplicate penalties.

**Risk:** expire_pending_* side effects; prod cron DB name mistake.

---

## I2 — File upload (C6)

**E2E claimed:** PARTIAL P2 — oversize rejected; upload often failed.

**Found:**
- UI path: `MessageComposer.tsx` → server `preCheckMessengerAttachment` (`upload.functions.ts` L62 `crypto.randomUUID()` on **Node server**) → client `storage.from('messenger-attachments').upload` → RPC `send_messenger_message_with_attachment`.
- Bucket exists, `file_size_limit=52428800`, not public. Storage INSERT policies require path owner + `messenger_attachment_size_ok` (ext allow-list: jpg/png/webp/mp4/webm/pdf/doc/docx/zip/xlsx — some audio exts can fail INSERT even when MIME looks fine).
- Kong compose: **no** `client_max_body_size`; storage service `FILE_SIZE_LIMIT` 50MB.
- E2E helpers used `lanEnv().SUPABASE_URL` which is host **`kong`** — host Playwright got `ENOTFOUND kong`. Zero `messenger_attachments` under E2E-COLLAB prefix.
- HTTP: paperclip path OK without secure context; **voice** fails via `AudioRecorder.tsx` (`isSecureContext` / `getUserMedia`) = BLOCKED-ENV only for recording.

**Classification:** Primary E2E failure = **test env URL (`kong`)**, not product HTTPS. UI on 3100 still needs one upload smoke (not run in this read-only pass).

**Prod:** HTTP alone OK for file attach if public API URL is reachable (not docker hostname). Voice still needs HTTPS.

**Recommended:** (1) keep E2E on `http://192.168.170.8:9000`; (2) UI verify jpg/pdf/mp4 on 3100; (3) if UI fails, check storage policy/ext allow-list before chasing HTTPS.

**Risk:** low for URL fix; audio ext vs `messenger_attachment_size_ok` is a separate P2 if STT/voice files are required.

---

## I3 — No redirect to `/login` (A6)

**E2E claimed:** FAIL P0 — cold session stays on `/collaboration`.

**Found:** Compound gate failure (app-wide):
- `_app.tsx`: SSR `if (typeof window === "undefined") return`; on `authError` shows retry UI **without** `/login`; non-redirect errors in catch are swallowed (no force login).
- `route-guards.ts` `requirePermission`: `resolveAuthWithRetry()` returns `null` without `window` → `return { user: null, roles: [] }` — **pass without redirect**.
- AuthProvider loads cold session / error UI but **does not navigate** to `/login`.
- HTTP probe: `/collaboration` and `/dashboard` return **200** SPA shell without cookies. Anon API: E9 (0 rows / errors).

**Anonymous visitor:** empty/unauthorized shell, **not** business data via RLS (evidence: prior E9 + design). **Re-rate: P1** (broken UX / incomplete gate), not P0, unless a follow-up proves data in HTML/SSR payload.

**Recommended fix:** client `beforeLoad` re-check or `_app` layout effect: if no session → `/login`; do not treat SSR null as authorized. Align all guards.

**Tests:** keep A6; add `/dashboard` cold session twin.

**Risk:** auth bounce loops if mis-handled during loading — use existing `ensureAuthReady` patterns from comments in same file.

---

## I4 — work_items vs tasks (C11)

**E2E claimed:** FAIL P1 — button should write `tasks`.

**Found:** `CreateWorkFromMessageButton` → `createWorkItem` → table **`work_items`**. Readers: `WorkBoardPage` / topics via `listWorkItems`; route `/_app.operations.work` (roles admin/manager/sales/accountant). `/operations/tasks` reads **`tasks`** separately (marketing/ops tasks) — **unrelated successor, not duplicate wiring**.

**Verdict:** **Wrong test expectation.** Feature is wired to `/operations/work`. Update E2E C11 to assert `work_items` + visibility on `/operations/work`.

**Risk of “fix”:** none if only tests/docs change.

---

## I5 — Viewer card → `/unauthorized` (A3)

**E2E claimed:** FAIL P1.

**Found (reconciled):**
- Hub hardcodes `viewer` on پیام‌ها (`_app.collaboration.tsx`).
- `/messages` uses `requirePermission('messages','view')` → `loadRolePermissions()` reads `role_permissions` as the user.
- As **postgres/admin**, matrix shows `viewer.can_view=true` for `messages` (so product *intent* includes viewer).
- As **viewer-only JWT**, restrictive policy `viewer_restricted` on `role_permissions` (`NOT is_viewer_only(auth.uid())`) hides those rows → empty permission cache → `hasPermissionEx` false → `/unauthorized`. Hub does not consult that table, so the card still shows.
- Same trap for mobile shortcut «پیام‌ها» for viewer. Soft gap: hub also **omits `purchase_specialist`** who has `messages.can_view` in DB.

**Which is wrong:** Not the matrix *row* (it grants view) — the **loading path** under `viewer_restricted` makes the route deny what the hub advertises. Fix: let authenticated users SELECT `role_permissions` (or load via SECURITY DEFINER), **or** remove viewer from hub/nav if messenger is not for viewers.

**Real viewer-only users (test):** **1** (`test.viewer@afrakala.local`). Prod count: owner verify.

**Recommended default:** fix SELECT on `role_permissions` for authenticated; keep read-only messenger for viewer.

**Risk:** only touch `role_permissions` read path; do not weaken restrictive policies on business tables.

---

## I6 — `purchase_specialist`

**Found:** `user_roles` count **0**. `role_permissions.messages` can_view=true for that role. Hub cards in collaboration.tsx do **not** list `purchase_specialist` (would see **no** hub cards if only that role). Mobile `SHORTCUTS_BY_ROLE.purchase_specialist`: dashboard, `/purchase`, products, `/messages` (`MobileBottomNav.tsx`).

**Would see/miss:** mobile shortcuts to purchase/messages; collaboration hub empty unless cards updated; messages OK if permissions load (not viewer-only).

**Test account plan (do not create now):** Auth admin create `test.purchase_specialist@afrakala.local` / `AfraTest!1404`; insert `user_roles`; add to session generator; never use service role for messenger writes in tests.

---

## I7 — Collaboration code not deployed

**Between `f9c57d0e` and `c1ea61a1`:** single commit `c1ea61a1` — sidebar pin + HelpHint + `collaboration-help.ts` + prod deploy script. UX/docs only; no RPC/schema. Needs smoke on hub+messages after deploy, not full SLA re-run.

**Branches containing it:** `feature/sales-desk`, `test/collab-e2e-20260921-2352`, others. Not ancestor of every workspace HEAD. Production presence **owner verify** (never probed `.10`).

**Recommended default:** include `c1ea61a1` in 3100 release after A6/I5/SLA gates if owner wants help UI; else ship SLA/guard fixes first without help commit.

---

## I8 — E2E side effects

| Table / metric | Count (prefix `E2E-COLLAB-20260921-2352`) |
|----------------|------------------------------------------|
| messenger_groups | 94 |
| messenger_group_members | 189 |
| messenger_messages | 64 |
| inquiries | 22 |
| messenger_attachments | 0 |
| inquiry_replies | 10 |
| inquiry_status_history | 81 |
| inquiry_transfers | 0 |
| performance_penalties for test.manager since 2026-09-21 | 12 (type `no_response_primary`) |

**D8 status force:** RPC `update_inquiry_status` as **admin JWT** (`p_new_status: transfer_available`) — **not** direct DB write. Then `transfer_inquiry` as sales. Allowed by mission (app/RPC with test JWT).

**Manual `tick_inquiries`:** `inquiry_status_history` with `reason=auto-tick` after E2E window on **non-E2E** groups: **0** rows. Side effects confined to E2E-named groups / test.manager penalties.

**Cleanup SQL:** soft-deactivates only `messenger_groups.name LIKE 'E2E-COLLAB-20260921-2352%'`; hard deletes commented and also prefix-scoped. **Safe** for review; does not remove `performance_penalties` (note for owner).

---

## Ordered execution phases (later prompt)

### Phase A — Test DB hygiene (3100/afrakala)
- Goal: prevent surprise on first cron enable.
- Changes: expire/cancel the 11 `transfer_available` test inquiries / deactivate E2E groups via reviewed cleanup (owner-approved writes).
- Gate: open>10m count = 0 OR only intentional leftovers; penalties inventory recorded.
- Rollback: N/A (data).

### Phase B — Migrations on test
- Goal: schedule `tick_inquiries`; fix viewer `role_permissions` SELECT if owner chooses keep-viewer-messenger.
- Changes: new migration files committed; apply on test; `docker restart afrakala-lan-rest` after migrations.
- Tests: cron.job row present; SLA slow spec; viewer can open `/messages`.
- Gate: job active; one new inquiry progresses without manual RPC.
- Rollback: `cron.unschedule` by jobname; revert migration on new deploy.

### Phase C — App guard fix on test branch
- Goal: cold session → `/login` for guarded routes.
- Changes: `route-guards` / `_app` client enforcement only.
- Tests: A6 + dashboard twin pass twice.
- Gate: Playwright A6 green.
- Rollback: revert commit.

### Phase D — Deploy 3100 from clean committed tree
- Goal: ship chosen commits (guard+SLA migration already applied; optionally `c1ea61a1`).
- Gate: `APP_GIT_SHA` matches intended; smoke hub/messages/inquiry; no `.10`.
- Rollback: redeploy previous SHA.

### Phase E — E2E re-run collab suite
- Goal: dual non-slow + SLA; update report.
- Gate: no P0; D6 wired; A6 pass; C11 expectation updated.

### Phase F — Production promotion (owner-run)
- Goal: 3000 + cron on DB `postgres`.
- Must differ: cron database name `postgres`; verify prod cron catalog and open-inquiry backlog **by owner** before enable.
- Gate: owner checklist signed; never automated from this agent against `.10`.

---

## Owner decisions (defaults)

1. **SLA penalty policy:** from day one / grace / warnings only → **Default: from day one**, after backlog expire on test; grace only if prod has real open inquiries (owner counts first).
2. **Open inquiry backlog:** expire vs leave → **Default: expire/cancel E2E + transfer_available test leftovers before cron**.
3. **Include `c1ea61a1` help/pin in this release?** → **Default: yes after Phase C/D smoke**, low risk UX-only.
4. **Viewer messenger:** keep + fix permissions read vs remove from hub → **Default: fix SELECT on `role_permissions` for authenticated** so matrix works; keep read-only messenger.
5. **Cron interval:** 1 min vs 5 min → **Default: 1 min** (matches SLA thresholds).

---

## Not verified

- Live Playwright UI upload of jpg/pdf/mp4 on 3100 (console/network capture).
- SSR HTML whether any business rows embedded for anon.
- Production cron.job, open inquiry backlog, viewer-only user count (`.10` forbidden).
- Whether `expire_pending_documents` still 42P10 under cron (comment in `inquiry-status.ts`).
- Whether `tick_inquiries` fails as a whole if nested `expire_pending_documents()` raises 42P10 (if so, scheduling it changes nothing).
- Full list of non-main local collab commits beyond `c1ea61a1`.
