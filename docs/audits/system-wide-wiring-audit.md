# سیستم‌وار — قابلیت‌های دوبار ساخته‌شده یا نصفه‌کاره

**مأموریت:** `docs/audits/system-wide-wiring-audit-mission.md`
**HANDOFF:** `docs/audits/system-wide-wiring-audit-progress.md`
**نوع:** فقط‌خواندنی. هیچ کد، مهاجرت یا داده‌ای تغییر نمی‌کند.
**مبنا:** `HEAD = da7f4c5d`، برنچ `feature/navigation-modernization`

> این ممیزی مستقل از دو ممیزی حسابداری هم‌زمان (Claude Code روی C/F و Codex روی
> B/D/H/I/J) اجرا می‌شود و فقط در همین دو فایل می‌نویسد.

**وضعیت گام‌ها:** گام ۱ ✅ · گام ۲ ✅ · گام ۳ ✅ · گام ۴ ✅ — **هر چهار گام کامل**

---

## خلاصه‌ی مدیریتی — یافته‌های مرتب‌شده بر اساس سردرگمی/ریسک روزانه

> این فهرست با تکمیل گام‌های ۲ تا ۴ به‌روز می‌شود. تا اینجا فقط خروجی گام ۱ لحاظ شده.

| # | یافته | شدت | جای اصلی |
|---|---|---|---|
| ۰ | **دکمه‌ی «تغییر نقش عضو گروه» تابعی را صدا می‌زند که در دیتابیس نیست** — همیشه خطا می‌دهد | 🔴 | `GroupMembersDialog.tsx:166` |
| ۱ | **کامنتِ «هر دو را با هم ویرایش کن» دروغ است** — کپی داخل `registry.ts` هیچ اثری بر سایدبار ندارد و در عمل مرده است | 🔴 | `registry.ts:1109` |
| ۲ | همان دو فهرست **در ۷ مسیر دیگر هم واگرا شده‌اند**، نه فقط `/updates` | 🔴 | `registry.ts:1109` ↔ `primary-modules.ts:36` |
| ۳ | **۳۸ صفحه‌ی seedشده در هیچ ماژول سایدبار نیستند** — فقط با جستجو پیدا می‌شوند، با کلیک هرگز | 🔴 | `primary-modules.ts:203` |
| ۴ | **سه پیاده‌سازی موازی «حاکمیت کلید API»**؛ دو تای آن‌ها غیرقابل‌دسترس و مستقیم روی جدول می‌نویسند (نه از راه RPCهای امن) | 🟠 | `_app.api-keys.tsx` · `_app.operations.api-keys.tsx` |
| ۵ | **۸ صفحه‌ی واقعی (~۲۸۲۰ خط) از هیچ کجای برنامه قابل دسترسی نیستند** | 🟠 | فهرست کامل در گام ۱-د |
| ۶ | `nav-items.ts` **هیچ واردکننده‌ای ندارد** — آداپتور مرده‌ای که مستندات هنوز «منبع حقیقت» صدایش می‌زند | 🟠 | `nav-items.ts:22` |
| ۷ | **۶ از ۸ selector ناوبری صفر مصرف‌کننده دارند**؛ `MOBILE_PRIORITIES` و `badgeSource` کاملاً مرده‌اند | 🟡 | `selectors.ts` |
| ۸ | `badgeSource` اعلانی وجود دارد ولی سایدبار **همان دو badge را دستی hardcode کرده** | 🟡 | `registry.ts:1252` ↔ `AppSidebar.tsx:222` |
| ۹ | دو فهرست میان‌بُر (`QUICK_ACCESS_BY_ROLE`, `SHORTCUTS_BY_ROLE`) هر مسیر نامعتبر را **بی‌صدا دور می‌ریزند** | 🟡 | `AppSidebar.tsx:34` · `MobileBottomNav.tsx:12` |
| ۱۰ | **تعادل سند دوطرفه توسط هیچ‌چیز اجباری نیست** — `validate_journal_entry_balance` هست ولی به هیچ constraint/تریگر/کدی وصل نیست | 🟠 | ج-۲ |
| ۱۱ | **۳۱ تابعِ در دسترسِ کلاینت با صفر فراخوان** — خوشه‌های کاملِ بک‌اند بدون فرانت (تخصیص سرمایه، لیگ، استعلام، …) | 🟠 | ج-۱ |
| ۱۲ | **دو مسیر اعطای نقش**؛ مسیر دیالوگ `assigned_by` را گم می‌کند (۲۱ از ۳۶ ردیف بدون آن) | 🟠 | الف-۱۰ |
| ۱۳ | **`accounting`، `hr` و `market-rates` هیچ ردیفی در `role_permissions` ندارند** — صفحه‌ی `/admin/roles` روی آن‌ها بی‌اثر است و فقط ماتریس هاردکد حکم می‌کند | 🟠 | الف-۱۲ |
| ۱۴ | **«فیلدهای سفارشی شخص» بک‌اند کامل دارد ولی هیچ فرمی پرش نمی‌کند** — و یک تعریفِ اجباری می‌تواند ساخت شخص را کاملاً از کار بیندازد | 🟠 | ب-۲ |

**نکته‌ی مثبت:** لینک شکسته **صفر** است — هیچ منبع ناوبری به مسیری اشاره نمی‌کند که فایل روت نداشته باشد.

---

## گام ۱ — تطبیق فهرست مسیرها

### ۱-الف) مسیرهای واقعی روی دیسک

- `src/routes/` — ۱۹۲ فایل روت.
- مرجع معتبرِ مسیرها `src/routeTree.gen.ts` (تولیدشده) است، نه حدس از روی نام فایل.
  از بلوک `FileRoutesByFullPath` **۲۰۹ مسیر یکتا** استخراج شد (پس از یکسان‌سازی
  اسلش انتهاییِ روت‌های `index` — TanStack آن‌ها را `"/products/"` می‌نویسد).

### ۱-ب) منابع ناوبری — دو تا نبود، **هشت** تا بود

