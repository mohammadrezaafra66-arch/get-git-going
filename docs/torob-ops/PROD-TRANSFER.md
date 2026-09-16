# Torob Ops Path B — آماده‌سازی انتقال به سرور اصلی

وضعیت: آمادهٔ انتقال پس از تأیید مالک روی ۳۱۰۰  
شاخهٔ نمایش ۳۱۰۰ / مسیر cutover فعلی: `staging` (با کامیت‌های ترب)  
Migration: `supabase/migrations/20260916190000_555_torob_ops_path_b.sql`  
Rollback: `docs/verification/555-down.sql`  
قرارداد فاز ۱: `docs/torob-ops/PATH_B_CONTRACT.md`

## محدودهٔ قابل انتقال (فاز ۱)

- قفل رمز per-user + CRUD ادمین
- مسیرها: `/torob-ops`, `/torob-ops/runs`, `/torob-ops/findings`, `/admin/torob-ops-access`
- اسکن از رصدخانه، صف بررسی دستی، ثبت نتیجهٔ گزارش دستی
- **بدون** ارسال خودکار گزارش در ترب و **بدون** ربات چنداکانت

## پین SHA (بعد از ادغام ترب روی sales-desk)

پس از دیپلوی موفق ۳۱۰۰، `APP_GIT_SHA` باید حداقل یکی از این‌ها باشد یا نواده‌شان:

| نقش | SHA کوتاه |
|-----|-----------|
| feat ماژول | وابسته به cherry-pick روی sales-desk |
| tip آمادهٔ ۳۱۰۰ | ببینید خروجی `git rev-parse --short HEAD` روی شاخهٔ دیپلوی |

روی LAN تست تأیید شده: جداول `torob_ops_*` + مسیرهای ۲۰۰.

## پیش‌نیاز قبل از پرود

1. بکاپ DB پرود (`pg_dump -Fc`) — اجباری قبل از migration 555
2. تأیید که رصدخانه / `torob_url` روی محصولات پرود در دسترس است (اسکن بدون دادهٔ رصدخانه خالی می‌ماند)
3. ادمین پرود بعد از دیپلوی برای هر کاربر مجاز رمز ماژول می‌سازد (`/admin/torob-ops-access`)
4. هیچ secret اضافه‌ای در `.env` لازم نیست (رمزها هش در DB)

## ترتیب انتقال به سرور اصلی (:3000)

هم‌راستا با `docs/research/person-dedupe/PROD-CUTOVER-FULL.md`؛ فقط بلوک ترب:

### A) کد

```powershell
cd C:\afrakala
git fetch origin
git checkout staging
git pull origin staging
git rev-parse --short HEAD
# باید شامل مسیرهای torob-ops در درخت باشد:
Test-Path .\src\routes\_app.torob-ops.tsx
Test-Path .\supabase\migrations\20260916190000_555_torob_ops_path_b.sql
```

### B) Migration 555 (فقط بعد از تأیید مالک)

```powershell
# فقط وقتی MIGRATE_PROD_APPROVED از قبل در جلسه ثبت شده
$EnvFile = "C:\afrakala\deploy\lan\.env.lan"
# اعمال با همان روشی که cutover کامل برای بقیه migrationها استفاده می‌کند
# فایل: supabase/migrations/20260916190000_555_torob_ops_path_b.sql
# Idempotent: CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS
```

پس از اعمال:

```powershell
docker exec afrakala-lan-db psql -U postgres -d postgres -c "\dt public.torob_ops*"
```

انتظار: `credentials`, `sessions`, `own_shops`, `scan_runs`, `findings`, `report_logs`

### C) Build / restart web (--no-deps)

```powershell
cd C:\afrakala
$env:GIT_SHA = (git rev-parse --short HEAD)
$env:BUILD_TIME = (Get-Date -Format o)
docker compose --env-file .\deploy\lan\.env.lan -f .\deploy\lan\docker-compose.yml up -d --no-deps --build web
docker compose --env-file .\deploy\lan\.env.lan -f .\deploy\lan\docker-compose.yml exec -T web printenv APP_GIT_SHA
```

### D) Smoke پرود (بدون نوشتن دادهٔ حساس)

- `/admin/torob-ops-access` برای ادمین باز شود
- ساخت رمز برای یک ادمین آزمایشی یا خود مالک
- `/torob-ops` فرم «ورود به عملیات ترب» را نشان دهد
- بعد از unlock: `/torob-ops/runs` و `/torob-ops/findings` عنوان صفحه داشته باشند
- منو: دستیار → عملیات ترب؛ تنظیمات → دسترسی عملیات ترب

### E) Rollback (فقط staging/copy یا پرود با تصمیم مالک)

1. وب را به SHA قبلی برگردانید (image/tag قبلی)
2. در صورت نیاز schema: اجرای کنترل‌شدهٔ `docs/verification/555-down.sql`  
   **هشدار:** جداول و یافته‌ها را حذف می‌کند — فقط با بکاپ معتبر

## چک‌لیست آمادگی (قبل از اعلام «برو پرود»)

- [ ] روی ۳۱۰۰ مسیرهای ترب ۲۰۰ هستند و در سایدبار دیده می‌شوند
- [ ] ادمین می‌تواند با ایمیل کاربر را پیدا کند و رمز بگذارد
- [ ] unlock با رمز ماژول کار می‌کند؛ ابطال نشست از ادمین کاربر را دوباره به گیت می‌فرستد
- [ ] اسکن آزمایشی روی ۳۱۰۰ بدون خطای سرور تمام می‌شود (ممکن است یافته صفر باشد)
- [ ] migration 555 در درخت `staging` هست
- [ ] `555-down.sql` و این سند در ریپو هستند
- [ ] مالک تأیید کرده که فاز ۱ بدون گزارش خودکار است
- [ ] بکاپ پرود قبل از apply گرفته می‌شود

## خارج از محدوده — عمداً منتقل نمی‌شود

- ربات گزارش چنداکانت
- ارسال خودکار به ترب
- هرگونه credential فروشگاه ترب در plaintext
