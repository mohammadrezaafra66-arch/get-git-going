# بستهٔ تست پذیرش (UAT) افراکالا — فهرست اصلی

> **مخاطب:** کارمندان تست (غیرفنی) — این سند نقطهٔ شروع است.
> **کاربرد:** آخرین دروازهٔ کنترل کیفیت پیش از تحویل به مشتری.
> **نسخه:** ۲ — بازنگری‌شده ۱۴۰۵/۰۴/۲۸ (2026-07-19) پس از تکمیل ۲۱ ماژول + `BLOCKERS.md` + اسکن دیتابیس زندهٔ `afrakala`. بخش «بازنگری پایانی» انتهای بخش ۱ را ببین. (نسخهٔ ۱: 2026-07-18، پیش از بررسی واقعی ماژول‌ها.)
>
> ⚠️ این فایل «فهرست» است، نه تست‌کیس. تست‌کیس‌های هر ماژول در فایل‌های `NN-module.md` کنار همین پوشه قرار می‌گیرند (بعد از تأیید همین فهرست ساخته می‌شوند).

---

## ۰) مبانی این بسته (خوانده شده از کد، نه فرض)

- **مدل دسترسی سه‌لایه است** و هر سه باید تست شوند:
  1. **لایهٔ UI:** منوی کناری آیتم‌های غیرمجاز را پنهان می‌کند (`nav-items.ts` + منطق `AppSidebar.tsx`: `(!adminOnly || نقش admin/manager) AND hasPermissionEx(module,"view")`) و `RoleGuard` بخش‌هایی از صفحه را مخفی می‌کند.
  2. **لایهٔ route:** هنگام باز کردن آدرس، تابع guard (`requirePermission` / `requireAnyRole` / `requireAdmin`) کاربر غیرمجاز را به `/unauthorized` (یا `/login` اگر لاگین نباشد) می‌فرستد.
  3. **لایهٔ RLS (دیتابیس):** حتی اگر دو لایهٔ بالا دور زده شوند، سیاست‌های Row-Level-Security در PostgreSQL جلوی خواندن/نوشتن ردیف را می‌گیرند.
- **نقش‌ها (enum `app_role`):** `admin`, `manager`, `sales`, `accountant`, `viewer`, `purchase_specialist`, `site`. پنج نقش اول نقش‌های اصلی سیستم‌اند؛ `purchase_specialist` (کارشناس خرید) و `site` (سایت) نقش‌های سفارشی فعال‌اند. جدول `custom_roles` نقش‌های سفارشی بیشتری هم دارد (`it` و …).
- **دسترسی = نقش + برچسب/visibility (نه فقط نقش).** این مهم‌ترین ویژگی مدل است و از خودِ RLS استخراج شده:
  - **اشخاص:** دیده‌شدن هر شخص به `visibility_scope` او بستگی دارد: `internal_general`(همهٔ نقش‌ها) / `restricted_finance`(admin, manager, accountant) / `restricted_executive`(admin, manager).
  - **جداول دادهٔ پویا:** دیده‌شدن هر جدول به `access_level` + آرایهٔ `allowed_roles` آن بستگی دارد (`all` / `finance_only`→accountant / `sales_only`→sales / `custom`→فهرست نقش‌های دلخواه).
  - **دانش سازمانی:** `is_published` + `access_level` (`all` / `manager_only` / `finance_only` / `admin_only`).
  - **مالکیت‌محور:** ویرایش موجودی محصول فقط توسط «مالک محصول»؛ پیش‌فاکتور فقط توسط فروشندهٔ صاحب آن (`salesperson_id`)؛ مشتری فقط توسط مسئول آن (`responsible_id`).
