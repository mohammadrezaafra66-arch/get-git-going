# مأموریت nav-invoices-cleanup — تکمیل شد ✅

**تاریخ:** ۱۷ مرداد ۱۴۰۵ · **ساعت:** ۰۸:۳۰ به وقت تهران · **ابزار:** Claude Code
**مأموریت:** `docs/execution/2-nav-invoices-cleanup-mission.md`
**برنچ:** `feature/navigation-modernization` — **همه‌چیز commit و push شده است** (تأیید در بخش ۹)
**وضعیت:** فاز ۱ ✅ · فاز ۲ ✅ · فاز ۳ ✅ · فاز ۴ ✅ (شامل هر سه شرطِ بازدارنده)
**پس از تکمیل:** استقرار تأییدشده (`6215e1e0`) · رگرسیون کامل e2e ۴۷۰/۳۰ · نسخهٔ **#28** منتشر شد — بخش ۱۳

---

## ۱ — خلاصهٔ اجرایی

چهار فاز مأموریت اجرا شد و زیرسیستم مردهٔ `invoices` **به‌طور کامل** برداشته شد. کار در
میانهٔ راه با تصمیم مالک به نسخهٔ **مرحله‌ای** تبدیل شد، چون بررسی نجات منطق نشان داد دامنهٔ
انفجار بسیار بزرگ‌تر از فرض اولیهٔ مأموریت («۴ جدول خالی») است: **۲۵ تابع** در بدنه‌شان به
`invoices` ارجاع داشتند، از جمله `post_receipt_accounting` که **تنها تابعی است که در دفتر
حسابداری می‌نویسد**.

سه شرطِ بازدارنده شناسایی، مستند و یکی‌یکی بسته شد؛ و یکی از آن‌ها (شرط ۲) به یک **رفع
ریشه‌ای دائمی** تبدیل شد که از تکرار حادثه‌ای جلوگیری می‌کند که در این پروژه **سه بار**
اتفاق افتاده بود.

---

## ۲ — دنبالهٔ کامل مهاجرت‌ها (۳۲۳ تا ۳۳۳)

| # | مهاجرت | چه کرد | ابزار تأیید |
|---|---|---|---|
| **۳۲۳** | `drop_dead_invoice_items_and_waybills` | حذف `invoice_items`, `waybills`, `waybill_items` + ۵ تابع مختصشان؛ بازنویسی `get_product_timeline` و `v_promotion_suggestions` | dry-run + assert داخل تراکنش |
| **۳۲۷** | `decouple_post_receipt_accounting_from_invoices` | **شرط ۱** — جدا کردن تنها نویسندهٔ دفتر حسابداری | گیت برابری با فیش واقعی ۱۲٬۰۰۰٬۰۰۰، خروجی بایت‌به‌بایت یکسان |
| **۳۲۸** | `person_fk_registry_gate` | **رفع ریشه‌ای** — event trigger که هر DDL ناهم‌خوان با رجیستری `person_merge` را rollback می‌کند | ۴ تست در `BEGIN…ROLLBACK` |
| **۳۲۹** | `drop_invoice_fks_and_dead_functions` | **شرط ۳ (الف)** — حذف هر دو کلید خارجی + ۳ تابع بدون فراخوان | assert پیش از اقدام روی داده |
| **۳۳۰** | `receipt_triggers_drop_invoice_branches` | **شرط ۳ (ب)** — چهار تریگر روی جدول‌های **زنده** | گیت برابری ۳ کاوش، old vs new |
| **۳۳۱** | `rewrite_invoice_readers` | **شرط ۳ (ج)** — هفت تابع خواننده | گیت برابری ۵ کاوش با JWT ادمین |
| **۳۳۲** | `drop_invoices_table` | **شرط ۲ + حذف نهایی جدول** | اثبات سه‌طرفهٔ merge (با شاهد) |
| **۳۳۳** | `drop_waybill_custom_fields` | حذف آخرین یتیم: جدول و صفحهٔ «فیلدهای بیجک» | assert روی بقای `set_updated_at` |

هر مهاجرت: snapshot از تعریف زنده در `docs/verification/pre-<NNN>/`، اجرای dry-run در
`BEGIN … ROLLBACK`، اعمال با `--single-transaction -v ON_ERROR_STOP=1`، `docker restart
afrakala-lan-rest`، و یک `docs/verification/<NNN>-down.sql` منطبق.

---

## ۳ — فایل‌های بررسی‌شده

`PROGRESS.md` · `AGENTS.md`/`CLAUDE.md` · فایل مأموریت · `docs/audits/system-wide-wiring-audit.md`
(+ `-COMPLETE`) · `docs/execution/ledger-mutual-settlement-mission-COMPLETE.md` (بخش ۱۰.۵) ·
`docs/qa/BLOCKERS.md` · مهاجرت ۳۲۴ عامل ledger · `src/lib/navigation/{registry,types,selectors,metadata}.ts` ·
`src/components/layout/primary-modules.ts` · `src/lib/rbac/roles.ts` · `src/routeTree.gen.ts` ·
۳۸ فایل روت برای خواندن گارد واقعی · هر دو صفحهٔ «دیدار» · `scripts/generate-release-notes.mjs` ·
و روی دیتابیس زنده: `pg_proc`, `pg_constraint`, `pg_trigger`, `pg_depend`, `pg_views`,
`pg_event_trigger` و تعریف زندهٔ ۲۰+ تابع.

## ۴ — فایل‌های تغییرکرده و دلیل هرکدام

