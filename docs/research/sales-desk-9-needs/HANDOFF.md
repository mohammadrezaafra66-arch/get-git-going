# HANDOFF

## چه چیزی تغییر کرد

روی شاخهٔ `feature/sales-desk` در `D:\AfraKalaTest\app` قابلیت «میز فروش / ۹ نیاز» پیاده و روی LAN اعمال شد. [E3: `git branch --show-current` → `feature/sales-desk`; `git rev-parse HEAD` → `3bec3749a244bc8347ecf2338cf0f6bc3a2b47e7`]

مهاجرت‌های `20260916030000_545`، `20260916031000_546`، `20260916032000_547`، `20260916033000_548` روی دیسک هستند و طبق چک‌پوینت‌های D1/D1b روی دیتابیس LAN `afrakala` با `INSERT 0 1` در لجر ثبت شدند. [E1: `supabase/migrations/20260916030000_545_sales_interactions.sql` و هم‌خانواده‌ها؛ E2: `orchestration/checkpoint-d1.md:33-37` و `checkpoint-d1b-548.md:33-36`]

مسیرهای UI `/operations/sales-desk`، `/sales/customers/$customerId/dossier`، `/operations/call-activity` و برچسب ناوبری «میز فروش» اضافه شدند. [E1: `src/routeTree.gen.ts:737-738,759-760,1319-1320`; `src/lib/navigation/registry.ts:562-564,571-572`]

نیاز ۳ با فراخوانی `derive_staff_call_metrics` بعد از ایمپورت موفق در `import-issabel-calls.server.ts` سیم‌کشی شد. [E1/E2: `src/lib/calls/import-issabel-calls.server.ts:423-437`]

نیاز ۹ با نوع اعلان `sales_interaction_assigned` و تریگر `trg_notify_sales_interaction_assigned` در مهاجرت ۵۴۷ پیاده شد. [E2: `supabase/migrations/20260916032000_547_sales_interaction_assign_notify.sql:41,98,113-117`]

E2E `e2e/business-flows/sales-desk-9.spec.ts` روی Vite `:8080` با **۷ passed** و `EXIT=0` گزارش شد؛ LAN `:3100` تا redeploy مسیر F1 را نداشت. [E3: `orchestration/checkpoint-t1.md:39-49,55-70`; E1: `e2e/business-flows/sales-desk-9.spec.ts:7-9`]

یافتهٔ امنیتی C6 (دزدیدن `author_id` توسط assignee) با مهاجرت ۵۴۸ بسته و در بازبینی مستقل APPROVE شد؛ ریسک MEDIUM اسپم ارجاع باز ماند. [E2: `orchestration/checkpoint-s1-security.md:168,48-49`; E4: `checkpoint-d1b-548.md:44-46`]

بدون Issabel، مسیر دستی `createSalesInteraction` / میز فروش همچنان قابل استفاده است. [E1: `src/routes/_app.operations.sales-desk.tsx:23-26`; `src/lib/sales-desk/interactions.ts:37-50`; `src/components/sales-desk/CallerInboundPopup.tsx:103,304`]

این بستهٔ docs-writer فقط `README.md`، همین `HANDOFF.md`، یک ردیف در `PROGRESS.md`، و اختیاری `orchestration/checkpoint-docs.md` را می‌نویسد؛ کد محصول را تغییر نمی‌دهد. [محدودهٔ بریف مأموریت]

## چرا

تیم فروش ۹ نیاز فوری داشت که ممیزی ۲۰۲۶-۰۹-۱۶ بخشی را ABSENT / BUILT_NOT_WIRED / PARTIAL اعلام کرده بود. [E1: `AUDIT-20260916.md:7-16`]

هدف action plan این بود که جدول تعاملات، RPCها، اعلان ارجاع، سیم‌کشی متریک تماس، صفحات میز/پرونده، ناوبری و E2E قابل‌سنجش باشند بدون وابستگی اجباری به Didar یا شکستن `tasks`/`sales_quotes`. [E1: `orchestration/ACTION_PLAN.md:8-21,58`]

اسناد نهایی باید برای بازبینی بیرونی هر ادعا را به مسیر:خط یا خروجی دستور وصل کند تا پس از تغییر کد، متن بدون منبع نماند. [قانون نردبان شواهد agent docs-writer]