| # | منبع | محل | تعداد مسیر | واقعاً رندر می‌شود؟ |
|---|---|---|---|---|
| ۱ | `NAVIGATION_SEEDS` | `registry.ts` (تا خط ۱۱۰۷) | ۱۲۳ seed (۲ تای `hiddenFromMenu`) | ✅ منبع مادر |
| ۲ | `PRIMARY_MODULE_PATHS` | `registry.ts:1109` | ۹۲ | ❌ **مرده** (بند الف-۱) |
| ۳ | `PRIMARY_MODULES[].paths` | `primary-modules.ts:36` | ۸۵ | ✅ **تنها فهرستی که سایدبار می‌خواند** |
| ۴ | `NAV_ITEMS` | `nav-items.ts:22` | مشتق از ۱ | ❌ صفر واردکننده |
| ۵ | `QUICK_ACCESS_BY_ROLE` | `AppSidebar.tsx:34` | ۱۴ | ✅ کارت میان‌بُر |
| ۶ | `SHORTCUTS_BY_ROLE` | `MobileBottomNav.tsx:12` | ۱۳ | ✅ نوار پایین موبایل |
| ۷ | `MOBILE_PRIORITIES` | `registry.ts:1213` | ۱۲ | ❌ مرده (بند الف-۵) |
| ۸ | جدول‌های جانبیِ کلید-مسیر | `registry.ts:1234`، `:1252`، `:1257`، `:1263`، `:1228` | — | بخشی مرده |

`NavigationCommandPalette.tsx:43` و جستجوی سایدبار (`AppSidebar.tsx:131`) هر دو روی
`getVisibleNavigationEntries(roles)` کار می‌کنند، یعنی **کل رجیستری** — نه فهرست ماژول‌ها.
به همین دلیل ۳۸ موردِ بند ۱-د «پیدا می‌شوند ولی دیده نمی‌شوند».

### ۱-ج) واگرایی دو فهرست — فراتر از `/updates`

کامنت `primary-modules.ts:59-66` می‌گوید `/updates` تنها موردِ واگرایی بوده و رفع شده.
**زنده بررسی شد: هفت مسیرِ دیگر همچنان واگرا هستند** — همه در جهت «در رجیستری هست، در
فهرست رندرشونده نیست»:

| ماژول | مسیری که فقط در `registry.ts:1109` است |
|---|---|
| sales | `/my-rejected-quotes` |
| finance | `/accounting/treasury` · `/accounting/payment-vouchers` |
| admin | `/admin/asan-import` · `/admin/asan-export` · `/admin/platform-releases` · `/admin/visitors` |

جهت معکوس (فقط در `primary-modules.ts`): **صفر مورد**.

### ۱-د) صفحاتی که هرگز در سایدبار ظاهر نمی‌شوند — ۳۸ مورد

`itemsForModule()` (`primary-modules.ts:209-214`) تطبیق را با **جست‌وجوی دقیق** انجام
می‌دهد، نه پیشوندی:

```ts
const byPath = new Map(visibleItems.map((i) => [i.route, i] as const));
for (const p of m.paths) { const it = byPath.get(p); if (it) out.push(it); }
```

پس یک seed فقط وقتی رندر می‌شود که **رشته‌ی مسیرش عیناً** در `PRIMARY_MODULES[].paths`
باشد. بودنِ والدش کافی نیست. با این معیار، **۳۸ عدد از ۱۲۱ seed منو-پذیر هرگز رندر
نمی‌شوند**:

```
/popup-center                /accounting/treasury               /admin/documents
/collaboration               /accounting/payment-vouchers       /admin/delivery-receipts
/pricing/attention           /accounting/salesperson-scoring    /admin/workflow-settings
/pricing/live-price-list     /gamification/settings             /admin/sales-reminders
/purchase                    /admin/platform-releases           /admin/visitors
/warehouses                  /admin/penalties                   /admin/automation
/warehouses/transfers        /admin/audit                       /integrations/didar
/warehouses/kardex           /admin/phone-collisions            /gamification/admin/kpi-rules
/my-rejected-quotes          /admin/asan-import                 /gamification/admin/achievements
/sales/product-videos        /admin/asan-export                 /gamification/admin/missions
/persons/import              /admin/purchase                    /gamification/admin/leagues
/persons/merge                                                  /gamification/admin/rewards
                                                                /gamification/admin/purchase-settings
                                                                /gamification/admin/manual-metrics
                                                                /gamification/admin/manual-metrics/guide
```

⚠️ برجسته‌ترین‌ها: `/warehouses` (کل انبار)، `/purchase` (فضای کاری خرید)،
`/persons/merge` و `/persons/import` (ادغام و ورود اشخاص)، ورود/خروج آسان، و **کل نُه
صفحه‌ی مدیریت گیمیفیکیشن**.

> **تصحیح روش (مهم):** نسخه‌ی اول همین گزارش عدد ۲۴ را نوشته بود. آن عدد با تطبیق
> **پیشوندی** به‌دست آمده بود، که منطق `resolveActiveModule()` است نه `itemsForModule()`.
> با معیار درست (تطبیق دقیق) عدد **۳۸** است. تمام ۹ صفحه‌ی `/gamification/admin/*` و
> `/persons/merge` و `/persons/import` در شمارش قبلی به‌غلط «پوشش‌داده‌شده» حساب شده بودند،
> چون والدشان (`/gamification`، `/persons`) در فهرست هست.

**چرا اتفاق افتاد:** `docs/lovable-change-reports/2026-05-23-0845-...md:99` نوشته بود
آیتم‌های map‌نشده «از ماژول «بیشتر» یا جستجو» در دسترس‌اند. بعداً ماژول «بیشتر» حذف شد
(`primary-modules.ts:31-35` — «No fallback module is permitted»)، ولی هیچ‌کس فهرست
map‌نشده‌ها را پر نکرد. تنها راه باقی‌مانده جستجو است.

### ۱-هـ) روت‌های یتیم (فایل هست، seed نیست)

۴۳ مسیر seed ندارند. دسته‌بندی:

| دسته | تعداد | حکم |
|---|---|---|
| صفحات احراز هویت/سیستمی (`/login`, `/register`, `/unauthorized`, `/pending-approval`, `/reset-password`, `/mcp`, `/sitemap.xml`) | ۷ | ✅ درست است |
| فرم‌های زیرمجموعه که از صفحه‌ی والد لینک دارند (`/purchases/create`, `/sales/quotes/new`, `/persons/create`, …) | ۲۳ | ✅ درست است — لینک ورودی زنده تأیید شد |
| **redirect shim قانونی** (`/accounting/daily-capital`, `/accounting/customer-capital-allocations`, `/accounting/salesperson-capital-allocations`, `/admin/gamification`, `/admin/gamification/achievements`) | ۵ | ✅ عمدی و مستند |
| **واقعاً غیرقابل‌دسترس** | ۸ | 🟠 زیر |