| فایل | چرا |
|---|---|
| `src/lib/navigation/registry.ts` | حذف `PRIMARY_MODULE_PATHS` (۱۰۳ خط مرده)؛ ۷ allowlist نقش هم‌راستا با گارد واقعی route؛ حذف `adminOnly` از ۳ seed؛ seed دیدار؛ ثبت `/accounting/mutual-settlement`؛ حذف seedهای `invoices`، `/invoices` و `/admin/waybill-fields` |
| `src/components/layout/primary-modules.ts` | وصل ۳۷ صفحهٔ یتیم + `/operations/didar` + `/accounting/mutual-settlement`؛ حذف مسیرهای زیرسیستم حذف‌شده؛ کامنت «هر دو فهرست را ویرایش کن» که **دروغ بود** حذف شد |
| `src/routes/_app.operations.didar.tsx` | نجات دو قابلیت از صفحهٔ بازنشسته |
| `src/routes/_app.integrations.didar.tsx` | تبدیل به redirect shim |
| `src/routes/_app.accounting.receivables.tsx` · `_app.operations.tasks.tsx` | حذف ۳ لینک مرده + شاخهٔ `complete_invoice_task` |
| ۶ روت invoice/waybill + `_app.admin.waybill-fields.tsx` | حذف زیرسیستم |
| `InvoiceForm` · `WaybillForm` · `WaybillStatusBadge` · `InvoiceAccountingMarkers` | کامپوننت‌های بی‌مصرف پس از حذف روت‌ها |
| `AGENTS.md` + `CLAUDE.md` | **بند ۹ تازه** — قاعدهٔ FK اشخاص و ترتیب اجباری‌اش (هر دو فایل بایت‌به‌بایت یکسان نگه داشته شدند) |
| `PROGRESS.md` | ردیف هر فاز |
| ۸ مهاجرت + ۸ down-script + ۶ snapshot + ۴ فایل تست | بالا |

---

## ۵ — پاسخ صریح به پرسش مأموریت: چه منطقی نجات یافت و چه چیزی از دست رفت

مأموریت خواسته بود این بند **صریح** باشد.

| منطق | حکم |
|---|---|
| **نگه‌داشتن اعتبار** (`hold_credit`) | 🟢 **از دست نرفت، چون وجود نداشت.** رزرو واقعی صفر بود (`sum(held_credit) = 0.00`). `sales_quotes` گیت اعتبار **سخت‌گیرتری** دارد (معوقه/تخصیص/کسری + snapshot). |
| **نگه‌داشتن سرمایه** (`hold_capital_allocation`) | 🟢 **از دست نرفت.** نیمه‌کاره بود: `release_`/`consume_`/`refund_` هر سه **صفر فراخوان** داشتند. |
| **وظایف گردش‌کار** | 🟠 **از دست رفت.** ۵ ردیف پیکربندی `invoice_workflow_stages` و زنجیرهٔ `complete_invoice_task`. صفر ردیف `tasks` از آن استفاده می‌کرد. |
| **بارنامه** | 🟠 **از دست رفت.** زنجیرهٔ کامل بارنامه، هر چهار جدول با صفر ردیف. |
| **آمار واردسازی دیدار** | ✅ **نجات داده شد** و به `/operations/didar` منتقل شد. |

**آنچه عمداً منتقل نشد** (هر سه تصمیم محصولی‌اند، نه عارضهٔ پاک‌سازی): امتیازدهی کارمند بر
پایهٔ فیش، سنجهٔ فروش وصول‌شده، و وضعیت معوقهٔ مشتری. هر سه امروز صفر برمی‌گرداندند و
**همچنان صفر برمی‌گردانند**؛ وصل‌کردنشان به `sales_quotes` اعداد زنده تولید می‌کرد. هر سه در
محل خودشان کامنت‌گذاری شده‌اند.

---

## ۶ — تأثیر بر مهاجرت / RLS / RBAC / حسابرسی

- **Migration:** ۸ مهاجرت (۳۲۳، ۳۲۷–۳۳۳)، همه با down-script. **صفر ردیف داده حذف شد** —
  هر جدول حذف‌شده پیش از حذف با assert صفر بودنش اثبات شد.
- **RLS:** سه policy روی `invoices` همراه خود جدول رفتند. هیچ policy دیگری لمس نشد.
- **RBAC:** فقط **باریک‌تر** شد، هرگز بازتر: ۷ allowlist اصلاحی، ۳ حذف `adminOnly`، و بستن
  یک حفره (`/integrations/didar` هیچ `beforeLoad` نداشت). ماتریس ایستای `PERMISSIONS` و
  جدول `role_permissions` **عمداً لمس نشدند**.
- **Audit log:** بدون تغییر ساختاری. `audit_invoice_insert` با جدولش رفت.
- **گارد تازه:** event trigger `trg_person_fk_registry_gate` (۳۲۸) — سخت‌گیرانه، نه شل‌کننده.

## ۷ — نتایج build / lint / typecheck / test

```
typecheck (پایه، پیش از شروع) .......... 70
typecheck پس از هر فاز ................. 70   (هیچ‌وقت بالا نرفت)
build .................................. سبز
eslint فایل‌های لمس‌شده ................. ۰ خطای تازه
گیت ناوبری ............................. ۷ ماژول، ۱۲۴ مسیر، صفر لینک شکسته،
                                          صفر تکراری، صفر seed بی‌ماژول
رگرسیون کامل e2e (روی بیلد مستقر) ...... ۴۷۰ سبز / ۳۰ قرمز / ۱۹ skip / ۷ اجرانشده
                                          طبقه‌بندی کامل در بخش ۱۳
```

⚠️ **این پروژه `test script` در `package.json` ندارد** (`npm test` وجود ندارد) و هیچ تست واحدی اجرا نشد.
در طول خودِ مأموریت هم e2e اجرا **نشد**؛ اعتبارسنجی رفتاری از راه گیت‌های برابری روی دیتابیس زنده
انجام شد (هر دو سمت ROLLBACK). **پس از تکمیل مأموریت** و به درخواست مالک، سوئیت کامل Playwright
روی بیلد مستقر اجرا شد — نتیجه و طبقه‌بندی کامل در **بخش ۱۳**.

---

## ۸ — چک‌لیست تست دستی (فقط انسان می‌تواند)

هیچ بررسی مرورگری انجام نشده است. این‌ها را با نقش **ادمین** روی `192.168.170.8:3100` ببینید:

**اولویت بالا — مسیرهایی که مهاجرت‌ها لمسشان کردند:**

- [ ] **`/accounting/receivables`** — صفحه باز شود، لیست بیاید، «جزئیات» دیالوگ را باز کند.
      (`get_receivable_detail` و `vw_customer_receivables` هر دو در ۳۳۱/۳۳۲ بازنویسی شدند.)
      ستون «تاریخ صدور» باید مثل قبل پر باشد.