## فایل‌ها و خطوط تغییریافته

### محصول (پیش از این مأموریت docs؛ روی شاخه موجود)

| حوزه | مسیرهای شاخص |
|------|----------------|
| اسکیما/RLS | `supabase/migrations/20260916030000_545_sales_interactions.sql` |
| RPC | `supabase/migrations/20260916031000_546_sales_interaction_rpcs.sql` |
| اعلان ارجاع | `supabase/migrations/20260916032000_547_sales_interaction_assign_notify.sql` |
| قفل author_id | `supabase/migrations/20260916033000_548_sales_interactions_lock_author_id.sql` |
| ایمپورت + Need 3 | `src/lib/calls/import-issabel-calls.server.ts:17-20,423-453` |
| کلاینت تعاملات | `src/lib/sales-desk/interactions.ts:37-57` |
| میز فروش | `src/routes/_app.operations.sales-desk.tsx` |
| پرونده ۳۶۰ | `src/routes/_app.sales_.customers_.$customerId.dossier.tsx` |
| ناوبری | `src/lib/navigation/registry.ts:562-572,1418-1420` |
| E2E | `e2e/business-flows/sales-desk-9.spec.ts` |

### این نشست docs-writer

| فایل | عمل |
|------|-----|
| `docs/research/sales-desk-9-needs/README.md` | ایجاد |
| `docs/research/sales-desk-9-needs/HANDOFF.md` | ایجاد |
| `docs/research/sales-desk-9-needs/orchestration/checkpoint-docs.md` | ایجاد (اختیاری) |
| `PROGRESS.md` | افزودن یک ردیف تاریخچه برای sales-desk 9-needs (ردیف person-dedupe از قبل در working tree بود و دست نخورد) |

## شواهد در دست با سطحشان   (هر مورد: ادعا | سطح E | دستور یا مسیر:خط)

| ادعا | سطح | منبع |
|------|-----|------|
| شاخهٔ فعلی `feature/sales-desk` است | E3 | `git branch --show-current` → `feature/sales-desk` |
| HEAD هنگام نوشتن docs ≈ `3bec3749` | E3 | `git rev-parse HEAD` → `3bec3749a244bc8347ecf2338cf0f6bc3a2b47e7` |
| فایل‌های مهاجرت ۵۴۵–۵۴۸ روی دیسک‌اند | E1 | `supabase/migrations/2026091603{00,10,20,30}00_54{5,6,7,8}_*.sql` |
| ۵۴۵–۵۴۷ روی LAN `afrakala` اعمال + لجر `INSERT 0 1` | E2 (گزارش worker) | `orchestration/checkpoint-d1.md:27-37,59` |
| ۵۴۸ روی LAN اعمال + لجر `INSERT 0 1` نسخه `20260916033000` | E2 | `orchestration/checkpoint-d1b-548.md:28-36,53` |
| جدول زنده پس از اعمال ستون‌ها/سیاست‌ها را دارد | E3 (خروجی ذخیره‌شده) | `orchestration/_verify_545_final.out:3-53` |
| مسیر `/operations/sales-desk` در route tree | E1 | `src/routeTree.gen.ts:737-738` |
| مسیر dossier مشتری | E1 | `src/routeTree.gen.ts:1319-1320` |
| مسیر `/operations/call-activity` | E1 | `src/routeTree.gen.ts:759-760` |
| ناوبری «میز فروش» | E2 | `registry.ts:563-564` `to: "/operations/sales-desk"` / `label: "میز فروش"` |
| Need 3: RPC derive بعد از ایمپورت | E2 | `import-issabel-calls.server.ts:436-437` |
| Need 9: نوع + تریگر | E2 | `547_….sql:41,98,113-117` |
| `createSalesInteraction` → `sales_interaction_create` با `p_source` پیش‌فرض manual | E2 | `interactions.ts:40-49` |
| صفحهٔ میز بدون ایزابل قابل استفاده است (کامنت+UI) | E2 | `sales-desk.tsx:23-26,32` |
| E2E ۷ سبز روی Vite `:8080` | E3 | `checkpoint-t1.md:29-49`؛ خروجی کامل `_t1_pass_run.out` |
| LAN `:3100` بدون redeploy ۴۰۴ روی sales-desk | E3 | `checkpoint-t1.md:55-70` |
| C6 قبل از ۵۴۸ قرمز (`assignee_can_steal_author=t`) | E4 | `checkpoint-d1b-548.md:44`؛ S1 `_s1_rls_probe` در `checkpoint-s1-security.md:48` |
| C6 بعد از ۵۴۸ سبز (`=f`) و RE-REVIEW APPROVE | E4/E2 | `checkpoint-d1b-548.md:45`؛ `checkpoint-s1-security.md:168` |
| MEDIUM assign-spam باقی است | E2 | `checkpoint-s1-security.md:49,168` |
| merge به staging / push انجام نشده (این agent) | E3 | بریف + `git status` بدون ahead-of-remote در این نشست docs؛ هیچ `git push` اجرا نشد |