**هشت صفحه‌ی واقعی که هیچ seed و هیچ لینک ورودی ندارند** (روش: جستجوی کل `src/`
برای رشته‌ی مسیر، با حذف فایل روتِ خودش):

| مسیر | خط | چیست |
|---|---|---|
| `/operations/didar` | ۸۱۸ | یکپارچه‌سازی دیدار CRM — **از نسخه‌ی زنده کامل‌تر** |
| `/api-keys` | ۵۶۹ | حاکمیت کلید API (ساخت/حذف) |
| `/operations/api-keys` | ۳۹۴ | حاکمیت کلید API (فعال/غیرفعال با دلیل) |
| `/operations/receipts` | ۳۹۲ | مرور فیش‌های OCR (`ocr_receipts`) |
| `/presence` | ۲۹۴ | گزارش حضور و غیاب (`presence_logs`) |
| `/operations/purchase-advisor` | ۲۲۰ | مشاور خرید |
| `/operations/gamification` | ۱۴۴ | مدیریت گیمیفیکیشن |
| `/gamification/achievements` | ۸۹ | نشان‌ها |

### ۱-و) لینک شکسته

**صفر.** هیچ مسیری در هیچ‌کدام از هشت منبع ناوبری وجود ندارد که فایل روت متناظر نداشته باشد.

---

## الف) موارد دوبار ساخته‌شده (Duplicated)

### الف-۱ 🔴 کپی داخل رجیستری مرده است، ولی کامنت می‌گوید نگهش دار

`PRIMARY_MODULE_PATHS` (`registry.ts:1109-1211`، ۱۰۳ خط داده) تنها یک مصرف‌کننده دارد:
`primaryModuleForRoute()` در `registry.ts:1311`، که مقدار `entry.primaryModule` را می‌سازد
(`registry.ts:1338`). زنجیره‌ی مصرف `primaryModule` تا انتها دنبال شد:

```
PRIMARY_MODULE_PATHS → primaryModuleForRoute() → entry.primaryModule
   ├── selectors.ts:27  getNavigationEntriesByModule()  → ۰ فراخوان در کل مخزن
   └── metadata.ts:44   resolveNavigationMetadata().module
            └── تنها مصرف‌کننده: NavigationBreadcrumbs.tsx:14
                     └── فقط `metadata.breadcrumbs` را می‌خواند (خط ۱۵ و ۲۰)
```

**نتیجه: `metadata.module` هیچ‌جا خوانده نمی‌شود.** پس کل آن ۱۰۳ خط داده روی رفتار
برنامه اثر صفر دارد. در مقابل، سایدبار منحصراً `PRIMARY_MODULES` را می‌خواند
(`AppSidebar.tsx:103` → `itemsForModule` → `primary-modules.ts:211`).

خطر واقعی این است که کامنت `primary-modules.ts:59-66` به توسعه‌دهنده‌ی بعدی می‌گوید
«هرکدام را ویرایش کردی، هر دو را ویرایش کن» — و کسی که فقط کپی رجیستری را ویرایش کند
**فکر می‌کند کار را انجام داده، ولی هیچ اتفاقی در رابط نمی‌افتد**. دقیقاً همان تله‌ای که
`/updates` را ساخت.

**جهت رفع (اجرا نشود):** یکی را حذف کنید. اگر `primaryModule` لازم نیست،
`PRIMARY_MODULE_PATHS` و `primaryModuleForRoute` حذف شوند و `PRIMARY_MODULES` تنها منبع
بماند؛ در غیر این صورت `PRIMARY_MODULES.paths` از `PRIMARY_MODULE_PATHS` مشتق شود.

### الف-۲ 🔴 هفت واگرایی دیگر بین همان دو فهرست

جدول بند ۱-ج. چون کپی رجیستری مرده است، این هفت مورد **هیچ اثری ندارند** — ولی دقیقاً
همان چیزی را نشان می‌دهند که بند الف-۱ پیش‌بینی می‌کند: کسی رجیستری را ویرایش کرده و
گمان کرده تمام شده.

**جهت رفع:** با الف-۱ یکجا حل می‌شود.

### الف-۳ 🟠 سه پیاده‌سازی موازی «حاکمیت کلید API»

| مسیر | خط | دسترسی به داده | در ناوبری؟ |
|---|---|---|---|
| `/bot-api-keys` | ۱۰۵۱ | **۶ RPC امن**: `create_bot_api_key`, `delete_bot_api_key_secure`, `set_bot_api_key_active`, `set_bot_api_key_table_access`, … | ✅ بله |
| `/api-keys` | ۵۶۹ | مستقیم `.from("bot_api_keys")` + `sha256Hex` سمت کلاینت | ❌ غیرقابل‌دسترس |
| `/operations/api-keys` | ۳۹۴ | مستقیم `.from("bot_api_keys")` | ❌ غیرقابل‌دسترس |

هر سه روی همان دو جدول (`bot_api_keys`, `bot_api_key_audit_log`) کار می‌کنند و **عنوان
صفحه‌ی دو تای اول کاملاً یکسان است**: «حاکمیت کلیدهای API». دو نسخه‌ی غیرقابل‌دسترس
هم‌پوشان نیستند بلکه واگرا هستند — `/api-keys` ساخت/کپی/حذف کلید دارد و
`/operations/api-keys` فعال/غیرفعال‌کردن با ثبت دلیل.

✅ **نگرانی امنیتی بررسی و رد شد (SQL زنده).** روی `bot_api_keys` مقدار
`relrowsecurity = true` است ولی **هیچ policyیی تعریف نشده** (صفر ردیف در `pg_policy`
برای این جدول). در PostgreSQL «RLS فعال + بدون policy» یعنی **منع کامل** برای هر نقشی
که مالک/superuser/BYPASSRLS نیست — از جمله `authenticated`.

```sql
SELECT relrowsecurity FROM pg_class WHERE relname='bot_api_keys';        --> t
SELECT count(*) FROM pg_policy WHERE polrelid='public.bot_api_keys'::regclass;  --> 0
```

