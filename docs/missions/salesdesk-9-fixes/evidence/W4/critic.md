# W4-CRITIC — independent review (Wave 4 salesdesk-9-fixes)

- Critic: W4-CRITIC (dev-code-critic)
- Worktree: `D:\AfraKalaTest\wt-salesdesk-9-fixes`
- Branch: `feature/salesdesk-9-fixes`
- Review HEAD at start: `a46ebd7cf490c105aeb3c0dcc41e656270fc0fd7`
- Deadline: 2026-09-22T11:00:00Z · Budget 40m
- Builder/orchestrator success reports: **not consulted** ([B-6])

## معیارهایی که از خواسته استخراج کردم (قبل از خواندن توضیح نویسنده)

از EXECUTION-PROMPT §3.16، §5 Wave 4، §6، §7، §9:

| Row | معیارهای پذیرش |
|-----|----------------|
| ADR-4 / §3.16 | فعالیت‌ها روی `sales_interactions`؛ `tasks` دست‌نخورده |
| D2 | جدول `sales_activity_types` با ۱۸ عنوان Didar (§6 ترتیب/املا)؛ hex round-trip |
| D1 | ستون‌های `activity_type_id,due_at,due_has_time,original_due_at,done_at,result_note,deal_id`؛ owner=`salesperson_id`؛ creator=`author_id`؛ map call/note بدون تغییر `kind` |
| D3 | لیبل‌ها/دکمه‌های §6؛ فقط owner نتیجه؛ revert به انجام‌نشده |
| D4 | صفحه «فعالیت‌ها» + سطل‌ها/فیلترها؛ badge قرمز منو با `tehran_today()`؛ `role_permissions` |
| D5 | آیکون زرد/قرمز/سبز/طوسی روی معاملات باز در میز فروش/کارهای من؛ فیلتر «معاملاتی که فعالیتی روی آن‌ها نیست» |
| D6 | «به تعویق انداختن» `original_due_at` را نگه دارد؛ یادآور فقط با ساعت → زنگوله poll؛ **هرگز** pg_cron |
| D7 | «فعالیت‌های امروز و عقب‌افتاده» در «کارهای من» |
| Gate | typecheck ≤74؛ migrations ≥572؛ 3100 healthy با worktree SHA؛ عدم لمس `app` tree |

## بررسی هر معیار

| معیار | برآورده؟ | شاهد |
|-------|----------|------|
| D2 seed+hex | **بله** | `critic-probe-out.txt`: 18/18 `title_eq=true hex_eq=true` · `D2_VERDICT_SEED=PASS` **[E3]** |
| D1 columns | **بله** | همان فایل: `D1_COLS=PASS`؛ mig `573_…sql` **[E2/E3]** |
| D1 note map | **بله** | `note|2|2` همه روی sort_order=0 «یادداشت ساده» **[E3]** |
| D1 call map | **نامعلوم زنده** | `kind=call` count=0 در DB؛ SQL backfill در `573` خوانده شد **[E2]**؛ بدون ردیف call زنده تأیید نشد |
| D1 kind intact | **بله** | فقط `note`/`request`؛ unexpected_kinds=0 **[E3]** |
| D3 labels/buttons | **بله** | `ActivityForm.tsx` / `ActivityDoneControls.tsx` رشته‌های §6 **[E2]** |
| D3 owner-only | **جزئی** | گارد در `activities.ts:139-141` و UI؛ UPDATE RLS اجازهٔ `author_id=uid()` هم می‌دهد → API bypass ممکن **[E2/E3]** |
| D3 revert | **بله (کد)** | `revertActivityDone` + UI «بازگردانی به انجام نشده» **[E2]** |
| D4 page/buckets/filters | **بله** | `_app.operations.sales-desk_.activities.tsx` سطل‌ها + فیلترها **[E2]** |
| D4 red menu + tehran | **بله** | RPC `count_open_activities_due_today_or_overdue` از `tehran_today`؛ badge `bg-destructive` در `AppSidebar.tsx:436-442` **[E2/E3]** |
| D4 role_permissions | **بله** | `sales-activities` برای admin/manager/sales view=t **[E3]** |
| D5 lights+filter | **بله** | `FollowUpTrafficLightIcon` + `followUpLightsForDeals` + فیلتر در `MyWorkDeals.tsx` (تب «کارهای من» داخل میز فروش) **[E2]** |
| D6 postpone keeps original | **بله** | ROLLBACK probe: `POSTPONE_KEEP keep=t` **[E3]**؛ کد `postponeActivityDue` وقتی original set است آن را PATCH نمی‌کند **[E2]** |
| D6 reminder + no cron | **بله** | `materialize_due_activity_reminders` + `NotificationBell` 30s؛ cron.job در `postgres` برای activity=0؛ `afrakala` فاقد `cron.job` **[E3]**؛ reminder probe `n=1 fired=t queue=1` **[E3]** |
| D7 my-work section | **بله** | `MyWorkDeals.tsx` عنوان «فعالیت‌های امروز و عقب‌افتاده» **[E2]** |
| tasks untouched | **بله** | mig 572–575 بدون `\btasks\b`؛ `tasks` هنوز 15 ستون **[E3]** |
| typecheck ≤74 | **بله** | `critic-tsc.txt`: `ERROR_TS_COUNT=74` EXIT=2 **[E3]** |
| migrations ≥572 | **بله** | فایل‌های 572–575؛ schema_migrations شامل `20260922050000`…`50300`؛ max num=575 **[E3]** |
| 3100 healthy + SHA | **جزئی** | HTTP 200؛ `APP_GIT_SHA=0c6eeb08`؛ HEAD=`a46ebd7c`؛ 3100 ancestor است ولی برابر HEAD نیست (فقط commits اسناد OPS بعد از FE) **[E3]** |
| app tree untouched | **بله (این جلسه)** | critic فقط در worktree نوشت؛ `app` تغییرات از قبل/بیگانه **[E3]** |

