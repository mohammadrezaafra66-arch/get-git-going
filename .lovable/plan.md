# پلن: غیرفعال‌سازی Legacy در UI اعتبار مشتری و اتصال بلاک فاکتور به Dynamic

## Task ID
CREDIT-DYNAMIC-ONLY-UI

## Classification
PLAN ONLY — فایل تغییر نمی‌کند تا تأیید نگیرم.

## هدف (یک جمله)
UI اعتبار مشتری فقط سیستم Dynamic را نمایش دهد و بلاک اعتبار در `InvoiceForm` بر پایه `customer_capital_allocations_dynamic.final_limit` تصمیم بگیرد؛ جداول و RPCهای Legacy در دیتابیس دست‌نخورده می‌مانند.

---

## ۱) وضعیت فعلی صفحه `/sales/customers/:id/credit`

فایل: `src/routes/_app.sales_.customers_.$customerId.credit.tsx`

بخش‌های Legacy که الان نمایش داده می‌شوند:
- دکمه «محاسبه مجدد امتیاز» → RPC `calculate_credit_score` (Legacy)
- ۴ کارت بالا: **امتیاز اعتباری (۰–۱۰۰)**، **سقف اعتبار**، **بدهی جاری**، **کل خرید** — همه از `customer_credit_profile`
- ۲ کارت میانی: **امتیاز تسویه**، **وضعیت معوق** — از `customer_credit_profile`
- کارت **سابقه پرداخت** — از `customer_credit_profile` (`total_paid`, `late_payments_count`, `last_purchase_date`)
- کارت **تاریخچه محاسبات (۲۰ مورد)** — از `credit_score_snapshots`

بخش Dynamic که هست و باقی می‌ماند:
- `<DynamicScoringSection entityType="customer" entityId={customerId} canEdit={canRecalc} />`

Query‌های Legacy در همین فایل:
- `queryKey ["credit-profile", customerId]` → `customer_credit_profile`
- `queryKey ["credit-snapshots", customerId]` → `credit_score_snapshots`
- `useMutation recalc` → `rpc("calculate_credit_score")`

---

## ۲) چه چیزی حذف/مخفی شود

**در فایل `src/routes/_app.sales_.customers_.$customerId.credit.tsx`:**
- حذف: `useQuery(profile)`, `useQuery(snapshots)`, `useMutation(recalc)`
- حذف: دکمه «محاسبه مجدد امتیاز» و «ایجاد و محاسبه امتیاز»
- حذف: هر ۴ کارت بالا (MetricCard امتیاز/سقف/بدهی/کل خرید)
- حذف: ۲ کارت میانی (امتیاز تسویه، وضعیت معوق)
- حذف: کارت سابقه پرداخت
- حذف: کارت تاریخچه محاسبات (۲۰ مورد)
- حذف: helper `scoreColor` (بعد از حذف کارت‌ها بلااستفاده)
- نگه‌داشتن: `PageHeader`, بازگشت به مشتریان، و `<DynamicScoringSection>`
- افزودن (اختیاری، پیشنهادی): یک کارت جمع‌بندی کوچک از آخرین تخصیص پویا با استفاده از `useCustomerLatestAllocation` — نمایش `final_limit`, `weighted_score`, `binding_constraint`, `capital_date` تا کاربر ببیند «سقف مؤثر امروز» چقدر است. این کارت فقط از Dynamic می‌خواند.

**هیچ کامپوننت/hook مشترک حذف نمی‌شود** — `DynamicScoringSection` و `useDynamicScoring` سالم می‌مانند. hookهای Legacy (`useCreditScoring` اگر جایی مصرف می‌شود) در این پلن دست‌نمی‌خورند.

خارج از این صفحه، **صفحه `/sales/credit-customers`** همچنان از Legacy می‌خواند. در این پلن به آن دست نمی‌زنیم (خارج از scope مشخص‌شده توسط کاربر). اگر بخواهید بعداً همان را هم Dynamic کنیم، فاز دوم جداگانه.

---

