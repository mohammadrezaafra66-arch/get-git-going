# مأموریت nav-invoices-cleanup — چهار فاز اجرا شد، حذف جدول `invoices` عمداً معوق

**تاریخ:** ۱۷ مرداد ۱۴۰۵ · **ساعت:** ۰۶:۰۰ به وقت تهران
**ابزار:** Claude Code · **مأموریت:** `docs/execution/2-nav-invoices-cleanup-mission.md`
**commitها:** `112d4e10` (فاز ۳) · `1d21a038` (بررسی نجات فاز ۴) · فازهای ۱–۲ داخل `75f56867` (توضیح پایین)
**وضعیت:** فاز ۱ ✅ · فاز ۲ ✅ · فاز ۳ ✅ · **فاز ۴ ✅ نسخهٔ مرحله‌ای (مهاجرت ۳۲۳)** — با یک
پیگیری معوقِ صریح: **جدول `invoices` دست‌نخورده است**.

> این فایل عمداً `-STATUS` نام دارد نه `-COMPLETE`: بخشی از فاز ۴ آگاهانه و با تصمیم مالک
> به بعد موکول شد، پس مأموریت «تمام» نیست، «تا مرز ایمن جلو رفته» است.

---

## چرا فاز ۴ اولش شروع نشد (بخش تاریخی — بعداً با worktree ایزوله حل شد)

> این بخش وضعیت پیش از تصمیم مالک را ثبت می‌کند. راه‌حل: مالک یک worktree جدا
> (`git worktree add --detach ../afrakala-nav-cleanup`) تأیید کرد و نسخهٔ **مرحله‌ای** را
> انتخاب کرد؛ فاز ۴ در همان worktree ایزوله اجرا شد. بخش «۴-ه» پایین نتیجه را دارد.

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

## ۴-ه) آنچه واقعاً اجرا شد — نسخهٔ مرحله‌ای (تصمیم مالک)

مالک نسخهٔ **مرحله‌ای** را انتخاب کرد: بخش خودبسنده حالا حذف شود، جدول `invoices` دست‌نخورده بماند.

**مهاجرت ۳۲۳** (`20260808130000_323_drop_dead_invoice_items_and_waybills.sql`) — اعمال شد با
`--single-transaction -v ON_ERROR_STOP=1`، سپس `docker restart afrakala-lan-rest`:

- **۳ جدول حذف شد:** `waybill_items` → `waybills` → `invoice_items` (فرزند پیش از والد، هر سه صفر ردیف).
- **۵ تابع حذف شد:** `create_waybill_for_invoice`، `create_waybills_batch`، `update_waybill_status`،
  `audit_invoice_item_insert`، `validate_invoice_item_price` (دو تای آخر تابع تریگر بودند و
  حذف جدول آن‌ها را پاک نمی‌کند، پس صریحاً drop شدند).
- **۲ شیء زنده بازنویسی شد، نه حذف** — و هر دو از **تعریف زنده** وصله شدند
  (`docs/verification/pre-323/`)، نه از حافظه:
  - `get_product_timeline` — تنها شاخه‌ای که `invoice_items` را می‌خواند حذف شد. آن شاخه از قبل
    مرده بود (`delivery_receipts` صفر ردیف با `invoice_id`).
  - `v_promotion_suggestions` — CTE به‌نام `sales_90d` با یک مجموعهٔ **خالیِ هم‌نوع** جایگزین شد تا
    رفتار view **بایت‌به‌بایت** مثل قبل بماند (این CTE از قبل همیشه خالی بود).
- مهاجرت **ادعاهای خودش را داخل همان تراکنش** بررسی می‌کند: صفر جدول باقی‌مانده، صفر تابع
  باقی‌مانده، **صفر ارجاع معلق**، و `invoices` هنوز خوانا.

**⛔ دو چیزی که فقط چون تست شدند گرفته شدند** (هر دو پیش از اعمال واقعی):

