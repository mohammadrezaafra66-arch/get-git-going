# اندازه‌گیری «امنیت ۳» — S1 تا S4 به‌علاوهٔ یافته‌های جانبی

- **تاریخ:** 2026-09-14
- **ابزار:** Claude Code (فقط‌خواندنی)
- **کد:** worktree ایزوله `D:\AfraKalaTest\wt-security3` روی `origin/main` = `9bc8d554`
- **دیتابیس:** `afrakala` روی کامپیوتر تست (`afrakala-lan-db`)؛ هر نشست با `PGOPTIONS=-c default_transaction_read_only=on`، SQL از stdin (هیچ فایلی داخل کانتینر نوشته نشد)، هر شبیه‌سازی JWT داخل `BEGIN READ ONLY … ROLLBACK`.
- **حکم کلی: PARTIAL** — همهٔ ۲۱۳ فایل route، همهٔ ۶۵۲ policy و همهٔ ۲۸ ماژول با شاهد تعیین تکلیف شدند؛ اما چند چیز فقط با اجرای واقعی قابل اثبات است و در بخش ۷ فهرست شده.

> **قاعدهٔ شاهد در این سند.** *cited* = `file:line`؛ *quoted* = نقل عین متن با محل؛ *measured* = دستور + خروجی. هر جملهٔ دیگر با برچسب **(assertion)** آمده.
> «صفر ردیف» در هیچ‌جا به‌عنوان «policy کار می‌کند» خوانده نشده؛ هر صفر کنار یک baseline غیرصفر (admin واقعی یا `supabase_admin`) گزارش شده.

---

## ۱. خلاصه

| | ادعا | عدد واقعی (measured) | معنی |
|---|---|---|---|
| **S1** | ~75 route SSR که fail-open است | **75** route با guard ولی بدون `staticData.gate` (+۱ که فقط برای `accountant` باز است). از این‌ها **58** برای نقشی که واقعاً کاربر دارد باز است؛ **30** صفحه کامل رندر می‌شود، 26 با پنهان‌سازی بخشی از کنترل‌ها، 2 رد در component ولی بعد از fetch. 18 تا اسمی‌اند (guard همهٔ نقش‌های دارای کاربر را از قبل راه می‌دهد). | ادعا درست است. اما افشای *داده* را RLS تعیین می‌کند نه route. |
| **S2** | ~35 policy با `qual=true` | **38** (هر ۳۸ از نوع SELECT یا UPDATE؛ ۳۷ مؤثر، ۱ بی‌اثر چون role آن `service_role` است). **95** policy با `qual IS NULL` همه `INSERT` هستند که `USING` ندارند و نقص نیستند. **12** policy دیگر `role() = 'authenticated'` دارند که برای کاربر واردشده همان `true` است. | ادعا تقریباً درست است. |
| **S3** | `role_permissions` برای authenticated خواناست | **درست است.** کاربر فروش: 196 از 196 ردیف، 12 ستون. viewer-only: 0. حساب **inactive بدون هیچ نقش**: 196. | مهم ولی کم‌خطر: فقط نقشهٔ دسترسی. |
| **S4** | ماژول‌هایی که ردیف ندارند با fallback باز می‌شوند | **0.** جدول یک ماتریس کامل 28×7 (196 ردیف) است؛ هر ۲۶ ماژولِ ارجاع‌شده در کلاینت و هر ۴ ماژولِ ارجاع‌شده در policyها داخل آن هستند. | fallback فعلاً نهفته است، نه فعال. |

مهم‌ترین یافته **خارج از چهار ادعا** است: پنج view با `security_invoker=false`. این viewها RLS را دور می‌زنند و **کل** مانده‌حساب‌های بانکی، بدهی به تأمین‌کنندگان و سرمایهٔ تخصیصی را به هر کاربر واردشده‌ای که viewer-only نباشد نشان می‌دهند؛ حساب غیرفعالِ بی‌نقش هم شاملش می‌شود (بخش ۶، R1).

---

## ۰. تفاوت با «KNOWN CONTEXT» — هر اختلاف یک یافته است

| # | ادعای context | اندازهٔ واقعی روی `afrakala` | شاهد |
|---|---|---|---|
| K1 | 37 کاربر، 23 admin | **41** کاربر در `auth.users` (0 حذف‌شده، 0 banned، 0 anonymous)؛ **14** کاربر متمایز با نقش `admin` (11 active، 2 inactive، 1 rejected). ممکن است عدد 37/23 مال production باشد **(assertion — .10 خارج از محدوده است)**. | measured: `q1-context.sql`، `q2-users.sql` |
| K2 | fallback در `has_dynamic_permission` «به همهٔ نقش‌ها» دسترسی می‌دهد، وقتی ماژول ردیف ندارد | متن زنده دقیق‌تر است: fallback وقتی فعال می‌شود که **برای نقش‌های همین کاربر** در آن ماژول ردیفی نباشد. نتیجه‌اش هم **به action بستگی دارد**: `view` → 5 نقش، `create/update` → admin و manager، `delete` → admin، `approve/export/view_sensitive` → admin، manager و accountant. `purchase_specialist` و `site` از fallback هیچ دسترسی‌ای نمی‌گیرند. | quoted: `pg_get_functiondef('public.has_dynamic_permission(uuid,text,text)')`، بلوک «Fallback: sensible defaults» |
| K3 | 537: TRUNCATE از authenticated روی 214 جدول گرفته شد | **روی این دیتابیس اعمال نشده.** با همان predicate خودِ 537 (`537:158-159`)، `authenticated` هنوز روی **216** جدول `public` مجوز TRUNCATE دارد. ledger هیچ ردیفی `>= 20260909` ندارد (686 ردیف؛ آخرین `20260908034500`). سرتیتر 537 می‌گوید روی «restore of the 2026-09-13 production dump» اندازه گرفته شده (quoted, `537:8`)؛ پس «بسته شد» احتمالاً دربارهٔ production است **(assertion)**. | measured: `q12-538pred.sql` |
| K4 | 538: توابع قابل اجرا برای anon به 0 رسید | **درست است، با predicate خودِ 538.** نتیجهٔ `538:256-268`: **0** تابع خارج از 17 استثنا. من اول عدد 507 گزارش کرده بودم که trigger، توابع extension و 17 استثنا را هم می‌شمرد؛ آن مقایسه غلط بود و اینجا اصلاح می‌شود. | measured: `q12-538pred.sql` |
| K5 | `user_roles.role` از نوع TEXT است؛ `has_role`/`has_any_role` دو overload دارند | تأیید شد: `text`؛ overloadها `has_role(uuid,app_role)`، `has_role(uuid,text)`، `has_any_role(uuid,app_role[])`، `has_any_role(uuid,text[])`، همه `SECURITY DEFINER`. 388 policy یکی از این دو را صدا می‌زنند. | measured: `q1-context.sql`، `q9-more.sql` |

---

## ۲. S1 — جدول routeها

### ۲.۱ مخرج و روش

- **مخرج (measured):** 214 فایل زیر `src/routes`؛ منهای `__root.tsx` می‌شود **213**. شامل **190** route UI و **23** handler سرور. هر 213 تا در `src/routeTree.gen.ts` پیدا شدند (زنجیرهٔ والد از `getParentRoute`).
- **ابزار:** `scratchpad/classify-routes.mjs` + `verdict-routes.mjs` (خواندن ایستا). بعد دو نمونهٔ خواندن فایل‌به‌فایل برای component (77 فایل) و یک نمونه برای NO GUARD و handlerها (55 فایل)، هرکدام با `file:line`.

**چرا «نقش نامعلوم» یعنی بار سرد SSR — cited:**
1. هر سه guard روی سرور بدون تصمیم برمی‌گردند: `route-guards.ts:15` (`if (typeof window === "undefined") return null;`) و بعد `:114`، `:151`، `:185` (`if (!resolved) return { user: null, roles: [] }`).
2. کلاینت هنگام hydration دوباره `beforeLoad` را اجرا نمی‌کند: `node_modules/@tanstack/router-core/src/ssr/ssr-client.ts:251-263` (نسخهٔ 1.171.5، همان نسخهٔ `package-lock.json:5388`). وقتی هیچ match با `ssr === false` نباشد و SPA mode نباشد، `router.load()` صدا زده نمی‌شود.
3. در کل repo فقط یک route `ssr: false` دارد: `[.]lovable.oauth.consent.tsx:37`.
4. تنها چیزی که روی بار سرد رد می‌کند `RouteRoleGate` است (`components/layout/RouteRoleGate.tsx:157-201`) که فقط `staticData.gate` را می‌خواند؛ برای `requirePermission` نوع gate وجود ندارد (`:120`).
5. نسخه‌های بعدی race بارگذاری نقش را بسته‌اند (`settleRoles`, `route-guards.ts:79-109`)؛ پس ناوبری سمت کلاینت امن است و مسئله فقط بار سرد است.

**مثال کارشده — `/admin/automation`: تأیید، با اصلاح دامنه.**
- guard در `_app.admin.automation.tsx:18` (`requireAnyRole(["admin","manager"])`)، بدون `staticData`. روی بار سرد، `route-guards.ts:185` برمی‌گرداند و `sales` صفحه را **کامل** می‌بیند. **تأیید شد.**
- اما چیزی که sales می‌تواند *انجام دهد*: دکمهٔ صف dummy سرور‌فانکشن `enqueueDummyAutomationJobFn` را صدا می‌زند که نقش را روی سرور بررسی می‌کند (`lib/automation/enqueue-dummy-job.functions.ts:18-29`)؛ دکمهٔ Torob به `api.admin.automation.torob.enqueue.ts:96` می‌رود که `requireAdminOrManager` دارد. پس افشا = متن ایستای صفحه، نه اجرای job.

### ۲.۲ شمارش

| حکم نهایی | تعداد |
|---|---|
| REFUSES (gate) | 82 |
| **ALLOWS** — guard هست، gate نیست، component هم بررسی نمی‌کند | **30** |
| **ALLOWS (partial UI)** — صفحه رندر می‌شود، فقط برخی کنترل‌ها با نقش پنهان‌اند | **26** |
| **REFUSES (component, after fetch)** — رد در render ولی query قبلش ارسال شده | **2** |
| ALLOWS-NOMINAL — guard همهٔ نقش‌های دارای کاربر (manager, sales, accountant, viewer) را از قبل راه می‌دهد | 18 |
| NO GUARD → REDIRECT-ONLY | 7 |
| NO GUARD → PUBLIC-BY-DESIGN | 6 |
| NO GUARD → SELF-SCOPED | 8 |
| NO GUARD → COMPONENT-REFUSES | 8 |
| NO GUARD → COMPONENT-PARTIAL | 2 |
| NO GUARD → OPEN (`gamification.leaderboard`، احتمالاً عمدی) | 1 |
| **جمع UI** | **190** |

- **75** = 30 + 26 + 2 + 18 − 1 (`sales.promotion-nominations` که gate والدش `_app.sales` فقط `accountant` را اضافه راه می‌دهد و در 26 شمرده شده).
- از این 75: **45** با `requirePermission`، **29** با `requireAnyRole` (شامل دو `ALL_ROLES`)، **1** با دو `requirePermission` (45+29+1 = 75)؛ به‌علاوهٔ مورد partial `promotion-nominations`.
- **حل دستی (cited):** سه مورد را طبقه‌بند نتوانست حل کند:
  - `_app.accounting.receipts.create.tsx`: `[...CREATE_ROLES]` در `:13`، gate در `:34` → REFUSES.
  - `_app.documents.tsx:28` و `_app.delivery-receipts.tsx:31`: `requireAnyRole(ALL_ROLES)` که در `lib/rbac/roles.ts:37` پنج نقش است → ALLOWS-NOMINAL (فقط `purchase_specialist`/`site` اضافه می‌بینند که **0 کاربر** دارند؛ measured در `q1-context.sql`).

**هشدار دربارهٔ معنی «ALLOWS» (assertion مبتنی بر کد):** صفحه‌ای که رندر می‌شود داده‌اش را با JWT همان کاربر می‌خواند، پس RLS هنوز جلوی ردیف‌ها را می‌گیرد. افشای واقعی = (آنچه RLS به آن نقش می‌دهد) + (متن و کنترل‌های صفحه). اینکه آیا عمل‌های نوشتنی این صفحه‌ها روی سرور رد می‌شوند، برای همهٔ 58 مورد اندازه گرفته نشده (بخش ۷).

**یافتهٔ جانبی در layout (cited، اجرا نشده):** در `_app.tsx:143-219`، وقتی بارگذاری تمام شده و `user` تهی است و `authError` هم نیست، `AppShell` + `Outlet` رندر می‌شود؛ `beforeLoad` لایه روی SSR رد می‌شود (`:29`) و در کلاینت هیچ redirect به `/login` یا `/pending-approval` نیست (`lib/auth/AuthProvider.tsx` هیچ `navigate` ندارد). یعنی روی بار سرد، بررسی `profile.status` (`_app.tsx:70-74`) هم اجرا نمی‌شود. با R3 ترکیب می‌شود.

### ۲.۳ جدول کامل (190 route UI)

ترتیب: ALLOWS → ALLOWS-NOMINAL → REFUSES-after-fetch → NO GUARD → REFUSES. ستون «نقش‌های دارای کاربر» فقط نقش‌هایی را می‌شمرد که حداقل یک کاربر دارند (measured: admin 14، sales 14، accountant 3، manager 3، viewer 2).