## چه چیزی تأیید نشد

- این agent در این نشست خودش `psql` زنده روی `afrakala` برای لجر ۵۴۵–۵۴۸ اجرا نکرد؛ اعمال LAN از گزارش‌های D1/D1b و خروجی‌های ذخیره‌شده نقل شده است (E2 worker، نه E3 تازهٔ docs-writer).
- Redeploy کانتینر `afrakala-lan-web` پس از F1/T1 در این نشست تأیید نشد؛ آخرین شواهد T1 هنوز ۴۰۴ روی `:3100` است.
- E5 کامل سوئیت رگرسیون خارج از `sales-desk-9.spec.ts` برای این feature اجرا/بازبینی نشد.
- `GROUND_TRUTH.md` هنوز می‌گوید `sales_interactions` ABSENT و Need 3 unwired است (`GROUND_TRUTH.md:83,140`) — آن سند پیش از پیاده‌سازی است و با وضعیت دیسک فعلی هم‌خوان نیست؛ به‌عنوان حقیقت جاری استفاده نشود.
- ردیف تاریخچهٔ person-dedupe در `PROGRESS.md` قبل از این agent در working tree بود؛ صحت ادعای آن ردیف راستی‌آزمایی نشد.
- Production (`192.168.170.10`) لمس یا مهاجرت نشده — فقط از گزارش‌های worker نقل می‌شود که هدف نبوده است.

## ریسک‌های باقی‌مانده

- **MEDIUM — اسپم اعلان ارجاع:** نویسنده می‌تواند `salesperson_id` را مکرر به پروفایل‌های دلخواه بزند و تریگر DEFINER ردیف `sales_interaction_assigned` بسازد؛ نرخ‌محدود/چک نقش هدف نیست. [E2: `checkpoint-s1-security.md:49,97`]
- **استقرار LAN وب:** تا rebuild/deploy، کاربران روی `:3100` مسیرهای میز/پرونده را نمی‌بینند حتی اگر DB مهاجرت شده باشد. [E3: `checkpoint-t1.md:76-78`]
- **Person picker روی Vite:** T1 گزارش کرد `searchPersons` serverFn خالی برمی‌گرداند در حالی که RPC مستقیم کار می‌کرد — مسیر E2E با RPC-through-page دور زد؛ UX ممکن است روی vite-dev ضعیف بماند. [E2: `checkpoint-t1.md:79`]
- **اسناد کهنه:** `AUDIT`/`GROUND_TRUTH` پیش‌ساختگی؛ خواننده باید README/HANDOFF و کد فعلی را ترجیح دهد.
- **انتشار:** بدون تأیید انسان، merge به `staging` و push انجام نشود. [بریف + قانون git constitution]

## دقیقاً چه چیزی باید بازبینی شود

1. آیا لجر زندهٔ `afrakala` هنوز چهار نسخهٔ `20260916030000`…`33000` را دارد (یک `SELECT` تأیید مالک/orchestrator).
2. پس از `docker compose … up -d --build web` روی LAN: HTTP 200 برای `/operations/sales-desk` با نشست sales/admin و تطبیق `APP_GIT_SHA` با HEAD شاخه.
3. اجرای مجدد `sales-desk-9.spec.ts` با `E2E_BASE_URL=http://192.168.170.8:3100` بعد از redeploy.
4. تصمیم محصولی برای بستن MEDIUM assign-spam (محدود کردن هدف ارجاع / نرخ).
5. PR از `feature/sales-desk` → `staging` فقط پس از موارد ۱–۳ — **نه** merge خودکار این agent.