پس دو صفحه‌ی مرده **دوبار مرده‌اند**: هم لینکی به آن‌ها نیست، هم اگر کسی آدرس را مستقیم
تایپ کند `.from("bot_api_keys")` با خطای RLS برمی‌گردد. صفحه‌ی واقعی `/bot-api-keys` فقط
به این دلیل کار می‌کند که از RPCهای `SECURITY DEFINER` عبور می‌کند. **مسیر دور زدن حاکمیت
وجود ندارد.**

**جهت رفع:** دو صفحه‌ی مرده حذف شوند؛ اگر «غیرفعال‌کردن با دلیل» قابلیت مطلوبی است، به
`/bot-api-keys` روی `set_bot_api_key_active` اضافه شود.

### الف-۴ 🟠 دو صفحه‌ی «یکپارچه‌سازی دیدار»

| مسیر | خط | جدول‌ها | وضعیت |
|---|---|---|---|
| `/integrations/didar` | — | `bot_api_keys`, `didar_import_log` | seed دارد، ولی در هیچ ماژول سایدبار نیست (بند ۱-د) |
| `/operations/didar` | ۸۱۸ | `customers`, `didar_activities`, `didar_import_log`, `employee_score_events`, `shop_settings` | **غیرقابل‌دسترس** |

هر دو عنوان یکسان «یکپارچه‌سازی دیدار CRM» دارند. نسخه‌ی **غیرقابل‌دسترس دامنه‌ی
گسترده‌تری** را لمس می‌کند — یعنی احتمالاً نسخه‌ی جدیدتر/کامل‌تر همان است که کاربر
نمی‌بیند.

**جهت رفع:** تعیین کنید کدام نسخه معتبر است، دیگری حذف شود، و معتبر در `PRIMARY_MODULES`
map شود.

### الف-۵ 🟡 دو سازوکار مستقل برای «چه چیزی در موبایل دیده شود»

- اعلانی: `MOBILE_PRIORITIES` (`registry.ts:1213`) → `mobileVisible`/`mobilePriority`
  (`registry.ts:1352-1353`) → `getMobileNavigationEntries()` (`selectors.ts:52`)
  → **صفر فراخوان در کل مخزن**.
- واقعی: `SHORTCUTS_BY_ROLE` (`MobileBottomNav.tsx:12`)، یک فهرست دستیِ جدا.

هر دوازده مسیر `MOBILE_PRIORITIES` در `SHORTCUTS_BY_ROLE` هم هستند؛ تنها `/purchase`
فقط در فهرست دستی است. یعنی امروز هم‌خوان‌اند ولی **هیچ چیزی این هم‌خوانی را تضمین
نمی‌کند** و نیمه‌ی اعلانی اصلاً اجرا نمی‌شود.

**جهت رفع:** `MobileBottomNav` از `getMobileNavigationEntries()` بخواند، یا نیمه‌ی
اعلانی حذف شود.

### الف-۶ 🟠 `nav-items.ts` آداپتور مرده است ولی مستندات «منبع حقیقت» صدایش می‌زند

`NAV_ITEMS`، `GROUP_LABELS` و `SUBGROUP_LABELS` (`nav-items.ts:22,33,45`) **هیچ
واردکننده‌ای در `src/` ندارند** — تنها ارجاع‌ها کامنت‌اند (`primary-modules.ts:25,27,33,34`
و `AppSidebar.tsx:32`).

در حالی که `docs/REPO_STATE_INVENTORY.md:150` هنوز می‌گوید:
«**Navigation** (`src/components/layout/nav-items.ts`): one source of truth — no parallel
registry.» این جمله امروز **دوبار غلط** است: فایل مرده است، و رجیستری موازی (بند الف-۱)
دقیقاً وجود دارد.

**جهت رفع:** فایل حذف و آن سطر مستندات اصلاح شود.

### الف-۷ 🟡 badge اعلانی در برابر badge دستی

`BADGE_SOURCE_BY_ROUTE` (`registry.ts:1252-1255`) دقیقاً دو badge تعریف می‌کند:
`/users` → `pending-users` و `/pricing/recompute-prices` → `pricing-recompute-queue`.
مقدار روی `entry.badgeSource` می‌نشیند (`registry.ts:1350`) و **هیچ کامپوننتی آن را
نمی‌خواند**.

سایدبار همان دو badge را دستی می‌سازد:
`AppSidebar.tsx:222` — `item.route === "/users" && isAdmin && (pendingCount ?? 0) > 0`
و `AppSidebar.tsx:223` برای صف قیمت‌گذاری.

**جهت رفع:** یکی را انتخاب کنید؛ اگر اعلانی می‌ماند، رندر badge از `entry.badgeSource`
خوانده شود.

### الف-۸ 🟡 دو فهرست میان‌بُر که خطا را بی‌صدا می‌بلعند

`QUICK_ACCESS_BY_ROLE` (`AppSidebar.tsx:34`) و `SHORTCUTS_BY_ROLE`
(`MobileBottomNav.tsx:12`) رشته‌ی مسیر خام نگه می‌دارند و با
`byPath.get(p)` / `getNavigationEntryByRoute(it.to)` تبدیل می‌شوند. اگر مسیر در رجیستری
نباشد، آیتم **بدون هیچ خطایی حذف می‌شود** — کامنت `MobileBottomNav.tsx:44-46` خودش این
را تأیید می‌کند («drops any shortcut it cannot resolve, silently»).

امروز هر دو فهرست سالم‌اند (تأیید زنده: بند ۱-و، صفر لینک شکسته)، ولی یک تغییرنام مسیر
باعث می‌شود میان‌بُر بی‌صدا ناپدید شود.

**جهت رفع:** تایپ مسیرها به اتحادیه‌ی مسیرهای رجیستری محدود شود تا خطا در زمان build
دیده شود.

### الف-۹ 🟡 پنج جدول جانبیِ کلید-مسیر بدون تضمین وجود کلید

`KEYWORDS_BY_ROUTE:1234` · `BADGE_SOURCE_BY_ROUTE:1252` · `ACTION_BY_ROUTE:1257` ·
`ROLE_ALLOWLIST_BY_ROUTE:1263` · `PRIMARY_ROLE_ROUTES:1228` — همه `Record<string, …>`
هستند، پس یک کلید غلط‌املا هرگز خطا نمی‌دهد و فقط بی‌اثر می‌ماند.

**جهت رفع:** کلید را به اتحادیه‌ی مسیرهای seed محدود کنید.

---

