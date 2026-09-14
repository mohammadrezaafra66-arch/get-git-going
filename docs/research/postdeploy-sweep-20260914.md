# بررسی پس از استقرار — RELEASE-20260914 روی production

- تاریخ: 2026-09-14، بازهٔ اجرا 12:55Z تا 13:15Z
- ماشین: production laptop، `http://192.168.170.10:3000`، checkout `main @ a935be0b`
- image `sha256:b67d27106ce4…`، `APP_GIT_SHA=a935be0b`، `APP_BUILD_TIME=2026-09-14T11:18:55Z` — برابر با HEAD، پیش از هر درخواست خودم بررسی شد
- ماهیت: **فقط خواندنی**. هیچ form، هیچ کلید ذخیره/ایجاد/حذف، هیچ migration، هیچ restart. به `192.168.170.8` هیچ درخواستی ارسال نشد.
- کد: `scripts/postdeploy/` (mint-session، pass1، pass2، classify)

## ۱. خلاصه

**۲۱۲ route** (A=13، B=181، C=18). همهٔ ۲۱۲ route حکم گرفتند:
`OK 139 · GUARD 42 · NOT EXERCISED 18 · BROKEN 6 · EMPTY 4 · AUTH 3 · ERROR 0`

- **BROKEN (۵ مورد واقعی و ۱ مورد مورد انتظار):**
  - `PGRST200`: `/accounting/receipts/$receiptId`، `/pricing/amin-hozoor-board`
  - `57014` statement timeout: `/audit-logs`، `/admin/audit`، `/bot-api-keys/usage`
  - مورد انتظار: `/.lovable/oauth/consent` بدون `authorization_id`
- **خطاهای سراسری روی همهٔ صفحه‌های داخل برنامه:**
  - `v_pricing_recompute_queue_summary` با `500` / `57014` برمی‌گردد (۲۰۰ از ۲۰۰ درخواست در لاگ `rest`).
  - دو GET با URL حدود ۱۰٬۲۰۰ کاراکتری روی `products` و `product_owner_assignments` با `OPTIONS 414` و سپس `GET 503` شکست می‌خورند.
- **ادعاهای انتشار:**
  - ۴.۱ «پخش حساب» و ۴.۲ ستون «کارشناس فروش»: **اثبات شدند** (در Chrome اپراتور).
  - ۴.۳ ارقام فارسی: **در صفحه‌های حسابداری اثبات شد، نه در همه‌جا**.
  - ۴.۴ نبودن banner: **اثبات شد** (۱۸۸ صفحه در headless و ۶ صفحه در Chrome).
- `__APP_RUNTIME_CONFIG__` روی همهٔ ۱۸۴ پاسخ HTML در SSR و همهٔ ۱۸۸ صفحهٔ browser دقیقاً **یک بار** آمده و `supabaseUrl=http://192.168.170.10:8000` است. هیچ درخواستی به `192.168.170.8` یا `kong` نرفت.
- **GUARD یعنی اثبات‌نشده، نه سالم:** دادهٔ آن صفحه از RPC/POST می‌آید و guard فقط‌خواندنی آن را قطع کرده است.

## روش

**چرا دو گذر؟** `_app.beforeLoad` در SSR احراز هویت را رد می‌کند (`if (typeof window === "undefined") return;`) و session در `localStorage` مرورگر است. پس GET خام با session و بدون session **بایت‌به‌بایت یکسان** است: همان صفحهٔ «در حال بررسی جلسه کاربری...»، مثلاً ۱۸٬۷۱۲ بایت برای `/accounting/receivables`.

1. **گذر ۱ (SSR):** GET خام، بدون session و بدون دنبال‌کردن redirect، روی ۲۰۵ route. نتیجه: status، زمان، حجم، `__APP_RUNTIME_CONFIG__`، banner کهربایی/قرمز در HTML و رشته‌های خطا.
2. **گذر ۲ (headless Chromium):**
   - روی ۱۸۸ route (۷ صفحهٔ A و ۱۸۱ صفحهٔ B)، با session یک‌ساعته برای `8ff55610-…` (ادمین active و ban‌نشدهٔ خود اپراتور).
   - هم‌زمانی ۴ و انتظار تا کامل‌شدن hydration و `networkidle`.
   - **guard:** هر درخواست غیر `GET/HEAD` و هر host غیر از `192.168.170.10:3000/:8000` پیش از خروج از مرورگر abort شد. `navigator.sendBeacon` غیرفعال و service worker مسدود بود.
   - guard واقعاً به کار آمد: heartbeat حضور (`PATCH /rest/v1/profiles`) روی همهٔ ۱۸۸ صفحه و `refresh_sale_list_prices` (نوشتنی) قطع شدند.
3. **Chrome اپراتور:** فقط بارگذاری صفحه، خواندن DOM و خواندن network. هیچ کلیک و هیچ form. شش صفحهٔ حسابداری بررسی شد.
   - این بارگذاری‌ها، مثل هر بار باز شدن صفحه توسط کارکنان، heartbeat `PATCH profiles` خود برنامه را فرستادند.
   - RPCهای دادهٔ این صفحه‌ها STABLE هستند و DML ندارند (بررسی read-only روی `pg_proc`): `get_receivables_list`، `get_receivables_summary`، `get_payables_list`، `list_allocation_rows`، `compute_daily_capital`، `can_issue_customer_invoice`، `is_user_online`.
4. **id واقعی برای routeهای پارامتری:** یک `SELECT … LIMIT 1` در تراکنش `READ ONLY` روی DB `postgres`. `academy_lessons` و `knowledge_documents` روی production ردیفی ندارند، پس برای آن‌ها UUID صفر به کار رفت.

**routeهایی که عمداً صدا زده نشدند:**
- ۴ route GET ربات: `logBotUsage()` پیش از احراز هویت در `bot_api_usage_logs` می‌نویسد و `bot_check_rate_limit` را صدا می‌زند.
- ۳ route MCP: در `@lovable.dev/mcp-js` متریک به‌طور پیش‌فرض `enabled: true` است و `LOVABLE_API_KEY` در container تنظیم شده، پس حتی GET ردشده ممکن است telemetry POST به سرویس بیرونی بفرستد.
- ۱۱ route API فقط POST/PATCH دارند. GET آن‌ها SPA fallback برمی‌گرداند و handler اجرا نمی‌شود، پس حکم NOT EXERCISED گرفتند.

## ۲. جدول کامل routeها

ستون‌ها:
- `SSR` = گذر ۱
- `browser` = گذر ۲
- `main chars` = طول متن `<main>` پس از hydration
- `Latin / Persian digits` = شمار ارقام در متن رندرشده؛ **شمارش است، نه حکم**، چون id، مدل کالا و شمارهٔ تلفن هم در آن هست

