# سیستم‌وار — قابلیت‌های دوبار ساخته‌شده یا نصفه‌کاره

**مأموریت:** `docs/audits/system-wide-wiring-audit-mission.md`
**HANDOFF:** `docs/audits/system-wide-wiring-audit-progress.md`
**نوع:** فقط‌خواندنی. هیچ کد، مهاجرت یا داده‌ای تغییر نمی‌کند.
**مبنا:** `HEAD = da7f4c5d`، برنچ `feature/navigation-modernization`

> این ممیزی مستقل از دو ممیزی حسابداری هم‌زمان (Claude Code روی C/F و Codex روی
> B/D/H/I/J) اجرا می‌شود و فقط در همین دو فایل می‌نویسد.

**وضعیت گام‌ها:** گام ۱ ✅ کامل · گام ۲ ⏳ · گام ۳ ⏳ · گام ۴ ⏳

---

## خلاصه‌ی مدیریتی — یافته‌های مرتب‌شده بر اساس سردرگمی/ریسک روزانه

> این فهرست با تکمیل گام‌های ۲ تا ۴ به‌روز می‌شود. تا اینجا فقط خروجی گام ۱ لحاظ شده.

| # | یافته | شدت | جای اصلی |
|---|---|---|---|
| ۱ | **کامنتِ «هر دو را با هم ویرایش کن» دروغ است** — کپی داخل `registry.ts` هیچ اثری بر سایدبار ندارد و در عمل مرده است | 🔴 | `registry.ts:1109` |
| ۲ | همان دو فهرست **در ۷ مسیر دیگر هم واگرا شده‌اند**، نه فقط `/updates` | 🔴 | `registry.ts:1109` ↔ `primary-modules.ts:36` |
| ۳ | **۳۸ صفحه‌ی seedشده در هیچ ماژول سایدبار نیستند** — فقط با جستجو پیدا می‌شوند، با کلیک هرگز | 🔴 | `primary-modules.ts:203` |
| ۴ | **سه پیاده‌سازی موازی «حاکمیت کلید API»**؛ دو تای آن‌ها غیرقابل‌دسترس و مستقیم روی جدول می‌نویسند (نه از راه RPCهای امن) | 🟠 | `_app.api-keys.tsx` · `_app.operations.api-keys.tsx` |
| ۵ | **۸ صفحه‌ی واقعی (~۲۸۲۰ خط) از هیچ کجای برنامه قابل دسترسی نیستند** | 🟠 | فهرست کامل در گام ۱-د |
| ۶ | `nav-items.ts` **هیچ واردکننده‌ای ندارد** — آداپتور مرده‌ای که مستندات هنوز «منبع حقیقت» صدایش می‌زند | 🟠 | `nav-items.ts:22` |
| ۷ | **۶ از ۸ selector ناوبری صفر مصرف‌کننده دارند**؛ `MOBILE_PRIORITIES` و `badgeSource` کاملاً مرده‌اند | 🟡 | `selectors.ts` |
| ۸ | `badgeSource` اعلانی وجود دارد ولی سایدبار **همان دو badge را دستی hardcode کرده** | 🟡 | `registry.ts:1252` ↔ `AppSidebar.tsx:222` |
| ۹ | دو فهرست میان‌بُر (`QUICK_ACCESS_BY_ROLE`, `SHORTCUTS_BY_ROLE`) هر مسیر نامعتبر را **بی‌صدا دور می‌ریزند** | 🟡 | `AppSidebar.tsx:34` · `MobileBottomNav.tsx:12` |

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

⚠️ **نکته‌ی امنیتی برای بررسی در گام ۲:** دو نسخه‌ی مرده مستقیم روی جدول می‌نویسند و
RPCهای امن را دور می‌زنند. اگر RLS این نوشتن را اجازه بدهد، یک مسیر دور زدن حاکمیت
کلید است که فقط به این دلیل بی‌خطر مانده که هیچ لینکی به آن نیست. **این با SQL زنده در
گام ۲ تأیید می‌شود.**

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

## ب) فرانت بدون بک‌اند (Frontend without backend)

⏳ گام‌های ۲ و ۴ هنوز اجرا نشده‌اند. یافته‌های این بخش پس از آن‌ها نوشته می‌شود.

موارد باز که از گام ۱ به اینجا منتقل شد:

- `/operations/receipts` (۳۹۲ خط، جدول `ocr_receipts`) — صفحه‌ای کامل که هیچ‌کس نمی‌بیند؛
  باید بررسی شود آیا `ocr_receipts` اصلاً پر می‌شود یا کل قابلیت OCR نصفه‌کاره است.
- `/presence` (۲۹۴ خط، `presence_logs`) — همان سؤال.

## ج) بک‌اند بدون فرانت (Backend without frontend)

⏳ گام ۲ (فهرست RPCها و جدول‌ها از `pg_proc`/`information_schema` روی دیتابیس زنده)
هنوز اجرا نشده است.

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
