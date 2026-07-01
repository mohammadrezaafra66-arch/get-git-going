## مسئله

در `/accounting/dynamic-capital` هنگام زدن «محاسبه و ذخیره» پیام **«خطا در محاسبه snapshot»** دیده می‌شود.

## ریشه

تابع `public.run_daily_capital_allocation` داخل یک حلقه `FOR v_sp IN _sp_alloc LOOP` این را انجام می‌دهد:

```sql
CREATE TEMP TABLE _sp_cust(...) ON COMMIT DROP;
```

نکتهٔ کلیدی: `ON COMMIT DROP` فقط در **commit تراکنش** جدول را حذف می‌کند. کل تابع در یک تراکنش اجرا می‌شود، پس در **دومین تکرار حلقه** (وقتی بیش از یک کارشناس فروش با allocated_capital > 0 وجود دارد) با خطای `relation "_sp_cust" already exists` مواجه می‌شویم و کل RPC fail می‌کند. با یک کارشناس کار می‌کند و همین باعث می‌شد قبلاً fix `WHERE true` کافی به نظر برسد.

## راه‌حل (migration کوچک، فقط بازتعریف تابع)

یک migration جدید که `run_daily_capital_allocation` را با همان امضا و همان منطق بازتعریف کند، فقط با این تغییرات محدود در بخش حلقه:

1. جدول موقت `_sp_cust` را **یک بار قبل از حلقه** ایجاد کنیم (بدون `ON COMMIT DROP`).
2. در ابتدای هر تکرار حلقه، `TRUNCATE _sp_cust;` بزنیم تا داده‌های تکرار قبلی پاک شود.
3. بقیهٔ منطق دست‌نخورده باقی بماند: نقش‌ها، Hamilton rounding، `WHERE true` روی UPDATE ها، audit log، مقدار بازگشتی.

معادلاً می‌توان از `CREATE TEMP TABLE IF NOT EXISTS` + `TRUNCATE` استفاده کرد؛ نتیجه یکسان است.

## دامنهٔ تغییر

- **Migration**: بازتعریف `public.run_daily_capital_allocation(date, numeric, text)` — بدون تغییر schema، بدون تغییر جدول، بدون تغییر RLS/GRANT.
- **بدون تغییر frontend**: `_app.accounting.dynamic-capital.tsx`، hook `useRunDailyAllocation` و پیام خطا دست‌نخورده.
- **بدون تغییر audit log / نقش‌ها / امضای تابع** → قابل rollback با بازگشت به نسخه قبلی migration.

## تأیید بعد از اجرا

1. در `/accounting/dynamic-capital` روی یک تاریخ جدید «محاسبه و ذخیره» → باید موفق شود و تعداد کارشناسان و مشتریان را برگرداند.
2. بررسی جدول `salesperson_capital_allocations_dynamic` و `customer_capital_allocations_dynamic` برای همان `setting_id`.
3. تلاش دوباره برای همان تاریخ → باید همان خطای قبلی «capital allocation already exists for date …» را بدهد (تغییر نکرده).

## ریسک‌ها

- تنها تابع تغییر می‌کند؛ اگر جای دیگری هم `_sp_cust` را در session ساخته باشد، `IF NOT EXISTS` جلوی conflict را می‌گیرد. جستجو در codebase نشان می‌دهد فقط همین تابع از این نام استفاده می‌کند.