- [ ] **تأیید یک فیش واریزی** روی `/accounting/receipts/<id>` — سند حسابداری ثبت شود، اعتبار
      مشتری به‌روز شود، پیام موفقیت بیاید. (`post_receipt_accounting` در ۳۲۷ تغییر کرد و
      `enforce_receipt_approval_allocation_limits` در ۳۳۰.)
- [ ] **تخصیص فیش به پیش‌فاکتور** — مبلغ معتبر پذیرفته شود؛ مبلغ بیشتر از فیش با پیام فارسی
      رد شود. (`enforce_payment_receipt_link_limits`، ۳۳۰.)
- [ ] **`/operations/tasks`** — لیست بیاید و دکمهٔ «تکمیل» یک وظیفه کار کند. (شاخهٔ
      `complete_invoice_task` حذف شد.)

**اولویت متوسط — ناوبری:**

- [ ] با هر نقش (admin / manager / sales / accountant / viewer) سایدبار را باز کنید و
      **روی هر آیتم تازه کلیک کنید**؛ هیچ‌کدام نباید به `/unauthorized` برود.
- [ ] بخش **انبار** نباید برای فروشنده دیده شود (allowlist در فاز ۲ اصلاح شد).
- [ ] `/integrations/didar` باید به `/operations/didar` **ریدایرکت** شود.
- [ ] `/operations/didar` — جدول «آخرین ۱۰۰ رکورد واردسازی» و آمار **سه موجودیت** دیده شود.
- [ ] `/accounting/mutual-settlement` حالا در منوی مالی هست (تحویل از عامل ledger).
- [ ] «فیلدهای بیجک» دیگر در منوی مدیریت **نباشد**.

**اولویت پایین:**

- [ ] `/products/<id>` — تایم‌لاین محصول باز شود (`get_product_timeline`، ۳۲۳).
- [ ] پیشنهادهای تبلیغاتی (`v_promotion_suggestions`) همان‌طور که بود کار کند.

---

## ۹ — تأیید commit و push (نه فقط اعمال محلی)

| commit | محتوا |
|---|---|
| `112d4e10` | فاز ۳ — بازنشستگی صفحهٔ دیدار |
| `1d21a038` | بررسی نجات منطق فاز ۴ |
| `8e2148c6` | مهاجرت ۳۲۳ + حذف روت‌ها/کامپوننت‌ها |
| `f19f5008` | مهاجرت ۳۲۷ — شرط ۱ |
| `8ac7f1b3` | مهاجرت ۳۲۸ — گیت دائمی + بند ۹ در AGENTS/CLAUDE |
| `90faf9cf` | مهاجرت ۳۲۹ — شرط ۳ (الف) |
| `a10ba29b` | مهاجرت ۳۳۰ — چهار تریگر زنده |
| `888f4c13` | مهاجرت ۳۳۱ + ۳۳۲ — حذف نهایی جدول |
| _(این commit)_ | مهاجرت ۳۳۳ + همین گزارش |

فازهای ۱ و ۲ ناخواسته داخل `75f56867` (کار عامل دیگر) رفتند — توضیح در پیوست.
**همهٔ موارد بالا روی `origin/feature/navigation-modernization` هستند**؛ خروجی `git push`
هر بار در گزارش ثبت شد و پیش از هر push یک `git pull --rebase` اجرا شد.

---

## ۱۰ — Assumptions

۱. **`/integrations/didar` ریدایرکت شد، نه حذف کامل** — URL ممکن است bookmark باشد و مخزن
   از قبل همین الگو را دارد (`_app.accounting.daily-capital.tsx`).
۲. **seed دیدار روی `module: "bot-api-keys"` ماند** — گاردش `requireAdmin()` است و admin در
   `hasPermissionEx` مدار کوتاه می‌کند، پس module این route را gate نمی‌کند.
۳. **ماتریس ایستای `PERMISSIONS` لمس نشد** — بازکردن مجوز تغییری امنیتی است و خواسته نشده بود.
۴. **دو نگهبان مالی مسیر فاکتور را «رد» می‌کنند، نه اینکه بی‌سقف رهایش کنند** — چون ستون و
   CHECK هنوز اجازه‌اش می‌دهند. اکیداً سخت‌گیرتر از قبل.
۵. **سه سنجه به `sales_quotes` وصل نشدند** — بند ۵.

## ۱۱ — ریسک‌ها و مانده‌ها

۱. ⚠️ **بررسی مرورگریِ انسانی هنوز انجام نشده** — بند ۸. سوئیت خودکار e2e اجرا شد (بخش ۱۳) و
   بخش بزرگی از این چک‌لیست را پوشش می‌دهد، ولی جایگزین نگاه انسان به صفحه نیست.
۲. ✅ **`build`/`deploy` روی LAN انجام شد** — `6215e1e0`، هر سه سیگنال تأیید شد (بخش ۱۳.۱).
   دیتابیس و فرانت دیگر از هم جلو/عقب نیستند.
۳. **نقص از قبل موجود:** `calculate_salesperson_collected_sales` با
   `type "public.text[]" does not exist` می‌افتد. ربطی به این مأموریت ندارد؛ در هر دو نسخه
   یکسان است. نیازمند رفع جداگانه.
۴. **یادداشت انتشار فازهای ۱–۲ گم شد** — بزرگ‌ترین تغییر کاربرپسند (۳۷ صفحه در سایدبار)
   داخل commit بدون تریلر عامل دیگر رفت. مالک گفت فعلاً بماند.
۵. **۹ صفحهٔ `/gamification/admin/*` روی `module: "roles"`اند** و `roles:view` ایستا فقط
   `["admin"]` است؛ manager/accountant تا seed شدن `role_permissions` لینک را نمی‌بینند.
۶. **جدول `invoice_workflow_stages` (۵ ردیف) باقی ماند** — پیکربندی یتیم است ولی خارج از
   دامنهٔ تأییدشده بود.
۷. **working tree مشترک است** — کار commit‌نشده در این مأموریت **دو بار** پاک شد. از آن پس
   هر فاز در worktree ایزوله انجام و بلافاصله push شد.

## ۱۲ — Self-Host Acceptance Check