### الف-۱۰ 🟠 دو مسیر جداگانه برای دادن نقش به کاربر — یکی اسناد را گم می‌کند

| مسیر | چطور می‌نویسد | `assigned_by` |
|---|---|---|
| صفحه‌ی `/roles` | `supabase.rpc("assign_user_role_txt")` (`_app.roles.tsx:58`) | ✅ `auth.uid()` ثبت می‌شود |
| دیالوگ مدیریت نقش در `/users` | `.from("user_roles").insert({ user_id, role })` (`RoleManagerDialog.tsx:76-78`) | ❌ ستون اصلاً پر نمی‌شود |

تابع `assign_user_role_txt` (مهاجرت `20260626082534`) عمداً `assigned_by` را با
`auth.uid()` پر می‌کند. `INSERT` خام دیالوگ آن ستون را نمی‌فرستد، پس `NULL` می‌ماند.

**شاهد زنده روی `afrakala`:**

```
SELECT count(*) FILTER (WHERE assigned_by IS NULL), count(*) FROM public.user_roles;
--> 21 از 36 ردیف بدون assigned_by
```

⚠️ همه‌ی آن ۲۱ ردیف لزوماً از این دیالوگ نیامده‌اند (bootstrapِ اولین ادمین هم مستقیم
`INSERT` می‌زند). ادعای دقیق این است: **مسیر دیالوگ نمی‌تواند این ستون را پر کند**، و
امروز ۵۸٪ اعطای نقش‌ها بدون نشانِ «چه کسی داد» است.

**جهت رفع:** دیالوگ هم همان RPC را صدا بزند. حذف نقش هم همین‌طور (`removeMut` مستقیم
`DELETE` می‌زند در حالی که `revoke_user_role_txt` وجود دارد).

### الف-۱۱ 🟡 دو امضای تکراری برای همان کار

`assign_user_role(uuid, app_role)` و `revoke_user_role(uuid, app_role)` بدنه‌شان فقط
`PERFORM public.assign_user_role_txt(...)` است. برنامه **فقط نسخه‌ی `_txt` را صدا می‌زند**
(`_app.roles.tsx:58,64`)، پس دو نسخه‌ی enum‌دار صفر فراخوان دارند و صرفاً سطح API را
دوبرابر می‌کنند.

### الف-۱۲ 🟠 ماتریس مجوز ثابت در برابر جدول `role_permissions` — سه ماژول اصلاً حکومت‌شونده نیستند

`src/lib/rbac/roles.ts` پنج بار در کامنت‌هایش می‌گوید ماتریس ثابت باید با
`role_permissions` بخواند (`roles.ts:99-102`, `:123`, `:221`, `:241`, `:261`). این دقیقاً
الگوی «دو ساختار، بدون منبع واحد» است. سازوکار واقعی در `hasPermissionEx`
(`roles.ts:294-335`) این است:

1. نقش `admin` → همیشه `true` (خط ۲۹۹) — پس همه‌ی اختلاف‌های مربوط به admin بی‌اثرند.
2. اگر برای آن (نقش، ماژول) **ردیفی در `role_permissions` باشد → دیتابیس تصمیم می‌گیرد**
   و ماتریس ثابت کاملاً نادیده گرفته می‌شود (خط ۳۰۴-۳۲۰).
3. **فقط اگر هیچ ردیفی نباشد** → ماتریس ثابت حکم می‌کند (خط ۳۲۲-۳۲۷).

پس اختلاف وقتی خطرناک است که ردیف **وجود نداشته باشد**.

**شاهد زنده:** ۲۷ ماژول در TS، ۲۴ ماژول در `role_permissions`. هر ۲۴ تا در TS هستند، ولی
**سه ماژول هیچ ردیفی ندارند:**

| ماژول | نتیجه |
|---|---|
| `accounting` | کل حسابداری فقط با ماتریس هاردکد کنترل می‌شود |
| `hr` | همین‌طور |
| `market-rates` | همین‌طور |

یعنی صفحه‌ی `/admin/roles` (که `role_permissions` را ویرایش می‌کند) **هیچ کنترلی روی این
سه ماژول ندارد**؛ مدیر هرچه آنجا تغییر دهد بی‌اثر است و تنها راه تغییر، ویرایش کد و
استقرار مجدد است.

نُه جفت (نقش، ماژول) بدون ردیف که ماتریس ثابت به آن‌ها دسترسی می‌دهد:

```
accounting  / manager    -> view, create, update
accounting  / accountant -> view, create, update
hr          / manager    -> view, create, update
hr          / sales      -> create
hr          / accountant -> create
hr          / viewer     -> create
market-rates/ manager    -> view, create, update
market-rates/ accountant -> view, create, update
market-rates/ sales      -> view
```

توجه: `hr.create` برابر `ALL_ROLES` است (`roles.ts:202`)، پس حتی `viewer` می‌تواند رکورد
HR بسازد ولی نمی‌تواند ببیند (`view` فقط admin/manager). این ممکن است عمدی باشد (ثبت
بازخورد کارمند)، ولی چون هیچ ردیف دیتابیسی ندارد **قابل بازبینی توسط مدیر هم نیست**.

> این با ممیزی موازی حسابداری هم‌خوان است: آنجا (دامنه‌ی F) گزارش شده بود ماژول
> `accounting` **صفر ردیف در `role_permissions`** دارد. این ممیزی همان را مستقل تأیید
> می‌کند و اضافه می‌کند که `hr` و `market-rates` هم همین وضع را دارند.

**۶۵ سه‌تایی (نقش، ماژول، اقدام)** هم هستند که ردیف دارند و ماتریس ثابت با آن‌ها مخالف
است. اینها **امروز بی‌اثرند** (دیتابیس برنده است) ولی مستقیماً کامنت‌های «باید بخوانند»
را نقض می‌کنند و توسعه‌دهنده‌ی بعدی را گمراه می‌کنند.

**جهت رفع:** یا برای هر ۲۷ ماژول ردیف seed ساخته شود تا `role_permissions` واقعاً تنها
منبع باشد و ماتریس ثابت به «حداقلِ امن» تقلیل یابد، یا ماتریس ثابت از جدول تولید شود.

