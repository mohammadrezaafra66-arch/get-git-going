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

## Self-Host Acceptance Check

بدون CDN، بدون فونت آنلاین، بدون API خارجی تازه، بدون سرویس ابری. هیچ secret اضافه نشد،
هیچ `VITE_` تازه‌ای ساخته نشد. `/operations/didar` همان `shop_settings` موجود را می‌خواند.
همه‌چیز روی Linux + Docker + Supabase self-host بدون تغییر کار می‌کند.