بدون CDN، بدون فونت آنلاین، بدون API خارجی تازه، بدون سرویس ابری. هیچ secret تازه‌ای اضافه
نشد و هیچ متغیر `VITE_` تازه‌ای ساخته نشد. همهٔ مهاجرت‌ها SQL استاندارد PostgreSQL‌اند و
event trigger ۳۲۸ نیز قابلیت هستهٔ PostgreSQL است. کل تغییرات روی
Linux + Docker + Supabase self-host بدون وابستگی تازه کار می‌کنند.

---

---

# ۱۳ — رگرسیون کامل e2e روی بیلد مستقر + انتشار نسخه (پس از تکمیل مأموریت)

**تاریخ:** ۱۷ مرداد ۱۴۰۵ · اجرا پس از آنکه هر هفت عامل کارشان را تمام کردند.

## ۱۳.۱ — استقرار: هر سه سیگنال

بیلد با مسیر تک‌فرمانی مستندشده انجام شد
(`docker compose --env-file deploy/lan/.env.lan -f deploy/lan/docker-compose.yml up -d --build web`).

| سیگنال | مقدار |
|---|---|
| `APP_GIT_SHA` | `6215e1e0` — **دقیقاً برابر** `git rev-parse --short HEAD` |
| `APP_BUILD_TIME` | `2026-08-08T16:33:44Z` |
| image id | `9214ab53…` ← **`5c2590cd…`** (بیلد واقعاً تازه است، نه برچسب دوباره روی image قدیمی) |

تأیید نمادی هم انجام شد چون «SHA درست روی image قدیمی» یک تلهٔ ثبت‌شدهٔ همین پروژه است:
نشانهٔ بیلد تازه (`accounting/mutual-settlement`) در **۵** فایل باندل، و تعریف روت
`_app/sales_/invoices` **صفر**. `/api/version` هم `commit: 6215e1e0` را با همان build time گزارش می‌کند.

⚠️ **نکتهٔ مهم برای دفعهٔ بعد:** قبل از این بیلد، کانتینر **۶۲ کامیت** عقب بود (`fc32f1df`،
دیروز ۲۲:۰۳) در حالی که دیتابیس همهٔ مهاجرت‌های امروز را داشت. یعنی هر تست e2e پیش از این
بیلد، «فرانت دیروز روی دیتابیس امروز» را می‌سنجید.

## ۱۳.۲ — ⛔ اجرای اول باطل بود: نشست ادمین منقضی شده بود

اولین اجرای کامل **۱۱۴ قرمز** داد. این‌ها رگرسیون **نبودند**:

توکن داخل `e2e/auth/admin.storage.json` در `2026-08-07T19:37Z` منقضی شده بود — حدود **۲۲ ساعت**
پیش از اجرا. الگو خودش را لو داد: specهای `chromium-admin` می‌افتادند در حالی که **همان
spec** برای accountant / sales / viewer / anonymous سبز بود و تمام تست‌های JWT/API هم سبز
بودند. یعنی مرورگرِ ادمین اصلاً احراز هویت نشده بود.

همان حالت خرابی که `PROGRESS.md` هشدار داده، فقط از راه **انقضای توکن** به‌جای spec بازنشستهٔ
`page.pause()`. رفع:

```
npx playwright test e2e/auth/generate-role-sessions.spec.ts --config=playwright.auth.config.ts
```

هر چهار نشست بازتولید و revalidate شد، سپس سوئیت **از نو** اجرا شد. گزارشِ ۱۱۴ قرمز به‌عنوان
«خط پایه» گمراه‌کننده می‌بود.

> **تصحیح یک ادعای قبلی من:** پیش‌تر هشدار `page.pause()` را خطر زنده دانستم؛ نبود.
> `save-admin-session.spec.ts` در ASAN M1.6 بازنشسته شده و `playwright.config.ts` کل
> `e2e/auth/` را با `testMatch` بیرون می‌گذارد. خطر واقعی، انقضای توکن بود.

## ۱۳.۳ — نتیجهٔ معتبر (پس از تازه‌سازی نشست‌ها)

```
۴۷۰ سبز · ۳۰ قرمز · ۱۹ skip · ۷ اجرا نشد    (۵۲۶ تست، ۱۹.۶ دقیقه)
```

تازه‌سازی نشست **۸۴ قرمز کاذب** را حذف کرد (۱۱۴ → ۳۰).

## ۱۳.۴ — طبقه‌بندی هر ۳۰ قرمز

### الف) خط پایهٔ مستند — ۱ مورد

| spec | خطا |
|---|---|
| `persons/credit-uses-person.spec.ts:21` | `final_limit 3000000000 not found on the credit page` |

این همان تک‌قرمزی است که `PROGRESS.md` بارها ثبت کرده («۱ قرمز مستند `credit-uses-person`»).
از این مأموریت نیست و پیش از آن هم قرمز بود.

### ب) 🔴 قرمزِ تازه که **کار من ساخته** — ۴ مورد

هر چهار مورد یک ریشه دارند: فاز ۲ صفحات یتیم را به سایدبار وصل کرد، و specهایی که
locatorشان به بخش اصلی صفحه محدود نشده بود حالا **لینک سایدبار** را هم می‌گیرند.

| spec | چه شد |
|---|---|
| `persons/person-profile.spec.ts:24` | `getByRole('link',{name:'اشخاص تکراری'})` به **۲** عنصر رسید: لینک سایدبار `/persons/merge` (افزودهٔ من) + دکمهٔ خودِ صفحه |
| `persons/quote-customer-link.spec.ts:52` | `a[href*="/persons/"]` انتظار **۰** داشت، **۲** گرفت — `/persons/import` و `/persons/merge` در سایدبار |
| `persons/quote-list-link.spec.ts:33` | اولین `a[href*="/persons/"]` حالا `/persons/import` است، نه لینک شخصِ مشتری |
| `business-flows/211-216-…:398` | `/ردشده|رد شده/` هم برچسب «ردشده» را می‌گیرد هم لینک سایدبارِ «درخواست‌های رد شدهٔ من» (افزودهٔ من) |

**اینها نقص محصول نیستند — نقص شکنندگی تست‌اند**، و در واقع نتیجهٔ همان چیزی‌اند که مأموریت
می‌خواست: آن صفحات حالا با کلیک قابل دسترس‌اند. **ولی قرمزِ تازه‌اند و کار من**، و پنهان
کردنشان پشت «تست شکننده است» درست نیست.