> **تصحیح روش:** نسخه‌ی اول این تحلیل عدد ۳۵ اختلاف را داد که **غلط بود** — پارسر
> رگولاری `view: ALL_ROLES` (شناسه‌ی خالی، نه آرایه) و ورودی‌های تک‌خطی را نمی‌دید و
> ۸ ردیف ساختگی «UI پنهان می‌کند» تولید کرده بود. تحلیل نهایی به‌جای regex، خودِ
> object literal را ارزیابی می‌کند.

---

## ب) فرانت بدون بک‌اند (Frontend without backend)

### ب-۱ 🔴 دکمه‌ی «تغییر نقش عضو گروه» تابعی را صدا می‌زند که وجود ندارد

`src/components/messenger/GroupMembersDialog.tsx:166`:

```ts
const { error } = await supabase.rpc("set_messenger_group_member_role", {
  p_group_id: groupId, p_user_id: vars.userId, p_role: vars.role,
});
```

**شاهد زنده — تابع در هیچ schemaیی وجود ندارد:**

```sql
SELECT n.nspname, p.proname FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE p.proname = 'set_messenger_group_member_role';
--> (0 rows)
```

توابع موجودِ گروه پیام‌رسان فقط این چهارتا هستند: `add_messenger_group_member`،
`create_messenger_group`، `deactivate_messenger_group`، `is_messenger_group_member`.
یعنی **افزودن و حذف عضو کار می‌کند ولی تغییر نقش عضو همیشه شکست می‌خورد** و کاربر پیام
`خطا در تغییر نقش` می‌گیرد (`GroupMembersDialog.tsx:177`).

این تنها فراخوانِ RPC در کل مخزن است که مقصدش در دیتابیس نیست (۱ از ۱۹۸ نام یکتا).

**جهت رفع:** یا تابع ساخته شود، یا مثل `removeMut` مستقیم روی
`messenger_group_members` به‌روزرسانی شود.

### ب-۲ 🟠 «فیلدهای سفارشی شخص» — بک‌اند کامل، هیچ فرمی آن را پر نمی‌کند

سمت بک‌اند کامل است:

| لایه | محل |
|---|---|
| اعتبارسنجی فیلدهای اجباری | `lib/persons/functions.ts:149-195` |
| نوشتن هنگام ساخت | `person_create_full(p_field_values)` — `functions.ts:273` |
| نوشتن هنگام ویرایش (upsert) | `functions.ts:387-406` |
| خواندن | `functions.ts:296`، `:431` |

سمت فرانت **هیچ‌کجا مقدار نمی‌دهد**:

- صفحه‌ی ساخت شخص مقدار را **ثابت خالی** می‌فرستد:
  `field_values: []` (`_app.persons_.create.tsx:57`).
- صفحه‌ی ویرایش شخص اصلاً این کلید را نمی‌فرستد (صفر ارجاع در
  `_app.persons_.$personId_.edit.tsx` و در هیچ کامپوننت `components/persons/`).
- **هیچ صفحه‌ی ادمینی برای تعریف `person_field_definitions` وجود ندارد.** تنها صفحه‌ی
  مدیریت فیلد، `/admin/profile-fields`، جدول **دیگری** را می‌نویسد:
  `profile_field_definitions` (`_app.admin.profile-fields.tsx:66,80,96,110,288,293`).

**شاهد زنده:** `person_field_definitions` = **۰** · `person_field_values` = **۰** ·
`profile_field_definitions` = **۰** · `profile_field_values` = **۰** (در برابر
`persons` = ۷۹).

⚠️ **مین خفته:** `validateRequiredPersonFields` هر تعریفِ فعالِ اجباری را می‌خواند و
چون صفحه‌ی ساخت همیشه `[]` می‌فرستد، `provided` خالی است و **هر تعریف اجباری بلافاصله
«missing» می‌شود**. یعنی اگر روزی کسی مستقیماً با SQL یک
`person_field_definitions(is_required=true, is_active=true)` درج کند، **ساخت شخص برای
همه‌ی کاربران از کار می‌افتد** و هیچ رابطی وجود ندارد که بتواند آن فیلد را پر کند.
امروز فقط به این دلیل بی‌خطر است که جدول خالی است — و خالی می‌ماند چون رابطی برای پر
کردنش نیست.

**جهت رفع:** یا فرم ساخت/ویرایش شخص فیلدهای پویا را رندر کند و مقدار واقعی بفرستد، یا
تا آن زمان مسیر اعتبارسنجی اجباری غیرفعال شود تا مین خنثی بماند.

### ب-۳ ⏳ باز — نیازمند تصمیم مالک

`/operations/receipts` (`ocr_receipts`) و `/presence` (`presence_logs`) صفحاتی کامل‌اند
که هیچ کاربری نمی‌بیند (بند ۱-هـ). چون هیچ ورودی‌ای ندارند، پر شدن یا نشدن جدولشان
تغییری در نتیجه نمی‌دهد: قابلیت برای کاربر وجود ندارد.

---

## ج) بک‌اند بدون فرانت (Backend without frontend)

### روش (گام ۲)

- ۶۳۹ تابع فراخوان‌پذیر در schema `public` (با `prokind='f'`، بدون توابع تریگر).
- **۳۰۹ تای آن‌ها متعلق به افزونه‌ها بودند** (`pgvector`، `pg_trgm`، `btree_gist`) و با
  `pg_depend.deptype='e'` کنار گذاشته شدند → **۳۳۰ تابع واقعیِ برنامه**.
- ۳۲۵ تا EXECUTE برای `authenticated`/`anon` دارند، یعنی برای فراخوانی از سمت کلاینت
  طراحی شده‌اند.
- سه لایه فیلتر پیش از هر ادعای «مرده»: (۱) ارجاع در بدنه‌ی تابع دیگر، (۲) ارجاع در
  RLS/CHECK/view/index/trigger/default، (۳) ارجاع در کد برنامه یا e2e.
- `pg_cron` نصب نیست، پس هیچ زمان‌بندی سمت دیتابیس وجود ندارد.

### ج-۱ 🟠 ۳۱ تابعِ در دسترسِ کلاینت با صفر فراخوان — بیشترشان خوشه‌ای‌اند

اینها اتفاقی پراکنده نیستند؛ **قابلیت‌های کاملی هستند که بک‌اندشان ساخته شده و
فرانتشان هرگز نیامده**. جدول پشت هرکدام هم خالی است، که تأیید دوم است:

| خوشه | توابع بدون فراخوان | جدول‌های مرتبط (ردیف زنده) |
|---|---|---|
| **چرخه‌ی تخصیص سرمایه** | `consume_capital_allocation` · `release_capital_allocation` · `refund_capital_allocation` | `capital_allocation_ledger` = **۰** |
| **سرمایه‌ی روزانه** | `save_daily_capital_snapshot` · `upsert_daily_capital_input` | `daily_capital_snapshots` = **۰** · `daily_capital_inputs` = **۰** |
| **لیگ گیمیفیکیشن** | `start_league_season` · `settle_league_season` | `employee_leagues` = **۰** · `employee_level_up_events` = **۰** |
| **استعلام‌ها** | `tick_inquiries` · `update_inquiry_status` | `inquiry_status_history` · `inquiry_transfers` · `inquiry_price_cache` همه **۰** |
| **نامزدی ارتقا** | `cancel_promotion_nomination` | `promotion_nominations` = **۰** · `promotion_nomination_policy` = **۰** |
| **بازمحاسبه‌ی امتیاز** | `recompute_all_employee_scores` · `recompute_customer_credit_scores` · `capture_score_snapshots` | `credit_score_snapshots` = **۰** |
| **API جدول پویا برای بات** | `api_dynamic_table_query_rows` · `api_dynamic_table_update_cell` | `dynamic_table_rows`/`_cells` = **۰** |

⚠️ **درباره‌ی خوشه‌ی «سرمایه‌ی روزانه»:** این یکی احتمالاً **عمدی** است — مسیر
`/accounting/daily-capital` طبق «مورد ۱۴۱» به `/accounting/dynamic-capital` منتقل شده
(`_app.accounting.daily-capital.tsx:12-14`). پس اینجا بک‌اندِ نسخه‌ی بازنشسته باقی مانده،
نه قابلیت نیمه‌کاره. **همین احتمال باید برای بقیه‌ی خوشه‌ها هم توسط مالک تأیید شود.**

بقیه‌ی موارد تک‌افتاده: `calculate_salesperson_collected_sales` · `cleanup_stale_auto_suppliers` ·
`create_dynamic_scoring_parameter` · `get_workflow_setting` (توجه: مفرد — برنامه فقط
جمعِ `get_workflow_settings` را صدا می‌زند، `useWorkflowSettings.ts:35`) ·
`is_valid_audit_entity_type` · `manual_daily_metrics_totals` · `mi_get_seller_favorite_products` ·
`person_backfill_existing` · `person_fk_drift_report` · `refresh_all_sale_list_prices` ·
`search_tokens_match` · `set_market_rate_tick_status` · `sync_product_price_observatory_rows` ·
`validate_journal_entry_balance`.

### ج-۲ 🟠 `validate_journal_entry_balance` وجود دارد ولی هیچ‌چیز آن را اجرا نمی‌کند

تابع دقیقاً همان چیزی را می‌سنجد که یک دفتر دوطرفه باید تضمین کند
(`SUM(debit) = SUM(credit) AND SUM(debit) > 0` روی `journal_lines`) — ولی **نه از کد
صدا زده می‌شود، نه در هیچ CHECK constraint یا تریگری بسته شده است** (هر سه لایه‌ی
فیلتر: صفر).

یعنی تعادل سند دوطرفه امروز **توسط هیچ سازوکاری اجباری نیست**؛ فقط ابزارِ سنجشش موجود است.

> این یافته با ممیزی موازی حسابداری هم‌پوشانی دارد (دامنه‌ی G، که گزارش کرده بود
> `journal_entries`=۱ و `journal_lines`=۲). آنجا نتیجه‌گیری «نوشته نمی‌شود» بود؛ اینجا
> اضافه می‌شود که **گاردش هم وصل نیست**. رفعش باید یکجا تصمیم‌گیری شود.

### ج-۳ 🟡 ۱۱ جدول دارای داده که هیچ فایل فرانتی به آن‌ها ارجاع نمی‌دهد

| ردیف | جدول | حکم |
|---:|---|---|
| ۶۶۷ | `purchase_request_status_history` | تاریخچه‌ی وضعیت درخواست خرید — **هیچ صفحه‌ای نمایشش نمی‌دهد** |
| ۵۹ | `purchase_items` | از راه RPC خرید نوشته/خوانده می‌شود — ✅ طبیعی |
| ۴۷ | `purchase_idempotency` | داخلی — ✅ طبیعی |
| ۲۴ | `purchase_request_fulfillments` | تأمین درخواست — نمایش داده نمی‌شود |
| ۴ | `score_level_thresholds` | از راه RPC خوانده می‌شود — ✅ طبیعی |
| ۲ | `product_service_types` | — |
| ۱ | `delivery_receipt_status_history` · `product_sku_counters` · `asan_control_accounts` · `person_merge_log` · `sales_quote_counters` | شمارنده/لاگ داخلی — بیشترشان طبیعی |

⚠️ «بدون `.from()` در فرانت» **مساوی مرده نیست**: جدول‌هایی که فقط از راه RPC لمس
می‌شوند درست کار می‌کنند. تنها دو مورد واقعاً «داده‌ای که کاربر هرگز نمی‌بیند» هستند:
`purchase_request_status_history` (۶۶۷ ردیف) و `purchase_request_fulfillments` (۲۴ ردیف).

**جهت رفع:** اگر تاریخچه‌ی وضعیت ارزش دارد، در صفحه‌ی درخواست خرید نمایش داده شود؛
وگرنه نوشتنش متوقف شود.

---

## گام ۴ — تطبیق فیلد فرم با فیلد بک‌اند

### دامنه‌ی این گام

مأموریت می‌گوید حوزه‌هایی که ممیزی‌های موازی حسابداری پوشش داده‌اند **دوباره انجام
نشوند، فقط ارجاع داده شوند**. با خواندن `docs/audits/accounting-audit-progress.md`:

| حوزه | پوشش | ارجاع |
|---|---|---|
| تأمین‌کنندگان · مشتریان · خرید · فروش · دریافت · پرداخت · بانک · انبار · چک | ✅ دامنه‌های A–J | `full-accounting-audit.md` · `full-accounting-audit-part2-codex.md` |
| بازخورد کارکنان | ✅ مورد زمینه‌ای ۵ | جدول و RLS درست، **۰ ردیف**، `converted_task_id` را هیچ تابعی نمی‌نویسد |
| **پرسنل/اشخاص** | ❌ پوشش داده نشده | **این گام** |
| **دستیار** | ❌ پوشش داده نشده | این گام (ناوبری‌اش در بند ۱-د) |

