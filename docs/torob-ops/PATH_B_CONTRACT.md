# Torob Ops Path B — قرارداد داخلی

## محدوده فاز ۱

- قفل رمز per-user (هش scrypt، نشست `sessionStorage` تا بستن تب)
- اسکن از رصدخانه (`afrakala-product-price-observatory`) روی محصولات دارای `torob_url` + برچسب
- صف مسیر ب + تأیید/رد دستی + ثبت نتیجه گزارش دستی
- بدون ارسال خودکار گزارش در ترب، بدون چنداکانت، بدون متن جعلی

## مسیرها

| مسیر | نقش |
|------|------|
| `/torob-ops` | داشبورد |
| `/torob-ops/runs` | اسکن |
| `/torob-ops/findings` | صف بررسی |
| `/admin/torob-ops-access` | فقط admin — مدیریت رمز |

## ServerFnها

همه تحت `src/lib/torob-ops/functions.ts`. عملیات ماژول نیاز به `opsSession` دارند (به‌جز unlock و admin CRUD).

## Migration

`supabase/migrations/20260916190000_555_torob_ops_path_b.sql`  
برگشت: `docs/verification/555-down.sql`

## تست دستی

1. اعمال migration 555 روی DB تست
2. ادمین → `/admin/torob-ops-access` → رمز برای یک کاربر
3. همان کاربر → `/torob-ops` → ورود با رمز ماژول
4. اسکن با/بدون برچسب → بررسی یافته‌ها در `/torob-ops/findings`
5. تأیید طعمه → باز کردن ترب → ثبت نتیجه گزارش
6. ابطال نشست از پنل ادمین → کاربر باید دوباره رمز بزند