1. **dry-run داخل `BEGIN … ROLLBACK` شکست خورد** — ادعای «هیچ تابعی نباید به جدول حذف‌شده ارجاع
   دهد» آتش گرفت. علت: `pg_get_functiondef` **کامنت‌ها را هم برمی‌گرداند** و کامنت توضیحی خودم
   داخل تابع، نام جدول حذف‌شده را داشت. کامنت بازنویسی شد. اگر ادعا نوشته نشده بود، این هرگز
   دیده نمی‌شد.
2. **`WaybillCustomFieldsInput` نزدیک بود اشتباهی حذف شود** — به‌نظر یک کامپوننت بارنامه می‌آمد،
   ولی `PaymentReceiptForm.tsx` (زنده) واردش می‌کند. بازگردانده شد؛ هیچ دسترسی دیتابیسی ندارد.

**سمت کد:** ۶ روت و ۳ کامپوننت حذف شدند (`InvoiceForm`، `WaybillForm`، `WaybillStatusBadge`)،
دو seed ناوبری و مسیرهایشان برداشته شد. سه لینک مردهٔ `/sales/invoices/$invoiceId` در
`_app.accounting.receivables.tsx` (۲ مورد) و `_app.operations.tasks.tsx` (۱ مورد) حذف شدند —
در هر سه، دکمهٔ اصلی کنارشان دست‌نخورده ماند (مطالبات همان دیالوگ «جزئیات» را دارد).

**تأیید:** typecheck **۷۰** (پایه حفظ شد) · build **سبز** · eslint فایل‌های لمس‌شده **۰ خطا**
(۲ هشدار `any` از قبل) · گیت ناوبری: **۱۲۴ مسیر، صفر لینک شکسته، صفر seed بی‌ماژول** ·
پس از اعمال روی دیتابیس زنده: `get_product_timeline` اجرا می‌شود،
`v_promotion_suggestions` **۱۹٬۸۸۰ ردیف** برمی‌گرداند، `post_receipt_accounting` سالم است.

---

# شرط ۱ برطرف شد — مهاجرت ۳۲۷ (`post_receipt_accounting` از `invoices` جدا شد)

**تاریخ:** ۱۷ مرداد ۱۴۰۵ · مهاجرت `20260808170000_327_...` اعمال شد، `afrakala-lan-rest` ری‌استارت شد.

## چه چیزی عوض شد — و چه چیزی عمداً عوض نشد

تنها تغییر: حلقهٔ `-- Allocate to invoices` (۲۸ خط) و چهار متغیر محلی که فقط همان حلقه
استفاده می‌کرد (`v_link`, `v_paid`, `v_total`, `v_new_status`). `diff` مقابل تعریف زنده
اثبات می‌کند **هیچ چیز دیگری** تغییر نکرده: گارد نقش، `posting_status='posted'`،
`increase_credit()`، سند دفتر idempotent و هر دو خط سند بایت‌به‌بایت دست‌نخورده‌اند.

**کلید `invoice_updates` در خروجی باقی ماند** (همیشه `[]`) چون رابط حسابدار
(`_app.accounting.receipts.$receiptId.tsx`) آن را می‌خواند و در `audit_logs` می‌نویسد.

**تغییر رفتاری نیست و انتقال قابلیت هم نیست:** هیچ معادل «پیش‌فاکتور را پرداخت‌شده علامت بزن»
جایش گذاشته نشد. اینکه تسویهٔ فیش باید ردیف `sales_quotes` را جابه‌جا کند یا نه یک **تصمیم
محصولی** است و عمداً داخل یک مهاجرتِ جداسازی قاچاق نشد.

## چرا حذف حلقه امن بود — اثبات، نه نمونه‌گیری

حلقه روی `payment_receipt_links JOIN public.invoices` می‌چرخید. اندازه‌گیری زنده پیش از تغییر:
`payment_receipt_links` سه ردیف داشت و **صفر** تای آن‌ها `invoice_id` غیرتهی داشت، و
`invoices` **صفر ردیف** دارد. پس JOIN در هر فراخوان صفر ردیف می‌داد و بدنهٔ حلقه **هرگز اجرا
نمی‌شد** — این استدلال است، نه نمونهٔ تصادفی.

## گیت برابری old-vs-new روی دیتابیس زنده (هر دو سمت rollback شد)