### ۴-الف) اشخاص — فرم ساخت کامل است

هر شش ستون کاربرتنظیم‌کردنیِ `persons` در فرم ساخت وجود دارد و همه ذخیره می‌شوند:

| ستون `persons` | در فرم؟ | محل |
|---|---|---|
| `kind` | ✅ | `_app.persons_.create.tsx:51` |
| `display_name` | ✅ | `:52` |
| `legal_name` | ✅ (خالی → `null`) | `:53` |
| `visibility_scope` | ✅ | `:54` |
| `is_active` | ✅ | `:55` |
| `notes` | ✅ (خالی → `null`) | `:56` |
| `id`, `created_by`, `created_at`, `updated_at` | — | سیستمی |

**هیچ ستون قابل‌ذخیره‌ای از UI دسترس‌ناپذیر نیست و هیچ فیلد فرمی بی‌صدا دور ریخته
نمی‌شود.** شناسه‌ها (`person_identifiers`، ۴۱ ردیف) هم داخل همان تراکنش
`person_create_full` ساخته می‌شوند (`:58-61`).

تنها استثنا `field_values` است که ثابت `[]` می‌ماند → بند ب-۲.

---

## تطبیق با اجرای موازی همین مأموریت (commit `c6ea8f5e`)

⚠️ **این مأموریت هم‌زمان دو بار اجرا شد.** یک عامل دیگر در همین working tree، رأس ساعت
۲۲:۵۵ همین روز، commit `c6ea8f5e` را با همین دو فایل خروجی ثبت کرد — چهار دقیقه پیش از
commit این نشست. چون هر دو نشست روی یک working tree کار می‌کنند، نوشتن این نشست فایل‌های
آن نشست را روی دیسک بازنویسی کرد. **محتوای آن‌ها از دست نرفته** (در `c6ea8f5e` محفوظ است)
و یافته‌های یکتای آن در همین بخش ادغام شده است.

| ادعا | آن نشست | این نشست | حکم |
|---|---|---|---|
| seedهایی که هرگز رندر نمی‌شوند | **۳۸** | ۲۴ → **۳۸** | ✅ **آن نشست درست بود.** خطای این نشست تصحیح شد (بند ۱-د) |
| تعداد منابع ناوبری | ۵ | **۸** | ✅ این نشست کامل‌تر: `nav-items.ts`، `MOBILE_PRIORITIES` و جدول‌های کلید-مسیر جا افتاده بودند |
| اندازه‌ی `PRIMARY_MODULE_PATHS` | ۱۱۴ | **۹۲** | ✅ این نشست: شمارش دقیق روی بلوک `registry.ts:1109` |
| اندازه‌ی `PRIMARY_MODULES[].paths` | ۸۶ | **۸۵** | ✅ این نشست |
| لینک شکسته `/pending` | «۱ لینک شکسته» | **صفر** | ❌ **رد شد** — زیر |
| `PRIMARY_MODULE_PATHS` زنده است | فرض شده زنده | **مرده** | ✅ این نشست: زنجیره‌ی مصرف تا `NavigationBreadcrumbs` دنبال شد (الف-۱) |
| `MobileBottomNav` از رجیستری نمی‌خواند | ✅ | ✅ | هر دو موافق (الف-۵، الف-۸) |

### رد ادعای «لینک شکسته `/pending`»

آن گزارش نوشت `/pending` در رجیستری هست ولی فایل ندارد. **تنها رخداد رشته‌ی `"/pending"`
در کل `registry.ts` این است:**

```
registry.ts:1354   recentEligible: !seed.to.includes("/pending") && !seed.to.includes("/admin/audit"),
```

این یک **گزاره‌ی فیلتر** است (زیررشته‌ای که مسیرهای `…/pending` را از «آخرین
استفاده‌ها» کنار می‌گذارد)، نه یک مقصد ناوبری. تطبیق دقیق روی هر ۹۲ ورودی
`PRIMARY_MODULE_PATHS` مقدار `false` می‌دهد. مسیر واقعی `/users/pending` است که هم seed
دارد و هم فایل. **بنابراین لینک شکسته همچنان صفر است.**

### یافته‌ی یکتای آن نشست که اینجا حفظ می‌شود

آن نشست یک **تصحیح روی ادعای پیشین خودش** ثبت کرده بود که ارزش نگه‌داشتن دارد:
در `docs/execution/unify-plan-corrected.md` پیش‌تر نوشته شده بود چهار صفحه‌ای که
`P3_SIDEBAR.md` «یتیم» خوانده بود در واقع یتیم نیستند «چون در رجیستری ثبت‌اند».
آن تصحیح **نادرست بود**: ثبت در `NAVIGATION_SEEDS` به‌تنهایی چیزی را در سایدبار نشان
نمی‌دهد؛ حضور دقیق در `PRIMARY_MODULES[].paths` لازم است. پس ادعای اصلی `P3_SIDEBAR.md`
در عمل درست بوده. این دقیقاً همان سازوکاری است که بند ۱-د می‌سنجد.

---

## روش و شواهد

- مسیرهای واقعی از `src/routeTree.gen.ts` (بلوک `FileRoutesByFullPath`) استخراج شد، نه از
  حدس نام فایل — چون قواعد TanStack (`_app.`، `_` انتهایی، `[.]`، `index`) دستی خطاخیز است.
- «لینک ورودی» برای هر روت یتیم با جستجوی رشته‌ی مسیر در کل `src/` سنجیده شد، با حذف
  فایل روتی که خودش آن مسیر را تعریف می‌کند.
- اسلش انتهاییِ روت‌های `index` یکسان‌سازی شد؛ بدون آن `/products` هم‌زمان «شکسته» و
  «یتیم» گزارش می‌شد که هر دو غلط بود.
- ادعای «صفر مصرف‌کننده» برای هر نماد با grep روی کل مخزن (بدون `node_modules`) تأیید شد.
- تطبیق seed با ماژول **دقیق** انجام شد نه پیشوندی، چون `itemsForModule()` از
  `Map.get(route)` استفاده می‌کند. تطبیق پیشوندی منطقِ `resolveActiveModule()` است و
  اگر اشتباهی اینجا به کار رود، ۱۴ صفحه را به‌غلط «قابل‌مشاهده» نشان می‌دهد.