| # | route | grp | SSR status | SSR ms | SSR bytes | browser status | browser ms | main chars | Latin / Persian digits | verdict | note |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/` | A | 200 | 11 | 6680 | 200 | 10407 | 541 | 3 / 56 | **OK** | redirects to /dashboard |
| 2 | `/.lovable/oauth/consent` | A | 307 | 18 | 0 | 200 | 2576 | 95 | 0 / 0 | **BROKEN** | «Missing authorization_id» — expected with no OAuth request id |
| 3 | `/.mcp/invoke-tool/$tool` | A | — | — | — | — | — | — | — | **NOT EXERCISED** | mcp-js metrics enabled + LOVABLE_API_KEY set: a GET may emit an outbound telemetry POST |
| 4 | `/.mcp/list-tools` | A | — | — | — | — | — | — | — | **NOT EXERCISED** | mcp-js metrics enabled + LOVABLE_API_KEY set: a GET may emit an outbound telemetry POST |
| 5 | `/.well-known/oauth-protected-resource` | A | 200 | 30 | 184 | — | — | — | — | **OK** | {"resource":"http://192.168.170.10:3000/mcp","authorization_servers":["https://afrakala-te |
| 6 | `/academy` | B | 200 | 43 | 18008 | 200 | 11170 | 187 | 3 / 0 | **OK** |  |
| 7 | `/academy/$courseId` | B | 200 | 30 | 18196 | 200 | 11631 | 95 | 3 / 0 | **EMPTY** | no rows exist on production; sentinel id → not-found state |
| 8 | `/academy/$courseId/$lessonId` | B | 200 | 22 | 18287 | 200 | 11614 | 94 | 3 / 0 | **EMPTY** | no rows exist on production; sentinel id → not-found state |
| 9 | `/academy/$courseId/$lessonId/quiz` | B | 200 | 31 | 18300 | 200 | 10764 | 112 | 3 / 0 | **EMPTY** | no rows exist on production; sentinel id → not-found state |
| 10 | `/academy/manage` | B | 200 | 39 | 18592 | 200 | 10837 | 169 | 3 / 0 | **OK** |  |
| 11 | `/accounting/allocation-workbench` | B | 200 | 18 | 18679 | 200 | 12010 | 628 | 3 / 9 | **OK** | headless: data RPC aborted by guard; Chrome (operator session): overdue receivables/payables totals + 50 receivable rows |
| 12 | `/accounting/bank-accounts` | B | 200 | 10 | 18510 | 200 | 11991 | 338 | 30 / 0 | **OK** |  |
| 13 | `/accounting/customer-capital-allocations` | B | 307 | 18 | 0 | 200 | 14783 | 1534 | 3 / 282 | **OK** | headless: data RPC aborted by guard; Chrome (operator session): redirect target /accounting/dynamic-capital verified |
| 14 | `/accounting/daily-capital` | B | 307 | 30 | 0 | 200 | 11614 | 1534 | 3 / 282 | **OK** | headless: data RPC aborted by guard; Chrome (operator session): redirect target /accounting/dynamic-capital verified |
| 15 | `/accounting/documents` | B | 200 | 91 | 18328 | 200 | 12601 | 2842 | 3 / 955 | **OK** |  |
| 16 | `/accounting/dynamic-capital` | B | 200 | 11 | 18942 | 200 | 12576 | 1534 | 3 / 282 | **OK** | headless: data RPC aborted by guard; Chrome (operator session): 17 snapshot rows |
| 17 | `/accounting/external-parties` | B | 200 | 10 | 18249 | 200 | 11386 | 271 | 28 / 0 | **OK** |  |
| 18 | `/accounting/mutual-settlement` | B | 200 | 30 | 18746 | 200 | 14843 | 217 | 3 / 0 | **OK** | headless: data RPC aborted by guard; Chrome (operator session): 7 rows |
| 19 | `/accounting/payables` | B | 200 | 10 | 18883 | 200 | 12341 | 599 | 3 / 31 | **OK** | headless: data RPC aborted by guard; Chrome (operator session): 9 rows |
| 20 | `/accounting/payment-vouchers` | B | 200 | 36 | 18379 | 200 | 12360 | 845 | 3 / 147 | **OK** |  |
| 21 | `/accounting/purchase-payments` | B | 200 | 37 | 19118 | 200 | 11308 | 1569 | 71 / 154 | **GUARD** | data path uses non-GET (aborted): POST get_account_balances |
| 22 | `/accounting/receipts` | B | 200 | 27 | 19027 | 200 | 11232 | 982 | 3 / 240 | **OK** |  |
| 23 | `/accounting/receipts/$receiptId` | B | 200 | 47 | 20399 | 200 | 15852 | 1068 | 20 / 115 | **BROKEN** | PGRST200 payment_receipt_links↔invoices |
| 24 | `/accounting/receipts/create` | B | 200 | 27 | 20735 | 200 | 15896 | 949 | 7 / 0 | **OK** |  |
| 25 | `/accounting/receipts/training` | B | 200 | 26 | 18294 | 200 | 11323 | 4834 | 3 / 16 | **OK** |  |
| 26 | `/accounting/receivables` | B | 200 | 7 | 18712 | 200 | 11349 | 555 | 3 / 31 | **OK** | headless: data RPC aborted by guard; Chrome (operator session): 50 rows, header «کارشناس فروش» |
| 27 | `/accounting/salesperson-capital-allocations` | B | 307 | 22 | 0 | 200 | 12926 | 1534 | 3 / 282 | **OK** | headless: data RPC aborted by guard; Chrome (operator session): redirect target /accounting/dynamic-capital verified |
| 28 | `/accounting/salesperson-scoring` | B | 200 | 47 | 19400 | 200 | 4409 | 339 | 3 / 0 | **GUARD** | data path uses non-GET (aborted): POST c3802fa1fef2e7158b60aaa7a95c2c08ca560b48 |
| 29 | `/accounting/treasury` | B | 200 | 32 | 18605 | 200 | 12076 | 363 | 3 / 3 | **OK** | headless: data RPC aborted by guard; Chrome (operator session): 2 accounts, totals |
| 30 | `/admin/ai-providers` | B | 200 | 46 | 19166 | 200 | 11549 | 3231 | 36 / 12 | **OK** |  |
| 31 | `/admin/asan-export` | B | 200 | 8 | 18922 | 200 | 11128 | 662 | 3 / 3 | **OK** |  |
| 32 | `/admin/asan-import` | B | 200 | 8 | 18513 | 200 | 12134 | 582 | 3 / 1 | **OK** |  |
| 33 | `/admin/audit` | B | 200 | 33 | 18303 | 200 | 11348 | 229 | 3 / 0 | **BROKEN** | 57014 statement timeout on audit_logs; stuck on «در حال بارگذاری…» |
| 34 | `/admin/automation` | B | 200 | 24 | 18526 | 200 | 11817 | 1099 | 6 / 4 | **OK** |  |
| 35 | `/admin/call-extensions` | B | 200 | 36 | 18231 | 200 | 14629 | 885 | 45 / 48 | **OK** |  |
| 36 | `/admin/delivery-receipts` | B | 200 | 33 | 19061 | 200 | 11909 | 284 | 3 / 5 | **GUARD** | error text after guard aborted: POST get_delivery_receipts |
| 37 | `/admin/documents` | B | 200 | 29 | 19007 | 200 | 11907 | 262 | 3 / 5 | **GUARD** | error text after guard aborted: POST get_documents |
| 38 | `/admin/gamification` | B | 307 | 22 | 0 | 200 | 12386 | 940 | 3 / 4 | **GUARD** | data path uses non-GET (aborted): POST admin_gamification_overview; redirects to /gamification/admin |
| 39 | `/admin/gamification/achievements` | B | 307 | 5 | 0 | 200 | 11679 | 940 | 3 / 4 | **GUARD** | data path uses non-GET (aborted): POST admin_gamification_overview; redirects to /gamification/admin |
| 40 | `/admin/marketing-channels` | B | 200 | 36 | 18476 | 200 | 12146 | 5388 | 874 / 0 | **OK** |  |
| 41 | `/admin/marketing-task-templates` | B | 200 | 25 | 18572 | 200 | 12804 | 13514 | 620 / 6 | **OK** |  |
| 42 | `/admin/payment-terms` | B | 200 | 38 | 18129 | 200 | 12312 | 406 | 17 / 0 | **OK** |  |
| 43 | `/admin/penalties` | B | 200 | 20 | 18807 | 200 | 11843 | 499 | 3 / 20 | **OK** |  |
| 44 | `/admin/person-fields` | B | 200 | 22 | 18331 | 200 | 12154 | 447 | 3 / 0 | **OK** |  |
| 45 | `/admin/persons-cleanup` | B | 200 | 27 | 18611 | 200 | 12149 | 11071 | 114 / 1632 | **OK** |  |
| 46 | `/admin/phone-collisions` | B | 200 | 32 | 17974 | 200 | 12365 | 500 | 16 / 1 | **OK** |  |
| 47 | `/admin/platform-releases` | B | 200 | 29 | 18465 | 200 | 12089 | 783 | 3 / 44 | **OK** |  |
| 48 | `/admin/profile-fields` | B | 200 | 8 | 18500 | 200 | 11259 | 442 | 3 / 0 | **OK** |  |
| 49 | `/admin/purchase` | B | 200 | 50 | 20902 | 200 | 11787 | 518 | 3 / 5 | **GUARD** | error text after guard aborted: POST get_purchase_assignee_options, POST get_purchase_requests |
| 50 | `/admin/receipt-fields` | B | 200 | 31 | 18410 | 200 | 11318 | 0 | 0 / 0 | **AUTH** | redirected to /unauthorized: «دسترسی غیرمجاز» |
| 51 | `/admin/recent-purchase-settings` | B | 200 | 6 | 17994 | 200 | 14754 | 384 | 3 / 3 | **OK** |  |
| 52 | `/admin/roles` | B | 200 | 8 | 18461 | 200 | 11073 | 559 | 14 / 0 | **OK** |  |
| 53 | `/admin/sales-reminders` | B | 200 | 30 | 18317 | 200 | 11072 | 508 | 3 / 5 | **OK** |  |
| 54 | `/admin/settings` | B | 200 | 14 | 18102 | 200 | 11687 | 548 | 3 / 8 | **OK** |  |
| 55 | `/admin/system-health` | B | 200 | 27 | 18505 | 200 | 11065 | 756 | 3 / 0 | **GUARD** | error text after guard aborted: POST person_fk_drift_report, POST polymorphic_ref_orphan_report |
| 56 | `/admin/validation-rules` | B | 200 | 32 | 18416 | 200 | 11768 | 430 | 3 / 0 | **OK** |  |
| 57 | `/admin/visitors` | B | 200 | 9 | 18104 | 200 | 11163 | 216 | 3 / 0 | **OK** |  |
| 58 | `/admin/workflow-settings` | B | 200 | 20 | 18357 | 200 | 11444 | 176 | 3 / 0 | **GUARD** | error text after guard aborted: POST get_workflow_settings |
| 59 | `/admin/workflow-stages` | B | 200 | 7 | 17865 | 200 | 11392 | 457 | 11 / 0 | **OK** |  |
| 60 | `/api-keys` | B | 200 | 21 | 18252 | 200 | 11581 | 2987 | 161 / 471 | **OK** |  |
| 61 | `/api/admin/automation/torob/enqueue` | C | 200 | 26 | 6458 | — | — | — | — | **NOT EXERCISED** | no GET handler; GET returned SPA fallback 200, handler not run |
| 62 | `/api/admin/calls/import-issabel` | C | 200 | 15 | 6450 | — | — | — | — | **NOT EXERCISED** | no GET handler; GET returned SPA fallback 200, handler not run |
| 63 | `/api/healthz` | C | 200 | 26 | 144 | — | — | — | — | **OK** | {"ok":true,"status":"healthy","checks":{"database":{"state":"up","ms":6},"whatsapp":{"stat |
| 64 | `/api/messenger/ai-chat` | C | 200 | 20 | 6432 | — | — | — | — | **NOT EXERCISED** | no GET handler; GET returned SPA fallback 200, handler not run |
| 65 | `/api/public/bot/dynamic-tables/$tableId/rows` | C | — | — | — | — | — | — | — | **NOT EXERCISED** | GET inserts bot_api_usage_logs + calls bot_check_rate_limit before auth |
| 66 | `/api/public/bot/dynamic-tables/$tableId/rows/$rowId` | C | 307 | 32 | 0 | — | — | — | — | **NOT EXERCISED** | no GET handler; GET returned SPA fallback 307, handler not run |
| 67 | `/api/public/bot/dynamic-tables/$tableId/rows/upsert` | C | 200 | 7 | 6683 | — | — | — | — | **NOT EXERCISED** | no GET handler; GET returned SPA fallback 200, handler not run |
| 68 | `/api/public/bot/dynamic-tables/by-slug/$slug` | C | — | — | — | — | — | — | — | **NOT EXERCISED** | GET inserts bot_api_usage_logs + calls bot_check_rate_limit before auth |
| 69 | `/api/public/bot/market-matches/candidates/upsert` | C | 200 | 26 | 6484 | — | — | — | — | **NOT EXERCISED** | no GET handler; GET returned SPA fallback 200, handler not run |
| 70 | `/api/public/bot/market-matches/resolve` | C | 200 | 27 | 6464 | — | — | — | — | **NOT EXERCISED** | no GET handler; GET returned SPA fallback 200, handler not run |
| 71 | `/api/public/bot/products` | C | — | — | — | — | — | — | — | **NOT EXERCISED** | GET inserts bot_api_usage_logs + calls bot_check_rate_limit before auth |
| 72 | `/api/public/bot/products/$productId` | C | — | — | — | — | — | — | — | **NOT EXERCISED** | GET inserts bot_api_usage_logs + calls bot_check_rate_limit before auth |
| 73 | `/api/public/hooks/generate-marketing-tasks` | C | 200 | 7 | 6472 | — | — | — | — | **NOT EXERCISED** | no GET handler; GET returned SPA fallback 200, handler not run |
| 74 | `/api/public/hooks/import-issabel-calls` | C | 200 | 9 | 6464 | — | — | — | — | **NOT EXERCISED** | no GET handler; GET returned SPA fallback 200, handler not run |
| 75 | `/api/public/hooks/ingest-market-rates` | C | 200 | 26 | 6462 | — | — | — | — | **NOT EXERCISED** | no GET handler; GET returned SPA fallback 200, handler not run |
| 76 | `/api/public/hooks/process-pricing-queue` | C | 200 | 5 | 6466 | — | — | — | — | **NOT EXERCISED** | no GET handler; GET returned SPA fallback 200, handler not run |
| 77 | `/api/public/products` | C | 200 | 12 | 42260 | — | — | — | — | **OK** | {"products":[{"id":"ff1da231-c434-42c3-9f1b-68e909f13808","name":"اتوبخارگر کوخ مدل KSI207 |
| 78 | `/api/version` | C | 200 | 6 | 181 | — | — | — | — | **OK** | {"ok":true,"app":"myafrakala.ir","environment":"lan","commit":"a935be0b","commitShort":"a9 |
| 79 | `/audit-logs` | B | 200 | 11 | 17720 | 200 | 11500 | 162 | 3 / 0 | **BROKEN** | 57014 statement timeout on audit_logs; stuck on «در حال بارگذاری...» |
| 80 | `/bot-api-keys` | B | 200 | 34 | 19267 | 200 | 11775 | 5523 | 195 / 626 | **GUARD** | data path uses non-GET (aborted): POST bot_key_stats_today |
| 81 | `/bot-api-keys/` | B | 307 | 3 | 0 | 200 | 11253 | 5523 | 195 / 626 | **GUARD** | data path uses non-GET (aborted): POST bot_key_stats_today |
| 82 | `/bot-api-keys/docs` | B | 200 | 12 | 18815 | 200 | 14930 | 14569 | 648 / 33 | **OK** |  |
| 83 | `/bot-api-keys/playground` | B | 200 | 27 | 18759 | 200 | 11657 | 321 | 3 / 0 | **OK** |  |
| 84 | `/bot-api-keys/usage` | B | 200 | 47 | 18662 | 200 | 11807 | 600 | 3 / 5 | **BROKEN** | 57014 statement timeout on bot_api_usage_logs |
| 85 | `/collaboration` | B | 200 | 31 | 17767 | 200 | 11216 | 333 | 3 / 12 | **OK** |  |
| 86 | `/dashboard` | B | 200 | 8 | 18346 | 200 | 11335 | 541 | 3 / 56 | **OK** |  |
| 87 | `/data-tables/` | B | 307 | 24 | 0 | 200 | 11791 | 1012 | 3 / 47 | **OK** |  |
| 88 | `/data-tables/$tableId` | B | 200 | 25 | 19482 | 200 | 11506 | 1788 | 3 / 3 | **GUARD** | data path uses non-GET (aborted): POST query_dynamic_table_rows, POST query_dynamic_table_rows_v2 |
| 89 | `/data-tables/new` | B | 200 | 29 | 18585 | 200 | 11291 | 438 | 3 / 0 | **OK** |  |
| 90 | `/delivery-receipts` | B | 200 | 10 | 19835 | 200 | 11734 | 205 | 3 / 0 | **GUARD** | error text after guard aborted: POST get_delivery_receipts |
| 91 | `/documents` | B | 200 | 36 | 19575 | 200 | 12364 | 181 | 3 / 0 | **GUARD** | error text after guard aborted: POST get_documents |
| 92 | `/feedback` | B | 200 | 24 | 18380 | 200 | 11402 | 501 | 5 / 36 | **OK** |  |
| 93 | `/feedback/$feedbackId` | B | 200 | 39 | 18639 | 200 | 11564 | 473 | 4 / 6 | **OK** |  |
| 94 | `/feedback/create` | B | 200 | 30 | 18663 | 200 | 11437 | 402 | 3 / 3 | **OK** |  |
| 95 | `/gamification` | B | 200 | 28 | 18450 | 200 | 3428 | 320 | 3 / 34 | **GUARD** | data path uses non-GET (aborted): POST get_employee_progress, POST get_employee_rank |
| 96 | `/gamification/achievements` | B | 200 | 29 | 18853 | 200 | 11485 | 593 | 3 / 40 | **OK** |  |
| 97 | `/gamification/admin/` | B | 307 | 27 | 0 | 200 | 3554 | 930 | 3 / 0 | **GUARD** | data path uses non-GET (aborted): POST admin_gamification_overview |
| 98 | `/gamification/admin/achievements` | B | 200 | 35 | 19699 | 200 | 11661 | 781 | 43 / 135 | **OK** |  |
| 99 | `/gamification/admin/analytics` | B | 200 | 28 | 19936 | 200 | 14761 | 696 | 3 / 2 | **GUARD** | error text after guard aborted: POST gamification_analytics_achievements, POST gamification_analytics_active_season, POST gamification_analytics_employees |
| 100 | `/gamification/admin/kpi-rules` | B | 200 | 30 | 19408 | 200 | 11405 | 1162 | 19 / 143 | **OK** |  |
| 101 | `/gamification/admin/leagues` | B | 200 | 39 | 20004 | 200 | 15159 | 484 | 64 / 0 | **OK** |  |
| 102 | `/gamification/admin/manual-metrics` | B | 200 | 26 | 19899 | 200 | 12331 | 921 | 3 / 7 | **GUARD** | data path uses non-GET (aborted): POST staff_call_metrics_coverage |
| 103 | `/gamification/admin/manual-metrics/guide` | B | 200 | 7 | 18153 | 200 | 14671 | 3703 | 3 / 12 | **OK** |  |
| 104 | `/gamification/admin/missions` | B | 200 | 43 | 19679 | 200 | 11393 | 621 | 16 / 52 | **OK** |  |
| 105 | `/gamification/admin/purchase-settings` | B | 200 | 20 | 19172 | 200 | 12261 | 966 | 3 / 50 | **OK** |  |
| 106 | `/gamification/admin/rewards` | B | 200 | 9 | 19882 | 200 | 12404 | 469 | 3 / 0 | **OK** |  |
| 107 | `/gamification/leaderboard` | B | 200 | 24 | 19028 | 200 | 12387 | 193 | 3 / 0 | **GUARD** | data path uses non-GET (aborted): POST get_leaderboard_monthly, POST get_rank_neighbors |
| 108 | `/gamification/league` | B | 200 | 8 | 19491 | 200 | 12339 | 339 | 3 / 0 | **GUARD** | data path uses non-GET (aborted): POST get_current_league, POST get_league_leaderboard |
| 109 | `/gamification/settings` | B | 200 | 24 | 19901 | 200 | 12626 | 2922 | 3 / 21 | **OK** |  |
| 110 | `/integrations/didar` | B | 307 | 3 | 0 | 200 | 12511 | 688 | 3 / 9 | **OK** | redirects to /operations/didar |
| 111 | `/knowledge` | B | 200 | 7 | 18889 | 200 | 12486 | 243 | 3 / 0 | **OK** |  |
| 112 | `/knowledge/$documentId` | B | 200 | 34 | 18206 | 200 | 11545 | 129 | 3 / 0 | **EMPTY** | no rows exist on production; sentinel id → not-found state |
| 113 | `/knowledge/manage` | B | 200 | 8 | 19184 | 200 | 11375 | 188 | 3 / 0 | **OK** |  |
| 114 | `/login` | A | 200 | 21 | 15162 | 200 | 2391 | 196 | 0 / 0 | **OK** |  |
| 115 | `/market-matches` | B | 200 | 29 | 18684 | 200 | 11743 | 377 | 3 / 3 | **OK** |  |
| 116 | `/marketing/my-tasks` | B | 200 | 4 | 18082 | 200 | 12566 | 261 | 3 / 8 | **OK** |  |
| 117 | `/marketing/suggestions` | B | 200 | 27 | 18659 | 200 | 11421 | 374 | 3 / 3 | **GUARD** | error text after guard aborted: POST compute_promotion_scores |
| 118 | `/marketing/suggestions-history` | B | 200 | 32 | 18503 | 200 | 11515 | 0 | 0 / 0 | **AUTH** | redirected to /unauthorized: «دسترسی غیرمجاز» |
| 119 | `/mcp` | A | — | — | — | — | — | — | — | **NOT EXERCISED** | mcp-js metrics enabled + LOVABLE_API_KEY set: a GET may emit an outbound telemetry POST |
| 120 | `/messages` | B | 200 | 13 | 19798 | 200 | 11611 | 144 | 3 / 0 | **OK** |  |
| 121 | `/messages/inquiries` | B | 200 | 33 | 20438 | 200 | 12602 | 145 | 3 / 0 | **OK** |  |
| 122 | `/my-penalties` | B | 200 | 7 | 18130 | 200 | 12686 | 200 | 3 / 2 | **GUARD** | error text after guard aborted: POST get_user_penalties |
| 123 | `/my-rejected-quotes` | B | 200 | 6 | 17858 | 200 | 11790 | 235 | 3 / 0 | **GUARD** | error text after guard aborted: POST get_my_rejected_quotes |
| 124 | `/notifications` | B | 200 | 30 | 17925 | 200 | 12625 | 2886 | 310 / 0 | **OK** |  |
| 125 | `/operations/call-activity` | B | 200 | 30 | 18068 | 200 | 11201 | 351 | 3 / 3 | **OK** |  |
| 126 | `/operations/daily-mood` | B | 200 | 36 | 17975 | 200 | 11625 | 282 | 3 / 2 | **OK** |  |
| 127 | `/operations/daily-mood/admin` | B | 200 | 25 | 18888 | 200 | 11619 | 282 | 3 / 2 | **OK** |  |
| 128 | `/operations/didar` | B | 200 | 12 | 18644 | 200 | 14839 | 688 | 3 / 9 | **OK** |  |
| 129 | `/operations/purchase-advisor` | B | 200 | 32 | 18981 | 200 | 12326 | 287 | 3 / 0 | **OK** |  |
| 130 | `/operations/tasks` | B | 200 | 40 | 18042 | 200 | 11980 | 3512 | 296 / 40 | **GUARD** | data path uses non-GET (aborted): POST get_task_kpi_report |
| 131 | `/pending-approval` | A | 200 | 7 | 8708 | 200 | 2241 | 0 | 0 / 0 | **OK** |  |
| 132 | `/persons` | B | 200 | 38 | 18778 | 200 | 12420 | 262 | 3 / 3 | **GUARD** | error text after guard aborted: POST search_visible_persons |
| 133 | `/persons/$personId` | B | 200 | 26 | 19714 | 200 | 11441 | 137 | 3 / 0 | **GUARD** | error text after guard aborted: POST 6a2b8d21a8842e018ab2e2333ec84757dfe3ce6f |
| 134 | `/persons/$personId/edit` | B | 200 | 30 | 19987 | 200 | 14903 | 137 | 3 / 0 | **GUARD** | error text after guard aborted: POST 6a2b8d21a8842e018ab2e2333ec84757dfe3ce6f |
| 135 | `/persons/create` | B | 200 | 33 | 19622 | 200 | 12004 | 562 | 3 / 0 | **OK** |  |
| 136 | `/persons/merge` | B | 200 | 23 | 18119 | 200 | 12305 | 280 | 3 / 0 | **GUARD** | error text after guard aborted: POST person_merge_candidates_overview |
| 137 | `/popup-center` | B | 200 | 35 | 17644 | 200 | 11852 | 196 | 6 / 0 | **OK** |  |
| 138 | `/presence` | B | 200 | 29 | 18162 | 200 | 11467 | 185 | 3 / 0 | **OK** |  |
| 139 | `/pricing/` | B | 307 | 2 | 0 | 200 | 12537 | 1432 | 3 / 22 | **OK** |  |
| 140 | `/pricing/amin-hozoor-board` | B | 200 | 30 | 19735 | 200 | 12708 | 6787 | 682 / 1403 | **BROKEN** | PGRST200 pricing_board_access_requests↔profiles |
| 141 | `/pricing/attention` | B | 200 | 26 | 18043 | 200 | 14763 | 20375 | 2929 / 1117 | **OK** |  |
| 142 | `/pricing/calculator` | B | 200 | 36 | 18890 | 200 | 12007 | 422 | 3 / 0 | **OK** |  |
| 143 | `/pricing/change-reasons` | B | 200 | 28 | 18614 | 200 | 13115 | 544 | 3 / 0 | **OK** |  |
| 144 | `/pricing/currencies` | B | 200 | 29 | 18308 | 200 | 12714 | 439 | 7 / 0 | **OK** |  |
| 145 | `/pricing/currency-rates` | B | 200 | 33 | 18874 | 200 | 11660 | 2011 | 3 / 339 | **OK** |  |
| 146 | `/pricing/currency-sources` | B | 200 | 35 | 18932 | 200 | 11793 | 236 | 3 / 0 | **OK** |  |
| 147 | `/pricing/live-price-list` | B | 200 | 30 | 21377 | 200 | 13167 | 4987 | 244 / 859 | **GUARD** | data path uses non-GET (aborted): POST c5baaad06dd60e8d146b25c70a74045025eb759e |
| 148 | `/pricing/market-intelligence` | B | 200 | 31 | 19493 | 200 | 12881 | 3294 | 44 / 78 | **GUARD** | error text after guard aborted: POST 415b4f1f0f4d9aabb57d283dcc1d356897f3c011, POST mi_get_demand_growth, POST mi_get_emerging_products |
| 149 | `/pricing/market-rates-workshop` | B | 200 | 27 | 19465 | 200 | 11741 | 1152 | 4 / 12 | **OK** |  |
| 150 | `/pricing/my-workbench` | B | 200 | 31 | 21290 | 200 | 12740 | 821 | 3 / 20 | **OK** |  |
| 151 | `/pricing/owner-attention` | B | 200 | 28 | 18435 | 200 | 11504 | 235 | 3 / 1 | **OK** |  |
| 152 | `/pricing/price-alerts` | B | 200 | 32 | 18898 | 200 | 13138 | 287 | 3 / 0 | **OK** |  |
| 153 | `/pricing/product-recommendations` | B | 200 | 27 | 18219 | 200 | 12181 | 264 | 3 / 1 | **OK** |  |
| 154 | `/pricing/purchase-prices` | B | 200 | 33 | 19283 | 200 | 12306 | 2701 | 255 / 358 | **OK** |  |
| 155 | `/pricing/quick-price` | B | 200 | 8 | 18697 | 200 | 12054 | 456 | 3 / 0 | **OK** |  |
| 156 | `/pricing/recompute-prices` | B | 200 | 7 | 19446 | 200 | 12046 | 318 | 3 / 6 | **OK** |  |
| 157 | `/pricing/rules` | B | 200 | 28 | 18843 | 200 | 16521 | 1502 | 19 / 67 | **OK** |  |
| 158 | `/pricing/sale-lists` | B | 200 | 33 | 18048 | 200 | 11641 | 1226 | 31 / 168 | **OK** |  |
| 159 | `/pricing/sale-lists/$listId` | B | 200 | 32 | 20607 | 200 | 15217 | 168 | 3 / 0 | **GUARD** | error text after guard aborted: POST refresh_sale_list_prices |
| 160 | `/pricing/sale-lists/$listId/publish` | B | 200 | 25 | 20990 | 200 | 15023 | 168 | 3 / 0 | **GUARD** | error text after guard aborted: POST refresh_sale_list_prices |
| 161 | `/pricing/sale-lists/new` | B | 200 | 7 | 19414 | 200 | 17061 | 1868 | 262 / 13 | **OK** |  |
| 162 | `/pricing/sale-price-types` | B | 200 | 21 | 18712 | 200 | 12356 | 416 | 9 / 7 | **OK** |  |
| 163 | `/pricing/settlement-types` | B | 200 | 35 | 18340 | 200 | 12832 | 1306 | 45 / 42 | **OK** |  |
| 164 | `/pricing/shipping-rules` | B | 200 | 17 | 18882 | 200 | 13315 | 591 | 7 / 26 | **OK** |  |
| 165 | `/products/` | B | 307 | 9 | 0 | 200 | 13320 | 3421 | 284 / 284 | **GUARD** | data path uses non-GET (aborted): POST get_recent_purchase_labels |
| 166 | `/products/$id` | B | 200 | 44 | 22307 | 200 | 13621 | 1250 | 39 / 53 | **GUARD** | data path uses non-GET (aborted): POST calculate_adjusted_price, POST get_product_stats, POST get_product_timeline |
| 167 | `/products/attributes` | B | 200 | 11 | 18865 | 200 | 14134 | 5994 | 958 / 3 | **OK** |  |
| 168 | `/products/brands` | B | 200 | 33 | 18579 | 200 | 12791 | 719 | 36 / 0 | **OK** |  |
| 169 | `/products/categories` | B | 200 | 7 | 18875 | 200 | 12123 | 488 | 14 / 0 | **OK** |  |
| 170 | `/products/labels` | B | 200 | 23 | 18481 | 200 | 13283 | 453 | 16 / 0 | **OK** |  |
| 171 | `/products/new` | B | 200 | 8 | 20348 | 200 | 13166 | 1677 | 28 / 3 | **OK** |  |
| 172 | `/products/regenerate-names` | B | 200 | 8 | 18275 | 200 | 12923 | 502 | 3 / 0 | **OK** |  |
| 173 | `/public/sale-lists/$listId` | A | 404 | 38 | 8932 | — | — | — | — | **AUTH** | anon 404 by design: «این لیست برای بازدیدکنندگان در دسترس نیست»; browser pass skipped (loader calls writer refresh_sale_list_prices) |
| 174 | `/purchase` | B | 200 | 9 | 20868 | 200 | 12200 | 224 | 3 / 0 | **GUARD** | error text after guard aborted: POST get_purchase_requests |
| 175 | `/purchases` | B | 200 | 7 | 17823 | 200 | 15288 | 240 | 3 / 0 | **OK** |  |
| 176 | `/purchases/create` | B | 200 | 7 | 20112 | 200 | 12106 | 1629 | 10 / 5 | **OK** |  |
| 177 | `/register` | A | 200 | 11 | 15464 | 200 | 2692 | 453 | 0 / 1 | **OK** |  |
| 178 | `/reports` | B | 200 | 23 | 18183 | 200 | 14245 | 4120 | 410 / 251 | **GUARD** | error text after guard aborted: POST mi_get_emerging_products, POST mi_get_top_checked_today, POST mi_get_trending_products |
| 179 | `/reset-password` | A | 200 | 31 | 8833 | 200 | 2689 | 85 | 0 / 0 | **OK** |  |
| 180 | `/roles` | B | 200 | 32 | 17789 | 200 | 14967 | 1385 | 13 / 0 | **OK** |  |
| 181 | `/sales` | B | 200 | 26 | 18099 | 200 | 13840 | 514 | 3 / 0 | **OK** |  |
| 182 | `/sales/` | B | 307 | 2 | 0 | 200 | 14094 | 514 | 3 / 0 | **OK** |  |
| 183 | `/sales/credit-customers` | B | 200 | 8 | 18749 | 200 | 15246 | 516 | 3 / 4 | **GUARD** | error text after guard aborted: POST list_trusted_credit_customers |
| 184 | `/sales/credit-requests` | B | 200 | 22 | 18438 | 200 | 14645 | 423 | 3 / 0 | **OK** |  |
| 185 | `/sales/credit-rules` | B | 200 | 26 | 18767 | 200 | 14036 | 876 | 9 / 10 | **OK** |  |
| 186 | `/sales/customers` | B | 200 | 35 | 18319 | 200 | 14059 | 875 | 27 / 128 | **OK** |  |
| 187 | `/sales/customers/$customerId/credit` | B | 200 | 34 | 18801 | 200 | 16462 | 1275 | 9 / 68 | **GUARD** | data path uses non-GET (aborted): POST calculate_customer_realtime_credit, POST calculate_dynamic_score |
| 188 | `/sales/customers/$customerId/edit` | B | 200 | 14 | 20069 | 200 | 14762 | 660 | 3 / 0 | **GUARD** | data path uses non-GET (aborted): POST 6a2b8d21a8842e018ab2e2333ec84757dfe3ce6f |
| 189 | `/sales/customers/create` | B | 200 | 28 | 19290 | 200 | 15078 | 452 | 3 / 0 | **OK** |  |
| 190 | `/sales/customers/credit-allocation-guide` | B | 200 | 6 | 18463 | 200 | 16120 | 2668 | 3 / 7 | **OK** |  |
| 191 | `/sales/customers/credit-training` | B | 200 | 6 | 18423 | 200 | 15778 | 2674 | 3 / 7 | **OK** |  |
| 192 | `/sales/product-videos` | B | 200 | 34 | 18673 | 200 | 13786 | 267 | 3 / 2 | **GUARD** | data path uses non-GET (aborted): POST product_videos_waiting |
| 193 | `/sales/promotion-nominations` | B | 200 | 16 | 18374 | 200 | 13734 | 355 | 3 / 0 | **GUARD** | data path uses non-GET (aborted): POST get_promotion_nomination_quota |
| 194 | `/sales/quote-share-logs` | B | 200 | 10 | 19061 | 200 | 12863 | 514 | 45 / 23 | **OK** |  |
| 195 | `/sales/quotes` | B | 200 | 13 | 20170 | 200 | 13233 | 3317 | 423 / 381 | **OK** |  |
| 196 | `/sales/quotes/` | B | 307 | 3 | 0 | 200 | 13646 | 3317 | 423 / 381 | **OK** |  |
| 197 | `/sales/quotes/$quoteId` | B | 200 | 26 | 20626 | 200 | 14440 | 853 | 84 / 68 | **GUARD** | data path uses non-GET (aborted): POST check_quote_stock_availability |
| 198 | `/sales/quotes/new` | B | 200 | 55 | 21147 | 200 | 13456 | 667 | 3 / 3 | **OK** |  |
| 199 | `/sales/search` | B | 200 | 35 | 22357 | 200 | 12210 | 1199 | 3 / 17 | **OK** |  |
| 200 | `/sales/send-queue` | B | 200 | 20 | 19317 | 200 | 13372 | 1045 | 3 / 33 | **OK** |  |
| 201 | `/sales/stock-alerts` | B | 200 | 26 | 19051 | 200 | 12446 | 322 | 3 / 0 | **OK** |  |
| 202 | `/sitemap.xml` | A | 200 | 4 | 484 | — | — | — | — | **OK** | https://myafrakala.ir/ weekly 1.0 https://myafrakala.ir/login monthly 0.6 https://myafraka |
| 203 | `/suppliers` | B | 200 | 26 | 18271 | 200 | 12560 | 1484 | 16 / 50 | **OK** |  |
| 204 | `/suppliers/$supplierId` | B | 200 | 16 | 19260 | 200 | 12225 | 422 | 5 / 20 | **OK** |  |
| 205 | `/unauthorized` | A | 200 | 28 | 8031 | 200 | 2596 | 0 | 0 / 0 | **OK** |  |
| 206 | `/updates` | B | 200 | 30 | 18336 | 200 | 16113 | 905 | 20 / 44 | **OK** |  |
| 207 | `/users` | B | 200 | 32 | 18253 | 200 | 12015 | 1846 | 70 / 112 | **OK** |  |
| 208 | `/users/$userId` | B | 200 | 29 | 19853 | 200 | 13235 | 1846 | 70 / 112 | **OK** | redirects to /users |
| 209 | `/users/pending` | B | 307 | 25 | 0 | 200 | 12963 | 223 | 3 / 1 | **OK** | redirects to /users |
| 210 | `/warehouses` | B | 200 | 28 | 18452 | 200 | 12970 | 433 | 3 / 0 | **OK** |  |
| 211 | `/warehouses/kardex` | B | 200 | 20 | 18711 | 200 | 12365 | 1178 | 55 / 74 | **OK** |  |
| 212 | `/warehouses/transfers` | B | 200 | 18 | 18804 | 200 | 12365 | 396 | 3 / 0 | **OK** |  |

## ۳. routeهای غیر OK و شواهد آن‌ها

متن خطاها عیناً از بدنهٔ پاسخ PostgREST نقل شده است. آن بدنه‌ها با یک re-run تشخیصی، با همان guard، گرفته شدند. علت را حدس نزده‌ام؛ فقط آنچه اندازه‌گیری شد آمده است.

### BROKEN

**۱. `/accounting/receipts/$receiptId`** (صفحهٔ حسابداری)

صفحه ۳ ردیف رندر می‌کند، ولی درخواست پیوند فاکتورها شکست می‌خورد:

```
400 GET /rest/v1/payment_receipt_links?select=id,amount,invoice:invoices(id,number,total_amount,status)&receipt_id=eq.<id>
{"code":"PGRST200","details":"Searched for a foreign key relationship between 'payment_receipt_links' and 'invoices' in the schema 'public', but no matches were found.","hint":null,"message":"Could not find a relationship between 'payment_receipt_links' and 'invoices' in the schema cache"}
```

بررسی read-only روی DB:
- `to_regclass('public.invoices')` = NULL، یعنی جدول `invoices` روی production وجود ندارد.
- FKهای `payment_receipt_links` فقط این دو هستند: `payment_receipt_links_receipt_id_fkey → payment_receipts` و `payment_receipt_links_quote_id_fkey → sales_quotes`.

**۲. `/pricing/amin-hozoor-board`**

صفحه ۵۰ ردیف رندر می‌کند، ولی درخواست دسترسی‌های در انتظار شکست می‌خورد:

```
400 GET /rest/v1/pricing_board_access_requests?select=*,profile:profiles!pricing_board_access_requests_user_id_fkey(id,full_name,phone)&board_key=eq.amin_hozoor_sales_board&status=eq.pending…
{"code":"PGRST200", … "hint":"Perhaps you meant 'pricing_board_settings' instead of 'pricing_board_access_requests'.","message":"Could not find a relationship between 'pricing_board_access_requests' and 'profiles' in the schema cache"}
```

روی DB، جدول `pricing_board_access_requests` هیچ FK ندارد.

**۳. `/audit-logs`** و **۴. `/admin/audit`**

صفحه روی «در حال بارگذاری...» می‌ماند:

```
500 GET /rest/v1/audit_logs?select=…&order=created_at.desc&limit=200   (/audit-logs)
500 GET /rest/v1/audit_logs?select=…&order=created_at.desc&offset=0&limit=50   (/admin/audit)
{"code":"57014","details":null,"hint":null,"message":"canceling statement due to statement timeout"}
```

**۵. `/bot-api-keys/usage`**

```
500 GET /rest/v1/bot_api_usage_logs?select=…&order=created_at.desc&offset=0&limit=50
{"code":"57014",…,"message":"canceling statement due to statement timeout"}
```

زمینهٔ اندازه‌گیری‌شده برای هر سه timeout:
- `authenticated` مقدار `statement_timeout=8s` دارد.
- `audit_logs` حدود ۵٬۹۹۰ ردیف زنده و ۷۳ MB است؛ `bot_api_usage_logs` حدود ۱۲٬۸۵۹ ردیف و ۱۴۶ MB.
- `bot_api_usage_logs` ایندکس `idx_bot_usage_time (created_at DESC)` دارد. `audit_logs` ایندکس سادهٔ `created_at` ندارد و فقط ایندکس‌های ترکیبی `(actor_id, created_at)` و ایندکس‌های partial دارد.
- **هشدار:** این timeoutها زیر بار سنجیده شدند. در همان لحظه چند نمونه از query `v_pricing_recompute_queue_summary` (بند ۶) هم‌زمان در `pg_stat_activity` در حال اجرا بودند، و sweep خودم هم بار اضافه کرد. نمی‌دانم بدون این بار هم timeout رخ می‌دهد یا نه.

**۶. `/.lovable/oauth/consent`** (مورد انتظار، نه regression)

متن صفحه: «خطا در بارگذاری درخواست … Missing authorization_id». این route بدون `authorization_id` یک جریان OAuth واقعی قابل اجرا نیست.

### خطاهای سراسری

این خطاها روی همهٔ صفحه‌های داخل `_app` دیده شدند، هم در headless و هم در Chrome اپراتور:

- **`v_pricing_recompute_queue_summary`** (sidebar، `src/components/layout/AppSidebar.tsx`):
  - پاسخ: `500 {"code":"57014",…,"message":"canceling statement due to statement timeout"}`
  - در لاگ `afrakala-lan-rest` از زمان restart آن: **۲۰۰ از ۲۰۰ درخواست 500 بودند**، شامل درخواست‌های Chrome واقعی و نه فقط headless.
  - در `pg_stat_activity` چند نمونه از همین query هم‌زمان تا ۷ ثانیه در حال اجرا دیده شد.
  - همان view در psql با `SET ROLE authenticated` جواب داد: `pending_count=119557`، `failed_count=1`.
  - پیامد: هر بارگذاری صفحه توسط هر کاربر یک query هشت‌ثانیه‌ای روی DB می‌گذارد.
- **درخواست‌های `products` و `product_owner_assignments` با URL بلند:**
  - `OPTIONS 414` و سپس `GET 503` روی `products?select=id,name,sku&id=in.(259 uuid)` (۱۰٬۱۷۷ کاراکتر) و `product_owner_assignments?select=product_id,user_id&product_id=in.(259 uuid)` (۱۰٬۲۰۷ کاراکتر). هر کدام ۴ بار در هر صفحه.
  - مرورگر آن را این‌طور گزارش می‌کند: `Access to fetch at '…/rest/v1/products?…' has been blocked by CORS policy`
  - منبع احتمالی (تأیید نشده): `src/lib/pricing/attention-queries.ts:52,153`
- **`WebSocket … /realtime/v1/websocket … Unexpected response code: 404`:** سرویس realtime در stack LAN نیست.
- **`HEAD 503 /rest/v1/profiles`:** یک بار در هر صفحه در Chrome دیده شد. HEAD مشابهی که خودم با `limit=1` فرستادم `206` داد، پس query دقیق را ندارم.

### AUTH

- `/admin/receipt-fields` و `/marketing/suggestions-history`: برای **admin** به `/unauthorized` redirect می‌شوند («دسترسی غیرمجاز — شما اجازه دسترسی به این بخش را ندارید»). اینکه عمدی است یا نه را نمی‌دانم.
- `/public/sale-lists/$listId`: برای بازدیدکنندهٔ ناشناس `404` می‌دهد با متن «این لیست برای بازدیدکنندگان در دسترس نیست — برای دیدن این لیست فروش وارد حساب کاربری خود شوید». این مطابق توضیح داخل `src/lib/public/get-public-sale-list.ts` است (RLS برای anon). در browser اجرا نشد، چون با session لودر آن `refresh_sale_list_prices` را صدا می‌زند که RPC نوشتنی است.

### EMPTY

`/academy/$courseId`، `/academy/$courseId/$lessonId`، `/academy/$courseId/$lessonId/quiz` و `/knowledge/$documentId`: روی production هیچ ردیفی در `academy_lessons` و `knowledge_documents` نیست. با UUID صفر، صفحه حالت «یافت نشد» را رندر کرد و محتوای واقعی قابل آزمون نبود.

### GUARD (۴۲ route) — اثبات‌نشده

حکم هر ۴۲ route، به همان ترتیب مسیر، در جدول آمده است: `/accounting/purchase-payments`، `/accounting/salesperson-scoring`، `/admin/delivery-receipts`، `/admin/documents`، `/admin/gamification`، `/admin/gamification/achievements`، `/admin/purchase`، `/admin/system-health`، `/admin/workflow-settings`، `/bot-api-keys`، `/bot-api-keys/`، `/data-tables/$tableId`، `/delivery-receipts`، `/documents`، `/gamification`، `/gamification/admin/`، `/gamification/admin/analytics`، `/gamification/admin/manual-metrics`، `/gamification/leaderboard`، `/gamification/league`، `/marketing/suggestions`، `/my-penalties`، `/my-rejected-quotes`، `/operations/tasks`، `/persons`، `/persons/$personId`، `/persons/$personId/edit`، `/persons/merge`، `/pricing/live-price-list`، `/pricing/market-intelligence`، `/pricing/sale-lists/$listId`، `/pricing/sale-lists/$listId/publish`، `/products/`، `/products/$id`، `/purchase`، `/reports`، `/sales/credit-customers`، `/sales/customers/$customerId/credit`، `/sales/customers/$customerId/edit`، `/sales/product-videos`، `/sales/promotion-nominations`، `/sales/quotes/$quoteId`.

- در چندین صفحه (مثلاً `/documents`، `/persons`، `/my-penalties`)، متن خطا («خطا: TypeError: Failed to fetch»، «بارگذاری فهرست با خطا مواجه شد»، «Something went wrong») **پس از** اینکه guard یک RPC یا `_serverFn` POST را abort کرد ظاهر شد. هر مورد بررسی‌شده به RPC قطع‌شده ردیابی شد. پس این متن‌ها نتیجهٔ guard هستند و مدرکی علیه release نیستند.
- **`/pricing/sale-lists/$listId`** و **`/publish`** error boundary «Something went wrong» را نشان دادند، پس از abort شدن `refresh_sale_list_prices`. این RPC نوشتنی است، پس بدون اجازهٔ نوشتن نمی‌توان سالم‌بودن آن را ثابت کرد.
- از ۶۷ RPC قطع‌شده، ۱۱ مورد `VOLATILE` هستند (۵۶ مورد دیگر یا `STABLE` بدون DML بودند یا در schema `public` یافت نشدند؛ این دو حالت را از هم جدا نکردم): `admin_gamification_overview`، `calculate_adjusted_price`، `get_customer_credit`، `get_delivery_receipts`، `get_documents`، `get_purchase_requests`، `get_user_penalties`، `person_merge_candidates_overview`، `query_dynamic_table_rows` (متن تابع DML دارد)، `query_dynamic_table_rows_v2` و `refresh_sale_list_prices`.
- ۷ صفحه `_serverFn` POST دارند که بدنه‌اش را بررسی نکردم: `/accounting/salesperson-scoring`، `/persons/$personId`، `/persons/$personId/edit`، `/pricing/amin-hozoor-board`، `/pricing/live-price-list`، `/pricing/market-intelligence`، `/sales/customers/$customerId/edit`.

### NOT EXERCISED (۱۸ route)

- **GET ربات که می‌نویسد (۴):** `/api/public/bot/products`، `/api/public/bot/products/$productId`، `/api/public/bot/dynamic-tables/by-slug/$slug`، `/api/public/bot/dynamic-tables/$tableId/rows`
- **MCP با telemetry بیرونی (۳):** `/mcp`، `/.mcp/list-tools`، `/.mcp/invoke-tool/$tool`
- **بدون handler GET (۱۱):** GET فقط SPA fallback برگرداند (۲۰۰ و حدود ۶٬۴ KB، یا ۳۰۷ برای `rows/$rowId`): `/api/admin/automation/torob/enqueue`، `/api/admin/calls/import-issabel`، `/api/messenger/ai-chat`، `/api/public/bot/dynamic-tables/$tableId/rows/$rowId`، `…/rows/upsert`، `/api/public/bot/market-matches/candidates/upsert`، `…/resolve`، و ۴ مسیر `/api/public/hooks/*`

### یافته‌های دیگر

- **`/.well-known/oauth-protected-resource`** روی production این را برمی‌گرداند: `"authorization_servers":["https://afrakala-test.supabase.co/auth/v1"]`. یعنی به یک پروژهٔ Supabase ابری با نام test اشاره می‌کند.
- **`/api/version`:** `"environment":"lan"`، در حالی که runtime config مقدار `appEnv "production"` دارد.
- **`/api/healthz`:** `"whatsapp":{"state":"up","ms":12,"detail":"HTTP 404"}`. وضعیت up با پاسخ 404 گزارش شده است.
- **`/api/public/products`:** بدون احراز هویت ۴۲ KB JSON محصول برمی‌گرداند (در نمونهٔ دیده‌شده `"price":0`). طبق کد عمدی است؛ فقط برای ثبت آمده.
- **صف قیمت‌گذاری:** `pending_count=119557`.
- **`/accounting/mutual-settlement` (Chrome):** یک ردیف «بدهی ما به او» را **منفی** (`-۶۸,۸۰۰,۰۰۰ تومان`) و «خالص» را مثبت نشان می‌دهد. درستی علامت را قضاوت نمی‌کنم.
- **ارتباط با migration 542:** در صفحه‌های `treasury`، `dynamic-capital` و `receivables` هیچ خطای مرتبطی دیده نشد. ارتباط `PGRST200`ها و `57014`ها با 542 را **نسنجیدم**؛ نمی‌دانم پیش از استقرار هم وجود داشتند یا نه.

## ۴. چهار ادعای انتشار

**۴.۱ «پخش حساب» — اثبات شد (client-side و فقط در Chrome)**

- route در کد: `src/routes/_app.accounting.allocation-workbench.tsx` (عنوان «پخش حساب»)، لینک‌شده از `src/components/finance/FinanceHub.tsx:209` و `src/lib/navigation/registry.ts:474`.
- headless: `200`، ولی داده از RPC `list_allocation_rows`، `get_receivables_list`، `get_payables_list` و `compute_daily_capital` می‌آید و guard آن‌ها را قطع کرد. در HTML سمت سرور هم فقط صفحهٔ «در حال بررسی جلسه کاربری...» هست.
- Chrome اپراتور: صفحه رندر شد با این محتوا:
  - «مطالبات معوق ۳۳,۶۹۶,۸۵۰,۱۰۱ تومان»
  - «بدهی معوق ۳,۱۰۲,۰۰۰,۰۰۰ تومان»
  - «دریافتنی — مشتریان ۵۰» و ردیف‌هایی مثل «فاکتور SQ-۲۰۲۶-۰۰۰۰۰۲ · سررسید ۲۰ مرداد ۱۴۰۵ · ۱۴۲,۸۰۰,۰۰۰ تومان»
  - پیام وضعیت داده (خطا نیست): «پیشنهاد سرمایهٔ روز محاسبه نشد؛ ورودی‌های نقدی این تاریخ … ثبت نشده است».

**۴.۲ ستون نمایندهٔ فروش در مطالبات — اثبات شد (client-side و فقط در Chrome)**

- `/accounting/receivables` در Chrome اپراتور ۵۰ ردیف داشت. سرستون‌ها عیناً:
  `مشتری | کارشناس فروش | سقف اعتبار | شماره فاکتور | سررسید | مبلغ کل | پیش‌پرداخت | پرداخت تأییدشده | مانده | سطل سنی | وضعیت | عملیات`
- ستون «کارشناس فروش» در ردیف اول مقدار داشت.
- در کد: `src/routes/_app.accounting.receivables.tsx:562` `<TableHead>کارشناس فروش</TableHead>` که فقط وقتی `get_receivables_list` ردیف برگرداند رندر می‌شود. پس در HTML سرور وجود ندارد.

**۴.۳ ارقام فارسی — در صفحه‌های حسابداری اثبات شد، نه در همه‌جا**

- **Chrome، سه صفحهٔ پول:** `/accounting/receivables` (۲٬۰۰۱ رقم فارسی)، `/accounting/allocation-workbench` (۱٬۵۶۵) و `/accounting/treasury` (۵۳). در هر سه صفحه **تنها** رقم لاتین «9+» روی badge اعلان‌ها و آدرس ایمیل حساب بود. مبالغ، تاریخ‌ها و شمارهٔ فاکتور فارسی بودند (`SQ-۲۰۲۶-۰۰۰۰۰۲`، `۳۸۱,۰۰۰,۰۰۰ تومان`).
- **headless، شمارش روی ۱۸۸ صفحه:** ۱۲۱ صفحه، بدون badge و ایمیل، دست‌کم یک توکن رقم لاتین دارند. بخشی از آن‌ها مدل کالا، SKU و شمارهٔ تلفن هستند. نمونه‌های روشن رقم لاتین در محتوای عددی:
  - `/notifications`: ۷۲ لاتین، ۰ فارسی؛ مثل «کاهش قیمت فروش از 16,400,000 به 430,000 تومان»، «درصد تغییر: -97.38٪»، «3 ساعت پیش»
  - `/pricing/attention`: ۶۳۱ توکن لاتین؛ مثل «99 روز پیش»، «ناموجود بیش از 3 روز»
  - `/admin/marketing-channels` (۱۹۲ / ۰)
  - `/products/attributes` (۲۹۹ / ۳)
  - `/popup-center`: «(نگه‌داری حداکثر 24 ساعت) تعداد: 0»
- رقم‌های سایر صفحه‌ها در ستون `Latin / Persian digits` جدول آمده است.

**۴.۴ نبودن banner — اثبات شد**

- **SSR:** در هیچ‌یک از ۱۸۴ پاسخ HTML نه «محیط تست» بود و نه «هشدار ایمنی».
- **headless:** روی هر ۱۸۸ صفحه، پس از hydration، `[role=alert][data-environment]`، `.bg-amber-100[role=alert]` و `.bg-red-600[role=alert]` صفر بودند. banner قرمز فقط پس از `useEffect` و خواندن `window.location.hostname` تصمیم گرفته می‌شود، پس این بررسی client-side معتبر است.
- **Chrome اپراتور:** روی ۶ صفحه صفر.
- **دلیل در config:** `appEnv "production"` و `trustedHosts "192.168.170.10,localhost"`.

**ادعای «OCR فیش بانکی کار نمی‌کند»:** بررسی نشد. نیاز به upload دارد.

## ۵. آنچه این بررسی نمی‌تواند بگیرد

1. **هر نوشتن:** ثبت فیش، صدور پیش‌فاکتور، «محاسبه و ذخیره» در `dynamic-capital`، ایجاد ردیف «پخش حساب» (`create_allocation_row`، `update_allocation_row`، `set_allocation_row_status`)، تسویهٔ متقابل، ادغام اشخاص. هیچ‌کدام اجرا نشد.
2. **آنچه پشت کلیک است:** dialogها، تب‌ها، فیلتر و جست‌وجو (debounce)، صفحهٔ دوم pagination، «جزئیات» هر ردیف، دکمهٔ «انتخاب به‌عنوان بدهکار» در «پخش حساب»، export CSV و Excel.
3. **۴۲ صفحهٔ GUARD:** دادهٔ آن‌ها از RPC یا `_serverFn` POST می‌آید و در headless قطع شد؛ فقط ۶ صفحهٔ حسابداری در Chrome جبران شد.
4. **آپلود فایل:** OCR فیش بانکی (که انتظار می‌رود کار نکند)، رسید تحویل، اسناد، import آسان. Storage upload اصلاً لمس نشد.
5. **نقش‌های دیگر:** همه‌چیز با **admin** دیده شد. نمای `sales`، `accountant`، `manager` و `viewer`، و RLS از دید آن‌ها (مثلاً اینکه کارشناس فروش فقط مشتریان خودش را ببیند) آزموده نشد. دو صفحه حتی برای admin به `/unauthorized` رفتند.
6. **realtime، اعلان زنده، heartbeat حضور و کارهای زمان‌بندی‌شده:** hookهای `/api/public/hooks/*`، پردازش صف قیمت‌گذاری با ۱۱۹٬۵۵۷ مورد در انتظار و import Issabel. پیامد heartbeat هم دیده نشد، چون guard `PATCH profiles` را قطع کرد.
7. **بار و هم‌زمانی:** timeoutها زیر بار sweep خودم سنجیده شدند. رفتار با ده‌ها کاربر هم‌زمان یا بدون sweep سنجیده نشد.
8. **موبایل و RTL:** viewport فقط ۱۴۴۰×۹۰۰ بود؛ چیدمان موبایل و بصری (screenshot) بررسی نشد.
9. **درستی عددی:** اینکه مانده‌ها، سطل‌های سنی و سقف‌ها **درست** هستند بررسی نشد، فقط اینکه رندر می‌شوند. نمونه‌اش علامت منفی در تسویهٔ متقابل.

## ۶. آنچه تأیید نشد

- ۴۲ route با حکم GUARD: رندر داده اثبات نشد.
- ۱۸ route با حکم NOT EXERCISED: ۴ GET ربات، ۳ MCP و ۱۱ handler غیر GET.
- `/public/sale-lists/$listId` با session (لودر نوشتنی).
- محتوای واقعی ۴ route پارامتری academy و knowledge، چون داده‌ای وجود ندارد.
- **console در Chrome اپراتور:** ابزار `read_console_messages` فقط پیام یک افزونهٔ مرورگر را برگرداند و خطاهای شبکهٔ خود مرورگر را نمی‌گیرد. پس خطاهای console فقط از headless آمده‌اند:
  - هیچ `PGRST203`، `42501`، `42883`، هشدار hydration mismatch یا `pageerror` در هیچ‌یک از ۱۸۸ صفحه دیده نشد.
  - تنها پیام‌های مکرر: `[auth-diagnostic]…SIGNED_IN/INITIAL_SESSION` (با سطح `console.error`، بی‌خطر)، خطای WebSocket realtime، CORS/414 بالا، و خطاهای `net::ERR_FAILED` که ناشی از guard هستند.
- `/accounting/purchase-payments` و `/accounting/salesperson-scoring` در Chrome بررسی نشدند؛ فرصت تمام شد.
- ارتباط `PGRST200`/`57014`/414 با این release: وضعیت پیش از استقرار را ندارم.
- session نوشته‌شده: پس از پایان کار از `%TEMP%` حذف شد (`ls` → No such file or directory).
