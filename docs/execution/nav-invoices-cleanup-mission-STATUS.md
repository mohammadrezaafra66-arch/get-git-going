# مأموریت nav-invoices-cleanup — فازهای ۱ تا ۳ کامل، فاز ۴ متوقف

**تاریخ:** ۱۷ مرداد ۱۴۰۵ · **ساعت:** ۰۴:۵۰ به وقت تهران
**ابزار:** Claude Code · **مأموریت:** `docs/execution/2-nav-invoices-cleanup-mission.md`
**commitها:** `112d4e10` (فاز ۳) · `d1092786` (PROGRESS) · فازهای ۱–۲ داخل `75f56867` (توضیح پایین)
**وضعیت:** فاز ۱ ✅ · فاز ۲ ✅ · فاز ۳ ✅ · **فاز ۴ ⛔ شروع نشد**

> این فایل عمداً `-STATUS` نام دارد نه `-COMPLETE`، چون مأموریت کامل نشده است.

---

## چرا فاز ۴ شروع نشد (مرز توقف مأموریت)

این `working tree` بین **۶ عامل مشترک** است — نه فقط branch مشترک. شواهد زنده:

- `git pull --rebase` با `error: cannot pull with rebase: You have unstaged changes` رد شد،
  در حالی که فایل‌های dirty متعلق به مأموریت‌های دیگر بودند (از جمله
  `src/lib/treasury/queries.ts` و `_app.accounting.purchase-payments.tsx` که همین مأموریت
  صریحاً **لمسشان را ممنوع کرده**).
- کار commit‌نشدهٔ من **دو بار** کامل پاک شد. فاز ۳ هر دو بار از دیسک رفت و باید از نو نوشته
  می‌شد؛ بار سوم در یک فراخوان اتمیک (اعمال + commit در یک دستور) ثبت شد و نجات یافت.
- فازهای ۱ و ۲ من ناخواسته داخل commit عامل دیگری رفتند
  (`75f56867 fix(rbac): seed role_permissions…`) چون آن عامل `git add` فراگیر زد.

فاز ۴ یعنی `pg_dump` + `DROP` چهار جدول + `DROP` چند تابع + حذف route و فرم. اگر مهاجرت روی
دیتابیس اعمال شود ولی حذف کد وسط کار برگردانده شود — یا برعکس — اپ روی سرور تستِ مشترک با
۵ عامل دیگر به جدولی ارجاع می‌دهد که دیگر وجود ندارد. این دقیقاً مرزهای توقف **(الف)
DELETE/DROP** و **(ج) ابهام جبران‌ناپذیر** خودِ مأموریت است. با tree ناپایدار، اجرای فاز ۴
بی‌احتیاطی است، نه سرعت.

**برای ادامه لازم است:** یا هر عامل worktree/clone جدا بگیرد، یا فاز ۴ تنها کار در جریان روی
این tree باشد.

---

## فایل‌های بررسی‌شده

`PROGRESS.md` · `AGENTS.md`/`CLAUDE.md` · `docs/execution/2-nav-invoices-cleanup-mission.md` ·
`docs/audits/system-wide-wiring-audit.md` (+ `-COMPLETE`) · `src/lib/navigation/registry.ts` ·
`src/lib/navigation/{types,selectors,metadata}.ts` · `src/components/layout/primary-modules.ts` ·
`src/lib/rbac/roles.ts` · `src/routeTree.gen.ts` · ۳۸ فایل روت برای خواندن گارد واقعی ·
`_app.integrations.didar.tsx` · `_app.operations.didar.tsx` · `_app.accounting.daily-capital.tsx`
(الگوی redirect) · `scripts/generate-release-notes.mjs` · `docs/qa/BLOCKERS.md`

## فایل‌های تغییرکرده و دلیلشان