| # | route id | فایل | guard (file:line) | gate (file:line) | حکم route-level در نقش نامعلوم | بررسی component (file:line) | نقش‌های دارای کاربر که فراتر از guard می‌بینند | حکم نهایی | منابع داده |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `/_app/academy_/manage` | _app.academy_.manage.tsx | _app.academy_.manage.tsx:20 `requireAnyRole(["admin", "manager"])` | — | ALLOWS | NONE _app.academy_.manage.tsx:42 | sales,accountant,viewer | **ALLOWS** | academy_courses, academy_lessons, academy_quizzes, academy_quiz_questions, audit_logs |
| 2 | `/_app/admin/automation` | _app.admin.automation.tsx | _app.admin.automation.tsx:18 `requireAnyRole(["admin", "manager"])` | — | ALLOWS | NONE _app.admin.automation.tsx:140-141 | sales,accountant,viewer | **ALLOWS** | enqueueDummyAutomationJobFn, useServerFn, /api/admin/automation/torob/enqueue, automation_jobs |
| 3 | `/_app/admin/purchase` | _app.admin.purchase.tsx | _app.admin.purchase.tsx:47 `requireAnyRole(["admin", "manager"])` | — | ALLOWS | PARTIAL src/components/purchase/PurchaseStatusActions.tsx:32 | sales,accountant,viewer | **ALLOWS (partial UI)** | get_purchase_requests, useAllPurchaseRequests, purchase_requests, usePurchaseStats, get_purchase_assignee_options |
| 4 | `/_app/admin/sales-reminders` | _app.admin.sales-reminders.tsx | _app.admin.sales-reminders.tsx:27 `requireAnyRole(["admin", "manager"])` | — | ALLOWS | NONE _app.admin.sales-reminders.tsx:48 | sales,accountant,viewer | **ALLOWS** | sales_reminders |
| 5 | `/_app/admin/validation-rules` | _app.admin.validation-rules.tsx | _app.admin.validation-rules.tsx:39 `requireAnyRole(["admin"])` | — | ALLOWS | NONE _app.admin.validation-rules.tsx:51 | manager,sales,accountant,viewer | **ALLOWS** | validation_rules |
| 6 | `/_app/admin/workflow-settings` | _app.admin.workflow-settings.tsx | _app.admin.workflow-settings.tsx:8 `requireAnyRole(["admin", "manager"])` | — | ALLOWS | NONE _app.admin.workflow-settings.tsx:13-22 | sales,accountant,viewer | **ALLOWS** | get_workflow_settings, useWorkflowSettings, useUpdateWorkflowSetting |
| 7 | `/_app/data-tables/$tableId` | _app.data-tables.$tableId.tsx | _app.data-tables.$tableId.tsx:86 `requirePermission("data-tables", "view")` | — | ALLOWS | PARTIAL _app.data-tables.$tableId.tsx:122-131 | viewer | **ALLOWS (partial UI)** | dynamic_tables, dynamic_table_columns, create_dynamic_table_row, update_dynamic_table_cell, export_dynamic_table_rows, add_dynamic_table_column |
| 8 | `/_app/data-tables/` | _app.data-tables.index.tsx | _app.data-tables.index.tsx:23 `requirePermission("data-tables", "view")` | — | ALLOWS | PARTIAL _app.data-tables.index.tsx:30 | viewer | **ALLOWS (partial UI)** | dynamic_tables, dynamic_table_columns |
| 9 | `/_app/data-tables/new` | _app.data-tables.new.tsx | _app.data-tables.new.tsx:37 `requirePermission("data-tables", "create")` | — | ALLOWS | PARTIAL _app.data-tables.new.tsx:65 | sales,accountant,viewer | **ALLOWS (partial UI)** | dynamic_tables, dynamic_table_columns |
| 10 | `/_app/gamification_/admin_/manual-metrics_/guide` | _app.gamification_.admin_.manual-metrics_.guide.tsx | _app.gamification_.admin_.manual-metrics_.guide.tsx:10 `requireAnyRole(["admin", "manager", "accountant"])` | — | ALLOWS | NONE _app.gamification_.admin_.manual-metrics_.guide.tsx:12 | sales,viewer | **ALLOWS** |  |
| 11 | `/_app/gamification/admin/achievements` | _app.gamification.admin.achievements.tsx | _app.gamification.admin.achievements.tsx:53 `requireAnyRole(["admin", "manager"])` | — | ALLOWS | NONE _app.gamification.admin.achievements.tsx:89 | sales,accountant,viewer | **ALLOWS** | achievements |
| 12 | `/_app/gamification/admin/analytics` | _app.gamification.admin.analytics.tsx | _app.gamification.admin.analytics.tsx:61 `requireAnyRole(["admin", "manager"])` | — | ALLOWS | NONE _app.gamification.admin.analytics.tsx:145 | sales,accountant,viewer | **ALLOWS** |  |
| 13 | `/_app/gamification/admin/` | _app.gamification.admin.index.tsx | _app.gamification.admin.index.tsx:14 `requireAnyRole(["admin", "manager"])` | — | ALLOWS | NONE _app.gamification.admin.index.tsx:72 | sales,accountant,viewer | **ALLOWS** | admin_gamification_overview, useAdminGamificationOverview |
| 14 | `/_app/gamification/admin/kpi-rules` | _app.gamification.admin.kpi-rules.tsx | _app.gamification.admin.kpi-rules.tsx:43 `requireAnyRole(["admin", "manager"])` | — | ALLOWS | NONE _app.gamification.admin.kpi-rules.tsx:73 | sales,accountant,viewer | **ALLOWS** | gamification_kpi_rules |
| 15 | `/_app/gamification/admin/leagues` | _app.gamification.admin.leagues.tsx | _app.gamification.admin.leagues.tsx:64 `requireAnyRole(["admin", "manager"])` | — | ALLOWS | NONE _app.gamification.admin.leagues.tsx:107 | sales,accountant,viewer | **ALLOWS** | league_settings |
| 16 | `/_app/gamification/admin/manual-metrics` | _app.gamification.admin.manual-metrics.tsx | _app.gamification.admin.manual-metrics.tsx:40 `requireAnyRole(["admin", "manager", "accountant"])` | — | ALLOWS | PARTIAL _app.gamification.admin.manual-metrics.tsx:115-117 | sales,viewer | **ALLOWS (partial UI)** | shop_settings, set_gamification_sales_source, profiles, staff_daily_performance_metrics, staff_call_metrics_coverage, upsert_staff_daily_performance_metric |
| 17 | `/_app/gamification/admin/missions` | _app.gamification.admin.missions.tsx | _app.gamification.admin.missions.tsx:57 `requireAnyRole(["admin", "manager"])` | — | ALLOWS | NONE _app.gamification.admin.missions.tsx:113 | sales,accountant,viewer | **ALLOWS** | missions |
| 18 | `/_app/gamification/admin/purchase-settings` | _app.gamification.admin.purchase-settings.tsx | _app.gamification.admin.purchase-settings.tsx:21 `requireAnyRole(["admin", "manager", "accountant"])` | — | ALLOWS | NONE _app.gamification.admin.purchase-settings.tsx:38 | sales,viewer | **ALLOWS** | shop_settings |
| 19 | `/_app/gamification/admin/rewards` | _app.gamification.admin.rewards.tsx | _app.gamification.admin.rewards.tsx:61 `requireAnyRole(["admin", "manager"])` | — | ALLOWS | NONE _app.gamification.admin.rewards.tsx:136 | sales,accountant,viewer | **ALLOWS** | gamification_rewards |
| 20 | `/_app/gamification/settings` | _app.gamification.settings.tsx | _app.gamification.settings.tsx:71 `requireAnyRole(["admin"])` | — | ALLOWS | NONE _app.gamification.settings.tsx:76-87 | manager,sales,accountant,viewer | **ALLOWS** | gamification_kpis, profiles, recordManualScoreAdjustment, useServerFn |
| 21 | `/_app/knowledge_/manage` | _app.knowledge_.manage.tsx | _app.knowledge_.manage.tsx:29 `requireAnyRole(["admin", "manager"])` | — | ALLOWS | NONE _app.knowledge_.manage.tsx:46 | sales,accountant,viewer | **ALLOWS** | knowledge_documents, audit_logs |
| 22 | `/_app/pricing/calculator` | _app.pricing.calculator.tsx | _app.pricing.calculator.tsx:37 `requirePermission("pricing", "view")` | — | ALLOWS | NONE _app.pricing.calculator.tsx:50 | viewer | **ALLOWS** | products, purchase_prices |
| 23 | `/_app/pricing/change-reasons` | _app.pricing.change-reasons.tsx | _app.pricing.change-reasons.tsx:40 `requirePermission("pricing", "view")` | — | ALLOWS | PARTIAL _app.pricing.change-reasons.tsx:55 | viewer | **ALLOWS (partial UI)** | price_change_reasons |
| 24 | `/_app/pricing/currencies` | _app.pricing.currencies.tsx | _app.pricing.currencies.tsx:27 `requirePermission("pricing", "view")` | — | ALLOWS | PARTIAL _app.pricing.currencies.tsx:43 | viewer | **ALLOWS (partial UI)** | currencies |
| 25 | `/_app/pricing/currency-sources` | _app.pricing.currency-sources.tsx | _app.pricing.currency-sources.tsx:38 `requirePermission("pricing", "view")` | — | ALLOWS | PARTIAL _app.pricing.currency-sources.tsx:54 | viewer | **ALLOWS (partial UI)** | currency_sources, autoFetchCurrencyRate, record_currency_fetch |
| 26 | `/_app/pricing/` | _app.pricing.index.tsx | _app.pricing.index.tsx:31 `requirePermission("pricing", "view")` | — | ALLOWS | NONE _app.pricing.index.tsx: | viewer | **ALLOWS** | products, purchase_prices, currency_rates, pricing_rules, sale_lists |
| 27 | `/_app/pricing/live-price-list` | _app.pricing.live-price-list.tsx | _app.pricing.live-price-list.tsx:63 `requirePermission("pricing", "view")` | — | ALLOWS | PARTIAL _app.pricing.live-price-list.tsx:112 | viewer | **ALLOWS (partial UI)** | brands, categories, products, search_product_ids, product_computed_prices_public, product_sale_price_history |
| 28 | `/_app/pricing/owner-attention` | _app.pricing.owner-attention.tsx | _app.pricing.owner-attention.tsx:35 `requirePermission("pricing", "view")` | — | ALLOWS | NONE _app.pricing.owner-attention.tsx:54 | viewer | **ALLOWS** | product_owner_assignments, profiles, products, purchase_prices |
| 29 | `/_app/pricing/price-alerts` | _app.pricing.price-alerts.tsx | _app.pricing.price-alerts.tsx:30 `requireAnyRole(["admin", "manager", "accountant", "sales"])` | — | ALLOWS | NONE _app.pricing.price-alerts.tsx: | viewer | **ALLOWS** | price_alert_rules, price_alert_notifications |
| 30 | `/_app/pricing/product-recommendations` | _app.pricing.product-recommendations.tsx | _app.pricing.product-recommendations.tsx:41 `requireAnyRole(["admin", "manager"])` | — | ALLOWS | NONE _app.pricing.product-recommendations.tsx:46 | sales,accountant,viewer | **ALLOWS** | products, get_product_recommendations, product_recommendation_overrides |
| 31 | `/_app/pricing/quick-price` | _app.pricing.quick-price.tsx | _app.pricing.quick-price.tsx:34 `requireAnyRole(ALLOWED_ROLES)` | — | ALLOWS | PARTIAL _app.pricing.quick-price.tsx:41-42 | viewer | **ALLOWS (partial UI)** | categories, pricing_rules, shipping_cost_rules |
| 32 | `/_app/pricing/rules` | _app.pricing.rules.tsx | _app.pricing.rules.tsx:47 `requirePermission("pricing", "view")` | — | ALLOWS | PARTIAL _app.pricing.rules.tsx:80 | viewer | **ALLOWS (partial UI)** | pricing_rules |
| 33 | `/_app/pricing/sale-lists_/$listId` | _app.pricing.sale-lists_.$listId.tsx | _app.pricing.sale-lists_.$listId.tsx:114 `requirePermission("pricing", "view")` | — | ALLOWS | PARTIAL _app.pricing.sale-lists_.$listId.tsx:429 | viewer | **ALLOWS (partial UI)** | sale_lists, refresh_sale_list_prices, sale_list_items, sale_list_versions, product_computed_prices_public, currency_rates |
| 34 | `/_app/pricing/sale-lists_/new` | _app.pricing.sale-lists_.new.tsx | _app.pricing.sale-lists_.new.tsx:63 `requirePermission("pricing", "create")` | — | ALLOWS | NONE _app.pricing.sale-lists_.new.tsx: | viewer | **ALLOWS** | products, product_sale_price_history, sale_lists, sale_list_items |
| 35 | `/_app/pricing/sale-lists` | _app.pricing.sale-lists.tsx | _app.pricing.sale-lists.tsx:29 `requirePermission("pricing", "view")` | — | ALLOWS | NONE _app.pricing.sale-lists.tsx:44 | viewer | **ALLOWS** | sale_lists |
| 36 | `/_app/pricing/sale-price-types` | _app.pricing.sale-price-types.tsx | _app.pricing.sale-price-types.tsx:31 `requirePermission("pricing", "view")` | — | ALLOWS | PARTIAL _app.pricing.sale-price-types.tsx:47 | viewer | **ALLOWS (partial UI)** | sale_price_types, generate_sale_price_type_code |
| 37 | `/_app/pricing/settlement-types` | _app.pricing.settlement-types.tsx | _app.pricing.settlement-types.tsx:26 `requireAnyRole(ALLOWED)` | — | ALLOWS | PARTIAL _app.pricing.settlement-types.tsx:21 | manager,sales,viewer | **ALLOWS (partial UI)** | settlement_types |
| 38 | `/_app/pricing/shipping-rules` | _app.pricing.shipping-rules.tsx | _app.pricing.shipping-rules.tsx:36 `requirePermission("pricing", "view")` | — | ALLOWS | PARTIAL _app.pricing.shipping-rules.tsx:65 | viewer | **ALLOWS (partial UI)** | shipping_cost_rules |
| 39 | `/_app/products/$id` | _app.products.$id.tsx | _app.products.$id.tsx:58 `requirePermission("products", "view")` | — | ALLOWS | PARTIAL _app.products.$id.tsx:73 | viewer | **ALLOWS (partial UI)** | products, product_owner_assignments, product_category_attribute_values, calculate_adjusted_price, get_product_stats, get_product_timeline |
| 40 | `/_app/products/attributes` | _app.products.attributes.tsx | _app.products.attributes.tsx:38 `requirePermission("products", "view")` | — | ALLOWS | PARTIAL _app.products.attributes.tsx:81 | viewer | **ALLOWS (partial UI)** | product_attribute_groups, product_attributes, category_product_attributes |
| 41 | `/_app/products/brands` | _app.products.brands.tsx | _app.products.brands.tsx:40 `requirePermission("products", "view")` | — | ALLOWS | PARTIAL _app.products.brands.tsx:56 | viewer | **ALLOWS (partial UI)** | brands, products |
| 42 | `/_app/products/categories` | _app.products.categories.tsx | _app.products.categories.tsx:47 `requirePermission("products", "view")` | — | ALLOWS | PARTIAL _app.products.categories.tsx:63 | viewer | **ALLOWS (partial UI)** | categories |
| 43 | `/_app/products/` | _app.products.index.tsx | _app.products.index.tsx:65 `requirePermission("products", "view")` | — | ALLOWS | PARTIAL _app.products.index.tsx:115 | viewer | **ALLOWS (partial UI)** | search_product_ids, products, product_computed_prices, product_images |
| 44 | `/_app/products/labels` | _app.products.labels.tsx | _app.products.labels.tsx:40 `requirePermission("products", "view")` | — | ALLOWS | PARTIAL _app.products.labels.tsx:80 | viewer | **ALLOWS (partial UI)** | product_labels |
| 45 | `/_app/products/new` | _app.products.new.tsx | _app.products.new.tsx:13 `requirePermission("products", "create")` | — | ALLOWS | NONE _app.products.new.tsx:18-99 | sales,accountant,viewer | **ALLOWS** | products, product_label_links |
| 46 | `/_app/purchase` | _app.purchase.tsx | _app.purchase.tsx:25 `requirePermission("purchases", "view")` | — | ALLOWS | PARTIAL _app.purchase.tsx:38 | viewer | **ALLOWS (partial UI)** | get_purchase_requests, create_purchase_request, products, inquiries |
| 47 | `/_app/purchases_/create` | _app.purchases_.create.tsx | _app.purchases_.create.tsx:11 `requirePermission("purchases", "create")` | — | ALLOWS | NONE _app.purchases_.create.tsx:15-37 | sales,accountant,viewer | **ALLOWS** | products, suppliers, payment_terms |
| 48 | `/_app/purchases` | _app.purchases.tsx | _app.purchases.tsx:11 `requirePermission("purchases", "view")` | — | ALLOWS | PARTIAL _app.purchases.tsx:17 | viewer | **ALLOWS (partial UI)** |  |
| 49 | `/_app/sales_/customers_/credit-allocation-guide` | _app.sales_.customers_.credit-allocation-guide.tsx | _app.sales_.customers_.credit-allocation-guide.tsx:8 `requirePermission("sales", "view")` | — | ALLOWS | NONE src/components/customers/CustomerCreditGuide.tsx:1-22 | viewer | **ALLOWS** |  |
| 50 | `/_app/sales_/customers_/credit-training` | _app.sales_.customers_.credit-training.tsx | _app.sales_.customers_.credit-training.tsx:8 `requirePermission("sales", "view")` | — | ALLOWS | NONE src/components/customers/CustomerCreditGuide.tsx:1-22 | viewer | **ALLOWS** |  |
| 51 | `/_app/sales/promotion-nominations` | _app.sales.promotion-nominations.tsx | _app.sales.promotion-nominations.tsx:36 `requireAnyRole(["sales", "admin", "manager"])`<br>_app.sales.tsx:13 `requirePermission("sales", "view")` | _app.sales.tsx:11 | ALLOWS-PARTIAL | PARTIAL _app.sales.promotion-nominations.tsx:44 | accountant | **ALLOWS (partial UI)** | get_promotion_nomination_quota, promotion_nominations, profiles, cancel_promotion_nomination |
| 52 | `/_app/suppliers_/$supplierId` | _app.suppliers_.$supplierId.tsx | _app.suppliers_.$supplierId.tsx:31 `requirePermission("suppliers", "view")` | — | ALLOWS | PARTIAL _app.suppliers_.$supplierId.tsx:63 | viewer | **ALLOWS (partial UI)** | suppliers, person_identifiers |
| 53 | `/_app/suppliers` | _app.suppliers.tsx | _app.suppliers.tsx:51 `requirePermission("suppliers", "view")` | — | ALLOWS | PARTIAL _app.suppliers.tsx:94 | viewer | **ALLOWS (partial UI)** | suppliers |
| 54 | `/_app/warehouses_/kardex` | _app.warehouses_.kardex.tsx | _app.warehouses_.kardex.tsx:43 `requireAnyRole(["admin", "manager", "accountant", "purchase_specialist"])` | — | ALLOWS | NONE _app.warehouses_.kardex.tsx: | sales,viewer | **ALLOWS** | warehouses, stock_movements |
| 55 | `/_app/warehouses_/transfers` | _app.warehouses_.transfers.tsx | _app.warehouses_.transfers.tsx:56 `requireAnyRole(["admin", "manager"])` | — | ALLOWS | NONE _app.warehouses_.transfers.tsx: | sales,accountant,viewer | **ALLOWS** | warehouses, stock_transfers, stock_transfer_items, products |
| 56 | `/_app/warehouses` | _app.warehouses.tsx | _app.warehouses.tsx:57 `requireAnyRole(["admin", "manager"])` | — | ALLOWS | NONE _app.warehouses.tsx: | sales,accountant,viewer | **ALLOWS** | warehouses |
| 57 | `/_app/academy_/$courseId_/$lessonId_/quiz` | _app.academy_.$courseId_.$lessonId_.quiz.tsx | _app.academy_.$courseId_.$lessonId_.quiz.tsx:16 `requirePermission("academy", "view")` | — | ALLOWS | NONE _app.academy_.$courseId_.$lessonId_.quiz.tsx:23 | — (هیچ نقش دارای کاربر) | **ALLOWS-NOMINAL** | academy_quizzes, academy_quiz_questions_public, submit_quiz_attempt |
| 58 | `/_app/academy_/$courseId_/$lessonId` | _app.academy_.$courseId_.$lessonId.tsx | _app.academy_.$courseId_.$lessonId.tsx:17 `requirePermission("academy", "view")` | — | ALLOWS | NONE _app.academy_.$courseId_.$lessonId.tsx:26 | — (هیچ نقش دارای کاربر) | **ALLOWS-NOMINAL** | academy_lessons, academy_quizzes, academy_user_progress, audit_logs |
| 59 | `/_app/academy_/$courseId` | _app.academy_.$courseId.tsx | _app.academy_.$courseId.tsx:15 `requirePermission("academy", "view")` | — | ALLOWS | NONE _app.academy_.$courseId.tsx:22 | — (هیچ نقش دارای کاربر) | **ALLOWS-NOMINAL** | academy_courses, academy_lessons, academy_quizzes, academy_user_progress |
| 60 | `/_app/academy` | _app.academy.tsx | _app.academy.tsx:19 `requirePermission("academy", "view")` | — | ALLOWS | PARTIAL _app.academy.tsx:27 | — (هیچ نقش دارای کاربر) | **ALLOWS-NOMINAL** | academy_courses, academy_lessons, academy_user_progress |
| 61 | `/_app/collaboration` | _app.collaboration.tsx | _app.collaboration.tsx:169 `requirePermission("messages", "view")` | — | ALLOWS | PARTIAL _app.collaboration.tsx:104-106 | — (هیچ نقش دارای کاربر) | **ALLOWS-NOMINAL** | useUnreadMessagesCount, usePendingPurchaseCount, useActivePenaltyCount, usePendingReceiptCount, usePendingDocCount, useGamificationBadgeCount |
| 62 | `/_app/dashboard` | _app.dashboard.tsx | _app.dashboard.tsx:44 `requirePermission("dashboard", "view")` | — | ALLOWS | PARTIAL _app.dashboard.tsx:52-56 | — (هیچ نقش دارای کاربر) | **ALLOWS-NOMINAL** | generate_birthday_notifications |
| 63 | `/_app/delivery-receipts` | _app.delivery-receipts.tsx | _app.delivery-receipts.tsx:31 `requireAnyRole(ALL_ROLES)` (lib/rbac/roles.ts:37) | — | ALLOWS | PARTIAL _app.delivery-receipts.tsx:40-44 | — (هیچ نقش دارای کاربر) | **ALLOWS-NOMINAL** | get_delivery_receipts, useMyDeliveryReceipts |
| 64 | `/_app/documents` | _app.documents.tsx | _app.documents.tsx:28 `requireAnyRole(ALL_ROLES)` (lib/rbac/roles.ts:37) | — | ALLOWS | PARTIAL _app.documents.tsx:37-42 | — (هیچ نقش دارای کاربر) | **ALLOWS-NOMINAL** | get_documents, useMyDocuments |
| 65 | `/_app/feedback_/$feedbackId` | _app.feedback_.$feedbackId.tsx | _app.feedback_.$feedbackId.tsx:44 `requirePermission("feedback", "view")` | — | ALLOWS | PARTIAL _app.feedback_.$feedbackId.tsx:52 | — (هیچ نقش دارای کاربر) | **ALLOWS-NOMINAL** | feedback_items, audit_logs |
| 66 | `/_app/feedback_/create` | _app.feedback_.create.tsx | _app.feedback_.create.tsx:13 `requirePermission("feedback", "create")` | — | ALLOWS | NONE _app.feedback_.create.tsx:19 | — (هیچ نقش دارای کاربر) | **ALLOWS-NOMINAL** | feedback_items, audit_logs |
| 67 | `/_app/feedback` | _app.feedback.tsx | _app.feedback.tsx:46 `requirePermission("feedback", "view")` | — | ALLOWS | PARTIAL _app.feedback.tsx:53 | — (هیچ نقش دارای کاربر) | **ALLOWS-NOMINAL** | feedback_items |
| 68 | `/_app/gamification/achievements` | _app.gamification.achievements.tsx | _app.gamification.achievements.tsx:21 `requirePermission("dashboard", "view")` | — | ALLOWS | NONE _app.gamification.achievements.tsx:26-28 | — (هیچ نقش دارای کاربر) | **ALLOWS-NOMINAL** | achievements, useAllAchievements, employee_achievements, useMyAchievements |
| 69 | `/_app/gamification/league` | _app.gamification.league.tsx | _app.gamification.league.tsx:40 `requireAnyRole(["admin", "manager", "sales", "accountant", "viewer"])` | — | ALLOWS | NONE _app.gamification.league.tsx:46 | — (هیچ نقش دارای کاربر) | **ALLOWS-NOMINAL** |  |
| 70 | `/_app/knowledge_/$documentId` | _app.knowledge_.$documentId.tsx | _app.knowledge_.$documentId.tsx:25 `requirePermission("knowledge", "view")` | — | ALLOWS | NONE _app.knowledge_.$documentId.tsx:34 | — (هیچ نقش دارای کاربر) | **ALLOWS-NOMINAL** | knowledge_documents, knowledge_confirmations, audit_logs |
| 71 | `/_app/knowledge` | _app.knowledge.tsx | _app.knowledge.tsx:45 `requirePermission("knowledge", "view")` | — | ALLOWS | PARTIAL _app.knowledge.tsx:52 | — (هیچ نقش دارای کاربر) | **ALLOWS-NOMINAL** | knowledge_documents |
| 72 | `/_app/messages/inquiries` | _app.messages.inquiries.tsx | _app.messages.inquiries.tsx:37 `requirePermission("messages", "view")`<br>_app.messages.tsx:25 `requirePermission("messages", "view")` | — | ALLOWS | NONE _app.messages.inquiries.tsx:69 | — (هیچ نقش دارای کاربر) | **ALLOWS-NOMINAL** | inquiries, useAllInquiries, update_inquiry_status, tick_inquiries |
| 73 | `/_app/messages` | _app.messages.tsx | _app.messages.tsx:25 `requirePermission("messages", "view")` | — | ALLOWS | PARTIAL _app.messages.tsx:8-21 | — (هیچ نقش دارای کاربر) | **ALLOWS-NOMINAL** | messenger_groups, messenger_messages, messenger_read_receipts, inquiries, create_messenger_group |
| 74 | `/_app/updates` | _app.updates.tsx | _app.updates.tsx:26 `requirePermission("platform-releases", "view")` | — | ALLOWS | PARTIAL _app.updates.tsx:34 | — (هیچ نقش دارای کاربر) | **ALLOWS-NOMINAL** | platform_releases |
| 75 | `/_app/admin/visitors` | _app.admin.visitors.tsx | _app.admin.visitors.tsx:53 `requireAnyRole(["admin", "manager"])` | — | ALLOWS | REFUSES _app.admin.visitors.tsx:60 | sales,accountant,viewer | **REFUSES (component, after fetch)** | visitors, audit_logs |
| 76 | `/_app/pricing/amin-hozoor-board` | _app.pricing.amin-hozoor-board.tsx | _app.pricing.amin-hozoor-board.tsx:7 `requirePermission("pricing", "view")` | — | ALLOWS | REFUSES src/components/pricing/board/AminHozoorPriceBoard.tsx:161 | viewer | **REFUSES (component, after fetch)** | pricing_board_access_requests, pricing_board_settings, brands, categories, products, product_computed_prices_public |
| 77 | `/_app/accounting/customer-capital-allocations` | _app.accounting.customer-capital-allocations.tsx | — | — | NO GUARD | REDIRECT-ONLY |  | **NO GUARD → REDIRECT-ONLY** |  |
| 78 | `/_app/accounting/daily-capital` | _app.accounting.daily-capital.tsx | — | — | NO GUARD | REDIRECT-ONLY |  | **NO GUARD → REDIRECT-ONLY** |  |
| 79 | `/_app/accounting/salesperson-capital-allocations` | _app.accounting.salesperson-capital-allocations.tsx | — | — | NO GUARD | REDIRECT-ONLY |  | **NO GUARD → REDIRECT-ONLY** |  |
| 80 | `/_app/admin/gamification/achievements` | _app.admin.gamification.achievements.tsx | — | — | NO GUARD | REDIRECT-ONLY |  | **NO GUARD → REDIRECT-ONLY** |  |
| 81 | `/_app/admin/gamification` | _app.admin.gamification.tsx | — | — | NO GUARD | REDIRECT-ONLY |  | **NO GUARD → REDIRECT-ONLY** |  |
| 82 | `/_app/admin/marketing-channels` | _app.admin.marketing-channels.tsx | — | — | NO GUARD | COMPONENT-REFUSES |  | **NO GUARD → COMPONENT-REFUSES** | marketing_channels |
| 83 | `/_app/admin/marketing-task-templates` | _app.admin.marketing-task-templates.tsx | — | — | NO GUARD | COMPONENT-REFUSES |  | **NO GUARD → COMPONENT-REFUSES** | marketing_task_templates, marketing_channels, profiles, generate_marketing_tasks |
| 84 | `/_app/admin/receipt-fields` | _app.admin.receipt-fields.tsx | — | — | NO GUARD | COMPONENT-REFUSES |  | **NO GUARD → COMPONENT-REFUSES** | payment_receipt_custom_fields, audit_logs |
| 85 | `/_app/admin/workflow-stages` | _app.admin.workflow-stages.tsx | — | — | NO GUARD | COMPONENT-REFUSES |  | **NO GUARD → COMPONENT-REFUSES** | invoice_workflow_stages, audit_logs |
| 86 | `/_app/gamification/leaderboard` | _app.gamification.leaderboard.tsx | — | — | NO GUARD | OPEN |  | **NO GUARD → OPEN** | useLeaderboard, get_rank_neighbors, useMyRankNeighbors, employee_scores, useRankTrends |
| 87 | `/_app/gamification` | _app.gamification.tsx | — | — | NO GUARD | SELF-SCOPED |  | **NO GUARD → SELF-SCOPED** | score_snapshots, employee_scores, employee_achievements, gamification_kpis |
| 88 | `/_app/integrations/didar` | _app.integrations.didar.tsx | — | — | NO GUARD | REDIRECT-ONLY |  | **NO GUARD → REDIRECT-ONLY** |  |
| 89 | `/_app/market-matches` | _app.market-matches.tsx | — | — | NO GUARD | COMPONENT-REFUSES |  | **NO GUARD → COMPONENT-REFUSES** | market_product_matches, market_product_match_events, review_market_product_match_approve, review_market_product_match_reject, review_market_product_match_disable |
| 90 | `/_app/marketing/my-tasks` | _app.marketing.my-tasks.tsx | — | — | NO GUARD | SELF-SCOPED |  | **NO GUARD → SELF-SCOPED** | tasks, complete_marketing_task |
| 91 | `/_app/marketing/suggestions-history` | _app.marketing.suggestions-history.tsx | — | — | NO GUARD | COMPONENT-REFUSES |  | **NO GUARD → COMPONENT-REFUSES** | marketing_channels, audit_logs, profiles |
| 92 | `/_app/marketing/suggestions` | _app.marketing.suggestions.tsx | — | — | NO GUARD | COMPONENT-REFUSES |  | **NO GUARD → COMPONENT-REFUSES** | marketing_channels, compute_promotion_scores |
| 93 | `/_app/my-penalties` | _app.my-penalties.tsx | — | — | NO GUARD | SELF-SCOPED |  | **NO GUARD → SELF-SCOPED** |  |
| 94 | `/_app/my-rejected-quotes` | _app.my-rejected-quotes.tsx | — | — | NO GUARD | SELF-SCOPED |  | **NO GUARD → SELF-SCOPED** | get_my_rejected_quotes |
| 95 | `/_app/notifications` | _app.notifications.tsx | — | — | NO GUARD | SELF-SCOPED |  | **NO GUARD → SELF-SCOPED** | notification_queue, mark_notification_read, mark_all_notifications_read |
| 96 | `/_app/operations/daily-mood/admin` | _app.operations.daily-mood.admin.tsx | — | — | NO GUARD | COMPONENT-REFUSES |  | **NO GUARD → COMPONENT-REFUSES** | daily_mood_entries |
| 97 | `/_app/operations/daily-mood` | _app.operations.daily-mood.tsx | — | — | NO GUARD | SELF-SCOPED |  | **NO GUARD → SELF-SCOPED** | daily_mood_entries, daily_mood_scenarios, daily_mood_questions, daily_mood_hafez_poems |
| 98 | `/_app/operations/tasks` | _app.operations.tasks.tsx | — | — | NO GUARD | COMPONENT-PARTIAL |  | **NO GUARD → COMPONENT-PARTIAL** | tasks, get_task_kpi_report |
| 99 | `/_app/popup-center` | _app.popup-center.tsx | — | — | NO GUARD | SELF-SCOPED |  | **NO GUARD → SELF-SCOPED** |  |
| 100 | `/_app/pricing/my-workbench` | _app.pricing.my-workbench.tsx | — | — | NO GUARD | SELF-SCOPED |  | **NO GUARD → SELF-SCOPED** |  |
| 101 | `/_app` | _app.tsx | — | — | NO GUARD | COMPONENT-PARTIAL |  | **NO GUARD → COMPONENT-PARTIAL** | useAuth |
| 102 | `/` | index.tsx | — | — | NO GUARD | REDIRECT-ONLY |  | **NO GUARD → REDIRECT-ONLY** |  |
| 103 | `/login` | login.tsx | — | — | NO GUARD | PUBLIC-BY-DESIGN |  | **NO GUARD → PUBLIC-BY-DESIGN** | useAuth |
| 104 | `/pending-approval` | pending-approval.tsx | — | — | NO GUARD | PUBLIC-BY-DESIGN |  | **NO GUARD → PUBLIC-BY-DESIGN** |  |
| 105 | `/public/sale-lists/$listId` | public.sale-lists.$listId.tsx | — | — | NO GUARD | PUBLIC-BY-DESIGN |  | **NO GUARD → PUBLIC-BY-DESIGN** | sale_lists, refresh_sale_list_prices, sale_price_types, sale_list_items, products, brands |
| 106 | `/register` | register.tsx | — | — | NO GUARD | PUBLIC-BY-DESIGN |  | **NO GUARD → PUBLIC-BY-DESIGN** | profile_field_definitions |
| 107 | `/reset-password` | reset-password.tsx | — | — | NO GUARD | PUBLIC-BY-DESIGN |  | **NO GUARD → PUBLIC-BY-DESIGN** |  |
| 108 | `/unauthorized` | unauthorized.tsx | — | — | NO GUARD | PUBLIC-BY-DESIGN |  | **NO GUARD → PUBLIC-BY-DESIGN** |  |
| 109 | `/_app/accounting/allocation-workbench` | _app.accounting.allocation-workbench.tsx | _app.accounting.allocation-workbench.tsx:98 `requireAnyRole(["admin", "manager", "accountant"])` | _app.accounting.allocation-workbench.tsx:96 | REFUSES |  |  | **REFUSES (gate)** |  |
| 110 | `/_app/accounting/bank-accounts` | _app.accounting.bank-accounts.tsx | _app.accounting.bank-accounts.tsx:34 `requireAnyRole(["admin", "manager", "accountant"])` | _app.accounting.bank-accounts.tsx:32 | REFUSES |  |  | **REFUSES (gate)** |  |
| 111 | `/_app/accounting/documents` | _app.accounting.documents.tsx | _app.accounting.documents.tsx:55 `requireAnyRole(["admin", "manager", "accountant"])` | _app.accounting.documents.tsx:53 | REFUSES |  |  | **REFUSES (gate)** |  |
| 112 | `/_app/accounting/dynamic-capital` | _app.accounting.dynamic-capital.tsx | _app.accounting.dynamic-capital.tsx:65 `requireAnyRole(["admin", "accountant"])` | _app.accounting.dynamic-capital.tsx:63 | REFUSES |  |  | **REFUSES (gate)** |  |
| 113 | `/_app/accounting/external-parties` | _app.accounting.external-parties.tsx | _app.accounting.external-parties.tsx:27 `requireAnyRole(["admin", "manager", "accountant"])` | _app.accounting.external-parties.tsx:25 | REFUSES |  |  | **REFUSES (gate)** |  |
| 114 | `/_app/accounting/mutual-settlement` | _app.accounting.mutual-settlement.tsx | _app.accounting.mutual-settlement.tsx:59 `requireAnyRole(["admin", "accountant"])` | _app.accounting.mutual-settlement.tsx:54 | REFUSES |  |  | **REFUSES (gate)** |  |
| 115 | `/_app/accounting/payables` | _app.accounting.payables.tsx | _app.accounting.payables.tsx:53 `requireAnyRole(["admin", "manager", "accountant"])` | _app.accounting.payables.tsx:51 | REFUSES |  |  | **REFUSES (gate)** |  |
| 116 | `/_app/accounting/payment-vouchers` | _app.accounting.payment-vouchers.tsx | _app.accounting.payment-vouchers.tsx:44 `requireAnyRole(["admin", "manager", "accountant"])` | _app.accounting.payment-vouchers.tsx:42 | REFUSES |  |  | **REFUSES (gate)** |  |
| 117 | `/_app/accounting/purchase-payments` | _app.accounting.purchase-payments.tsx | _app.accounting.purchase-payments.tsx:68 `requireAnyRole(["admin", "manager", "accountant"])` | _app.accounting.purchase-payments.tsx:66 | REFUSES |  |  | **REFUSES (gate)** |  |
| 118 | `/_app/accounting/receipts_/training` | _app.accounting.receipts_.training.tsx | _app.accounting.receipts_.training.tsx:12 `requireAnyRole(["admin", "manager", "accountant"])` | _app.accounting.receipts_.training.tsx:9 | REFUSES |  |  | **REFUSES (gate)** |  |
| 119 | `/_app/accounting/receipts/$receiptId` | _app.accounting.receipts.$receiptId.tsx | _app.accounting.receipts.$receiptId.tsx:62 `requireAnyRole(["admin", "manager", "accountant"])`<br>_app.accounting.receipts.tsx:76 `requireAnyRole(["admin", "manager", "accountant"])` | _app.accounting.receipts.$receiptId.tsx:60<br>_app.accounting.receipts.tsx:74 | REFUSES |  |  | **REFUSES (gate)** |  |
| 120 | `/_app/accounting/receipts/create` | _app.accounting.receipts.create.tsx | _app.accounting.receipts.create.tsx:42 `requireAnyRole([...CREATE_ROLES])` (:13) | _app.accounting.receipts.create.tsx:34 | REFUSES |  |  | **REFUSES (gate)** |  |
| 121 | `/_app/accounting/receipts` | _app.accounting.receipts.tsx | _app.accounting.receipts.tsx:76 `requireAnyRole(["admin", "manager", "accountant"])` | _app.accounting.receipts.tsx:74 | REFUSES |  |  | **REFUSES (gate)** |  |
| 122 | `/_app/accounting/receivables` | _app.accounting.receivables.tsx | _app.accounting.receivables.tsx:51 `requireAnyRole(["admin", "manager", "accountant"])` | _app.accounting.receivables.tsx:49 | REFUSES |  |  | **REFUSES (gate)** |  |
| 123 | `/_app/accounting/salesperson-scoring` | _app.accounting.salesperson-scoring.tsx | _app.accounting.salesperson-scoring.tsx:26 `requireAnyRole(["admin", "accountant"])` | _app.accounting.salesperson-scoring.tsx:22 | REFUSES |  |  | **REFUSES (gate)** |  |
| 124 | `/_app/accounting/treasury` | _app.accounting.treasury.tsx | _app.accounting.treasury.tsx:47 `requireAnyRole(["admin", "manager", "accountant"])` | _app.accounting.treasury.tsx:45 | REFUSES |  |  | **REFUSES (gate)** |  |
| 125 | `/_app/admin/ai-providers` | _app.admin.ai-providers.tsx | _app.admin.ai-providers.tsx:52 `requireAdmin()` | _app.admin.ai-providers.tsx:50 | REFUSES |  |  | **REFUSES (gate)** |  |
| 126 | `/_app/admin/asan-export` | _app.admin.asan-export.tsx | _app.admin.asan-export.tsx:110 `requireAnyRole(["admin", "accountant"])` | _app.admin.asan-export.tsx:108 | REFUSES |  |  | **REFUSES (gate)** |  |
| 127 | `/_app/admin/asan-import` | _app.admin.asan-import.tsx | _app.admin.asan-import.tsx:143 `requireAnyRole(["admin", "accountant"])` | _app.admin.asan-import.tsx:141 | REFUSES |  |  | **REFUSES (gate)** |  |
| 128 | `/_app/admin/audit` | _app.admin.audit.tsx | _app.admin.audit.tsx:32 `requireAnyRole(["admin", "manager"])` | _app.admin.audit.tsx:30 | REFUSES |  |  | **REFUSES (gate)** |  |
| 129 | `/_app/admin/call-extensions` | _app.admin.call-extensions.tsx | _app.admin.call-extensions.tsx:108 `requireAnyRole(["admin", "manager"])` | _app.admin.call-extensions.tsx:106 | REFUSES |  |  | **REFUSES (gate)** |  |
| 130 | `/_app/admin/delivery-receipts` | _app.admin.delivery-receipts.tsx | _app.admin.delivery-receipts.tsx:64 `requireAnyRole(["admin", "manager"])` | _app.admin.delivery-receipts.tsx:62 | REFUSES |  |  | **REFUSES (gate)** |  |
| 131 | `/_app/admin/documents` | _app.admin.documents.tsx | _app.admin.documents.tsx:64 `requireAnyRole(["admin", "manager"])` | _app.admin.documents.tsx:62 | REFUSES |  |  | **REFUSES (gate)** |  |
| 132 | `/_app/admin/payment-terms` | _app.admin.payment-terms.tsx | _app.admin.payment-terms.tsx:360 `requireAdmin()` | _app.admin.payment-terms.tsx:353 | REFUSES |  |  | **REFUSES (gate)** |  |
| 133 | `/_app/admin/penalties` | _app.admin.penalties.tsx | _app.admin.penalties.tsx:304 `requireAnyRole(["admin", "manager"])` | _app.admin.penalties.tsx:302 | REFUSES |  |  | **REFUSES (gate)** |  |
| 134 | `/_app/admin/person-fields` | _app.admin.person-fields.tsx | _app.admin.person-fields.tsx:73 `requireAnyRole(["admin", "manager"])` | _app.admin.person-fields.tsx:71 | REFUSES |  |  | **REFUSES (gate)** |  |
| 135 | `/_app/admin/persons-cleanup` | _app.admin.persons-cleanup.tsx | _app.admin.persons-cleanup.tsx:574 `requireAnyRole(["admin"])` | _app.admin.persons-cleanup.tsx:572 | REFUSES |  |  | **REFUSES (gate)** |  |
| 136 | `/_app/admin/phone-collisions` | _app.admin.phone-collisions.tsx | _app.admin.phone-collisions.tsx:68 `requireAnyRole(["admin", "manager"])` | _app.admin.phone-collisions.tsx:66 | REFUSES |  |  | **REFUSES (gate)** |  |
| 137 | `/_app/admin/platform-releases` | _app.admin.platform-releases.tsx | _app.admin.platform-releases.tsx:56 `requireAdmin()` | _app.admin.platform-releases.tsx:54 | REFUSES |  |  | **REFUSES (gate)** |  |
| 138 | `/_app/admin/profile-fields` | _app.admin.profile-fields.tsx | _app.admin.profile-fields.tsx:43 `requireAdmin()` | _app.admin.profile-fields.tsx:41 | REFUSES |  |  | **REFUSES (gate)** |  |
| 139 | `/_app/admin/recent-purchase-settings` | _app.admin.recent-purchase-settings.tsx | _app.admin.recent-purchase-settings.tsx:21 `requireAdmin()` | _app.admin.recent-purchase-settings.tsx:19 | REFUSES |  |  | **REFUSES (gate)** |  |
| 140 | `/_app/admin/roles` | _app.admin.roles.tsx | _app.admin.roles.tsx:52 `requireAdmin()` | _app.admin.roles.tsx:50 | REFUSES |  |  | **REFUSES (gate)** |  |
| 141 | `/_app/admin/settings` | _app.admin.settings.tsx | _app.admin.settings.tsx:31 `requireAdmin()` | _app.admin.settings.tsx:29 | REFUSES |  |  | **REFUSES (gate)** |  |
| 142 | `/_app/admin/system-health` | _app.admin.system-health.tsx | _app.admin.system-health.tsx:49 `requireAdmin()` | _app.admin.system-health.tsx:47 | REFUSES |  |  | **REFUSES (gate)** |  |
| 143 | `/_app/api-keys` | _app.api-keys.tsx | _app.api-keys.tsx:54 `requireAdmin()` | _app.api-keys.tsx:52 | REFUSES |  |  | **REFUSES (gate)** |  |
| 144 | `/_app/audit-logs` | _app.audit-logs.tsx | _app.audit-logs.tsx:17 `requireAdmin()` | _app.audit-logs.tsx:15 | REFUSES |  |  | **REFUSES (gate)** |  |
| 145 | `/_app/bot-api-keys/docs` | _app.bot-api-keys.docs.tsx | _app.bot-api-keys.docs.tsx:27 `requirePermission("bot-api-keys", "view")`<br>_app.bot-api-keys.tsx:38 `requirePermission("bot-api-keys", "view")` | _app.bot-api-keys.tsx:36 | REFUSES |  |  | **REFUSES (gate)** |  |
| 146 | `/_app/bot-api-keys/` | _app.bot-api-keys.index.tsx | _app.bot-api-keys.index.tsx:71 `requirePermission("bot-api-keys", "view")`<br>_app.bot-api-keys.tsx:38 `requirePermission("bot-api-keys", "view")` | _app.bot-api-keys.tsx:36 | REFUSES |  |  | **REFUSES (gate)** |  |
| 147 | `/_app/bot-api-keys/playground` | _app.bot-api-keys.playground.tsx | _app.bot-api-keys.playground.tsx:25 `requirePermission("bot-api-keys", "view")`<br>_app.bot-api-keys.tsx:38 `requirePermission("bot-api-keys", "view")` | _app.bot-api-keys.tsx:36 | REFUSES |  |  | **REFUSES (gate)** |  |
| 148 | `/_app/bot-api-keys` | _app.bot-api-keys.tsx | _app.bot-api-keys.tsx:38 `requirePermission("bot-api-keys", "view")` | _app.bot-api-keys.tsx:36 | REFUSES |  |  | **REFUSES (gate)** |  |
| 149 | `/_app/bot-api-keys/usage` | _app.bot-api-keys.usage.tsx | _app.bot-api-keys.usage.tsx:34 `requirePermission("bot-api-keys", "view")`<br>_app.bot-api-keys.tsx:38 `requirePermission("bot-api-keys", "view")` | _app.bot-api-keys.tsx:36 | REFUSES |  |  | **REFUSES (gate)** |  |
| 150 | `/_app/operations/call-activity` | _app.operations.call-activity.tsx | _app.operations.call-activity.tsx:82 `requireAnyRole(["admin", "manager", "sales"])` | _app.operations.call-activity.tsx:80 | REFUSES |  |  | **REFUSES (gate)** |  |
| 151 | `/_app/operations/didar` | _app.operations.didar.tsx | _app.operations.didar.tsx:62 `requireAdmin()` | _app.operations.didar.tsx:60 | REFUSES |  |  | **REFUSES (gate)** |  |
| 152 | `/_app/operations/purchase-advisor` | _app.operations.purchase-advisor.tsx | _app.operations.purchase-advisor.tsx:32 `requireAnyRole(["admin", "manager"])` | _app.operations.purchase-advisor.tsx:30 | REFUSES |  |  | **REFUSES (gate)** |  |
| 153 | `/_app/persons_/$personId_/edit` | _app.persons_.$personId_.edit.tsx | _app.persons_.$personId_.edit.tsx:30 `requirePermission("persons", "update")` | _app.persons_.$personId_.edit.tsx:28 | REFUSES |  |  | **REFUSES (gate)** |  |
| 154 | `/_app/persons_/$personId` | _app.persons_.$personId.tsx | _app.persons_.$personId.tsx:50 `requirePermission("persons", "view")` | _app.persons_.$personId.tsx:46 | REFUSES |  |  | **REFUSES (gate)** |  |
| 155 | `/_app/persons_/create` | _app.persons_.create.tsx | _app.persons_.create.tsx:26 `requirePermission("persons", "create")` | _app.persons_.create.tsx:24 | REFUSES |  |  | **REFUSES (gate)** |  |
| 156 | `/_app/persons_/merge` | _app.persons_.merge.tsx | _app.persons_.merge.tsx:31 `requireAnyRole(["admin", "manager"])` | _app.persons_.merge.tsx:29 | REFUSES |  |  | **REFUSES (gate)** |  |
| 157 | `/_app/persons` | _app.persons.tsx | _app.persons.tsx:159 `requirePermission("persons", "view")` | _app.persons.tsx:117 | REFUSES |  |  | **REFUSES (gate)** |  |
| 158 | `/_app/presence` | _app.presence.tsx | _app.presence.tsx:31 `requireAdmin()` | _app.presence.tsx:29 | REFUSES |  |  | **REFUSES (gate)** |  |
| 159 | `/_app/pricing/attention` | _app.pricing.attention.tsx | _app.pricing.attention.tsx:47 `requirePermission("pricing", "view")` | _app.pricing.attention.tsx:40 | REFUSES |  |  | **REFUSES (gate)** |  |
| 160 | `/_app/pricing/currency-rates` | _app.pricing.currency-rates.tsx | _app.pricing.currency-rates.tsx:59 `requirePermission("pricing", "view")` | _app.pricing.currency-rates.tsx:52 | REFUSES |  |  | **REFUSES (gate)** |  |
| 161 | `/_app/pricing/market-intelligence` | _app.pricing.market-intelligence.tsx | _app.pricing.market-intelligence.tsx:37 `requireAnyRole(["admin", "manager", "accountant"])` | _app.pricing.market-intelligence.tsx:35 | REFUSES |  |  | **REFUSES (gate)** |  |
| 162 | `/_app/pricing/market-rates-workshop` | _app.pricing.market-rates-workshop.tsx | _app.pricing.market-rates-workshop.tsx:51 `requirePermission("market-rates", "view")` | _app.pricing.market-rates-workshop.tsx:49 | REFUSES |  |  | **REFUSES (gate)** |  |
| 163 | `/_app/pricing/purchase-prices` | _app.pricing.purchase-prices.tsx | _app.pricing.purchase-prices.tsx:69 `requirePermission("pricing", "create")` | _app.pricing.purchase-prices.tsx:62 | REFUSES |  |  | **REFUSES (gate)** |  |
| 164 | `/_app/pricing/recompute-prices` | _app.pricing.recompute-prices.tsx | _app.pricing.recompute-prices.tsx:45 `requirePermission("pricing", "update")` | _app.pricing.recompute-prices.tsx:38 | REFUSES |  |  | **REFUSES (gate)** |  |
| 165 | `/_app/pricing/sale-lists_/$listId/publish` | _app.pricing.sale-lists_.$listId.publish.tsx | _app.pricing.sale-lists_.$listId.publish.tsx:42 `requirePermission("pricing", "update")`<br>_app.pricing.sale-lists_.$listId.tsx:114 `requirePermission("pricing", "view")` | _app.pricing.sale-lists_.$listId.publish.tsx:35 | REFUSES |  |  | **REFUSES (gate)** |  |
| 166 | `/_app/products/regenerate-names` | _app.products.regenerate-names.tsx | _app.products.regenerate-names.tsx:24 `requirePermission("products", "update")` | _app.products.regenerate-names.tsx:22 | REFUSES |  |  | **REFUSES (gate)** |  |
| 167 | `/_app/reports` | _app.reports.tsx | _app.reports.tsx:385 `requirePermission("reports", "view")` | _app.reports.tsx:378 | REFUSES |  |  | **REFUSES (gate)** |  |
| 168 | `/_app/roles` | _app.roles.tsx | _app.roles.tsx:18 `requireAdmin()` | _app.roles.tsx:16 | REFUSES |  |  | **REFUSES (gate)** |  |
| 169 | `/_app/sales_/customers_/$customerId/credit` | _app.sales_.customers_.$customerId.credit.tsx | _app.sales_.customers_.$customerId.credit.tsx:28 `requireAnyRole(["admin", "manager", "accountant"])` | _app.sales_.customers_.$customerId.credit.tsx:26 | REFUSES |  |  | **REFUSES (gate)** |  |
| 170 | `/_app/sales_/customers_/$customerId/edit` | _app.sales_.customers_.$customerId.edit.tsx | _app.sales_.customers_.$customerId.edit.tsx:20 `requirePermission("sales", "update")` | _app.sales_.customers_.$customerId.edit.tsx:18 | REFUSES |  |  | **REFUSES (gate)** |  |
| 171 | `/_app/sales_/customers_/create` | _app.sales_.customers_.create.tsx | _app.sales_.customers_.create.tsx:14 `requirePermission("sales", "create")` | _app.sales_.customers_.create.tsx:12 | REFUSES |  |  | **REFUSES (gate)** |  |
| 172 | `/_app/sales_/customers` | _app.sales_.customers.tsx | _app.sales_.customers.tsx:55 `requirePermission("sales", "view")` | _app.sales_.customers.tsx:53 | REFUSES |  |  | **REFUSES (gate)** |  |
| 173 | `/_app/sales/credit-customers` | _app.sales.credit-customers.tsx | _app.sales.credit-customers.tsx:49 `requirePermission("sales", "view")`<br>_app.sales.tsx:13 `requirePermission("sales", "view")` | _app.sales.credit-customers.tsx:47<br>_app.sales.tsx:11 | REFUSES |  |  | **REFUSES (gate)** |  |
| 174 | `/_app/sales/credit-requests` | _app.sales.credit-requests.tsx | _app.sales.credit-requests.tsx:74 `requireAnyRole(["admin", "manager", "accountant", "sales"])`<br>_app.sales.tsx:13 `requirePermission("sales", "view")` | _app.sales.credit-requests.tsx:72<br>_app.sales.tsx:11 | REFUSES |  |  | **REFUSES (gate)** |  |
| 175 | `/_app/sales/credit-rules` | _app.sales.credit-rules.tsx | _app.sales.credit-rules.tsx:37 `requireAnyRole(["admin", "accountant"])`<br>_app.sales.tsx:13 `requirePermission("sales", "view")` | _app.sales.credit-rules.tsx:35<br>_app.sales.tsx:11 | REFUSES |  |  | **REFUSES (gate)** |  |
| 176 | `/_app/sales/` | _app.sales.index.tsx | _app.sales.index.tsx:9 `requirePermission("sales", "view")`<br>_app.sales.tsx:13 `requirePermission("sales", "view")` | _app.sales.tsx:11 | REFUSES |  |  | **REFUSES (gate)** |  |
| 177 | `/_app/sales/product-videos` | _app.sales.product-videos.tsx | _app.sales.product-videos.tsx:48 `requireAnyRole(["admin", "manager", "sales", "accountant"])`<br>_app.sales.tsx:13 `requirePermission("sales", "view")` | _app.sales.tsx:11 | REFUSES |  |  | **REFUSES (gate)** |  |
| 178 | `/_app/sales/quote-share-logs` | _app.sales.quote-share-logs.tsx | _app.sales.quote-share-logs.tsx:47 `requirePermission("sales", "view")`<br>_app.sales.tsx:13 `requirePermission("sales", "view")` | _app.sales.tsx:11 | REFUSES |  |  | **REFUSES (gate)** |  |
| 179 | `/_app/sales/quotes/$quoteId` | _app.sales.quotes.$quoteId.tsx | _app.sales.quotes.tsx:13 `requirePermission("sales", "view")`<br>_app.sales.tsx:13 `requirePermission("sales", "view")` | _app.sales.quotes.tsx:11<br>_app.sales.tsx:11 | REFUSES |  |  | **REFUSES (gate)** |  |
| 180 | `/_app/sales/quotes/` | _app.sales.quotes.index.tsx | _app.sales.quotes.tsx:13 `requirePermission("sales", "view")`<br>_app.sales.tsx:13 `requirePermission("sales", "view")` | _app.sales.quotes.tsx:11<br>_app.sales.tsx:11 | REFUSES |  |  | **REFUSES (gate)** |  |
| 181 | `/_app/sales/quotes/new` | _app.sales.quotes.new.tsx | _app.sales.quotes.new.tsx:72 `requireAnyRole(ALLOWED_ROLES)`<br>_app.sales.quotes.tsx:13 `requirePermission("sales", "view")`<br>_app.sales.tsx:13 `requirePermission("sales", "view")` | _app.sales.quotes.new.tsx:68<br>_app.sales.quotes.tsx:11<br>_app.sales.tsx:11 | REFUSES |  |  | **REFUSES (gate)** |  |
| 182 | `/_app/sales/quotes` | _app.sales.quotes.tsx | _app.sales.quotes.tsx:13 `requirePermission("sales", "view")`<br>_app.sales.tsx:13 `requirePermission("sales", "view")` | _app.sales.quotes.tsx:11<br>_app.sales.tsx:11 | REFUSES |  |  | **REFUSES (gate)** |  |
| 183 | `/_app/sales/search` | _app.sales.search.tsx | _app.sales.search.tsx:99 `requirePermission("sales", "view")`<br>_app.sales.tsx:13 `requirePermission("sales", "view")` | _app.sales.tsx:11 | REFUSES |  |  | **REFUSES (gate)** |  |
| 184 | `/_app/sales/send-queue` | _app.sales.send-queue.tsx | _app.sales.send-queue.tsx:54 `requirePermission("sales", "view")`<br>_app.sales.tsx:13 `requirePermission("sales", "view")` | _app.sales.tsx:11 | REFUSES |  |  | **REFUSES (gate)** |  |
| 185 | `/_app/sales/stock-alerts` | _app.sales.stock-alerts.tsx | _app.sales.stock-alerts.tsx:56 `requirePermission("sales", "view")`<br>_app.sales.tsx:13 `requirePermission("sales", "view")` | _app.sales.tsx:11 | REFUSES |  |  | **REFUSES (gate)** |  |
| 186 | `/_app/sales` | _app.sales.tsx | _app.sales.tsx:13 `requirePermission("sales", "view")` | _app.sales.tsx:11 | REFUSES |  |  | **REFUSES (gate)** |  |
| 187 | `/_app/users/$userId` | _app.users.$userId.tsx | _app.users.$userId.tsx:22 `requireAdmin()`<br>_app.users.tsx:62 `requireAdmin()` | _app.users.$userId.tsx:20<br>_app.users.tsx:53 | REFUSES |  |  | **REFUSES (gate)** |  |
| 188 | `/_app/users/pending` | _app.users.pending.tsx | _app.users.tsx:62 `requireAdmin()` | _app.users.tsx:53 | REFUSES |  |  | **REFUSES (gate)** |  |
| 189 | `/_app/users` | _app.users.tsx | _app.users.tsx:62 `requireAdmin()` | _app.users.tsx:53 | REFUSES |  |  | **REFUSES (gate)** |  |
| 190 | `/.lovable/oauth/consent` | [.]lovable.oauth.consent.tsx | — | — | REFUSES |  |  | **REFUSES (gate)** |  |