فیش واقعی `123456` (۱۲٬۰۰۰٬۰۰۰) با JWT ادمین واقعی، یک‌بار با تعریف قدیم و یک‌بار با ۳۲۷
اعمال‌شده داخل تراکنش — **خروجی بایت‌به‌بایت یکسان**:

```
{"posted": true, "customer_credit": {...available_credit: 12000000.00...}, "invoice_updates": []}
line 1 | bank            | 32a4c282… | 12000000.00 |           0 | واریز به حساب بانکی شرکت
line 2 | customer_credit | 4a42034a… |           0 | 12000000.00 | افزایش اعتبار/کاهش بدهی مشتری
entry  | 2026-07-30 | سند فیش واریزی شماره 123456 | posted | payer 5550 | receiver cust-123
posting_status → posted
```

`invoice_updates` **در سمت قدیم هم `[]` بود** — یعنی همان اثباتِ بالا را تجربی هم تأیید کرد.
هر دو تراکنش ROLLBACK شدند؛ هیچ داده‌ای نوشته نشد (`posted` همچنان ۱ ردیف).

## ⚠️ تصحیح — عددهای «۲۵» و «۲۱» تابع، بیش‌برآورد بودند

آن دو شمارش با الگوی کلمه‌ای `\minvoices\M` روی `pg_get_functiondef` گرفته شده بودند و
`pg_get_functiondef` **کامنت‌ها را هم برمی‌گرداند**. مثال زنده: همین تابع بعد از ۳۲۷ هنوز
word-match می‌دهد، ولی تنها خط منطبقش یک **مسیر مستند در کامنت** است:

```
-- posting later. See docs/execution/nav-invoices-cleanup-mission-STATUS.md, phase 4.
                                       ^^^^^^^^ «nav-invoices-cleanup»
```

عدد درست باید روی شکل کد (`public\.invoices`) گرفته شود:

| سنجه | پیش از ۳۲۷ | پس از ۳۲۷ |
|---|---|---|
| ارجاع **کد** (`public.invoices`) | ۱۸ | **۱۷** |
| word-match (بیش‌برآورد، شامل کامنت و نام فایل) | ۲۱ | ۲۱ |

`post_receipt_accounting` حالا `code_match = false` است. ضمناً معلوم شد `person_merge`،
`calculate_credit_score` و `asan_list_sales_export` اصلاً ارجاع **کدی** نداشتند و از همان
بیش‌برآورد آمده بودند — این شرط ۲ را تغییر نمی‌دهد (آن دربارهٔ خواندن `pg_constraint` است،
نه دربارهٔ نام جدول در بدنه).

**۱۷ تابع باقی‌مانده با ارجاع کدی واقعی:**
`calculate_salesperson_collected_sales` · `cancel_invoice` · `complete_invoice_task` ·
`create_delivery_receipt` · `create_preinvoice_workflow_tasks` ·
`enforce_payment_receipt_link_limits` · `enforce_receipt_approval_allocation_limits` ·
`get_receivable_detail` · `invoices_log_type_changes` · `person_fk_drift_report` ·
`recalculate_settlement_score` · `recompute_all_employee_scores` ·
`recompute_employee_scores_on_receipt(_link)` · `send_invoice_to_accountant` ·
`set_invoice_accounting_marker` · `update_customer_overdue_status`

## وضعیت سه شرط پس از ۳۲۷

| # | شرط | وضعیت |
|---|---|---|
| ۱ | `post_receipt_accounting` از `invoices` جدا شود | ✅ **برطرف شد (۳۲۷)** |
| ۲ | ثبت تغییر FK در سامانه‌ای که `pg_constraint` را برای `person_merge` می‌خواند | 🔴 باز |
| ۳ | حذف ۲ کلید خارجی + بازبینی ۱۷ تابع باقی‌مانده | 🔴 باز |

---

## 🔴 پیگیری معوق — جدول `invoices` هنوز باید حذف شود

> **invoices table itself still needs dropping, blocked on ledger-mutual-settlement agent
> finishing its `post_receipt_accounting` changes, and must register the FK change with
> whatever system reads `pg_constraint` for `person_merge` before dropping — migrations 271
> and 287 both broke merge this same way.**