### ✅ رفع شد (به درخواست مالک)

هر چهار locator به landmark `<main>` محدود شدند (`AppShell.tsx:26`)، چون ادعای واقعی هر چهار
تست دربارهٔ **محتوای صفحه** است نه کل سند:

```ts
page.getByRole("main").getByRole("link", { name: "اشخاص تکراری" })
page.getByRole("main").locator('a[href*="/persons/"]')
```

**چرا «شمارش زندهٔ انتظار» انتخاب نشد:** فقط یکی از این چهار اصلاً assertion شمارشی است
(`toHaveCount(0)`)، و مشتق‌کردن آن عدد از داده، **اندازهٔ فعلی سایدبار را داخل تست می‌پخت** —
یعنی دفعهٔ بعد که کسی یک آیتم به منو اضافه کند دوباره می‌شکست. عدد درست در `<main>` صفر است،
مستقل از اینکه سایدبار چند لینک دارد. محدودکردن به `<main>` هم علت را رفع می‌کند هم تست را
در برابر تغییرات آیندهٔ ناوبری مصون می‌کند.

**تأیید:** هر ۴ تست حالا سبزند و ۷ تست همسایه در همان فایل‌ها هم سبز ماندند
(**۱۱ سبز / ۱ skip** — آن skip از قبل بود).

### ج) کار عامل‌های دیگرِ امروز — ۲۲ مورد

**۲۰ مورد `asan/*`** — همه روی انتظارِ **داده** می‌افتند، نه روی خطای ساختاری:
«هیچ فاکتور قابل‌خروجی نیست»، «هنوز هیچ تأمین‌کننده‌ای کد آسان ندارد» (انتظار ۰، دریافت **۲**)،
«minted Asan numbers»، شماره‌گذاری.

**اثبات اینکه کار من نیست:** هر چهار تابع خروجی آسان زنده بررسی شدند —
`asan_list_sales_export`, `asan_list_purchase_export`, `asan_list_journal_export`,
`asan_list_bank_deposit_export` — و **هیچ‌کدام** به جدول حذف‌شده ارجاع ندارند
(`references_dropped_table = f` برای هر چهار). داده هم تأیید می‌کند جهتِ تغییر: الان
**۲ تأمین‌کننده** کد آسان دارند در حالی که spec صراحتاً ۰ را assert می‌کند، و ۱۱ شناسهٔ
`asan_person_code` موجود است. مهاجرت‌های امروزِ عامل `p1-dual-role` — **۳۲۱**
(`one_asan_code_per_person`) و **۳۲۲** (`unlink_fix_and_supplier_edit`) — دقیقاً همین داده را
جابه‌جا کرده‌اند. این همان بند ۷ قواعد چندعامله است: «دیتابیس زنده هم مشترک است؛ دادهٔ
کسب‌وکاری زیر پای تست‌ها تکان می‌خورد.»

⚠️ یک نکتهٔ صادقانه: ۱۶ پیش‌فاکتور مشتریِ دارای کد دارند ولی `export-sales` صفر مورد
قابل‌خروجی می‌بیند. سازوکار دقیقش **اثبات نشده**؛ آنچه اثبات شده این است که **از حذف جدول
`invoices` نیست**. صاحب کار آسان باید نگاه کند.

**۲ مورد `clusters/new-clusters-jwt.spec.ts`** (`tick_inquiries`, `start_league_season`) —
specهای تازهٔ عامل `new-clusters-frontend` دربارهٔ RPCهای خودش. قلمرو همان عامل.

### د) محیط / هارنس — ۳ مورد

| spec | خطا |
|---|---|
| `business-flows/212-quote-credit-guard.spec.ts:607` | `Command failed: docker exec afrakala-lan-db …` |
| `business-flows/213-dynamic-customer-credit-scoring.spec.ts:486` | همان |
| `business-flows/214-whatsapp-market-purchase-advisor.spec.ts:35` | `toBeVisible` — پل واتساپ در این محیط در دسترس نیست |

دو تای اول از داخل spec به کانتینر دیتابیس shell می‌زنند و آن فرمان شکست می‌خورد (محیط،
نه محصول).

### جمع‌بندی طبقه‌بندی

| دسته | تعداد |
|---|---|
| خط پایهٔ مستند | ۱ |
| 🔴 **تازه، ناشی از کار من** | **۴** ← ✅ رفع شد |
| کار عامل‌های دیگر امروز (asan ۲۰ + clusters ۲) | ۲۲ |
| محیط/هارنس | ۳ |
| **جمع** | **۳۰** |

**هیچ قرمزی به حذف زیرسیستم `invoices` برنمی‌گردد.** هر ۴ قرمز منتسب به من از **افزودن**
لینک به سایدبار است، نه از حذف چیزی.

## ۱۳.۵ — انتشار نسخه روی `/updates`

**تشخیص تأیید شد:** تولیدکنندهٔ یادداشت انتشار فقط در مسیر رسمی و **روی هاست** اجرا می‌شود:
`deploy/lan/build.ps1` یادداشت‌ها را می‌سازد و در image می‌پزد، و `deploy/lan/up.ps1` پس از
بالا آمدن استک، `APP_GIT_SHA` را از **داخل کانتینرِ در حال اجرا** می‌خواند و
`server/publish-release.mjs` را صدا می‌زند. کانتینر خودش نمی‌تواند منتشر کند — تأیید شد که
`grep -rl "publish-release|auto_publish_release" /app/.output` **صفر** نتیجه دارد.

**ولی یک تصحیح:** بیلدِ من با `docker compose up -d --build web` انجام شد، نه با
`build.ps1`+`up.ps1` — پس **خودش هم منتشر نکرد**. حتی `public/release-notes.json` که در image
پخته شد، یک فایل باقی‌ماندهٔ **دیروز** بود (`headSha: fc32f1df`). یعنی مسیر تک‌فرمانی که
`PROGRESS.md` برای فرار از تلهٔ image قدیمی توصیه می‌کند، **مرحلهٔ انتشار را بی‌صدا رد می‌کند**؛
این دو مسیر هم‌ارز نیستند.

پس از آن، مرحلهٔ انتشار دقیقاً مثل `up.ps1` دستی اجرا شد:

```
[release-notes]   8 entries (8 with a Persian trailer) -> public/release-notes.json
[release-publish] published release #28 with 8 item(s) for 6215e1e0
```

| نسخه | git_sha | وضعیت | تعداد آیتم |
|---|---|---|---|
| **#28** | `6215e1e0` | `published` | **۸** |
| #21 (قبلی) | `fc32f1df` | `published` | ۱ |

از **۶۲** کامیت امروز فقط **۸** تریلر `Release-note-fa:` داشتند؛ بقیه مهاجرت و مستند و
refactor بودند و **درست است** که منتشر نشوند.

## ۱۳.۶ — مانده‌ها پس از این بخش

۱. ✅ **۴ قرمزِ ناشی از کار من رفع شد** (بند ب) — locatorها به `<main>` محدود شدند و هر ۴ سبز شدند.
۲. **۲۰ قرمز آسان** نیاز به نگاه صاحب کار آسان دارد؛ فقط اثبات شد که از حذف `invoices` نیست.
۳. **۷ تست «اجرا نشد»** — پیامد توقف سوئیت پس از قرمزهای پیشین، نه نتیجهٔ مستقل.
۴. یادداشت انتشار فازهای ۱–۲ همچنان گم است (تصمیم مالک: فعلاً بماند).

# پیوست — تاریخچهٔ فازبه‌فاز (به ترتیب وقوع)

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

**تست:** این پروژه `test script` ندارد و هیچ تست واحدی اجرا نشد. e2e در طول مأموریت اجرا نشد؛
پس از تکمیل، سوئیت کامل روی بیلد مستقر اجرا شد (**۴۷۰ سبز / ۳۰ قرمز / ۱۹ skip / ۷ اجرانشده**) —
بخش ۱۳ هر ۳۰ قرمز را طبقه‌بندی می‌کند، از جمله **۴ قرمز تازه که کار همین مأموریت است**.

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

---

# مهاجرت ۳۲۸ — گیت دائمی رجیستری FK اشخاص (رفع ریشه‌ای)

**چرا:** سه بار (۲۷۱، ۲۸۷، ۳۱۹) یک FK تازه به `persons` اضافه شد و در رجیستری `person_merge`
ثبت نشد؛ هر بار **ادغام اشخاص در کل سامانه از کار افتاد** و هر بار فقط بعد از وقوع پیدا شد.
هر سه نویسنده حادثهٔ قبلی را در `PROGRESS.md` خوانده بودند. مستندسازی سه بار شکست خورد، پس
این‌بار مکانیکی شد.

**چه شد:** یک event trigger روی `CREATE TABLE` / `ALTER TABLE` / `DROP TABLE` که هر بار
مجموعهٔ FKهای `persons` را با کلیدهای رجیستری مقایسه می‌کند و در صورت اختلاف **DDL و در
نتیجه کل مهاجرت را rollback می‌کند** — با پیامی که دقیقاً نام ستون را می‌گوید.

**دو جهت را می‌گیرد، نه یکی:**
- `UNREGISTERED` — FK هست، سیاست نیست (تلهٔ ۲۷۱/۲۸۷/۳۱۹).
- `STALE` — کلید رجیستری هست، ستون نیست (**دقیقاً سناریوی شرط ۲ همین مأموریت**؛ حلقهٔ پایانی
  `person_merge` روی خودِ رجیستری می‌چرخد و `_person_merge_count_refs` روی جدول ناموجود
  `42P01` می‌دهد).

**قاعدهٔ ترتیب (در `AGENTS.md`/`CLAUDE.md` بند ۹ هم ثبت شد):** افزودن FK ⇒ اول `person_merge`
را با کلید تازه جایگزین کن بعد `ALTER TABLE`؛ حذف جدول ⇒ اول کلید را از رجیستری بردار بعد
`DROP`.

## تست‌ها (همه داخل `BEGIN … ROLLBACK`، فایل `docs/verification/328-gate-tests.sql`)

| # | سناریو | نتیجه |
|---|---|---|
| ۱ | `CREATE TABLE` با FK ثبت‌نشده به `persons` | ✅ رد شد — نام برد `zz_gate_probe.person_id` |
| ۲ | `ALTER TABLE … ADD CONSTRAINT` ثبت‌نشده | ✅ رد شد |
| ۳ | تغییر نام `invoices` (شبیه‌سازی DROP) | ✅ رد شد — **هر دو** مورد را نام برد: `invoices.customer_person_id` (STALE) و `zz_invoices_gone.customer_person_id` (UNREGISTERED) |
| ۴ | DDL بی‌ربط (جدول بدون FK به اشخاص) | ✅ اجازه داده شد، صفر مشکل |

هیچ‌چیز باقی نماند (هر سه جدول آزمایشی `NULL`، `invoices` سرجایش).

**⛔ نقصی که dry-run خودِ ۳۲۸ گرفت:** نسخهٔ اول استخراج‌گر رجیستری، رشتهٔ `'public.persons'`
داخل **کامنت‌های** رجیستری را به‌عنوان کلید می‌خواند و یک `STALE` جعلی گزارش می‌کرد. حالا
خطوط کامنت پیش از تطبیق حذف می‌شوند و هر توکن `public.*` صریحاً کنار گذاشته می‌شود.
استخراج‌گر عمداً **fail-loud** است: اگر بلوک رجیستری را پیدا نکند خطا می‌دهد، چون گیتی که
بی‌صدا پاس کند از نبودِ گیت بدتر است.

**وضعیت زنده پس از اعمال:** `trg_person_fk_registry_gate` فعال (`evtenabled = O`)،
۳۰ کلید رجیستری = ۳۰ FK، صفر مشکل.

---

---

# شرط ۳ — بخش ۱ اجرا شد (مهاجرت ۳۲۹): هر دو کلید خارجی حذف شد

**کلیدهای خارجی:** `payment_receipt_links_invoice_id_fkey` و `delivery_receipts_invoice_id_fkey`
حذف شدند. PostgreSQL اجازه نمی‌دهد جدولی که به آن ارجاع هست drop شود، پس این دو **سدِ سختِ**
حذف جدول بودند. مهاجرت پیش از اقدام، فرضش را **زنده assert می‌کند** (اگر ردیفی با
`invoice_id` غیرتهی پیدا شود متوقف می‌شود، نه اینکه بی‌صدا یتیمش کند) — در زمان اجرا هر دو صفر بودند.
**ستون‌های `invoice_id` نگه داشته شدند**، چون توابعی مثل `enforce_payment_receipt_link_limits`
هنوز می‌خوانندشان؛ حذف ستون کار مرحلهٔ بعد است.