| فایل | چرا |
|---|---|
| `src/lib/navigation/registry.ts` | حذف `PRIMARY_MODULE_PATHS` (۱۰۳ خط) و `primaryModuleForRoute`؛ `primaryModule` حالا از `PRIMARY_MODULES` مشتق می‌شود. ۷ ردیف `ROLE_ALLOWLIST_BY_ROUTE` اضافه/اصلاح شد تا با گارد واقعی route بخواند؛ `adminOnly` از ۳ seed گیمیفیکیشن برداشته شد؛ seed دیدار به `/operations/didar` منتقل شد. |
| `src/components/layout/primary-modules.ts` | ۳۷ مسیر یتیم + `/operations/didar` وصل شد؛ کامنت «هر دو فهرست را ویرایش کن» که **دروغ** بود حذف و با توضیح درست جایگزین شد. |
| `src/routes/_app.operations.didar.tsx` | نجات دو قابلیت از صفحهٔ بازنشسته: آمار هر سه موجودیت + جدول ۱۰۰ رکورد آخر. |
| `src/routes/_app.integrations.didar.tsx` | تبدیل به redirect shim (نه ۴۰۴ خام). |
| `PROGRESS.md` | ردیف‌های این مأموریت. |

## یافته‌های اصلی

**۱ — زنجیرهٔ مرگ `PRIMARY_MODULE_PATHS` زنده تأیید شد، نه از روی گزارش.**
تنها مصرف‌کننده‌اش `primaryModuleForRoute()` بود ⇒ `entry.primaryModule` ⇒ فقط دو خواننده:
`getNavigationEntriesByModule()` با **صفر فراخوان** در کل مخزن، و `resolveNavigationMetadata().module`
که تنها مصرف‌کننده‌اش `NavigationBreadcrumbs` است و **فقط `breadcrumbs` را می‌خواند**.

**۲ — ۷ مجوز نقش با گارد واقعی route نمی‌خواند.** خطرناک‌ترینشان انبار بود:
`warehouse:view` به **۵ نقش** داده شده ولی هر سه route با `requireAnyRole(["admin","manager"])`
(و kardex + accountant/purchase_specialist) بسته‌اند. وصل‌کردن بدون pin کردن allowlist، کل
بخش انبار را جلوی فروشنده می‌گذاشت و بعد به `/unauthorized` پرتش می‌کرد.

**۳ — `adminOnly` روی ۳ seed گیمیفیکیشن، حسابدار را از صفحه‌ای پنهان می‌کرد که گاردش قبولش دارد.**
`adminOnly` یعنی admin **یا** manager (`selectors.ts:35`) و با `allowedRoles` **AND** می‌شود.

**۴ — صفحهٔ `/integrations/didar` عملاً مرده بود، نه فقط تکراری.** دکمه‌های همگام‌سازی stub
بودند (۶۰۰ms + توست «به‌زودی») و نشانگر اتصال `bot_api_keys` را می‌خواند که RLS فعال و
**صفر policy** دارد ⇒ برای هر کاربر غیر superuser همیشه «متصل نیست».

## Evidence

```
typecheck (baseline before start) ....... 70
typecheck after phases 1-2 .............. 70
typecheck after phase 3 ................. 70
```

گیت خودکار ناوبری (اسکریپت روی `primary-modules.ts` × `registry.ts` × `routeTree.gen.ts`):

```
my additions: 37
  not present in PRIMARY_MODULES: none
  without a real route (broken):  none
paths in PRIMARY_MODULES: 122 | duplicates: none
```

eslint فایل‌های لمس‌شده: `_app.operations.didar.tsx` **۱۰ خطا / ۲۳ هشدار** در برابر baseline
**۱۱ / ۲۳** روی نسخهٔ HEAD همان فایل (یعنی یکی کمتر، صفر مورد تازه). سه فایل دیگر تمیز.

تأیید نهایی روی HEAD: redirect shim ✅ · `ImportHistorySection` ✅ · `import-stats` ✅ ·
`PRIMARY_MODULE_PATHS` صفر ✅ · `/warehouses` + `/persons/merge` + `/operations/didar` در
`PRIMARY_MODULES` ✅.

**تست:** این پروژه `test script` ندارد — اجرا نشد و ادعای اجرا نمی‌شود. e2e مرورگری اجرا نشد.