## ۳) منبع فعلی سقف اعتبار در `InvoiceForm`

فایل: `src/shared/components/InvoiceForm.tsx`

- بلاک از RPC `get_customer_credit(p_customer_id)` می‌خواند (خط ۱۵۹ و مجدداً خط ۲۹۷ در حین submit).
- این RPC داخل خودش `_ensure_credit_balance` را صدا می‌زند که `customer_credit_balance.available_credit` را از `customer_credit_profile.credit_limit` مقداردهی اولیه می‌کند.
- پس **منبع نهایی سقف اعتبار = `customer_credit_profile.credit_limit` (Legacy)**. `available_credit = credit_limit − held − outstanding` تقریباً.
- علاوه بر آن، RPC `can_issue_customer_invoice` برای بلاک معوق (این متعلق به overdue است، نه سقف — جدا نگه می‌داریم).

---

## ۴) اتصال بلاک فاکتور به Dynamic

**آیا `final_limit` در جدول Dynamic هست؟** بله — `customer_capital_allocations_dynamic` ستون `final_limit numeric` دارد (تأیید شده در `useDynamicScoring.ts` و در RPC `run_daily_capital_allocation`). هر رکورد به `daily_capital_settings.capital_date` لینک می‌شود، پس «آخرین snapshot امروز» = آخرین ردیف با `capital_date = today`.

**راهبرد پیشنهادی (کم‌ریسک، بدون شکستن held/outstanding):**

RPC جدید (SECURITY DEFINER) به نام `get_customer_dynamic_credit(p_customer_id uuid)` که برمی‌گرداند:
- `final_limit` — از آخرین `customer_capital_allocations_dynamic` امروز (اگر نبود → 0 و پرچم `has_allocation=false`)
- `capital_date`
- `binding_constraint`
- `outstanding_balance` — از `customer_credit_profile` (این ستون فعلاً تنها منبع بدهی جاری است و در دیتابیس دست‌نمی‌خورد)
- `held_credit` — از `customer_credit_balance` (برای احترام به holdهای فعال روی پیش‌فاکتورها)
- `available_credit = max(final_limit − outstanding − held, 0)`
- `has_overdue`, `overdue_since`, `settlement_score` — همچنان از `customer_credit_profile` (چون trigger معوق و RPC `can_issue_customer_invoice` روی همین جدول کار می‌کنند و در scope این تغییر نیست)

**تغییر در `InvoiceForm.tsx`:**
- جایگزینی هر دو فراخوانی `rpc("get_customer_credit", …)` (خطوط ۱۵۹ و ۲۹۷) با `rpc("get_customer_dynamic_credit", …)`.
- شکل خروجی مصرفی (`available_credit`, `held_credit`, `outstanding_balance`, `has_overdue`, `overdue_since`, `settlement_score`) عمداً یکسان با RPC قبلی طراحی می‌شود تا **هیچ کد UI دیگری تغییر نکند**.
- منطق `hold_credit` / `release_credit` / `settle_credit` که در سایر جریان‌ها روی `customer_credit_balance` می‌نویسند، دست‌نخورده می‌ماند. فقط منبع «سقف پایه» از Legacy به Dynamic منتقل می‌شود.
- بلاک معوق (`can_issue_customer_invoice`, `log_invoice_issuance_blocked_overdue`) بدون تغییر باقی می‌ماند.

**نکته حیاتی برای تأیید کاربر:**
- اگر برای مشتری در «امروز» هیچ ردیف Dynamic ثبت نشده باشد، `final_limit = 0` → **هر پیش‌فاکتور اعتباری بلاک می‌شود**. باید تصمیم بگیرید:
  - الف) رفتار همان: بلاک شود تا اپراتور ابتدا `run_daily_capital_allocation` بزند. (پیشنهاد من — امن‌تر)
  - ب) fallback به آخرین `final_limit` قبلی (هر تاریخی).
  - ج) fallback به `customer_credit_profile.credit_limit` (یعنی Legacy به‌عنوان safety net باقی بماند).
  
  لطفاً یکی را انتخاب کنید تا در RPC پیاده کنم.