### ۲.۴ handlerهای سرور (23)

- هیچ handlerی به کاربر ناشناس اجازهٔ عبور نمی‌دهد؛ هر 18 handler دارای بررسی، در خطا رد می‌کنند. 5 تا عمداً عمومی‌اند: `products`، `healthz`، `version`، `sitemap`، `oauth-protected-resource`.
- دو بررسی ثانوی **fail-open** هستند (هر دو را خودم خواندم):
  - `server/bot-api.ts:83-86` — quoted: `return { ok: true }; // fail open: never block legitimate traffic on infra error`. rate limit هر 8 endpoint bot، از جمله سقف تلاش ناموفق per-IP، هنگام خطای دیتابیس خاموش می‌شود.
  - `api.public.bot.dynamic-tables.$tableId.rows.upsert.ts:184-188` — `const { data: tableMeta } = …` خطا را دور می‌ریزد؛ اگر lookup شکست بخورد، قاعدهٔ «approved market match required» برای جدول observatory اجرا نمی‌شود. کلید bot معتبر با دسترسی نوشتن لازم است.
- مقایسهٔ secret در ۴ hook زمان‌ثابت نیست: `generate-marketing-tasks.ts:43`، `import-issabel-calls.ts:53`، `ingest-market-rates.ts:279`، `process-pricing-queue.ts:28` (منبع: گزارش نمونهٔ خواندن؛ **خودم فقط دو مورد fail-open را بازبینی کردم**).