**سه تابع حذف شد** — هر سه با صفر فراخوان، هم در فرانت‌اند و هم **داخل خودِ دیتابیس**:
`cancel_invoice` · `send_invoice_to_accountant` · `set_invoice_accounting_marker`.

**یک یتیم که از مهاجرت ۳۲۳ جا مانده بود:** تنها مصرف‌کنندهٔ `set_invoice_accounting_marker`
کامپوننت `src/components/invoices/InvoiceAccountingMarkers.tsx` بود که ۳۲۳ روت‌های واردکننده‌اش
را حذف کرد ولی خودش را جا گذاشت — نه چیزی واردش می‌کرد نه چیزی وارد می‌کرد. در همین commit حذف شد.

**سه تابع عمداً نگه داشته شدند، چون هنوز مصرف‌کنندهٔ زنده دارند:**

| تابع | چرا ماند |
|---|---|
| `complete_invoice_task` | از `/operations/tasks` صدا زده می‌شود — صفحه‌ای که در سایدبار است |
| `create_preinvoice_workflow_tasks` | پشتِ تریگر `trg_create_preinvoice_workflow_tasks` **روی خودِ `invoices`** |
| `invoices_log_type_changes` | تریگر روی `invoices` |

این سه با خودِ جدول می‌روند، نه پیش از آن.

**وضعیت زنده پس از ۳۲۹:** کلید خارجی به `invoices` **صفر** · ارجاع کدی توابع **۱۷ → ۱۴** ·
جدول `invoices` سرجایش · رجیستری اشخاص متوازن (گیت ۳۲۸ روی همین `ALTER TABLE`ها اجرا شد و پاس داد) ·
typecheck **۷۰**.

## مانده از شرط ۳ — بازنویسی ۱۴ تابع

الگوی امن همان است که ۳۲۷ اثبات کرد: چون `invoices` **صفر ردیف** دارد، هر `JOIN`/`SELECT` روی آن
امروز هیچ ردیفی برنمی‌گرداند، پس برداشتن آن شاخه **اثباتاً حافظِ رفتار** است — نه یک تخمین.
خطرناک‌ترین‌ها آن‌هایی‌اند که تریگرِ جدول‌های **زنده**اند و با حذف `invoices` از بین نمی‌روند بلکه
هنگام اجرا می‌شکنند: `enforce_payment_receipt_link_limits` و
`enforce_receipt_approval_allocation_limits` (نگهبان‌های مالی) و
`recompute_employee_scores_on_receipt(_link)`.

---

---

# شرط ۳ — بخش ۲ (مهاجرت ۳۳۰): چهار تریگر روی جدول‌های زنده

این چهار **تیزترین** موردِ کل شرط ۳ بودند: تریگرِ `payment_receipts` و
`payment_receipt_links`اند — جدول‌هایی که **با حذف `invoices` از بین نمی‌روند**. برخلاف
توابع مختص فاکتور، این‌ها همچنان اجرا می‌شدند و در **زمان اجرا** روی اولین نوشتنِ فیش
می‌شکستند، مدت‌ها بعد از اینکه مهاجرتِ DROP گزارش موفقیت داده بود.

## تصمیم مهم — دو نگهبان مالی «حذف» نشدند، «سخت‌گیرتر» شدند

در `enforce_payment_receipt_link_limits` و `enforce_receipt_approval_allocation_limits`
شاخهٔ فاکتور **کد مرده نبود، یک سقف مالی بود**. چون ستون `payment_receipt_links.invoice_id`
هنوز هست و CHECK نوع XOR هنوز اجازه‌اش می‌دهد، **پاک‌کردن ساده‌ی آن شاخه یعنی برداشتن سقف از
ردیفی که هنوز ساختنی است**. پس به‌جای حذف، این مسیر **صریحاً رد** می‌شود — اکیداً
سخت‌گیرتر از قبل، هرگز شل‌تر.

`recompute_employee_scores_on_receipt` نقطهٔ مقابل است: `invoices` **تنها** راهش برای پیدا
کردن کارمند بود، یعنی این تریگر **هرگز حتی یک امتیاز نداده**. عمداً به `sales_quotes` وصل
**نشد** — این کار آن را از «هرگز اجرا نمی‌شود» به «برای ۵۰ پیش‌فاکتور زنده اجرا می‌شود»
تبدیل می‌کرد و امتیازهای واقعی را جابه‌جا می‌کرد؛ یک **تصمیم محصولی** است نه عارضهٔ جانبی
یک مهاجرت پاک‌سازی. `recompute_employee_scores_on_receipt_link` شاخهٔ پیش‌فاکتورِ **زنده**
دارد و آن شاخه دست‌نخورده ماند.

## گیت برابری old-vs-new (هر دو سمت ROLLBACK، فایل `docs/verification/330-equivalence-test.sql`)

| کاوش | تعریف قدیم | تعریف جدید |
|---|---|---|
| تخصیص معتبر روی پیش‌فاکتور | ACCEPTED | **ACCEPTED** |
| تخصیص بیشتر از مبلغ فیش (قاعدهٔ ۱) | REJECTED `23514` «مجموع تخصیص‌های این فیش برابر ۲۰٬۱۰۰٬۱۰۰٬۰۰۰…» | **همان `23514`، همان پیام، همان عدد** |
| تخصیص به فاکتور | REJECTED `23503` «فاکتور مورد نظر یافت نشد» | REJECTED `23514` «…بازنشسته شده است» |

مورد سوم تنها تفاوت است و **هر دو رد می‌کنند** — قدیمی چون هیچ فاکتوری وجود ندارد، جدید
صریحاً. یعنی هیچ‌جا شل‌تر نشد. هیچ ردیفی نوشته نشد (۳ لینک، بدون تغییر).

