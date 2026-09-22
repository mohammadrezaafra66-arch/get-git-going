# طرح تحقیق و اجرای انتشار ارتباطات همکاری — 2026-09-22

**STATUS: COMPLETE** (تحقیق read-only انجام شد؛ این سند مبنای اجرای فازهاست)

منبع E2E: `docs/qa/collab-e2e-report-20260921-2352.md` (commit `4c4a8e83` روی branch `test/collab-e2e-20260921-2352`).  
محیط تست: app `http://192.168.170.8:3100` (`APP_GIT_SHA=f9c57d0e`)، PostgREST `:9000`، DB `afrakala`.  
Production (`192.168.170.10:3000`, DB name `postgres`) — فقط توسط مالک و پس از گیت تست؛ از این agent هرگز فراخوانی نمی‌شود.

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

**EXPLAIN (no CALL):** open pending scan uses bitmap on `idx_inquiries_product_open`. Full function duration not measured without executing.

**Backlog >10m open:** **11** rows, all `status=transfer_available`, all `assigned_to` / email = `a0a4afe5-…` / `test.manager@afrakala.local`, age ~15h+. Count in `pending|warning|danger|critical` older than 10m: **0**. Stuck past expire@30m proves **no live ticker**. Enabling schedule → primarily **expire** these 11; no new critical penalties expected.

**Same as `/my-penalties`?** Yes — `useMyPenalties` → RPC `get_user_penalties` → `performance_penalties`.

**Recommended:** tracked migration with `cron.schedule_in_database(..., 'afrakala', ...)`. Prod: 4th arg `'postgres'`. Pattern: `supabase/migrations/20260913101000_533_pg_cron_http_scheduler.sql`, `deploy/lan/scripts/cron-445-schedule-afrakala-jobs.sql`.

**Draft SQL:**
```sql
SELECT cron.schedule_in_database(
  'afrakala-tick-inquiries-1min',
  '* * * * *',
  'SELECT public.tick_inquiries();',
  'afrakala',
  'supabase_admin',
  true
);
```

**Avoid penalty flood:** expire/cancel E2E + stale open inquiries on test before enable (default).

**Tests:** assert `cron.job` row; second tick does not duplicate penalties.

**Risk:** `expire_pending_*` side effects; wrong prod DB name.

---

## I2 — File upload (C6)

**E2E claimed:** PARTIAL P2.

**Found:** UI path `MessageComposer` → server `preCheckMessengerAttachment` (`crypto.randomUUID` on Node) → storage `messenger-attachments` → RPC. Bucket 50MB private. E2E used `SUPABASE_URL` host **`kong`** → `ENOTFOUND`. Zero E2E attachment rows. Paperclip OK without HTTPS; **voice** needs `isSecureContext` (`AudioRecorder.tsx`) = BLOCKED-ENV. Storage INSERT uses `messenger_attachment_size_ok` ext allow-list (some audio exts may fail).

**Recommended:** E2E always use `http://192.168.170.8:9000`; UI smoke jpg/pdf/mp4 on 3100; fix storage ext list only if UI fails.

---

## I3 — No redirect to `/login` (A6)

**E2E claimed:** FAIL P0.

**Found:** App-wide. `_app.tsx` SSR skips; `authError` without `/login`; `requirePermission` returns pass when `resolveAuthWithRetry()` is null (no window). Shell HTTP 200 for `/collaboration` and `/dashboard` without cookies. Anon API: 0 rows (E9).

**Re-rate: P1** (UX / incomplete gate), not P0, unless SSR HTML embeds business data (not verified).

**Recommended:** client enforcement — no session → `/login`; do not treat SSR null as authorized.

**Tests:** A6 + `/dashboard` cold twin.

---

## I4 — work_items vs tasks (C11)

**E2E claimed:** FAIL P1.

**Found:** `CreateWorkFromMessageButton` → `work_items`; UI at `/operations/work`. `/operations/tasks` is separate `tasks` table. **Wrong test expectation** — update C11 to assert `work_items` + `/operations/work`.

---

## I5 — Viewer card → `/unauthorized` (A3)

**E2E claimed:** FAIL P1.

**Found:** Hub hardcodes `viewer`. Matrix row `viewer.can_view=true` for `messages`, but `viewer_restricted` on `role_permissions` hides rows from viewer-only JWT → empty cache → deny. Soft gap: hub omits `purchase_specialist`. Test viewer-only count: **1** (`test.viewer@afrakala.local`).

**Recommended default:** authenticated SELECT on `role_permissions` (write stays admin-only); keep read-only messenger for viewer.

---

## I6 — `purchase_specialist`

**Found:** 0 users. `messages.can_view=true`. Hub cards omit role (empty hub). Mobile shortcuts: dashboard, `/purchase`, products, `/messages`.

**Test account (plan):** `test.purchase_specialist@afrakala.local` / `AfraTest!1404` + `user_roles` + session generator.

---

## I7 — Collaboration code not deployed

**Range `f9c57d0e..c1ea61a1`:** single commit — sidebar pin + HelpHint + `collaboration-help.ts`. UX only. Default: include after guard/SLA smoke on 3100. Prod presence: owner verify.

---

## I8 — E2E side effects

| Metric | Count |
|--------|------:|
| messenger_groups (prefix) | 94 |
| messenger_group_members | 189 |
| messenger_messages | 64 |
| inquiries | 22 |
| messenger_attachments | 0 |
| inquiry_replies | 10 |
| inquiry_status_history | 81 |
| inquiry_transfers | 0 |
| penalties test.manager since 2026-09-21 | 12 |

**D8 force:** RPC `update_inquiry_status` (admin JWT) — not direct DB write.  
**Manual tick non-E2E history:** 0.  
**Cleanup SQL:** prefix-scoped soft-deactivate; safe; does **not** clear penalties.

---

## Ordered execution phases

### Phase A — Test DB hygiene
Expire/cancel the 11 `transfer_available` leftovers / deactivate E2E groups. Gate: open>10m = 0 or intentional only.

### Phase B — Migrations on test
Schedule `tick_inquiries`; fix `role_permissions` SELECT for authenticated if keeping viewer messenger. Apply; `docker restart afrakala-lan-rest`. Gate: cron job active; new inquiry progresses without manual RPC.

### Phase C — App guard fix
Cold session → `/login`. Gate: A6 green twice.

### Phase D — Deploy 3100
Clean committed tree; optional `c1ea61a1`. Gate: `APP_GIT_SHA` match; smoke.

### Phase E — E2E re-run
Dual non-slow + SLA; update C11 expectation; update report.

### Phase F — Production (owner-only)
Cron with database `'postgres'`; owner verifies backlog first. Never automate against `.10` from this agent.

---

## Owner decisions (defaults applied in execution)

1. SLA penalties **from day one** after backlog expire on test.
2. **Expire/cancel** E2E + transfer_available test leftovers before cron.
3. Include **`c1ea61a1`** after Phase C/D smoke when feasible.
4. **Fix** `role_permissions` SELECT for authenticated; keep viewer messenger.
5. Cron interval **1 minute**.

---

## Not verified

- Live Playwright UI upload jpg/pdf/mp4 on 3100.
- SSR HTML business-data embedding for anon.
- Production cron / backlog / viewer counts (`.10`).
- Whether `expire_pending_documents` still 42P10 under cron.
- Other local collab commits beyond `c1ea61a1`.