- ⚠️ **نیاز به تأیید توسعه‌دهنده:** برای کاربرانِ لاگین‌شده، RLS محصولات را بر اساس **برچسب محصول** فیلتر نمی‌کند؛ فیلتر برچسبی فقط برای کلیدهای API ربات اعمال می‌شود. اگر انتظار می‌رود فروشنده فقط محصولات برچسب‌دار خاصی را ببیند، این در RLS **وجود ندارد**.
- **واژگان وضعیت تست:** `قبول` (طبق انتظار) / `رد` (مغایر انتظار — باگ) / `مسدود` (نتوانستم تست کنم، پیش‌نیاز نبود یا خطای محیط) / `نامشخص` (رفتار مبهم، نیاز به تصمیم توسعه‌دهنده).
- **این بسته کجا را پوشش نمی‌دهد (چون سند قبلی دارد):** معیارهای غیرفنی self-host/secret/backup در `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`؛ ایمنی محیط staging و متن بنر در `docs/testing/STAGING_HUMAN_TEST_CHECKLIST.md`. این بسته فقط **تست عملکردی هر ماژول** را پر می‌کند.

---

## ۱) جدول ماژول‌ها

> ستون «نقش‌های مجاز» از **guard سطح-route** (کد) + **RLS** استخراج شده، نه از نام نقش. جایی که `requirePermission(module,…)` استفاده شده، نقش‌ها از ماتریس پیش‌فرض `PERMISSIONS` می‌آیند و **ممکن است جدول پویای `role_permissions` آن را تغییر دهد** (با ⚙️ علامت خورده).