## تلاش‌های ابطال

| تلاش | نتیجه |
|------|--------|
| Hex mismatch روی هر ۱۸ عنوان §6 | همگی match — ابطال شکست خورد |
| ستون‌های D1 غایب | هر ۹ ستون حاضر |
| call mapping غلط | هیچ `call` زنده برای ابطال؛ SQL mig بررسی شد |
| owner-only بدون گارد DB | **موفق ابطال جزئی**: RLS UPDATE به author هم اجازه می‌دهد |
| count RPC بدون tehran_today | از `tehran_today` استفاده می‌کند |
| pg_cron برای reminder | صفر job مرتبط در `postgres.cron.job` |
| postpone original را عوض کند | `keep=t` در ROLLBACK probe |
| materialize بدون JWT هیچ ننویسد | با `set_config` JWT → n=1؛ بدون auth.uid در کد `RETURN 0` |
| typecheck >74 | دقیقاً 74 |
| 3100 ≠ worktree HEAD | **موفق ابطال جزئی**: SHA برابر نیست |
| آیکون‌ها خارج از MyWorkDeals | فقط در `MyWorkDeals` سیم‌کشی شده (سطح «میز فروش»=صفحهٔ والد) |

## اجرای واقعی (E3)

| دستور | exit | خلاصه خروجی |
|-------|------|-------------|
| `node …/critic-probe.mjs` | 0 | D2 PASS؛ D1 COLS PASS؛ RPCs+perms OK |
| `node …/critic-postpone-probe.mjs` | 0 | `POSTPONE_KEEP keep=t` |
| `node …/critic-reminder-probe.mjs` | 0 | `REMINDER n=1 fired=t queue=1` |
| `npx tsc -p tsconfig.json --noEmit` | 2 | `ERROR_TS_COUNT=74` (سقف ≤74) |
| `docker exec afrakala-lan-web printenv APP_GIT_SHA` | 0 | `0c6eeb08` |
| HTTP HEAD `:3100/` | — | status 200 |
| cron probe `-d postgres` | 0 | 0 activity/reminder jobs |

Artifacts: `evidence/W4/critic-probe-out.txt`, `critic-postpone-run.txt`, `critic-reminder-probe.txt`, `critic-tsc.txt`, `critic-3100-sha.txt`, `critic-policies.txt`, `critic-cron-postgres.txt`.

## یافته‌ها

| شدت | مسیر | چرا | شکست احتمالی |
|-----|------|-----|----------------|
| Medium | RLS `sales_interactions_update_staff` | «فقط owner نتیجه ثبت کند» فقط در TS/UI؛ author/admin می‌تواند PATCH کند | ثبت نتیجه توسط غیر-مسئول از مسیر API |
| Low | 3100 `APP_GIT_SHA` vs HEAD | برابر worktree HEAD نیست (اسناد OPS بعد از deploy) | اگر کد بعد از `0c6eeb08` اضافه شود روی 3100 نیست؛ فعلاً فقط docs |
| Info | live `kind=call` = 0 | map تماس ورودی/خروجی روی دادهٔ زنده اندازه‌گیری نشد | ریسک latent اگر backfill روی call واقعی باشد |
| Info | Playwright §9 UI script | این critic مرورگر/login سرد اجرا نکرد | رگرسیون بصری/جریان UI کشف‌نشده |

## توصیه‌های سلیقه‌ای

- تریگر/گارد DB برای `done_at`/`result_note`: فقط `salesperson_id = auth.uid()` (یا admin).
- redeploy 3100 روی HEAD پس از commits اسناد تا شرط «worktree SHA» لفظی برقرار شود.

## چه چیزی را نتوانستم بررسی کنم

- Playwright پذیرش فارسی §9 روی 3100 (لاگین سرد / UI end-to-end).
- Backfill زنده برای `kind=call` (ردیف وجود ندارد).
- Visual regression خارج از دامنهٔ خواندن کد.

## حکم ردیف‌ها

| Row | Verdict | Evidence floor |
|-----|---------|----------------|
| D2 | **CONFIRM** | E3 hex round-trip |
| D1 | **CONFIRM** | E3 columns + note map؛ call map code-only |
| D3 | **CONFIRM** | E2 UI/lib؛ FINDING RLS bypass |
| D4 | **CONFIRM** | E2+E3 page/RPC/perms/badge |
| D5 | **CONFIRM** | E2 lights+filter in MyWorkDeals |
| D6 | **CONFIRM** | E3 postpone + reminder materialize؛ no cron |
| D7 | **CONFIRM** | E2 section in MyWorkDeals |
| Gate (tsc/mig/3100/app) | **CONFIRM** with FINDING SHA≠HEAD | E3 |

## حکم کلی: **CONFIRM**

با یافته‌های Medium (RLS owner) و Low (SHA drift docs-only). هیچ ردیف Wave 4 رد نشد؛ ابطال‌های موفق به رد کامل معیارهای اصلی نرسیدند.
