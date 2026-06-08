## هدف

هر کانال تبلیغاتی یک «سهمیه روزانه» داشته باشد (مثلاً «حداکثر ۵ پیشنهاد در روز در این کانال»). موتور پیشنهاد، پس از پر شدن سهمیه، آن کانال را از نتایج حذف می‌کند و در UI مصرف امروز/سهمیه باقی‌مانده نمایش داده می‌شود.

مبنای «مصرف» = رکوردهای موجود `audit_logs` با `action='promotion_suggestion_used'` که قبلاً در صفحه «پیشنهادهای تبلیغاتی» با دکمه «ثبت به‌عنوان استفاده‌شده» نوشته می‌شوند (هیچ منبع داده جدید لازم نیست).

روز = روز تقویمی به وقت تهران (`Asia/Tehran`) تا با کاربر هماهنگ باشد.

---

۱) تغییرات دیتابیس (یک migration جدید)

فایل: `supabase/migrations/<timestamp>_marketing_channel_daily_quota.sql`

- `ALTER TABLE public.marketing_channels ADD COLUMN daily_quota integer` 
  - مقدار `NULL` یا `0` = نامحدود. مقدار مثبت = سقف روزانه.
  - افزودن `CHECK (daily_quota IS NULL OR daily_quota >= 0)`.
- ایندکس کمکی روی `audit_logs` برای شمارش روزانه:
  - `CREATE INDEX IF NOT EXISTS idx_audit_promo_used_day ON public.audit_logs (action, created_at) WHERE action = 'promotion_suggestion_used';`
- بازنویسی View و RPC:
  - افزودن CTE `used_today` که برای هر `channel_id` تعداد رکوردهای `audit_logs` با `action='promotion_suggestion_used'` و `created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Tehran') AT TIME ZONE 'Asia/Tehran'` را می‌شمارد. `channel_id` از داخل ستون `diff` JSON استخراج می‌شود (`(diff->>'channel_id')::uuid`).
  - افزودن سه ستون جدید به View: `daily_quota`, `used_today`, `remaining_today` (که اگر `daily_quota` نال یا صفر باشد = `NULL` به‌معنی نامحدود).
  - منطق RPC: فیلتر فعلی `score > 0` حفظ می‌شود + شرط جدید «کانال‌هایی که `daily_quota` معتبر دارند و `used_today >= daily_quota` هستند حذف شوند». مرتب‌سازی و `LIMIT` مثل قبل.
- بازصدور `grant execute` فقط برای `authenticated` (مثل قبل).
- ثبت در `audit_logs` با action جدید `marketing_channel_quota_updated` در سمت UI (نیاز به تغییر schema ندارد، فقط در ذخیره فرم).

این تغییر کاملاً سازگار با backup/restore، idempotent و قابل rollback است (DROP COLUMN).

## ۲) UI مدیریت کانال‌ها (`src/routes/_app.admin.marketing-channels.tsx`)

- افزودن فیلد «سهمیه روزانه» در فرم Dialog (افزودن/ویرایش): `Input type=number min=0`, راهنمای زیر فیلد: «خالی یا ۰ یعنی نامحدود».
- افزودن ستون «سهمیه روزانه» در جدول با نمایش «نامحدود» وقتی `NULL/0` است.
- شامل کردن `daily_quota` در `select`، `insert`، `update` و در diff لاگ ممیزی.
- اعتبارسنجی سمت کلاینت: عدد صحیح، 0..10000.

## ۳) UI پیشنهادهای تبلیغاتی (`src/routes/_app.marketing.suggestions.tsx`)

- نوع `Suggestion` گسترش پیدا کند با سه فیلد جدید: `daily_quota`, `used_today`, `remaining_today` (همگی `number | null`).
- ستون جدید جدول: «سهمیه امروز» با فرمت `used / quota` و Badge:
  - نامحدود → خاکستری `∞`
  - باقی‌مانده > 0 → سبز
  - باقی‌مانده = 0 → قرمز (اگر RPC این ردیف‌ها را حذف می‌کند، فقط حالت‌های مرزی دیده می‌شوند)
- پس از موفقیت `markAsUsed`، با `queryClient.invalidateQueries(['promotion-suggestions'])` لیست refresh شود تا `used_today` به‌روز شود و در صورت پر شدن سهمیه، آن کانال از لیست حذف شود.
- اگر `remaining_today === 0` (در حالت مرزی)، دکمه «ثبت به‌عنوان استفاده‌شده» غیرفعال با tooltip «سهمیه روزانه این کانال تمام شده است».

## ۴) موارد خارج از scope (طبق Phase rule)

- بدون ساخت جدول جداگانه برای quota / counter (از `audit_logs` موجود استفاده می‌شود).
- بدون تغییر در صفحه «تاریخچه پیشنهادها».
- بدون افزودن دلیوری خودکار به مشتری؛ فقط مرحله پیشنهاد به اپراتور سهمیه‌بندی می‌شود.
- بدون تغییر در نقش‌ها/RLS موجود. (RLS فعلی `marketing_channels` بدون تغییر؛ مدیریت توسط admin/accountant.)

---

## بخش فنی (جزئیات SQL)

```sql
-- CTE داخل view
with used_today as (
  select (diff->>'channel_id')::uuid as channel_id, count(*)::int as used
  from public.audit_logs
  where action = 'promotion_suggestion_used'
    and created_at >= (date_trunc('day', (now() at time zone 'Asia/Tehran')) at time zone 'Asia/Tehran')
  group by 1
)
-- در select view:
,  mc.daily_quota
,  coalesce(ut.used, 0)::int as used_today
,  case when mc.daily_quota is null or mc.daily_quota = 0
        then null
        else greatest(mc.daily_quota - coalesce(ut.used,0), 0)
   end as remaining_today
-- در RPC شرط:
and (mc.daily_quota is null or mc.daily_quota = 0
     or coalesce(ut.used, 0) < mc.daily_quota)
```

## بررسی پذیرش Self-Host

- بدون سرویس/CDN خارجی، فقط Postgres.
- timezone `Asia/Tehran` در همه نصب‌های Supabase موجود است.
- migration reversible (DROP COLUMN + بازگرداندن نسخه قبلی view/RPC در صورت rollback).

## گزارش تحویل بعد از اجرا

فایل‌های بررسی/تغییر، تأثیر migration، تأثیر RLS/RBAC (بدون تغییر)، تأثیر audit logs (action جدید `marketing_channel_quota_updated`)، نتایج build/lint، مسیر تست دستی: ساخت کانال با سهمیه ۲ → ثبت ۲ پیشنهاد → بررسی حذف کانال از لیست تا پایان روز.