| # | ماژول (فارسی) | مسیر اصلی (route) | فایل‌های کلیدی | تعداد قابلیت | نقش‌های مجاز (route + RLS) |
|---|---|---|---|---|---|
| 01 | داشبورد و اعلان‌ها | `/dashboard`, `/notifications`, `/popup-center`, `/presence` | `_app.dashboard.tsx`, `_app.notifications.tsx`, `_app.presence.tsx` | ۴ | همهٔ نقش‌ها ⚙️ (notifications/popup/presence بدون guard route — فقط لاگین) |
| 02 | محصولات | `/products` و زیرمسیرها (برند/دسته/ویژگی/برچسب) | `_app.products.*.tsx`, `lib/products/*` | ۸ | مشاهده: **admin/manager/sales** ⚙️ (accountant و viewer طبق `role_permissions` `can_view=false` → نمی‌بینند) · ساخت/ویرایش محصول: admin, manager · برند/دسته: admin/manager/**accountant** · حذف: admin |
| 03 | قیمت‌گذاری | `/pricing/*` (قوانین، ماشین‌حساب، قیمت سریع، کارگاه، ارز، تسویه، ارسال) | `_app.pricing.*.tsx`, `lib/pricing/*` | ۲۷ | مشاهدهٔ قیمت: admin, manager, accountant ⚙️ · ⚠️ **accountant محصولِ خام (`products`) را نمی‌بیند** (مجوز پویا) — صفحاتی که مستقیم از `products` می‌خوانند برایش خالی‌اند · بدون guard route: فقط attention و my-workbench (quick-price و settlement-types اکنون guard دستی دارند) ⚠️ |
| 04 | انتشار و لیست‌های قیمت | `/pricing/sale-lists`, `/pricing/live-price-list`, `/pricing/amin-hozoor-board`, `/pricing/recompute-prices`, `/price-lists` | `_app.pricing.sale-lists*.tsx`, `_app.pricing.live-price-list.tsx`, `lib/pricing/publish-prices.ts` | ۷ | مشاهده: admin, manager, accountant ⚙️ · قیمت حساس در «لیست زنده»: `view_sensitive` · انتشار دسته‌ای: admin (`update`) |
| 05 | هوشمند بازار و نرخ‌ها | `/pricing/market-intelligence`, `/pricing/market-rates-workshop`, `/pricing/price-alerts`, `/pricing/currency-rates` | `_app.pricing.market-intelligence.tsx`, `lib/market-rates-ingestion.functions.ts` | ۵ | هوشمند بازار: admin, manager, accountant · هشدار قیمت: admin, manager, accountant, sales |
| 06 | خرید و تأمین‌کنندگان | `/purchases`, `/purchase`, `/suppliers`, `/operations/purchase-advisor` | `_app.purchases*.tsx`, `_app.suppliers*.tsx` | ۶ | خرید/تأمین‌کننده مشاهده: admin, manager, accountant(, viewer) ⚙️ · مشاور خرید: admin, manager |
| 07 | فروش (جستجو و پیش‌فاکتور) | `/sales`, `/sales/search`, `/sales/quotes`, `/sales/stock-alerts`, `/sales/send-queue` | `_app.sales.*.tsx`, `lib/sales/*` | ۱۷ | مشاهده: همه ⚙️ · ساخت/ویرایش: admin, manager, sales · RLS: فروشنده فقط پیش‌فاکتور خودش |
| 08 | مشتریان و اعتبار | `/sales/customers`, `/sales/credit-customers`, `/sales/credit-rules`, `.../credit` | `_app.sales_.customers*.tsx`, `_app.sales.credit-*.tsx` | ۶ | مشتری مشاهده: admin, manager, accountant, viewer + (sales فقط مسئولِ خود) · قوانین اعتبار: admin, accountant · صفحهٔ اعتبار: admin, manager, accountant |
| 09 | فاکتورها و بیجک | `/invoices`, `/sales/invoices`, `.../waybill` | `_app.invoices.tsx`, `_app.sales_.invoices_*.tsx` | ۶ | مشاهده: همه ⚙️ · ساخت: admin, manager, sales |
| 10 | اشخاص | `/persons`, `/persons/create`, `.../edit` | `_app.persons*.tsx`, `lib/persons/*.functions.ts` | ۳ | مشاهده: همه (اما RLS بر اساس `visibility_scope`) · ساخت/ویرایش: admin, manager |
| 11 | حسابداری و خزانه | `/accounting/*` (فیش، مطالبات، بدهی، بانک، سرمایه) | `_app.accounting.*.tsx`, `lib/receipt-ocr*.functions.ts` | ۱۲ | admin, manager, accountant · برخی نوشتن‌ها فقط admin, accountant (دریافت فیش، سرمایهٔ پویا) |
| 12 | عملیات داخلی | `/operations/tasks`, `/operations/daily-mood`, `/operations/receipts`, `/operations/didar` | `_app.operations.*.tsx`, `lib/operations/daily-mood.ts` | ۸ | tasks/daily-mood بدون guard route (فقط لاگین) ⚠️ · receipts/gamification/purchase-advisor: admin, manager · didar/api-keys: admin |
| 13 | گیمیفیکیشن | `/gamification`, `/gamification/leaderboard`, `/gamification/admin/*` | `_app.gamification.*.tsx`, `lib/operations/gamification*.ts` | ۱۳ | داشبورد/لیدربورد کارمند: بدون guard route (فقط لاگین) ⚠️ · مدیریت: admin, manager |
| 14 | دانش و آکادمی | `/knowledge`, `/academy` | `_app.knowledge*.tsx`, `_app.academy*.tsx` | ۸ | مشاهده: همه (RLS: `is_published` + `access_level`) · مدیریت: admin, manager |
| 15 | جداول دادهٔ پویا | `/data-tables` | `_app.data-tables.*.tsx` | ۳ | مشاهده: admin, manager, accountant, viewer ⚙️ (RLS: `access_level` + `allowed_roles` هر جدول) |
| 16 | ربات API و یکپارچه‌سازی | `/bot-api-keys/*`, `/integrations/didar`, `/market-matches` | `_app.bot-api-keys.*.tsx`, `api.public.bot.*.ts` | ۹ | کلیدهای ربات: admin, manager · didar/market-matches بدون guard route ⚠️ |
| 17 | بازخورد و ارتباطات | `/feedback`, `/collaboration`, `/messages` | `_app.feedback*.tsx`, `_app.collaboration.tsx`, `lib/messenger/*` | ۵ | همه ⚙️ · پیام‌رسان: عضویت گروه (RLS `is_messenger_group_member`) |
| 18 | گزارش‌ها و لاگ‌ها | `/reports`, `/audit-logs`, `/sales/quote-share-logs` | `_app.reports.tsx`, `_app.audit-logs.tsx` | ۴ | گزارش‌ها: همه ⚙️ · لاگ فعالیت: admin (RLS: فقط admin می‌خواند) |
| 19 | کاربران و نقش‌ها | `/users`, `/users/pending`, `/roles`, `/admin/roles`, `/admin/profile-fields` | `_app.users*.tsx`, `_app.roles.tsx`, `_app.admin.roles.tsx` | ۵ | فقط admin (`requireAdmin`) · RLS: `user_roles`/`custom_roles`/`role_permissions` نوشتن فقط admin |
| 20 | تنظیمات سیستم و ادمین | `/admin/settings`, `/admin/penalties`, `/admin/workflow-*`, `/admin/*-fields`, `/admin/marketing-channels`, `/admin/payment-terms`, `/admin/automation` | `_app.admin.*.tsx` | ۲۰ | اغلب admin یا admin, manager · ⚠️ چند صفحه بدون guard route (پایین را ببین) |
| 21 | جریمه‌ها (کارت قرمز) | `/my-penalties`, `/admin/penalties` | `_app.my-penalties.tsx`, `_app.admin.penalties.tsx` | ۲ | کارت من: بدون guard route (فقط لاگین) ⚠️ · مدیریت: admin, manager |

**جمع کل قابلیت‌های تخمینی:** ~۱۸۰ در ۲۱ ماژول (به‌علاوهٔ ~۹ مسیر عمومی/احراز هویت و ~۱۳ endpoint سرور/ربات که تست جداگانه دارند).

### ⚠️ یافته‌های اولیهٔ امنیتی (برای بررسی عمیق در فاز ۲ و ۳)
این صفحات **guard سطح-route ندارند** (فقط نیازمند لاگین‌اند) درحالی‌که منو با `adminOnly` مخفیشان می‌کند. یعنی اگر کاربر غیرمجاز آدرس را مستقیم تایپ کند، ممکن است صفحه بارگذاری شود (خط دفاع نهایی فقط RLS می‌ماند):

- `/admin/marketing-channels`, `/admin/payment-terms`, `/admin/receipt-fields`, `/admin/waybill-fields`, `/admin/workflow-stages` — صفحات پیکربندی ادمین.
- `/integrations/didar` (بدون guard) درحالی‌که `/operations/didar` نیازمند admin است — ناسازگاری.
- `/pricing/attention`, `/pricing/my-workbench`, `/pricing/quick-price`, `/pricing/settlement-types` — قیمت‌گذاری.
- `/gamification`, `/gamification/leaderboard`, `/operations/tasks`, `/operations/daily-mood`, `/presence`, `/marketing/suggestions`, `/my-penalties`, `/market-matches`, `/popup-center`, `/notifications`.

➡️ در فاز ۲ برای هر کدام یک **تست منفی سه‌لایه** نوشته می‌شود: آیا با نقش پایین (مثلاً sales/viewer) صفحه باز می‌شود؟ اگر بله ولی RLS داده‌ای نشان نمی‌دهد = قابل قبول؛ اگر بله و داده هم دیده/تغییر شد = **یافتهٔ امنیتی**.
➡️ ⚠️ نیاز به تأیید توسعه‌دهنده: آیا نبودِ guard در این صفحات عمدی است؟

---

### 🔄 بازنگری پایانی (پس از بررسی واقعی ۲۱ ماژول — 2026-07-19)
این فهرست در فاز ۱ پیش از بررسی عمیق نوشته شد. پس از تکمیل ۲۱ فایل ماژول، `BLOCKERS.md`، `98-selfcheck.md`، `99-coverage.md` و اسکن دیتابیس زندهٔ `afrakala`:

**الف) قابلیت‌های اصلاح‌شده (ادعای فاز-۱ که بررسی تصحیح/رد کرد):**
- `/integrations/didar`: **«نشت config» وجود ندارد** — صفحه فقط `bot_api_keys` (سه ستون غیرحساس) و `didar_import_log` را می‌خواند که هر دو در live محدود به admin/manager‌اند؛ هیچ credential/داده به نقش‌پایین نمی‌رود. شدت از «بالا» به «پایین». (BLOCKERS دستهٔ ب)
- `/pricing/quick-price` و `/pricing/settlement-types`: در کد فعلی **guard دستی دارند** (فاز-۱ آن‌ها را بدون guard گفته بود). فقط `/pricing/attention` و `/pricing/my-workbench` واقعاً بدون guard route‌اند.
- نوشتن برند/دسته (ماژول ۰۲): `accountant` هم مجاز است (RLS و UI سازگار) — فاز-۱ فقط admin/manager گفته بود. اصلاح مستندسازی (نه باگ).
- ماژول ۲۰: ادعای «اعتبارسنجی طول نام فروشگاه در `/admin/settings`» ساختگی بود (در کد نیست) — در بازنویسی حذف شد.
- کم‌پوشش شدید `03-pricing` (۱۲→۳۹ تست) و `20-admin-settings` (۱۰→۲۷) از نو و grounded نوشته شدند.

**ب) یافته‌های امنیتی جدید (تأییدشده از دیتابیس زندهٔ afrakala — جزئیات در `BLOCKERS.md`):**
- 🔴 **P0:** `inquiry_price_cache` (قیمت خرید مذاکره‌شده) و `didar_activities` (فعالیت CRM) — هر دو `qual=true`.
- **بالا:** `daily_capital_settings` (`total_capital`) و `dynamic_entity_scores` (امتیاز اعتباری/عملکرد) — `qual=true`.
- **الگوی سیستمی:** ۳۸ policyٔ `qual=true` در live؛ ۴ LEAK + ۶ CONFIG در migration واحد `20260719120000_rls_permissive_select_fix.sql` بسته شد؛ ۵ ⚠️ نیازمند تصمیم؛ ۲۳ REFERENCE عمداً باز.
- **واگرایی نوشتن:** `suppliers` (manager/accountant فراتر از UI می‌توانند حذف/تغییر کنند).
- **ریسک زیرساخت (پیش از production):** دیتابیس دومِ `postgres` با schema قدیمی و **کپی دادهٔ کسب‌وکار** روی همان کانتینر؛ و drift انوم `app_role` (نوع هست، ستون `text`).
- **پایین:** `academy_lessons/quizzes` (`auth.role()='authenticated'`، نه `true`؛ کلید پاسخ‌ها قفل admin/manager).

**ج) پنج حساب تست:** ۵ حساب تک‌نقشهٔ بخش ۳ تأیید شد. ⚠️ **حساب ششم `test.sales2` لازم است** — بدون آن تست منفیِ مالکیت فروش (فروشندهٔ الف نباید دادهٔ ب را ببیند) مسدود می‌ماند (بخش ۵-۳ و `99-coverage.md`).

**د) شکاف پوشش (از `99-coverage.md`):** جریان‌های احراز هویت (`login/register/reset-password`) و صفحهٔ **عمومی** `public.sale-lists.$listId` در هیچ ماژولی پوشش عملکردی ندارند؛ و توابع `SECURITY DEFINER` (که RLS را دور می‌زنند) فقط غیرمستقیم تست شده‌اند.

---

## ۲) دادهٔ تست موردنیاز (قبل از شروع تست باید وجود داشته باشد)

⚠️ **هشدار مهم — محیط فعلی تقریباً خالی از دادهٔ تراکنشی است.** بدون ساختن این داده‌ها، بخش زیادی از تست‌ها «مسدود» می‌شوند:

| موجودیت | تعداد فعلی در دیتابیس | برای تست چه لازم است |
|---|---|---|
| محصولات (`products`) | ۳۵۴ ✅ | کافی است؛ حداقل ۱ محصول با قیمت خرید فعال و قیمت فروش منتشرشده لازم است |
| مشتریان (`customers`) | **۱** ⚠️ | حداقل ۳ مشتری (یکی با مسئولِ فروشندهٔ تست، یکی بدون مسئول، یکی با سقف اعتبار) |
| پیش‌فاکتور (`sales_quotes`) | **۰** ⚠️ | باید حین تست ساخته شوند؛ برای تست وضعیت‌ها حداقل ۲ عدد |
| فاکتور (`invoices`) | **۰** ⚠️ | باید حین تست از روی پیش‌فاکتور ساخته شوند |
| اشخاص (`persons`) | **۰** ⚠️ | حداقل ۳ شخص، هر کدام با یک `visibility_scope` متفاوت (برای تست RLS نقش+visibility) |
| قیمت‌های خرید | نیاز به بررسی | برای انتشار قیمت لازم است |

**پیش‌نیازهای پیکربندی (باید موجود/فعال باشند):** حداقل یک «نوع قیمت فروش» فعال، حداقل یک «نوع تسویه» فعال، حداقل یک «قانون قیمت‌گذاری» فعال، و نرخ ارز فعال (برای محصولات ارزی).

### نحوهٔ آماده‌سازی داده
1. **دادهٔ مرجع** با اسکریپت `docs/qa/seed-data.sql` ساخته می‌شود: ۲۰ محصول، ۵ تأمین‌کننده، ۱۰ شخص (با `visibility_scope`های متفاوت)، ۵ مشتری، و نرخ ارز فعال. این اسکریپت را توسعه‌دهنده یک بار پیش از تست اجرا می‌کند.
2. **دادهٔ تراکنشی** (پیش‌فاکتور، فاکتور، بیجک) را **خودِ تسترها حین تست می‌سازند** — چون RLS فروش مالکیت‌محور است و هر رکورد باید به فروشندهٔ سازنده‌اش گره بخورد.
3. **قرارداد پیشوند:** هر تستر رکوردهایش را با پیشوند خودش می‌سازد (`ARM-` / `NIL-` / `HAN-` / `MRA-`) تا در RLS مالکیت‌محور قابل‌ردیابی باشند.

🔴 **همهٔ دادهٔ seed و تراکنشی تست باید پیش از تحویل به مشتری حذف شود** (به بخش ۳ و `BLOCKERS.md` مراجعه کن).

---

## ۳) حساب‌های تست

**قانون طلایی: هر حساب تست دقیقاً یک نقش دارد. حساب چندنقشه برای تست ممنوع است** — چون تست منفی (بررسی اینکه نقش پایین به چیزی دسترسی ندارد) را بی‌اعتبار می‌کند.

پنج حساب تک‌نقشه ساخته می‌شود:

| نام‌کاربری حساب | نقش | رمز | یادداشت |
|---|---|---|---|
| `test.admin` | admin (مدیر کل) | ⚠️ (توسعه‌دهنده پر می‌کند) | دسترسی کامل؛ تست ماژول‌های ۱۸، ۱۹، ۲۰ |
| `test.manager` | manager (مدیر بخش) | ⚠️ | تست ماژول‌های ۱۲، ۱۳، ۱۶، ۲۱ |
| `test.accountant` | accountant (حسابدار) | ⚠️ | ماژول‌های مالی/حسابداری/قیمت |
| `test.sales` | sales (فروشنده) | ⚠️ | فروش/مشتری خودش (RLS مالکیت‌محور) |
| `test.viewer` | viewer (بیننده) | ⚠️ | فقط مشاهده؛ ستون فقرات تست‌های منفی |

> **ستون رمز عمداً خالی است — توسعه‌دهنده پیش از تست پر می‌کند** (اعتبار در کد/اسناد مستند نشده).

> 🔴 **هشدار امنیتی — پیش از تحویل به مشتری:** این پنج حساب تست (`test.*`) و همهٔ رکوردهای seed/تراکنشیِ ساخته‌شده حین تست **باید حذف شوند**. محیط تحویل نباید هیچ حساب `test.*` داشته باشد.

**نکتهٔ RLS مالکیت‌محور:** فروش، مالکیت‌محور است — هر فروشنده فقط رکوردهای خودش را می‌بیند. چون هر چهار تستر انسانی از یک حساب `test.sales` استفاده نمی‌کنند (نیلا و آرمین هر دو با `test.sales` وارد می‌شوند)، برای تست منفیِ «فروشندهٔ الف دادهٔ فروشندهٔ ب را نبیند» ⚠️ **نیاز به تأیید توسعه‌دهنده:** یا یک حساب دوم `test.sales2` ساخته شود، یا این تست منفی با دو کاربر sales واقعیِ موجود انجام شود.

**قرارداد نام‌گذاری رکوردها:** هر تستر انسانی رکوردهایش را با پیشوند خودش می‌سازد تا در RLS مالکیت‌محور قابل‌ردیابی باشند:
- آرمین → پیشوند `ARM-`
- نیلا → پیشوند `NIL-`
- حانیه → پیشوند `HAN-`
- محمدرضا → پیشوند `MRA-`

(مثال: نام مشتری تست آرمین = «ARM- مشتری آزمایشی ۱».)

---

## ۴) راهنمای تستر (نحوهٔ پر کردن)

1. **ستون «نتیجهٔ واقعی»** را با آنچه دقیقاً دیدی پر کن (متن toast، پیام خطا، یا اسکرین‌شات). خالی نگذار.
2. **ستون «وضعیت»** یکی از این چهار باشد:
   - `قبول` — دقیقاً همان «نتیجهٔ مورد انتظار» رخ داد.
   - `رد` — رفتار متفاوت بود (باگ). حتماً نتیجهٔ واقعی را بنویس.
   - `مسدود` — نتوانستی تست کنی (پیش‌نیاز آماده نبود، صفحه باز نشد، خطای محیط). دلیل را بنویس. **همچنین:** اگر نقشی طبق طراحی دسترسی ندارد و نتیجه خالی است (مثلاً `accountant`/`viewer` طبق `role_permissions` محصول نمی‌بیند)، این «مسدود طبق طراحی» است — **باگ نیست، `رد` نزن**.
   - `نامشخص` — رفتار مبهم بود و مطمئن نیستی درست است یا نه؛ برای تصمیم به توسعه‌دهنده ارجاع بده.
3. **مراحل را دقیقاً به ترتیب و با همان متن دکمه‌ها/لیبل‌های فارسیِ داخل برنامه انجام بده.** اگر لیبل در برنامه با سند فرق داشت، همان را در «نتیجهٔ واقعی» یادداشت کن (خودش یک یافته است).
4. **تست‌های منفی را جدی بگیر:** جایی که نوشته «نباید ببینی/نباید بتوانی»، اگر برعکس شد، `رد` بزن و بنویس چه چیزی دیدی — این‌ها حساس‌ترین موارد امنیتی‌اند.
5. **موبایل:** هر صفحه را یک بار روی موبایل (یا حالت باریک مرورگر) هم باز کن؛ چیدمان RTL، دکمه‌های قابل‌لمس، و نبود اسکرول افقی را چک کن.
6. **تاریخ‌ها شمسی، اعداد با جداکنندهٔ هزارگان، و کل متن فارسی/راست‌به‌چپ** باید باشد؛ هر مورد انگلیسی یا چپ‌چین = یافته.

---

## ۵) ماتریس تخصیص (بر اساس «حساب»، نه «آدم»)

ماتریس بر اساس حساب تک‌نقشه نوشته شده. تخصیص انسانی زیر تعیین می‌کند چه کسی با کدام حساب وارد شود.

### ۵-۱) تخصیص انسانی

| تستر انسانی | حساب(های) تست | ماژول‌های مسئول | ترتیب |
|---|---|---|---|
| **محمدرضا** | `test.admin` + `test.viewer` | با admin: **18، 19، 20** · با viewer: **همهٔ تست‌های منفیِ نقش پایین** | admin اول، بعد viewer |
| **حانیه** | `test.accountant` سپس `test.manager` | با accountant: **03، 04، 05، 11، 15** · سپس با manager: **12، 13، 16، 21** | ⚠️ اول accountant را کامل تمام کند، بعد به manager سوییچ کند |
| **آرمین** | `test.sales` | **07، 08، 09** (+ ساخت دادهٔ ARM-) | — |
| **نیلا** | `test.sales` | **01، 09، 14، 17** (+ ساخت دادهٔ NIL-) | — |

> **قانون:** هیچ‌کس با دو نقش هم‌زمان وارد نشود. حانیه باید کاملاً از accountant خارج و با حساب manager وارد شود؛ لاگین هم‌زمان دو نقش، تست منفی را بی‌اعتبار می‌کند.

### ۵-۲) پوشش ماژول به حساب

| ماژول | حساب لازم برای مشاهده | حساب لازم برای ساخت/ویرایش |
|---|---|---|
| 01 داشبورد · 09 فاکتور · 14 دانش · 17 ارتباطات | `test.sales` (نیلا) | `test.sales` |
| 07 فروش · 08 مشتریان | `test.sales` (آرمین) | `test.sales` |
| 02 محصولات · 06 خرید · 10 اشخاص | `test.accountant`/`test.sales` (مشاهده) | `test.admin`/`test.manager` (ساخت) → محمدرضا/حانیه |
| 03 قیمت · 04 انتشار · 05 بازار · 11 حسابداری · 15 جداول پویا | `test.accountant` (حانیه) | `test.accountant`/`test.admin` |
| 12 عملیات · 13 گیمیفیکیشن · 16 ربات API · 21 جریمه (مدیریت) | `test.manager` (حانیه) | `test.manager`/`test.admin` |
| 18 لاگ · 19 کاربران/نقش · 20 تنظیمات ادمین | `test.admin` (محمدرضا) | `test.admin` |
| **همهٔ ماژول‌ها — تست منفی «نقش پایین نباید ببیند»** | `test.viewer` (محمدرضا) | — |

### ۵-۳) تست منفیِ مالکیت (RLS فروش)
چون هر دو فروشنده با یک حساب `test.sales` وارد می‌شوند، تست «فروشندهٔ الف دادهٔ ب را نبیند» با یک حساب قابل انجام نیست. ⚠️ **نیاز به تأیید توسعه‌دهنده:** ساخت حساب دوم `test.sales2` یا استفاده از دو کاربر sales واقعی. تا آن زمان این تست منفی «مسدود» علامت می‌خورد.

---

## پیوست: فهرست فایل‌های این بسته

- `00-index.md` — همین فایل (فهرست، حساب‌ها، دادهٔ لازم، تخصیص).
- `seed-data.sql` — اسکریپت دادهٔ مرجع (۲۰ محصول، ۵ تأمین‌کننده، ۱۰ شخص، ۵ مشتری، نرخ ارز فعال). **دادهٔ تراکنشی (پیش‌فاکتور/فاکتور) را خودِ تسترها با پیشوند خودشان می‌سازند.**
- `BLOCKERS.md` — فهرست صفحات بدون guard سطح-route (یافته‌های امنیتی). **این فایل باید پیش از توزیع محیط تست به صفر برسد.**
- `01`…`21`-`<module>.md` — یک فایل تست‌کیس به‌ازای هر ماژول جدول بخش ۱.
- `98-selfcheck.md` — بررسی مکانیکی هر ۲۱ فایل (تعداد تست‌کیس/منفی/موبایل، ستون اولویت، ⚠️، تطبیق با قابلیت‌ها).
- `99-coverage.md` — ماتریس پوشش: هر route ← تست‌کیس، routeهای یتیم، توابع سرور بدون تست، نقاط پرریسک سرتاسری.
- `rls-live-afrakala.txt` — خروجی مستقیم دیتابیس زندهٔ `afrakala` (۳۸ policyٔ باز روی SELECT) — مرجع اسکن الگوی سیستمی.
- `../supabase/migrations/20260719120000_rls_permissive_select_fix.sql` — migration واحد رفع الگوی سیستمی (روی branch `security/rls-permissive-select-fix`؛ نوشته‌شده، اجرا/commit نشده).