**⛔ همان تلهٔ سوم‌بار:** dry-run دوباره روی ادعای خودِ مهاجرت افتاد، چون کامنت‌های توضیحی‌ام
داخل بدنهٔ تابع عبارت دقیق `public.invoices` را داشتند و `pg_get_functiondef` کامنت را هم
برمی‌گرداند. کامنت‌های داخل بدنه بازنویسی شدند (سرآیند مهاجرت دست‌نخورده، چون جزو بدنه نیست).

**وضعیت زنده پس از ۳۳۰:** ارجاع کدی توابع **۱۴ → ۱۰** · هر چهار تریگر همچنان متصل ·
۳ لینک بدون تغییر · جدول `invoices` دست‌نخورده.

---

---

# ✅ پایان — هر سه شرط برآورده شد و جدول `invoices` حذف شد (۳۳۱ + ۳۳۲)

## ۳۳۱ — هفت تابعی که فقط می‌خواندند

هیچ‌کدام تریگر نبود و هیچ‌کدام مختص فاکتور نبود: توابع زندهٔ مالی/امتیاز/هویت که اتفاقاً
جدولِ در حال بازنشستگی را می‌خواندند. **دو موردشان با ویرایش کورکورانه می‌شکست:**

- `get_receivable_detail` — نام مستعار `i` واقعاً **استفاده می‌شد**:
  `COALESCE(i.issue_date, v.created_at::date)`. حذف صرفِ JOIN اصلاً کامپایل نمی‌شد. چون
  LEFT JOIN هرگز ردیفی نمی‌گرفت، `i.issue_date` همیشه NULL بود و COALESCE همیشه آرگومان
  دوم را برمی‌گرداند؛ پس همان آرگومان دوم مستقیم جایگزین شد.
- `calculate_salesperson_collected_sales` — SELECT پایانی روی CTE **خالی** تجمیع می‌کند و
  **دقیقاً یک ردیف صفر** برمی‌گرداند، نه صفر ردیف. جایگزین هم یک ردیف صفر برمی‌گرداند؛
  برگرداندن هیچ ردیفی برای همهٔ فراخوان‌ها تغییر رفتار بود.

هرجا یک سنجه تنها منبعش را از دست داد (وقت‌شناسی تسویه، معوقهٔ مشتری، فروش وصول‌شده)
همان چیزی را برمی‌گرداند که قبلاً برمی‌گرداند — صفر یا NULL — و **عمداً** به `sales_quotes`
وصل نشد؛ آن کار عدد همیشه‌صفر را زنده می‌کرد و یک تصمیم محصولی است.

**گیت برابری با JWT ادمین واقعی (هر دو سمت ROLLBACK):** خروجی هر پنج کاوش **یکسان**.
⚠️ اولین اجرا بی‌ارزش بود چون کاوش‌ها روی گاردِ احراز هویت می‌افتادند و اصلاً به کد
بازنویسی‌شده نمی‌رسیدند؛ با JWT دوباره اجرا شد.
**یافتهٔ صادقانه:** `calculate_salesperson_collected_sales` امروز با
`type "public.text[]" does not exist` می‌افتد — نقصی **از قبل موجود** در گاردِ نقشش، در هر
دو نسخه یکسان؛ ۳۳۱ نه ساختش نه رفعش کرد.

## ۳۳۲ — شرط ۲ و خودِ حذف

**دو سدی که فقط با بررسی زنده پیدا شدند:**

1. **`vw_customer_receivables` به جدول وابسته بود** — `DROP TABLE` می‌افتاد، و `CASCADE`
   بی‌صدا همان view را می‌برد که صفحهٔ مطالبات از آن می‌خواند. view یک UNION است؛ فقط بازوی
   فاکتور و CTE مخصوصش (`paid_inv`) برداشته شد و بازوی پیش‌فاکتور دست‌نخورده ماند.
2. **از ۱۱ تریگر روی جدول، دو تابعشان مشترک‌اند** — `set_updated_at` روی **۷۳** جدول دیگر و
   `tg_credit_derive_customer_person` روی **۷** جدول دیگر. حذفشان بخش بزرگی از اسکیما را
   می‌شکست. ۹ تابع مختص فاکتور حذف شدند و این دو با assert صریح محافظت شدند.

**ترتیب باربر است:** اول از رجیستری حذف، بعد `DROP TABLE` — دقیقاً همان چیزی که گیت ۳۲۸
می‌خواهد. بین این دو هیچ DDL جدولی اجرا نمی‌شود، پس گیت حالت میانی را نمی‌بیند.

## اثبات سه‌طرفهٔ شرط ۲ (همه ROLLBACK شد)

| سناریو | نتیجه |
|---|---|
| پیش از ۳۳۲ | **MERGE OK** |
| پس از ۳۳۲ (حذف + de-register) | **MERGE OK** ← شرط ۲ اثبات شد، نه فرض |
| **شاهد:** حذف **بدون** de-register | **گیت ۳۲۸ جلویش را گرفت** و هر دو ستون را نام برد |

مورد سوم همان فاجعه‌ای است که ۲۷۱/۲۸۷/۳۱۹ سه بار ساختند؛ حالا مکانیکی جلویش گرفته می‌شود.

## وضعیت نهایی زنده

```
جدول invoices ................ DROPPED
توابع ارجاع‌دهنده ............. 0   (از ۲۵ در ابتدای مأموریت)
کلیدهای رجیستری اشخاص ........ 29  (از ۳۰، متوازن، صفر مشکل)
تریگرهای set_updated_at ...... 73  (دست‌نخورده)
vw_customer_receivables ...... ۳ ردیف (کار می‌کند)
typecheck .................... 70  · build سبز
```

**دنبالهٔ کامل:** ۳۲۳ (جدول‌های فرزند) → ۳۲۷ (شرط ۱) → ۳۲۸ (گیت) → ۳۲۹ (کلیدهای خارجی) →
۳۳۰ (چهار تریگر) → ۳۳۱ (هفت خواننده) → ۳۳۲ (حذف نهایی).

---

## ~~🔴 پیگیری معوق — جدول `invoices` هنوز باید حذف شود~~ ✅ انجام شد در ۳۳۲

<!-- بخش زیر برای تاریخچه نگه داشته شد؛ هر سه شرطش در ۳۲۷/۳۲۹/۳۳۰/۳۳۱/۳۳۲ بسته شد. -->

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