## Migration / RLS / RBAC / Audit

- **Migration:** هیچ. فازهای ۱–۳ صرفاً فرانت‌اند بودند.
- **RLS:** بدون تغییر.
- **RBAC:** فقط **باریک‌تر** شد، هرگز بازتر — ۷ allowlist و ۳ حذف `adminOnly`. هیچ گارد
  سمت سرور، هیچ policy و جدول `role_permissions` (کار عامل دیگر) لمس نشد.
- **Audit log:** بدون تغییر.
- **بستن یک حفرهٔ جانبی:** `/integrations/didar` هیچ `beforeLoad` نداشت
  (`docs/qa/BLOCKERS.md`)؛ حالا redirect می‌شود به مسیری که `requireAdmin()` دارد.

## Assumptions

1. **`/integrations/didar` redirect شد، نه حذف کامل.** مأموریت هر دو را مجاز کرده بود. redirect
   انتخاب شد چون URL ممکن است bookmark شده باشد، صفحهٔ جایگزین بعد از port یک ابرمجموعهٔ کامل
   است، و مخزن از قبل همین الگو را دارد (`_app.accounting.daily-capital.tsx`).
2. **seed دیدار روی `module: "bot-api-keys"` ماند** با اینکه صفحهٔ جدید آن جدول را نمی‌خواند —
   برای پیوستگی با seed قبلی. گاردش `requireAdmin()` است و admin در `hasPermissionEx` مدار
   کوتاه می‌کند، پس module اصلاً این route را gate نمی‌کند؛ `allowedRoles: ["admin"]` است که
   منو را دقیقاً با گارد هم‌اندازه می‌کند.
3. **`/gamification/settings` به ماژول `admin` رفت** (نه `analytics`)، چون صفحهٔ تنظیمات است.
4. **ماتریس ایستای `PERMISSIONS` در `roles.ts` عمداً دست نخورد** — بازکردن مجوز تغییری
   امنیتی است و درخواست نشده بود. پیامدش پایین آمده.

## ⚠️ مانده‌ها و ریسک‌ها

1. **فاز ۴ اصلاً انجام نشد** — زیرسیستم `invoices` (۴ جدول با صفر ردیف + route + فرم +
   تریگر + توابع) کاملاً سرجایش است. بررسی نجاتِ چهار منطقی که Codex هشدار داده بود
   (credit hold، capital hold، وظایف گردش‌کار، بارنامه) **انجام نشده**.
2. **یادداشت انتشار فازهای ۱–۲ گم شد.** بزرگ‌ترین تغییر کاربرپسند این مأموریت (۳۷ صفحه که
   حالا در سایدبار دیده می‌شوند) داخل `75f56867` رفت که تریلر `Release-note-fa:` ندارد ⇒
   **به کاربر اعلام نمی‌شود**. اگر مالک بخواهد، یک commit خالی با تریلر فارسی کافی است.
3. **۹ صفحهٔ `/gamification/admin/*` و بیشتر `/admin/*` روی `module: "roles"` هستند و
   `roles:view` در ماتریس ایستا فقط `["admin"]` است.** یعنی manager/accountant با اینکه گارد
   route قبولشان دارد، تا وقتی `role_permissions` ردیف `roles` نداشته باشد لینک را نمی‌بینند.
   حذف `adminOnly` لازم بود ولی **کافی نیست**؛ نیمهٔ دوم دست عامل `db-hygiene` است.
4. **این tree هنوز مشترک است.** تا وقتی حل نشود، هر کار commit‌نشدهٔ هر عاملی در خطر است.
5. **بررسی مرورگری انجام نشد** (فقط انسان می‌تواند): دیدنِ واقعی ۳۷ آیتم تازه در سایدبار با
   JWT هر نقش، کلیک روی هرکدام، و باز شدن `/integrations/didar` که باید به `/operations/didar`
   برود. build/deploy روی LAN هم اجرا نشد چون فاز ۴ نیمه‌کاره متوقف شد.