### دلیل دوم (تأییدشدهٔ مستقل) — کوپلینگ مستقیم `post_receipt_accounting`

عامل ledger مأموریتش را تمام کرد (`2e73b99d`)، ولی **این شرط اول را برطرف نمی‌کند — برعکس،
آن را سخت‌تر می‌کند.** گزارش پایانی‌اش (`docs/execution/ledger-mutual-settlement-mission-COMPLETE.md`)
صریحاً می‌گوید:

> «**`post_receipt_accounting` هنوز به جدول `invoices` وصل است** و عامل `nav-invoices-cleanup`
> قرار است آن زیرسیستم را حذف کند. اگر آن جدول حذف شود، **مسیر ثبت فیش می‌شکند**. این را لمس
> نکردم (خارج از دامنه و مال عامل دیگر) ولی تعارضش را اینجا ثبت می‌کنم چون کسی باید ببیندش.»

و `post_receipt_accounting` **تنها تابعی است که در دفتر حسابداری می‌نویسد**. یعنی حذف جدول
`invoices` کل مسیر ثبت سند فیش را می‌شکند — و چون تابع در **زمان اجرا** می‌افتد نه هنگام drop،
مهاجرت سبز می‌شود و خرابی بعداً و جای دیگری ظاهر می‌شود.

این دلیلِ دومِ مستقل است. این تابع در فهرست ۲۵ تابعی که ممیزی خودم پیدا کرد هم بود، ولی عامل
ledger با خواندن بدنه‌اش تأیید مستقل و دقیق‌تری داد. **پس اکنون سه شرط برای حذف جدول `invoices`
باز است، نه دو تا:**

1. `post_receipt_accounting` باید از `invoices` جدا شود (ledger مأموریتش تمام شد ولی این را
   عمداً دست نزد — پس این کار **هنوز انجام نشده**).
2. تغییر FK باید در سامانه‌ای که `pg_constraint` را برای `person_merge` می‌خواند ثبت شود.
3. ~۲۰ تابع باقی‌مانده بازبینی شوند و FK روی `payment_receipt_links` حذف شود.

**هیچ‌کدام از این‌ها در این مأموریت انجام نشد و جدول `invoices` دست‌نخورده است** — مهاجرت ۳۲۳
حتی داخل همان تراکنش ادعا می‌کند که `invoices` باید هنوز موجود و خوانا باشد.

هرکس این را ادامه می‌دهد، این‌ها هم بخشی از همان کارند:
- حذف FK روی `payment_receipt_links` (و `delivery_receipts`) — هر دو امروز صفر ردیف با `invoice_id`.
- ~۲۰ تابع باقی‌مانده که در بدنه‌شان `invoices` دارند باید بازبینی شوند (نه لزوماً حذف).
- `/admin/waybill-fields` و جدولش `waybill_custom_fields` **عمداً دست‌نخورده ماندند** — خارج از
  دامنهٔ تأییدشده بودند. حالا پیکربندیِ قابلیتی هستند که دیگر وجود ندارد؛ حذفشان به همین
  پیگیری تعلق دارد. (کامپوننت `WaybillCustomFieldsInput` باید بماند — فرم فیش پرداخت از آن استفاده می‌کند.)
- `v_promotion_suggestions.sales_90d` اکنون یک مجموعهٔ خالی است. سیگنال واقعی فروش ۹۰ روزه در
  `sales_quote_items`/`sales_quotes` است؛ وصل‌کردنش یک **تغییر رفتاری** است و عمداً در مهاجرت
  حذف گنجانده نشد.

## Self-Host Acceptance Check

بدون CDN، بدون فونت آنلاین، بدون API خارجی تازه، بدون سرویس ابری. هیچ secret اضافه نشد،
هیچ `VITE_` تازه‌ای ساخته نشد. `/operations/didar` همان `shop_settings` موجود را می‌خواند.
همه‌چیز روی Linux + Docker + Supabase self-host بدون تغییر کار می‌کند.