| # | فایل | authn | authz | fail_mode | db_client |
|---|---|---|---|---|---|
| 1 | api/messenger/ai-chat.ts | SUPABASE_JWT | NONE (no role check). Group membership check when group_id supplied: messenger_group_members eq user_id -> 403 (ai-chat.ts:102-110). | REFUSES. Missing SUPABASE_URL/PUBLISHABLE_KEY -> 500 (ai-chat.ts:71-73); no Authorization header -> 401 (:76-78); getUser error or no user -> 401 (:85-88); membership loo… | User client (publishable key + caller Authorization header, RLS applies) for messenger/ai_conversations (ai-ch… |
| 2 | api/public/hooks/generate-marketing-tasks.ts | API_KEY | NONE beyond the shared worker token. | REFUSES. Missing MARKETING_TASKS_WORKER_TOKEN -> 500 (generate-marketing-tasks.ts:28-37); missing/wrong token -> 401 (:39-48). Comparison is plain `token !== expected` (:… | Service role: generateMarketingTasks uses supabaseAdmin.rpc (src/lib/marketing/generate-marketing-tasks.server… |
| 3 | api/public/hooks/import-issabel-calls.ts | API_KEY | NONE beyond the shared worker token. | REFUSES. Missing ISSABEL_IMPORT_WORKER_TOKEN -> 500 (import-issabel-calls.ts:41-47); missing/wrong token -> 401 (:49-58). Comparison `token !== expected` (:53) - NOT cons… | Service role: importIssabelCalls({workerMode: true}) (import-issabel-calls.ts:76) uses supabaseAdmin (src/lib/… |
| 4 | api/public/hooks/ingest-market-rates.ts | API_KEY | NONE beyond the cron secret; feature flags gate actual work (ingest-market-rates.ts:283-288). | REFUSES. Missing MARKET_RATES_CRON_SECRET -> 500 (ingest-market-rates.ts:273-276); missing/wrong bearer -> 401 (:277-281). Comparison `token !== expected` (:279) - NOT co… | Service role supabaseAdmin (ingest-market-rates.ts:18, :94) - rpc start/finish_market_rate_ingestion_run_syste… |
| 5 | api/public/hooks/process-pricing-queue.ts | API_KEY | NONE beyond the worker token. | REFUSES. Missing PRICING_WORKER_TOKEN -> 500 (process-pricing-queue.ts:17-23); missing/wrong token -> 401 (:24-33). Comparison `token !== expected` (:28) - NOT constant-t… | Service role: processPricingRecomputeQueue uses supabaseAdmin.rpc (src/lib/pricing/process-recompute-queue.ser… |
| 6 | api/public/products.ts | NONE | NONE (public CORS * endpoint, products.ts:33-38). Row selection by anon RLS policy public_api_read_active_products (comment :94-97). | N/A (no auth). Query error -> 500 (products.ts:67-75); missing env -> createClient throws -> caught -> 500 (:48-50, :150-157). | Anon client (publishable key, no session) for products (products.ts:48-65). Service role supabaseAdmin for pro… |
| 7 | api.admin.automation.torob.enqueue.ts | SUPABASE_JWT | Role admin or manager from user_roles via service role (api.admin.automation.torob.enqueue.ts:9, :54-72, :96-103). | REFUSES. No bearer -> 401 (:78-85); missing SUPABASE_URL/PUBLISHABLE_KEY -> 500 (:30-32); /auth/v1/user non-OK -> 401 (:42-44); missing user id -> 401 (:46-49); fetch thr… | Service role for role lookup (:55) and enqueueTorobReadonlyAutomationJob (:147, src/lib/automation/enqueue-tor… |
| 8 | api.admin.calls.import-issabel.ts | SUPABASE_JWT | Role admin or manager from user_roles via service role (api.admin.calls.import-issabel.ts:15, :60-75, :95-102). | REFUSES. No bearer -> 401 (:81-88); missing env -> 500 (:36-38); /auth/v1/user non-OK -> 401 (:48-50); missing id -> 401 (:53-55); fetch throw unhandled -> framework 500;… | Service role for role lookup (:63); importIssabelCalls called with userAccessToken: token (:142-145) - that li… |
| 9 | api.healthz.ts | NONE | NONE | N/A (no auth). Probe failures return 503 (api.healthz.ts:143). | No supabase client; raw fetch to PostgREST /rest/v1/currencies with the publishable (anon) key (api.healthz.ts… |
| 10 | api.public.bot.dynamic-tables.$tableId.rows.$rowId.ts | API_KEY | Per-key table access enforced inside SECURITY DEFINER rpc bot_update_table_row via p_key_id (route :157-162; supabase/migrations/20260906111500_468_bot_writers_require_a_… | REFUSES for auth: missing key -> 401 (src/server/bot-api.ts:278-285); bot_authenticate_key RPC error -> mapped status, unmapped -> 500 (bot-api.ts:286-290, :245-246); no … | Service role supabaseAdmin (route :2, :157); auth via supabaseAdmin.rpc (bot-api.ts:286). |
| 11 | api.public.bot.dynamic-tables.$tableId.rows.ts | API_KEY | Per-key table access inside SECURITY DEFINER RPCs: bot_query_table_rows (can_read, migration 468:744,778-782) and bot_create_table_row (can_update, migration 468:175,214-… | REFUSES for auth (same authenticateBot path: route :40-54 GET, :165-178 POST; bot-api.ts:277-296). Rate limit fails open on RPC error (bot-api.ts:83-86). | Service role supabaseAdmin (:2, :82, :282). |
| 12 | api.public.bot.dynamic-tables.$tableId.rows.upsert.ts | API_KEY | Per-key table access inside bot_upsert_table_row (migration 468:514,561-565). Additional business gate for the observatory table: approved market match required (route :1… | REFUSES for auth (route :42-55; bot-api.ts:277-296). BUT the observatory match-enforcement gate FAILS OPEN: the dynamic_tables slug lookup ignores its error (`const { dat… | Service role supabaseAdmin (:2, :184, :273, :336). |
| 13 | api.public.bot.dynamic-tables.by-slug.$slug.ts | API_KEY | Explicit per-key table access check in route: bot_api_key_table_access eq api_key_id & table_id; no row -> 403 (by-slug.$slug.ts:111-132). Only existence required - can_r… | REFUSES. Auth same as bot-api (:38-51). dynamic_tables error -> 500 (:79-93). Access lookup ignores error but a null result -> 403 (:111-118), so it fails closed. | Service role supabaseAdmin (:2, :73, :111, :134). |
| 14 | api.public.bot.market-matches.candidates.upsert.ts | API_KEY | NONE beyond a valid active key - no per-key scope/table/label check before upsert_market_product_match_candidate (candidates.upsert.ts:26-41, :221-229). | REFUSES for auth (:26-39; bot-api.ts:277-296). RPC error -> 500 (:231-247). Rate limit fails open (bot-api.ts:83-86). | Service role supabaseAdmin (:2, :221). |
| 15 | api.public.bot.market-matches.resolve.ts | API_KEY | NONE beyond a valid active key (resolve.ts:24-39, :143-147). | REFUSES for auth (:24-37). RPC error -> 500 (:149-161). Rate limit fails open (bot-api.ts:83-86). | Service role supabaseAdmin (:2, :143). |
| 16 | api.public.bot.products.$productId.ts | API_KEY | Per-key label access inside bot_get_product_for_key (p_key_id) -> forbidden_product 403 (route :73-90; migration 20260906120000_471...sql:264,295-300). | REFUSES. Key from x-bot-api-key header or Bearer (bot-api.ts:268-274); auth failures 401/500 (route :38-51; bot-api.ts:277-296). RPC error mapped, default 500 (:78-102). … | Service role supabaseAdmin (:2, :73). |
| 17 | api.public.bot.products.ts | API_KEY | Per-key label access inside bot_list_products_for_key -> forbidden_no_labels / forbidden_label 403 (route :81-100; migration 471:356,386-401). | REFUSES. Auth via extractBotKey + authenticateBot (route :21-34; bot-api.ts:268-296). RPC error mapped, default 500 (:92-118). Rate limit fails open (bot-api.ts:83-86). | Service role supabaseAdmin (:2, :81). |
| 18 | api.version.ts | NONE | NONE | N/A (no auth, no DB). | none |
| 19 | mcp.ts | OTHER | NONE at route level; the only tool (whoami) returns the caller's own id/email/client_id (src/lib/mcp/tools/whoami.ts:10-22). | REFUSES. Handler createTanStackMcpHandler (mcp.ts:15) -> createMcpProtocolHandler calls authorizer first and returns its response when !ok (node_modules/@lovable.dev/mcp-… | none (whoami reads only verified claims). |
| 20 | sitemap[.]xml.ts | NONE | NONE | N/A (static XML). | none |
| 21 | [.mcp]/invoke-tool/$tool.ts | OTHER | NONE at route level (tool-level: whoami only). | REFUSES. createInvokeToolHandler authorizes first and returns the rejection (node_modules/@lovable.dev/mcp-js/dist/chunk-H7W77K6V.js:34-38); authorizer semantics as in mc… | none |
| 22 | [.mcp]/list-tools.ts | OTHER | NONE | REFUSES. createListToolsHandler authorizes first and returns the rejection (node_modules/@lovable.dev/mcp-js/dist/chunk-PTPLMKOV.js:38-42). | none |
| 23 | [.well-known]/oauth-protected-resource.ts | NONE | NONE | N/A (public RFC 9728 metadata; returns 404 when OAuth unconfigured - node_modules/@lovable.dev/mcp-js/dist/chunk-VOMKN2HP.js:17-27). | none |

### ۲.۵ server functionها (59 در 28 فایل) — سطح HTTP مستقل از route

`createServerFn` از هر کلاینتی قابل صدا زدن است، صرف‌نظر از اینکه route آن gate دارد یا نه.

- **شمارش:** OK = 26، AUTHN-ONLY = 27، NO-AUTH = 6.
- middleware `requireSupabaseAuth` در هر خطا 401/500 پرتاب می‌کند (`integrations/supabase/auth-middleware.ts:12-60`).
- **R4 (خودم بازبینی کردم):** `generatePurchaseAdvice` فقط احراز هویت دارد (`lib/ai-tools/purchase-advisor.functions.ts:39-40`) و `getWhatsappTopProductsSnapshot`/`getWhatsappProductSellersSnapshot` را مستقیم صدا می‌زند (`:96`، `:112`)؛ بررسی نقش `assertAllowed` فقط در wrapperهای serverFn است (`lib/management/whatsapp-top-products.functions.ts:219`، `:239`). خروجی شامل نام، گروه و تلفن فروشندگان واتساپ است (`purchase-advisor.functions.ts:153-166`). route صفحه gate دارد (`_app.operations.purchase-advisor.tsx:30`)، پس این **فقط با صدا زدن مستقیم** قابل دسترس است.
- **NO-AUTH (6):** `lib/accounting/functions.ts:52,156,218` و `lib/invoices/functions.ts:75,169,244` — نوشتن پرداخت/فاکتور بدون احراز هویت با service-role. اما (measured) هیچ فایلی آن‌ها را import نمی‌کند و `@/integrations/supabase/server` وجود ندارد؛ پس احتمالاً در build نیستند **(assertion — خروجی build بررسی نشد)**.
- `listAssignableUsers` (`lib/products/assignable-users.functions.ts:23-35`): با service-role از `profiles` فقط `id, full_name` می‌خواند؛ طبق توضیح کد عمدی است.

| # | فایل:خط | نام | authn | authz | db_client | حکم |
|---|---|---|---|---|---|---|
| 1 | lib/accounting/functions.ts:52 | `recordPaymentFn` | NONE functional. .middleware() receives a bare try/catch fun… | NONE (:67-154) | service-role via getServiceClient() (:16, :84, :10… | **NO-AUTH** |
| 2 | lib/accounting/functions.ts:156 | `updatePaymentFn` | NONE functional — same broken pattern (:157-170, requireSupa… | NONE (:171-216) | service-role getServiceClient() (:195) — module mi… | **NO-AUTH** |
| 3 | lib/accounting/functions.ts:218 | `reversePaymentFn` | NONE functional — same broken pattern (:219-232, requireSupa… | NONE (:233-296) | service-role getServiceClient() (:244, :261, :277)… | **NO-AUTH** |
| 4 | lib/ai-tools/ad-copy.functions.ts:23 | `generateAdCopy` | requireSupabaseAuth middleware (:24) | NONE (:26-96) | user JWT context.supabase for insert (:79); aiChat… | **AUTHN-ONLY** |
| 5 | lib/ai-tools/purchase-advisor.functions.ts:39 | `generatePurchaseAdvice` | requireSupabaseAuth middleware (:40) | NONE (:42-228) | user JWT for products/purchase_prices/suppliers/cu… | **AUTHN-ONLY** |
| 6 | lib/ai/providers.functions.ts:71 | `listAiProviders` | requireSupabaseAuth middleware (:72) | assertAdmin(userId) (:76) — reads user_roles role='admin' via supabaseAdmin (:33-43) | service-role supabaseAdmin (:16, :78, :86, :92) | **OK** |
| 7 | lib/ai/providers.functions.ts:130 | `upsertAiProvider` | requireSupabaseAuth middleware (:131) | assertAdmin (:134) via supabaseAdmin user_roles (:33-43); RPC also checks has_role per com… | user JWT context.supabase.rpc (:141) | **OK** |
| 8 | lib/ai/providers.functions.ts:166 | `deleteAiProvider` | requireSupabaseAuth middleware (:167) | assertAdmin (:170) | user JWT context.supabase.rpc (:172) | **OK** |
| 9 | lib/ai/providers.functions.ts:182 | `testAiProvider` | requireSupabaseAuth middleware (:183) | assertAdmin (:188) | testProviderCapability in src/lib/ai/client.server… | **OK** |
| 10 | lib/ai/providers.functions.ts:192 | `discoverAiModels` | requireSupabaseAuth middleware (:193) | assertAdmin (:200) | discoverModels -> supabaseAdmin (src/lib/ai/client… | **OK** |
| 11 | lib/ai/providers.functions.ts:205 | `updateAiUsageRoute` | requireSupabaseAuth middleware (:206) | assertAdmin (:209) | service-role supabaseAdmin (:219, :234) | **OK** |
| 12 | lib/analytics/product-interactions.functions.ts:63 | `trackProductInteractionFn` | requireSupabaseAuth middleware (:64) | NONE — documented as intentionally open to any authenticated user (:22-23) | user JWT for existence checks (:70-86); service-ro… | **AUTHN-ONLY** |
| 13 | lib/automation/enqueue-dummy-job.functions.ts:13 | `enqueueDummyAutomationJobFn` | requireSupabaseAuth middleware (:14) | roles admin\|manager (:11) read from user_roles via supabaseAdmin (:18-21) | service-role supabaseAdmin (:8, :18); enqueueDummy… | **OK** |
| 14 | lib/currency-sources.functions.ts:63 | `autoFetchCurrencyRate` | requireSupabaseAuth middleware (:64) | roles admin\|accountant (:15) read from user_roles via USER JWT client (:70-77) | user JWT for role check; service-role supabaseAdmi… | **OK** |
| 15 | lib/customers/functions.ts:139 | `createCustomer` | surfaceAuthError + requireSupabaseAuth middleware (:140) | NONE in handler; delegated to customers RLS (:9-11) | user JWT context.supabase (:144, :160) | **AUTHN-ONLY** |
| 16 | lib/customers/functions.ts:181 | `updateCustomer` | surfaceAuthError + requireSupabaseAuth middleware (:182) | NONE in handler; RLS (:9-11) | user JWT (:186, :206) | **AUTHN-ONLY** |
| 17 | lib/customers/functions.ts:222 | `linkCustomerToPerson` | surfaceAuthError + requireSupabaseAuth middleware (:223) | NONE in handler; SECURITY INVOKER RPC customer_set_person + RLS (:12-16) | user JWT rpc (:227-232) | **AUTHN-ONLY** |
| 18 | lib/gamification/manual-score.functions.ts:67 | `previewManualScoreAdjustment` | requireSupabaseAuthNode20 middleware (:68) | assertAdmin (:72) — user_roles via supabaseAdmin, requires 'admin' (:146-156) | service-role supabaseAdmin rpc (:74-85) | **OK** |
| 19 | lib/gamification/manual-score.functions.ts:91 | `recordManualScoreAdjustment` | requireSupabaseAuthNode20 middleware (:92) | assertAdmin (:96) (:146-156) | service-role supabaseAdmin (:98, :99, :116, :125) | **OK** |
| 20 | lib/invoices/functions.ts:75 | `createInvoiceFn` | NONE functional — bare function to .middleware() (:76-89); r… | NONE (:90-167) | service-role getServiceClient() (:17, :107, :130) … | **NO-AUTH** |
| 21 | lib/invoices/functions.ts:169 | `updateInvoiceFn` | NONE functional — same pattern (:170-183, :197) | NONE (:184-242) | service-role getServiceClient() (:221) — module mi… | **NO-AUTH** |
| 22 | lib/invoices/functions.ts:244 | `deleteInvoiceFn` | NONE functional — same pattern (:245-258, :266) | NONE (:259-306) | service-role getServiceClient() (:270, :285) — mod… | **NO-AUTH** |
| 23 | lib/knowledge/rag.functions.ts:48 | `reindexKnowledgeDocuments` | requireSupabaseAuth middleware (:49) | roles admin\|manager from user_roles via supabaseAdmin (:54-61); chunk write RPC also check… | service-role supabaseAdmin reads knowledge_documen… | **OK** |
| 24 | lib/knowledge/rag.functions.ts:156 | `askKnowledge` | requireSupabaseAuth middleware (:157) | NONE in handler; retrieval gated in SQL kd_role_can_view via user JWT RPC (:172-178, asser… | user JWT rpc search_knowledge_chunks_semantic (:17… | **AUTHN-ONLY** |
| 25 | lib/management/whatsapp-top-products.functions.ts:204 | `fetchWhatsappTopProducts` | requireSupabaseAuthNode20 middleware (:205) | assertAllowed admin\|manager\|accountant (:18, :219) via supabaseAdmin user_roles (:75-82) | service-role only for role lookup (:76-77); data f… | **OK** |
| 26 | lib/management/whatsapp-top-products.functions.ts:227 | `fetchWhatsappMentioners` | requireSupabaseAuthNode20 middleware (:228) | assertAllowed (:239) (:75-82) | service-role for role lookup only (:76-77); extern… | **OK** |
| 27 | lib/market-rates-ingestion.functions.ts:96 | `ingestMarketRatesExternal` | requireSupabaseAuth middleware (:97) | roles admin\|manager\|accountant (:14) via USER JWT user_roles (:103-110); RPCs also check p… | user JWT context.supabase for all RPCs/reads (:100… | **OK** |
| 28 | lib/market-rates-ingestion.functions.ts:316 | `getExternalRatesStatus` | requireSupabaseAuth middleware (:317) | roles admin\|manager\|accountant via USER JWT (:321-326); unauthorized gets all-false defaul… | user JWT (:320-324) | **OK** |
| 29 | lib/marketing/marketing-channels.functions.ts:91 | `updateMarketingChannel` | requireSupabaseAuth middleware (:92) | roles admin\|accountant (:33) via USER JWT user_roles (:98-105) + RLS mc_write_admin_accoun… | user JWT (:95, :143, :160) | **OK** |
| 30 | lib/marketing/marketing-channels.functions.ts:172 | `createMarketingChannel` | requireSupabaseAuth middleware (:173) | roles admin\|accountant via USER JWT (:179-186) | user JWT (:176, :210, :225) | **OK** |
| 31 | lib/marketing/marketing-channels.functions.ts:237 | `toggleMarketingChannelActive` | requireSupabaseAuth middleware (:238) | roles admin\|accountant via USER JWT (:243-250) | user JWT (:241, :263, :271) | **OK** |
| 32 | lib/marketing/promotion-suggestions.functions.ts:60 | `markPromotionSuggestionUsed` | requireSupabaseAuth middleware (:61) | roles admin\|manager\|accountant (:29) via USER JWT user_roles (:67-75) | user JWT (:64, :79-84, :101, :129) | **OK** |
| 33 | lib/messenger/embeddings.functions.ts:116 | `generateMessageEmbedding` | requireSupabaseAuthNode20 middleware (aliased) (:5, :117) | ownership: message sender_id must equal userId (:130) | user JWT (:121, :124, :142); aiEmbed uses supabase… | **OK** |
| 34 | lib/messenger/embeddings.functions.ts:164 | `semanticSearchMessenger` | requireSupabaseAuthNode20 middleware (aliased) (:165) | group membership check via user JWT (:171-177) | user JWT (:168, :180, :186); aiEmbed supabaseAdmin… | **OK** |
| 35 | lib/messenger/inquiries.functions.ts:32 | `createInquiry` | requireSupabaseAuthNode20 middleware (:33) | NONE in handler; delegated to RPC create_inquiry (:38-42) | user JWT rpc (:36, :38) | **AUTHN-ONLY** |
| 36 | lib/messenger/inquiries.functions.ts:51 | `replyInquiry` | requireSupabaseAuthNode20 middleware (:52) | NONE in handler; RPC reply_inquiry (:57-61) | user JWT rpc (:55, :57) | **AUTHN-ONLY** |
| 37 | lib/messenger/inquiries.functions.ts:69 | `transferInquiry` | requireSupabaseAuthNode20 middleware (:70) | NONE in handler; RPC transfer_inquiry (:75-78) | user JWT rpc (:73, :75) | **AUTHN-ONLY** |
| 38 | lib/messenger/transcribe.functions.ts:17 | `transcribeMessengerAudio` | requireSupabaseAuthNode20 middleware (aliased) (:5, :18) | ownership: sender_id === userId (:39); update also filtered by sender_id (:97) | user JWT incl. storage download (:22, :33, :51, :9… | **OK** |
| 39 | lib/messenger/upload.functions.ts:26 | `preCheckMessengerAttachment` | requireSupabaseAuthNode20 middleware (aliased) (:8, :27) | group membership via rpc is_messenger_group_member (:34-39) | user JWT rpc (:31, :34) | **OK** |
| 40 | lib/persons/aliases.functions.ts:97 | `listPersonAliases` | requireSupabaseAuth middleware (:98) | NONE in handler; RLS-authoritative (:2) | user JWT (:101) | **AUTHN-ONLY** |
| 41 | lib/persons/aliases.functions.ts:110 | `createPersonAlias` | requireSupabaseAuth middleware (:111) | NONE in handler; RLS (:2) | user JWT (:114) | **AUTHN-ONLY** |
| 42 | lib/persons/aliases.functions.ts:129 | `updatePersonAlias` | requireSupabaseAuth middleware (:130) | NONE in handler; RLS | user JWT (:145) | **AUTHN-ONLY** |
| 43 | lib/persons/aliases.functions.ts:155 | `deletePersonAlias` | requireSupabaseAuth middleware (:156) | NONE in handler; RLS | user JWT (:159) | **AUTHN-ONLY** |
| 44 | lib/persons/context-links.functions.ts:56 | `listPersonContextLinks` | requireSupabaseAuth middleware (:57) | NONE in handler; RLS (SELECT via parent person) (:8-9) | user JWT (:60) | **AUTHN-ONLY** |
| 45 | lib/persons/context-links.functions.ts:76 | `addPersonContextLink` | requireSupabaseAuth middleware (:77) | NONE in handler; RLS admin/manager INSERT (:10) | user JWT (:80, :97) | **AUTHN-ONLY** |
| 46 | lib/persons/context-links.functions.ts:108 | `updatePersonContextLink` | requireSupabaseAuth middleware (:109) | NONE in handler; RLS admin/manager UPDATE (:10) | user JWT (:112, :117) | **AUTHN-ONLY** |
| 47 | lib/persons/context-links.functions.ts:130 | `endPersonContextLink` | requireSupabaseAuth middleware (:131) | NONE in handler; RLS (:10) | user JWT (:134, :136) | **AUTHN-ONLY** |
| 48 | lib/persons/functions.ts:243 | `createPerson` | surfaceAuthError + requireSupabaseAuth middleware (:244) | NONE in handler; delegated to RPC person_create_full / RLS (:237, :265) | user JWT (:249, :265, :285, :295) | **AUTHN-ONLY** |
| 49 | lib/persons/functions.ts:312 | `updatePerson` | surfaceAuthError + requireSupabaseAuth middleware (:313) | NONE in handler; RLS admin/manager (:9-10) | user JWT (:318, :362, :389) | **AUTHN-ONLY** |
| 50 | lib/persons/functions.ts:414 | `getPerson` | surfaceAuthError + requireSupabaseAuth middleware (:415) | NONE in handler; RLS | user JWT (:419-433) | **AUTHN-ONLY** |
| 51 | lib/persons/functions.ts:472 | `searchPersons` | surfaceAuthError + requireSupabaseAuth middleware (:473) | NONE in handler; SECURITY INVOKER RPC search_visible_persons under RLS (:464-466) | user JWT rpc (:481-487) | **AUTHN-ONLY** |
| 52 | lib/persons/identifiers.functions.ts:235 | `createPersonIdentifier` | requireSupabaseAuth middleware (:236) | NONE in handler; RLS admin/manager (:9, :234) | user JWT (:244, :258) | **AUTHN-ONLY** |
| 53 | lib/persons/identifiers.functions.ts:280 | `updatePersonIdentifier` | requireSupabaseAuth middleware (:281) | NONE in handler; RLS (:277) | user JWT (:284, :307, :355) | **AUTHN-ONLY** |
| 54 | lib/persons/identifiers.functions.ts:369 | `revokePersonIdentifier` | requireSupabaseAuth middleware (:370) | NONE in handler; RLS | user JWT (:373-381) | **AUTHN-ONLY** |
| 55 | lib/pricing/process-queue.functions.ts:20 | `triggerPricingRecomputeQueue` | requireSupabaseAuth middleware (:21) | roles admin\|manager\|accountant (:18) from user_roles via supabaseAdmin (:35-46) | service-role supabaseAdmin (:4, :35); processPrici… | **OK** |
| 56 | lib/products/assignable-users.functions.ts:23 | `listAssignableUsers` | requireSupabaseAuthNode20 middleware (:24) | NONE (:26-41); handler does not even read context | service-role supabaseAdmin (:27-35) | **AUTHN-ONLY** |
| 57 | lib/receipt-ocr-bytes.functions.ts:57 | `extractReceiptFromBytes` | requireSupabaseAuth middleware (:58) | roles admin\|accountant (:37) via USER JWT user_roles (:64-77) | user JWT for role check (:61-67); aiVision uses su… | **OK** |
| 58 | lib/receipt-ocr.functions.ts:67 | `extractReceiptDocumentOcr` | requireSupabaseAuth middleware (:68) | roles admin\|accountant (:43) via USER JWT user_roles (:74-87) | user JWT for doc row + signed URL (:90-107); aiVis… | **OK** |
| 59 | lib/sales/quote-status.functions.ts:88 | `updateQuoteStatus` | surfaceAuthError + requireSupabaseAuth middleware (:89) | NONE in handler; delegated to SECURITY DEFINER RPC update_sales_quote_status which enforce… | user JWT rpc (:93, :103) | **AUTHN-ONLY** |

---

## ۳. S2 — policyهایی که هیچ محدودیتی ندارند

### ۳.۱ شمارش (measured: `q3-policies.sql` → `analyze-policies.mjs`)

| مورد | تعداد |
|---|---|
| کل policyها در `pg_policies` | **652** (SELECT 250، ALL 179، INSERT 95، UPDATE 82، DELETE 46) |
| `qual` برابر `true` | **38** — همه در `public` |
| `qual IS NULL` | 95 — **همه `INSERT`** (هیچ غیر-INSERT) |
| true یا null | 133 — اما null‌های INSERT نقص نیستند چون INSERT `USING` ندارد؛ هم‌ارزش در INSERT `with_check=true` است که **1** مورد است و role آن `service_role` است |
| `role() = 'authenticated'` (در عمل true برای کاربر واردشده) | 12 (جدول ۳.۳) |
| جدول `public` با RLS خاموش | **0** از 226 |

**زمینهٔ هم‌جدول — چرا مهم است:**
- policyهای PERMISSIVE با OR ترکیب می‌شوند؛ پس یک permissive با `true` هر permissive دیگرِ همان cmd را بی‌اثر می‌کند.
- فقط RESTRICTIVE می‌تواند محدود کند. در کل این 38 مورد، تنها RESTRICTIVE موجود `viewer_restricted: (NOT is_viewer_only(uid()))` است که روی 9 جدول نشسته.
- quoted از `is_viewer_only`: `SELECT EXISTS (… role = 'viewer') AND NOT EXISTS (… role <> 'viewer')`. کاربری که **هیچ** نقشی ندارد viewer-only نیست، پس رد نمی‌شود.
- measured: حساب inactive بی‌نقش همان 196/28/19/1535 ردیفی را می‌بیند که sales می‌بیند. همان الگوی «شرط منفی fail-open» که `RouteRoleGate.tsx:142-145` هشدارش را داده.

### ۳.۲ جدول 38 policy

ستون ردیف‌ها با JWT واقعی اندازه گرفته شده (`q5-personas.sql`؛ هر خانه یک `BEGIN READ ONLY … ROLLBACK`). `admin` در این ستون `supabase_admin` است که RLS جدول را دور می‌زند (= کل ردیف‌ها). `DENIED` یعنی خطای privilege، نه صفر ردیف.

| # | جدول | policy | roles | cmd | RESTRICTIVE هم‌جدول (همان cmd) | PERMISSIVE دیگرِ هم‌جدول (بی‌اثر در برابر true) | grant anon | ردیف: admin / sales / viewer-only / inactive بی‌نقش / anon | ماهیت داده (assertion) | فایل‌های UI |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `brands` | `brands_public_read` | anon | SELECT | ندارد | `all authenticated read brands[SELECT]` | SELECT | 40 / 40 / 40 / 40 / 40 | catalog/reference | 10 |
| 2 | `call_log_extensions` | `call_log_extensions_select_authenticated` | authenticated | SELECT | ندارد | — | ندارد | 9 / 9 / 9 / 9 / DENIED | staff mapping (extension→employee) | 2 |
| 3 | `categories` | `categories_public_read` | anon | SELECT | ندارد | `all authenticated read categories[SELECT]` | column-level (6 ستون) | 12 / 12 / 0 / 12 / 12 | catalog/reference | 13 |
| 4 | `category_product_attributes` | `cpa_read_authed` | authenticated | SELECT | ندارد | `cpa_write_admin_manager[ALL]` | ندارد | 60 / 60 / 60 / 60 / DENIED | catalog/reference | 3 |
| 5 | `category_required_services` | `category_required_services_select` | authenticated | SELECT | ندارد | `category_required_services_write[ALL]` | ندارد | 2 / 2 / 2 / 2 / DENIED | catalog/reference | 1 |
| 6 | `currencies` | `currencies_read_authed` | authenticated | SELECT | ندارد | `currencies_write_admin_accountant[ALL]` | SELECT | 4 / 4 / 4 / 4 / 0 | catalog/reference | 4 |
| 7 | `currency_rate_fetches` | `crf_read` | authenticated | SELECT | ندارد | `crf_write[ALL]` | ندارد | 1 / 1 / 1 / 1 / DENIED | market data | 1 |
| 8 | `custom_roles` | `custom_roles_read_authed` | authenticated | SELECT | `viewer_restricted[ALL]: (NOT is_viewer_only(uid()))` | `custom_roles_write_admin[ALL]` | ندارد | 9 / 9 / 0 / 9 / DENIED | security-config | 2 |
| 9 | `daily_capital_settings` | `dcs_select_authenticated` | authenticated | SELECT | `viewer_restricted[ALL]: (NOT is_viewer_only(uid()))` | `dcs_admin_accountant_all[ALL]` | ندارد | 19 / 19 / 0 / 19 / DENIED | money (total_capital) | 2 |
| 10 | `daily_mood_hafez_poems` | `hafez readable to authenticated` | authenticated | SELECT | ندارد | `admin manage hafez[ALL]` | ندارد | 21 / 21 / 21 / 21 / DENIED | content | 1 |
| 11 | `daily_mood_questions` | `questions readable to authenticated` | authenticated | SELECT | ندارد | `admin manage questions[ALL]` | ندارد | 93 / 93 / 93 / 93 / DENIED | content | 1 |
| 12 | `daily_mood_scenarios` | `scenarios readable to authenticated` | authenticated | SELECT | ندارد | `admin manage scenarios[ALL]` | ندارد | 10 / 10 / 10 / 10 / DENIED | content | 1 |
| 13 | `dashboard_ticker_events` | `ticker_select_auth` | authenticated | SELECT | ندارد | — | ندارد | 0 / 0 / 0 / 0 / DENIED | feed (0 rows) | 1 |
| 14 | `employee_leagues` | `employee_leagues_read_all` | authenticated | SELECT | ندارد | — | ندارد | 0 / 0 / 0 / 0 / DENIED | staff (0 rows) | 0 |
| 15 | `employee_profiles` | `ep_select_auth` | authenticated | SELECT | ندارد | `ep_write_own[ALL]` | ندارد | 0 / 0 / 0 / 0 / DENIED | staff PII (0 rows) | 1 |
| 16 | `gamification_kpis` | `Authenticated can view kpis` | authenticated | SELECT | ندارد | — | ندارد | 13 / 13 / 13 / 13 / DENIED | config | 1 |
| 17 | `inquiries` | `inquiry_update_rpc` | service_role | UPDATE | ندارد | — | ندارد | 5 / 0 / 0 / 0 / DENIED | n/a — policy role is service_role | 5 |
| 18 | `invoice_workflow_stages` | `iws_select` | authenticated | SELECT | ندارد | `iws_write[ALL]` | ندارد | 5 / 5 / 5 / 5 / DENIED | config | 1 |
| 19 | `league_seasons` | `league_seasons_read_authenticated` | authenticated | SELECT | ندارد | — | ندارد | 24 / 24 / 24 / 24 / DENIED | gamification | 1 |
| 20 | `marketing_channels` | `mc_select_authed` | authenticated | SELECT | ندارد | `mc_write_admin_accountant[ALL]` | ندارد | 56 / 56 / 56 / 56 / DENIED | catalog/reference | 8 |
| 21 | `marketing_task_templates` | `mtt_select` | authenticated | SELECT | ندارد | `mtt_write[ALL]` | ندارد | 1 / 1 / 1 / 1 / DENIED | config | 1 |
| 22 | `payment_receipt_custom_fields` | `prcf_select_authed` | authenticated | SELECT | ندارد | `prcf_write_admin_accountant[ALL]` | ندارد | 0 / 0 / 0 / 0 / DENIED | money-config | 1 |
| 23 | `payment_terms` | `payment_terms_select_authed` | authenticated | SELECT | ندارد | `payment_terms_write_admin_accountant[ALL]` | SELECT | 5 / 5 / 5 / 5 / 0 | money-config | 2 |
| 24 | `pricing_board_settings` | `pbs_select_auth` | authenticated | SELECT | `viewer_restricted[ALL]: (NOT is_viewer_only(uid()))` | `pricing_board_settings_select_authorized[SELECT]` | ندارد | 1 / 1 / 0 / 1 / DENIED | config | 1 |
| 25 | `product_attribute_groups` | `pag_select` | authenticated | SELECT | ندارد | — | ندارد | 6 / 6 / 6 / 6 / DENIED | catalog/reference | 1 |
| 26 | `product_attributes` | `product_attributes_read_authed` | authenticated | SELECT | ندارد | `product_attributes_write_admin_manager[ALL]` | ندارد | 308 / 308 / 308 / 308 / DENIED | catalog/reference | 3 |
| 27 | `product_images` | `product_images_select` | public | SELECT | ندارد | `product_images_write[ALL]` | SELECT | 9 / 9 / 9 / 9 / 9 | catalog/reference | 3 |
| 28 | `product_recommendation_overrides` | `pro_select_authed` | authenticated | SELECT | `viewer_restricted[ALL]: (NOT is_viewer_only(uid()))` | `pro_write_admin_manager[ALL]` | ندارد | 1535 / 1535 / 0 / 1535 / DENIED | catalog-config | 1 |
| 29 | `product_service_types` | `product_service_types_select` | authenticated | SELECT | ندارد | `product_service_types_write[ALL]` | ندارد | 2 / 2 / 2 / 2 / DENIED | catalog/reference | 0 |
| 30 | `promotion_nomination_policy` | `promo_policy_select_authed` | authenticated | SELECT | `viewer_restricted[ALL]: (NOT is_viewer_only(uid()))` | `promo_policy_write_admin_manager[ALL]` | ندارد | 1 / 1 / 0 / 1 / DENIED | config | 0 |
| 31 | `recent_purchase_settings` | `recent_purchase_settings read authenticated` | authenticated | SELECT | `viewer_restricted[ALL]: (NOT is_viewer_only(uid()))` | — | ندارد | 1 / 1 / 0 / 1 / DENIED | config | 1 |
| 32 | `role_permissions` | `role_permissions_read_authed` | authenticated | SELECT | `viewer_restricted[ALL]: (NOT is_viewer_only(uid()))` | `role_permissions_write_admin[ALL]` | ندارد | 196 / 196 / 0 / 196 / DENIED | security-config | 2 |
| 33 | `sale_price_types` | `sale_price_types_auth_read` | authenticated | SELECT | ندارد | `sale_price_types_read[SELECT]`, `sale_price_types_write[ALL]` | SELECT | 3 / 3 / 3 / 3 / 0 | catalog/reference | 8 |
| 34 | `sales_reminders` | `sales_reminders_select_authed` | authenticated | SELECT | `viewer_restricted[ALL]: (NOT is_viewer_only(uid()))` | — | ندارد | 6 / 6 / 0 / 6 / DENIED | business text | 2 |
| 35 | `score_level_thresholds` | `score_level_thresholds_read_authenticated` | authenticated | SELECT | ندارد | `score_level_thresholds_admin_write[ALL]` | ندارد | 4 / 4 / 4 / 4 / DENIED | config | 0 |
| 36 | `shop_settings` | `shop_settings_read_authed` | authenticated | SELECT | `viewer_restricted[ALL]: (NOT is_viewer_only(uid()))` | `shop_settings_write_admin[ALL]` | ندارد | 28 / 28 / 0 / 28 / DENIED | secret+config (didar_api_key) | 6 |
| 37 | `validation_rules` | `validation_rules_select_authenticated` | authenticated | SELECT | ندارد | `validation_rules_admin_all[ALL]` | ندارد | 5 / 5 / 5 / 5 / DENIED | config | 2 |
| 38 | `workflow_settings` | `all authenticated can read settings` | authenticated | SELECT | ندارد | — | ندارد | 5 / 5 / 5 / 5 / DENIED | config | 0 |

**نکات تفسیری:**
- **`inquiries.inquiry_update_rpc`** role آن `service_role` است که RLS را دور می‌زند؛ این policy هیچ اثری ندارد → **37 مؤثر**.
- **`brands`، `categories`، `product_images`، `currencies`، `payment_terms`، `sale_price_types`** grant ستونی برای anon دارند (measured: `q13.sql`). anon واقعاً brands=40، categories=12، product_images=9 را می‌خواند؛ currencies/payment_terms/sale_price_types برای anon **0** برمی‌گرداند که کنار baseline غیرصفر یعنی policy anon را نمی‌پذیرد، نه اینکه جدول خالی است. همه کاتالوگ عمومی‌اند **(assertion دربارهٔ عمدی بودن)**.
- **`shop_settings`** بحرانی‌ترین مورد S2 است: R2 را ببینید.

### ۳.۳ دوازده policy «در عمل true» برای authenticated

| # | جدول | policy | roles | qual | ردیف: admin / sales / viewer-only / inactive بی‌نقش / anon |
|---|---|---|---|---|---|
| 1 | `academy_lessons` | `al_select_authed` | authenticated | `(role() = 'authenticated'::text)` | 0 / 0 / 0 / 0 / DENIED |
| 2 | `academy_quizzes` | `aq_select_authed` | authenticated | `(role() = 'authenticated'::text)` | 0 / 0 / 0 / 0 / DENIED |
| 3 | `brands` | `all authenticated read brands` | public | `(role() = 'authenticated'::text)` | 40 / 40 / 40 / 40 / 40 |
| 4 | `categories` | `all authenticated read categories` | public | `(role() = 'authenticated'::text)` | 12 / 12 / 0 / 12 / 12 |
| 5 | `product_label_links` | `all authenticated read product_label_links` | public | `(role() = 'authenticated'::text)` | 694 / 694 / 694 / 694 / DENIED |
| 6 | `product_labels` | `all authenticated read product_labels` | public | `(role() = 'authenticated'::text)` | 12 / 12 / 12 / 12 / DENIED |
| 7 | `product_owner_assignments` | `all authenticated read product_owners` | public | `(role() = 'authenticated'::text)` | 362 / 362 / 0 / 362 / DENIED |
| 8 | `settlement_types` | `settlement_types_read` | public | `(role() = 'authenticated'::text)` | 12 / 12 / 12 / 12 / DENIED |
| 9 | `visitors` | `visitors_read` | public | `(role() = 'authenticated'::text)` | 1 / 1 / 0 / 1 / DENIED |
| 10 | `zz_retired_knowledge_articles` | `all authenticated read knowledge` | public | `(role() = 'authenticated'::text)` | 0 / 0 / 0 / 0 / DENIED |
| 11 | `zz_retired_price_list_items` | `all authenticated read price_list_items` | public | `(role() = 'authenticated'::text)` | 0 / 0 / 0 / 0 / DENIED |
| 12 | `zz_retired_price_lists` | `all authenticated read price_lists` | public | `(role() = 'authenticated'::text)` | 0 / 0 / 0 / 0 / DENIED |

---

## ۴. S3 — آنچه یک کاربر authenticated غیر-admin واقعاً از `role_permissions` می‌خواند

**روش (measured، نه خواندن متن policy):**
```sql
BEGIN READ ONLY;
SELECT set_config('request.jwt.claims', json_build_object('sub', <subquery persona>, 'role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT count(*) FROM public.role_permissions;
ROLLBACK;
```
شناسهٔ persona داخل subquery ساخته شد و هرگز چاپ نشد؛ برای هر persona یک خط `resolved|1` تأیید کرد که subquery خالی نبوده.

| persona (measured) | ردیف | ستون‌ها |
|---|---|---|
| active admin | 196 | 12 |
| **active sales-only** | **196** | 12 |
| active viewer-only | 0 (به‌خاطر `viewer_restricted` RESTRICTIVE؛ baseline = 196) | — |
| **inactive، بدون هیچ ردیف `user_roles`** | **196** | `id, module, can_view, role_name, can_create, can_delete, can_export, can_update, created_at, updated_at, can_approve, can_view_sensitive` |
| anon | `DENIED` (خطای privilege) | — |

**policyها (quoted از `pg_policies`):** `role_permissions_read_authed` PERMISSIVE SELECT `true`؛ `viewer_restricted` RESTRICTIVE ALL `(NOT is_viewer_only(uid()))`؛ `role_permissions_write_admin` PERMISSIVE ALL `has_role(uid(),'admin')`.

**محتوا:** ماتریس کامل 28 ماژول × 7 نقش (`admin, manager, sales, accountant, viewer, purchase_specialist, site`) با 7 پرچم بولی.

**آیا مهم است؟**
- **آنچه افشا می‌کند (assertion):** نقشهٔ کامل اینکه هر نقش به کدام ماژول با کدام action دسترسی دارد. رمز، داده مالی یا PII نیست. مهاجم با آن می‌داند کدام نقش را هدف بگیرد و کدام policyها به `has_dynamic_permission` تکیه دارند.
- **آنچه نمی‌تواند:** نوشتن فقط برای admin است (policy بالا)؛ تغییر ماتریس با این خواندن ممکن نیست.
- **چرا بستنش ساده نیست (cited):** کلاینت خودش این جدول را می‌خواند تا مجوز UI را حساب کند: `lib/rbac/dynamic-permissions.ts` (از `supabase.from("role_permissions")`) و `lib/rbac/roles.ts:161` (`getCachedRolePermissions()`). بستن `SELECT` بدون جایگزین، همهٔ کنترل‌های UI غیر-admin را خاموش می‌کند چون `hasPermissionEx` بدون ردیف `false` می‌دهد (`roles.ts:165`).
- **خطر روی این box (measured، K3):** `authenticated` روی `role_permissions` مجوز `TRUNCATE` دارد (`information_schema.role_table_grants`) و TRUNCATE از RLS عبور می‌کند. اما PostgREST فعل TRUNCATE ندارد، پس از API قابل دسترس نیست و فقط با اتصال مستقیم SQL ممکن است **(assertion)**.

---

## ۵. S4 — ماژول‌هایی که با fallback باز هستند

**نتیجه: 0 (measured).**

| منبع | ماژول‌ها | شاهد |
|---|---|---|
| `role_permissions` زنده | **28** متمایز؛ هر 7 نقش برای هر 28 ماژول ردیف دارند (196 = 28×7) | `q6-views.sql`: `role_name|modules` = 28 برای هر 7 نقش |
| policyهای زنده که `has_dynamic_permission` صدا می‌زنند | 24 policy؛ ماژول‌ها: `sales`، `products`، `suppliers`، `pricing` | `q7-modules.sql` |
| توابع دیتابیس که `has_dynamic_permission` صدا می‌زنند | **0** (و 0 فراخوانی با آرگومان غیر-literal) | `q7-modules.sql` |
| کلاینت: `requirePermission`، `hasPermissionEx`، `module: "…"` در registry | 26 ماژول: academy, accounting, asan-export, asan-import, audit-logs, bot-api-keys, dashboard, data-tables, feedback, hr, invoices, knowledge, market-rates, messages, persons, platform-releases, pricing, product-videos, products, purchases, reports, roles, sales, suppliers, users, warehouse | `scratchpad/client-modules.txt` (262 خط) |
| `ModuleKey` | 27 | `lib/rbac/roles.ts:69-96` |

- **تفاضل:** (کلاینت ∪ دیتابیس) − `role_permissions` = ∅.
- در `role_permissions` هست ولی جایی ارجاع نشده: `ledger-documents`؛ `price-lists` فقط در `ModuleKey`.
- **کلاینت fail-closed است:** `hasPermissionEx` بدون ردیف `false` برمی‌گرداند (`roles.ts:165`)؛ پس fallback فقط سمت دیتابیس معنا دارد.

**خطر نهفته (assertion):** fallback هنوز در تابع هست. سه چیز بی‌صدا دوباره بازش می‌کند: (الف) ماژول تازه‌ای که policy آن `has_dynamic_permission` بخواند ولی seed نشود؛ (ب) نقش تازه در `app_role` بدون ردیف؛ (ج) حذف یک ردیف توسط admin. در حالت (الف) `view` به هر پنج نقش اصلی داده می‌شود. همچنین `has_dynamic_permission(uuid,text,text)` برای `authenticated` قابل اجراست (measured) و `_user_id` دلخواه می‌پذیرد، پس یک oracle دربارهٔ مجوز کاربران دیگر است.

---

## ۶. رتبه‌بندی بر اساس افشای واقعی

مقیاس اندازه: **small** = یک migration یا تغییر محدود با اثبات ساده؛ **medium** = چند فایل یا نیاز به طراحی جایگزین؛ **large** = تغییر گسترده یا نیاز به تصمیم مالک.

جمعیت «هر کاربر واردشده» (measured):
- **26** حساب active.
- **8** حساب غیر-active که هنوز می‌توانند وارد شوند (6 inactive، 2 rejected؛ ایمیل تأییدشده، ban نشده، رمز دارند).
- 4 حساب pending ایمیل تأییدنشده دارند و نمی‌توانند وارد شوند.

| رتبه | یافته | چه کسی می‌رسد | چه چیزی | UI یا فقط API | شاهد | برای بستن | اندازه |
|---|---|---|---|---|---|---|---|
| **R1** | پنج view با `security_invoker=false` که RLS را دور می‌زنند و فقط `uid() IS NOT NULL AND NOT is_viewer_only(uid())` دارند | هر authenticated غیر-viewer، **شامل حساب inactive بی‌نقش** | **پول:** `vw_account_balances` (2/2 حساب بانکی با مانده)، `vw_supplier_payables` (317/317 خرید با نام تأمین‌کننده و مبلغ باز)، `v_dynamic_salesperson_capital_balances` (252/252)، `v_dynamic_customer_capital_balances` (35/35)، `publish_recipients_view` (25 نام کارمند + نقش) | **فقط API.** صفحه‌های مربوط gate دارند (`_app.accounting.dynamic-capital.tsx:63`، `_app.accounting.payables.tsx:51`)؛ `vw_account_balances` و `vw_supplier_payables` در `src` هیچ ارجاعی ندارند | measured: sales = admin در `q11.sql`؛ quoted: `pg_get_viewdef` هر پنج (`q6.out`) | یا `security_invoker=true` بعد از اثبات اینکه RLS جدول‌های پایه به نقش‌های مجاز اجازه می‌دهد، یا شرط نقش صریح (`has_any_role(uid(), …)`) به‌جای شرط منفی | small–medium |
| **R1b** | `v_customer_credit_exposure` بدون **هیچ** فیلتری، `security_invoker=false`، grant به authenticated | هر authenticated، حتی viewer | پول (کمبود اعتبار مشتری) | فقط API | quoted: viewdef؛ measured: 0 ردیف برای `supabase_admin` هم (جدول الان خالی است، نه اینکه بسته باشد) | همان R1 | small |
| **R2** | `shop_settings` با `qual=true` شامل `didar_api_key` (16 نویسه، شبیه placeholder نیست؛ مقدار چاپ نشد) | هر authenticated غیر-viewer، شامل inactive بی‌نقش | **secret** یک سرویس بیرونی (Didar CRM) | **UI:** `lib/shop/settings.ts:56` کل `key, value` را می‌خواند و در مرورگر فیلتر می‌کند (`:61`)؛ از `_app.pricing.sale-lists_.$listId.tsx:98` و `…sale-lists_.new.tsx:46` صدا زده می‌شود که sales می‌بیند | measured: `didar_api_key non-empty row visible` = 1 برای sales و inactive_no_role، 0 برای viewer (`q11.sql`)؛ صفحهٔ مدیریت خودش می‌گوید «کلید API فقط برای مدیران قابل مشاهده است» (quoted, `_app.operations.didar.tsx:326`) | کلید به جدول یا secret فقط-admin/سرور، `select` فقط کلیدهای لازم، **rotate کلید** | small |
| **R3** | وضعیت پروفایل در دیتابیس اعمال نمی‌شود | 3 حساب غیر-active با نقش admin (2 inactive، 1 rejected؛ هر 3 تأییدشده و ban‌نشده)، و 8 حساب غیر-active در مجموع | **همه‌چیز** برای آن سه: inactive admin دقیقاً همان را می‌بیند که active admin (audit_logs 53255، persons 93، customers 91، …) | API؛ و روی بار سرد UI هم (بخش ۲.۲، `_app.tsx:143-219`) | measured: `q11.sql`؛ quoted: `has_role` فقط `user_roles` را می‌خواند؛ فقط 1 policy به status اشاره دارد (`public_api_read_active_products`) | در زمان غیرفعال‌سازی `banned_until` در GoTrue ست شود یا ردیف‌های `user_roles` برداشته شود؛ یا `has_role`/`is_viewer_only` status را هم بخوانند | small (عملیاتی) / medium (سیستمی) |
| **R4** | `generatePurchaseAdvice` بررسی نقش را دور می‌زند | هر authenticated | **PII:** نام، گروه و تلفن فروشندگان واتساپ | فقط API (صفحه gate دارد `:30`) | cited: `purchase-advisor.functions.ts:39-40,96,112,153-166`؛ `whatsapp-top-products.functions.ts:219,239` | `assertAllowed` داخل handler یا داخل دو helper | small |
| **R5** | S1: 58 route که روی بار سرد برای نقش‌های دارای کاربر رندر می‌شوند | authenticated با نقش پایین‌تر از guard | عمدتاً UI و متن؛ دادهٔ ردیفی همچنان با RLS | UI (بار سرد، مثلاً لینک مستقیم یا refresh) | بخش ۲ | `staticData.gate` برای 29 `requireAnyRole` (یک خط هر کدام)؛ برای 45 `requirePermission` یک نوع gate `permission` لازم است که `RouteRoleGate.tsx:116-118` صراحتاً ساخته نشده | medium |
| **R6** | TRUNCATE برای authenticated روی 216 جدول (537 روی این DB اعمال نشده) | هر کسی با اتصال SQL به نقش authenticated | حذف کامل داده، شامل ردیف‌هایی که production staff در incident نوشته‌اند | **نه از PostgREST** (فعل TRUNCATE ندارد، assertion)؛ فقط اتصال مستقیم | measured: `q12-538pred.sql` | اعمال 537 روی `afrakala` با اجازهٔ مالک + ثبت ledger (قاعدهٔ 2b) | small |
| **R7** | `daily_capital_settings` با `qual=true` | authenticated غیر-viewer | پول: `total_capital` روزانه (19 ردیف) | صفحه gate دارد، پس API | measured: 19/19 برای sales | policy SELECT با نقش‌های accounting | small |
| **R8** | `role_permissions` خوانا (S3) | authenticated غیر-viewer، شامل بی‌نقش | پیکربندی امنیتی | UI (کلاینت خودش می‌خواند) | بخش ۴ | RPC که فقط ردیف‌های نقش‌های caller را برگرداند + policy محدود | medium |
| **R9** | rate limit bot در خطای DB fail-open؛ lookup slug در upsert خطا را نادیده می‌گیرد | دارندهٔ کلید bot (یا anon برای سقف تلاش ناموفق) | در دسترس بودن و یک قاعدهٔ یکپارچگی داده | API | cited: `bot-api.ts:83-86`؛ `rows.upsert.ts:184-188` | fail-closed یا سقف محلی در حافظه؛ بررسی `error` | small |
| **R10** | بقیهٔ 33 policy `qual=true` + 12 policy «در عمل true» | authenticated (و anon برای 3 کاتالوگ) | کاتالوگ، محتوا، پیکربندی غیرحساس، نگاشت extension→کارمند (9 ردیف) | UI و API | بخش ۳ | فقط جایی که تصمیم مالک «غیرعمومی» باشد | small هر کدام |
| **R11** | S4 fallback نهفته + oracle `has_dynamic_permission(_user_id دلخواه)` | authenticated | اطلاعات مجوز | API | بخش ۵ | fallback را `RETURN false` کردن بعد از اثبات کامل بودن ماتریس؛ یا نادیده گرفتن `_user_id` غیر از `uid()` | small |

---

## ۷. آنچه نتوانستم اندازه بگیرم

| # | چه چیزی | چرا | چه چیزی قطعی‌اش می‌کند |
|---|---|---|---|
| U1 | رندر واقعی 58 route روی بار سرد با نشست `sales` | ممنوعیت «nothing that touches the running stack»؛ هیچ درخواست HTTP به `:3100` زده نشد | Playwright با storage-state یک کاربر sales: `page.goto('/admin/automation')` بدون ناوبری قبلی؛ assert که `data-testid="route-gate-denied"` نیست و عنوان صفحه دیده می‌شود. همان spec برای یک route gate‌دار به‌عنوان control |
| U2 | اینکه عمل‌های نوشتنی در صفحه‌های ALLOWS روی سرور رد می‌شوند | برای هر RPC باید `pg_get_functiondef` و policy جدول هدف خوانده شود؛ فقط `/admin/automation` کامل بررسی شد | برای هر `data_sources` در جدول ۲.۳ که RPC یا نوشتن دارد: شبیه‌سازی JWT sales داخل `BEGIN … ROLLBACK` — **روی یک کپی دیتابیس، نه `afrakala`**، چون حتی نوشتن rollback‌شده خلاف قاعدهٔ این مأموریت است |
| U3 | اینکه کاربر anon یا حساب inactive روی بار سرد به صفحه‌های `_app` بدون gate می‌رسد (`_app.tsx:143-219`) | اجرای مرورگر لازم است (U1) | Playwright بدون نشست روی `/dashboard` و با نشست یک حساب `inactive` |
| U4 | اینکه مقدار `didar_api_key` کلید واقعی و فعال است | چاپ یا استفاده از آن ممنوع است؛ فقط طول (16) و شکل غیر-placeholder اندازه شد | مالک در پنل Didar بررسی کند؛ در هر صورت rotate |
| U5 | اینکه حساب‌های inactive/rejected واقعاً می‌توانند وارد شوند | فقط وضعیت `auth.users` اندازه شد (تأییدشده، ban‌نشده، رمز دارد)؛ ورود واقعی تست نشد | `POST /auth/v1/token?grant_type=password` روی یک حساب آزمایشی inactive روی محیطی غیر از این box |
| U6 | وضعیت S1–S4، K1، K3 روی production | .10 خارج از محدوده | همان `q1`، `q3`، `q5`، `q7`، `q11`، `q12` روی `postgres` در production با اجازهٔ مالک (همه SELECT و read-only) |
| U7 | اینکه 6 serverFn بدون احراز هویت (`lib/accounting/functions.ts`، `lib/invoices/functions.ts`) در bundle سرور هستند | build ممنوع بود (image work) و worktree `node_modules` ندارد | `grep -rl "recordPaymentFn\|createInvoiceFn" .output/` در یک build محلی خارج از docker |
| U8 | مقایسهٔ زمان‌ثابت secret در ۴ hook، و ادعاهای handlerها غیر از دو مورد fail-open | توسط نمونهٔ خواندن گزارش شد؛ من فقط `bot-api.ts:83-86` و `rows.upsert.ts:184-188` را بازبینی کردم | خواندن `file:line`های ذکرشده در `scratchpad/outC.json` |
| U9 | viewer-only همهٔ 93 شخص را می‌بیند در حالی که sales فقط 21 (`persons_select_by_visibility_scope` → `can_read_person_scoped`) | خارج از S1–S4؛ فقط شمارش شد، نیت بررسی نشد | خواندن `can_read_person_scoped` و ردیف `viewer::persons` در `role_permissions` |
| U10 | اینکه route `public.sale-lists.$listId` برای anon چه داده‌ای می‌دهد و آیا `lib/public/get-public-sale-list.ts` کلیدهای `shop_settings` را هم برمی‌گرداند | نمونهٔ خواندن آن را PUBLIC-BY-DESIGN دانست؛ مسیر داده تا انتها دنبال نشد | خواندن `get-public-sale-list.ts` و RPC آن |

---

## پیوست — فایل‌ها و دستورها

اسکریپت‌ها در scratchpad نشست ماندند و commit نشدند:
- **route:** `classify-routes.mjs`، `verdict-routes.mjs`، `gen-tables.mjs`، `outA.json`، `outB.json`، `outC.json`، `outD.json`.
- **policy:** `q3-policies.sql` → `policies.csv` (652)، `analyze-policies.mjs`، `gen-s2.mjs`.
- **persona:** `gen-persona.mjs` → `q5-personas.sql` → `q5-table.tsv`؛ `gen-q11.mjs` → `q11.sql`.
- **context:** `q1-context.sql`، `q2-users.sql`، `q4-ctx.sql`، `q6-views.sql`، `q7-modules.sql`، `q9-more.sql`، `q10.sql`، `q12-538pred.sql`، `q13.sql`.

همهٔ اجراهای DB exit code 0 داشتند، جز یک اجرا:
- اجرای اول `q9` با exit 3 شکست خورد (`column "name" does not exist` در ledger)؛ query اصلاح و دوباره اجرا شد.
- اجرای اول `q10` هم به‌خاطر حذف `\gset` در heredoc خطای نحوی داد؛ exit آن 0 بود چون `ON_ERROR_STOP=0` بود. هر بلوک rollback شد، هیچ دادهٔ آن استفاده نشد و با `gen-q11.mjs` دوباره اجرا شد.