---

# فاز ۴ — بررسی نجات منطق (کامل، پیش از هر حذفی)

طبق دستور خودِ فایل مأموریت، این بررسی **قبل از** هرگونه حذف انجام و ثبت شد.
هیچ‌چیز حذف نشده است. همهٔ دسترسی‌های دیتابیس `SELECT` روی کاتالوگ و شمارش ردیف بود.

## ۴-الف) چهار منطقی که Codex هشدار داده بود

| منطق | در invoice چیست | آیا `sales_quotes` معادلش را دارد؟ | حکم |
|---|---|---|---|
| **نگه‌داشتن اعتبار** (`hold_credit`/`release_credit`، کلیدخوردهٔ `p_invoice_id`) | **رزرو** واقعی: `available_credit` کم و `held_credit` زیاد می‌شود | **نه.** `create_sales_quote_with_items` اعتبار را فقط **بررسی** می‌کند (`get_customer_dynamic_credit` + گیت معوقه/تخصیص/کسری + `credit_check_snapshot`) ولی چیزی **رزرو نمی‌کند** | 🟠 **منحصربه‌فرد** — گیتِ پیش‌فاکتور سخت‌گیرتر است، ولی «رزرو» فقط اینجاست |
| **نگه‌داشتن سرمایه** (`hold_capital_allocation` + `consume_/release_/refund_capital_allocation`) | پیش‌بررسی `can_use_customer_capital_allocation` سپس hold | **نه** | 🟡 منحصربه‌فرد ولی **نیمه‌کاره**: `release_`/`consume_`/`refund_capital_allocation` در کل فرانت‌اند **صفر فراخوان** دارند ⇒ سرمایه hold می‌شود و هیچ مسیری آزادش نمی‌کند |
| **وظایف گردش‌کار** (`invoice_workflow_stages`، `create_preinvoice_workflow_tasks`، `complete_invoice_task`) | ۵ ردیف پیکربندی زنده؛ صفحهٔ `/admin/workflow-stages` مدیریتش می‌کند | **نه** | 🔴 **منحصربه‌فرد و زنده‌متصل** — `complete_invoice_task` از `/operations/tasks` صدا زده می‌شود که صفحه‌ای **در سایدبار** است |
| **بارنامه** (`waybills`، `waybill_items`، `create_waybill_for_invoice`، `create_waybills_batch`) | زنجیرهٔ کامل بارنامه + صفحهٔ `/admin/waybill-fields` که **در سایدبار است** | **نه** | 🔴 **منحصربه‌فرد** — قابلیت کسب‌وکاری واقعی (مستندات حمل) که با حذف از بین می‌رود |

## ۴-ب) شواهد زنده (دیتابیس `afrakala`)

```
invoices 0 · invoice_items 0 · waybills 0 · waybill_items 0     ⇒ فرض «صفر ردیف» درست است
payment_receipt_links 3 ردیف — با invoice_id: 0
delivery_receipts      1 ردیف — با invoice_id: 0
customer_credit_balance 9 ردیف — مجموع held_credit: 0.00        ⇒ هیچ رزرو زنده‌ای وجود ندارد
invoice_workflow_stages 5 · sales_quotes 50
```

کلیدهای خارجی که به `invoices` اشاره می‌کنند (از `pg_constraint` زنده، نه از export):

```
invoice_items         → CASCADE
payment_receipt_links → RESTRICT
waybills              → RESTRICT
delivery_receipts     → NO ACTION
```

## ۴-ج) ⛔ یافتهٔ تعیین‌کننده — دامنهٔ انفجار بسیار بزرگ‌تر از فرض مأموریت است

مأموریت سه تابع نام می‌برد (`cancel_invoice`, `send_invoice_to_accountant`,
`validate_invoice_item_price`). شمارش زنده روی `pg_proc` **۲۵ تابع** می‌دهد که در بدنه‌شان
به `invoices` ارجاع دارند — و بیشترشان اصلاً مختص invoice نیستند، بلکه هستهٔ زندهٔ مالی و
هویت‌اند:

```
post_receipt_accounting          enforce_payment_receipt_link_limits
get_receivable_detail            enforce_receipt_approval_allocation_limits
calculate_credit_score           update_customer_overdue_status
person_merge                     person_fk_drift_report
recompute_employee_scores_on_receipt(_link)   recalculate_settlement_score
calculate_salesperson_collected_sales         asan_list_sales_export
get_product_timeline             create_delivery_receipt   … و ۱۱ تای دیگر
```

سه پیامد که حذف را از «۴ جدول خالی، بی‌ریسک» به یک تغییر پرخطر تبدیل می‌کند:

1. **حذف `invoices` بدون دست‌زدن به جدول‌های ممنوعه ممکن نیست.** PostgreSQL اجازه نمی‌دهد
   جدولی که به آن ارجاع هست drop شود، پس باید `payment_receipt_links_invoice_id_fkey` (یک
   شیء `payment_*`) و `delivery_receipts_invoice_id_fkey` حذف شوند. فایل مأموریت صریحاً
   «هر migration مالی (`journal_*`, `payment_*`, `treasury/*`)» را در فهرست **لمس‌نکردنی**
   گذاشته است.
2. **این دقیقاً همان چیزی است که عامل ۵ همین حالا دارد بازنویسی می‌کند.**
   `post_receipt_accounting` و دو تابع `enforce_*` قلب زنجیرهٔ فیش/حسابداری‌اند و
   `ledger-mutual-settlement` در همین ساعت روی `treasury/queries.ts` و
   `_app.accounting.purchase-payments.tsx` کار می‌کند. تابعی که در بدنه‌اش به جدول
   حذف‌شده ارجاع دارد، **هنگام اجرا** می‌افتد، نه هنگام drop.
3. **`person_merge` همان تله‌ای است که PROGRESS دو بار ثبت کرده.** این تابع فهرست کارش را در
   زمان اجرا از `pg_constraint` می‌خواند و روی هر کلید خارجیِ ناشناخته **کل ادغام را متوقف
   می‌کند** (مهاجرت‌های ۲۷۱ و ۲۸۷ هر دو با همین شکستند و هر دو بار «رگرسیون کل سامانه» شد).
   حذف `invoices` گراف کلیدهای خارجی را تغییر می‌دهد.

## ۴-د) حکم

**داده‌ای در خطر نیست** (هر چهار جدول صفر ردیف، هیچ ارجاع زنده‌ای، `held_credit = 0`).
مسئله داده نیست، **کوپلینگ کد** است.

از چهار منطق، **هیچ‌کدام معادلی در `sales_quotes` ندارند**؛ دو تای اول عملاً مرده‌اند
(رزرو صفر، آزادسازی بدون فراخوان) ولی **وظایف گردش‌کار و بارنامه هر دو زنده و از سایدبار
قابل‌دسترس‌اند**. حذف کامل، این دو را از بین می‌برد.

اجرای فاز ۴ به‌صورت نوشته‌شده بدون یکی از این دو ممکن نیست: (الف) تغییر اشیای صریحاً
ممنوع (`payment_receipt_links` و توابع حسابداری)، یا (ب) جا گذاشتن ۱۰+ تابع زنده که به
جدول حذف‌شده ارجاع می‌دهند و هنگام اجرا می‌افتند. این همان مرز توقفی است که خودِ بند
«بررسی نجات منطق» فاز ۴ پیش‌بینی کرده بود: **«اگر واقعاً مهم به‌نظر رسید، متوقف شو و از
مالک بپرس قبل از حذف نهایی.»**

## Self-Host Acceptance Check

بدون CDN، بدون فونت آنلاین، بدون API خارجی تازه، بدون سرویس ابری. هیچ secret اضافه نشد،
هیچ `VITE_` تازه‌ای ساخته نشد. `/operations/didar` همان `shop_settings` موجود را می‌خواند.
همه‌چیز روی Linux + Docker + Supabase self-host بدون تغییر کار می‌کند.
