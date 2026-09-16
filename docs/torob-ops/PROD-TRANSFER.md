# Torob Ops Path A/B — آماده‌سازی انتقال به سرور اصلی

وضعیت: Path B روی :3000 زنده؛ Path A روی شاخهٔ `feature/torob-ops-path-a` → اول `:3100`  
شاخهٔ نمایش ۳۱۰۰: `staging` پس از merge  
Migration Path B: `555_torob_ops_path_b`  
Migration Path A: `20260916210000_557_torob_ops_path_a.sql`  
Rollback A: `docs/verification/557-down.sql`  
قرارداد: `docs/torob-ops/PATH_A_CONTRACT.md` · Runbook: `docs/torob-ops/RUNBOOK.md`

## محدودهٔ قابل انتقال (Path A)

- همهٔ Path B به‌علاوه: own shops UI، pagination یافته‌ها، غنی‌سازی فروشنده، قالب گزارش، dry-run
- استخر اکانت + encryption session، worker صف گزارش، kill switch، feature flag `auto_report_enabled` (**پیش‌فرض خاموش**)
- **ارسال زنده به ترب** فقط پس از spike + تأیید کتبی مالک؛ تا آن زمان dry_run / دستی

## Env جدید (LAN)

در `deploy/lan/.env.lan` (هرگز commit نشود):

```
TOROB_OPS_WORKER_TOKEN=<random>
TOROB_OPS_ACCOUNT_SECRET=<random-32+>
# اختیاری:
# TOROB_OPS_WORKER_ACTOR_ID=<admin-uuid>
# TOROB_OPS_SIMULATE_SUBMIT=1   # فقط staging برای تست بدون hit ترب
```

Worker: `deploy/lan/scripts/torob-ops-report-worker.ps1`

## مسیرهای جدید

`/torob-ops/shops` · `/torob-ops/settings` · `/torob-ops/accounts`  
API: `POST /api/public/hooks/process-torob-ops-report-queue`

## ترتیب promote

1. Merge `feature/torob-ops-path-a` → `staging` → rebuild `:3100`
2. اعمال migration **557** روی DB تست
3. e2e گیت + path-a + smoke settings (flag خاموش)
4. تأیید مالک برای cutover کد به `:3000` با **auto_report_enabled=false** و kill_switch آماده
5. Migration 557 روی پرود فقط با بکاپ + تأیید کتبی
6. روشن کردن auto فقط بعد از spike و تست کنترل‌شده روی :3100

## چک‌لیست cutover Path A

- [ ] 557 روی :3100 اعمال و `\dt torob_ops_*` شامل templates/accounts/settings
- [ ] صف یافته‌ها page size ≤۵۰ بدون timeout
- [ ] dry-run preview روی confirmed_bait کار می‌کند؛ روی manual_review بلاک می‌شود
- [ ] kill switch صف را صفر می‌کند
- [ ] worker بدون token → 401
- [ ] auto flag روی :3000 خاموش است
- [ ] PROD بکاپ قبل از 557

## خارج از محدوده تا تأیید جدا

- اتصال adapter به فرم زندهٔ ترب بدون spike
- دور زدن CAPTCHA
- گزارش روی یافتهٔ بررسی‌دستی یا ردشده


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