---

## ۵) تأثیر روی دیتابیس

- **هیچ جدولی drop یا rename نمی‌شود.** `customer_credit_profile`, `credit_score_snapshots`, `credit_scoring_rules`, `customer_credit_balance`, `customer_credit_ledger`, `customer_capital_allocations`, `salesperson_capital_allocations`, `daily_capital_snapshots` همه دست‌نخورده می‌مانند.
- RPCهای Legacy (`calculate_credit_score`, `compute_customer_capital_allocations`, …) drop نمی‌شوند — فقط UI دیگر آن‌ها را صدا نمی‌زند.
- تنها تغییر SQL: **افزودن یک RPC جدید** `get_customer_dynamic_credit` (SECURITY DEFINER + role check مشابه `get_customer_credit`).
- تریگرهای موجود روی invoices/payment_receipts که `customer_credit_profile` و `customer_credit_balance` را به‌روز می‌کنند، همچنان کار می‌کنند (پس `outstanding_balance` و `held_credit` معتبر می‌مانند).

---

## فایل‌های تغییر (خلاصه)

| فایل | تغییر |
|---|---|
| `src/routes/_app.sales_.customers_.$customerId.credit.tsx` | حذف queries/mutation/cardsی Legacy؛ نگه‌داشتن `DynamicScoringSection`؛ افزودن کارت خلاصه آخرین تخصیص |
| `src/shared/components/InvoiceForm.tsx` | جایگزینی نام RPC از `get_customer_credit` به `get_customer_dynamic_credit` (۲ محل) — بدون تغییر فیلدهای مصرفی |
| migration جدید | ایجاد `get_customer_dynamic_credit(uuid)` با role guard + fallback مطابق تصمیم بند ۴ |

---

## Migration/RLS/RBAC/Audit
- migration فقط CREATE FUNCTION + GRANT EXECUTE به `authenticated`؛ reversible با `DROP FUNCTION IF EXISTS`.
- role guard داخل RPC: admin/manager/accountant/sales — همان مجموعه `get_customer_credit`.
- بدون تغییر RLS جداول. بدون audit log جدید (رفتار موجود `credit_limit_blocked` در `InvoiceForm` حفظ می‌شود).

## UI/UX
- صفحه credit مشتری تمیزتر و فقط Dynamic.
- در `InvoiceForm` هیچ تغییر بصری‌ای رخ نمی‌دهد؛ فقط عدد سقف از منبع جدید می‌آید.

## مسیر تست دستی
1. `/sales/customers/<id>/credit` — فقط بخش Dynamic + کارت خلاصه دیده شود؛ هیچ کارت Legacy نباشد.
2. اجرای `run_daily_capital_allocation` برای امروز → صدور پیش‌فاکتور اعتباری زیر `final_limit` باید موفق شود؛ بالاتر → بلاک با پیام موجود.
3. بدون تخصیص امروز → طبق تصمیم بند ۴ (پیش‌فرض: بلاک).
4. مشتری معوق → همچنان توسط `can_issue_customer_invoice` بلاک شود.
5. `bun run build && bun run lint`.

## ریسک‌ها
- اگر گزینه (الف) انتخاب شود، تا وقتی allocation روز اجرا نشده باشد هیچ فاکتور اعتباری صادر نمی‌شود — نیاز به هماهنگی عملیاتی.
- `outstanding_balance` و `held_credit` هنوز از مسیر Legacy می‌آیند؛ اگر روزی بخواهید کاملاً از `customer_credit_profile` مستقل شوید، فاز جداگانه لازم است.
- صفحه `/sales/credit-customers` هنوز Legacy است و در این پلن پاکسازی نمی‌شود.

## سؤال بلاک‌کننده قبل از اجرا
لطفاً یکی از سه گزینه fallback در بند ۴ را انتخاب کنید: **(الف) بلاک وقتی allocation امروز نیست**، **(ب) آخرین final_limit تاریخی**، یا **(ج) fallback به `credit_limit` Legacy**.
