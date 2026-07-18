## هدف
انتقال همه تغییرات این چند روز (اسناد/رسیدها، جریمه، امتیازدهی، سرمایه پویا، تصاویر محصول، API key، حضور و غیاب، API عمومی محصولات، اعتبار مشتری، جست‌وجوی محصول، تفاوت تسویه، role‌های جدید، polyfill crypto/UUID، embeddings مسنجر با Lovable AI، نمایش قیمت استعلام) به سرور LAN شما در `192.168.170.8:3100`.

## نوع آپدیت
طبق `docs/LOCAL_UPDATE_PROTOCOL.md` این یک آپدیت **نوع B** است: **کد + migration‌های زیاد**.
تعداد قابل توجهی migration جدید ثبت شده (documents/receipts، penalty، capital dynamic، product search، messenger embeddings 1536-dim، inquiry price cache، RLS updates و …). پس **backup کامل قبل از اجرا الزامی است**.

نکته مهم درباره embeddings مسنجر: migration جدید ابعاد ستون `message_embeddings.embedding` را از 768 به 1536 تغییر می‌دهد و ایندکس HNSW را بازسازی می‌کند. embeddingهای قبلی روی سرور شما بی‌اعتبار می‌شوند و باید دوباره تولید شوند (کد به‌طور خودکار تا ۵۰ پیام آخر هر گروه را قبل از اولین سرچ backfill می‌کند). این نیازمند این است که سرور شما بتواند به `LOVABLE_API_KEY` دسترسی داشته باشد — یا در `.env` سرور ست شود، یا فعلاً بدون سرچ معنایی کار کنید.

## مراحل اجرا روی سرور 192.168.170.8

### ۱) Backup اجباری
```bash
ssh <user>@192.168.170.8
cd /opt/afrakala   # یا مسیر واقعی نصب
DRY_RUN=false bash deploy/backups/scripts/backup-postgres.sh
DRY_RUN=false bash deploy/backups/scripts/backup-storage.sh
```
تا زمانی که فایل dump تازه در پوشه backup تایید نشده، ادامه ندهید.

### ۲) Sync کد از GitHub
```bash
cd /opt/afrakala
git fetch --all
git status          # مطمئن شوید هیچ تغییر محلی commit-نشده نیست
git pull origin main
```

### ۳) بررسی migration‌های جدید
```bash
ls -lt supabase/migrations | head -30
```
migration‌های مربوط به این چند روز را باز کنید و یک بار مرور کنید (طبق `MIGRATION_SAFETY_POLICY.md`). به‌خصوص migration مربوط به:
- `message_embeddings` (تغییر ابعاد vector)
- `documents` / `delivery_receipts` / `product_video_required`
- `create_manual_penalty` و RLS جدولین `penalty_appeals` / `appeal_reviewers`
- `customer_capital_allocations_dynamic` (RPCهای جدید)
- `can_issue_customer_invoice` (رفع ambiguity)

### ۴) Preview اول (بدون اعمال)
```bash
bash deploy/migration/scripts/apply-project-migrations.sh    # DRY_RUN پیش‌فرض
```
لیست دستورات SQL که قرار است اجرا شوند را ببینید.

### ۵) اجرای واقعی migration
```bash
DRY_RUN=false bash deploy/migration/scripts/apply-project-migrations.sh
```

### ۶) ست‌کردن `LOVABLE_API_KEY` (برای سرچ معنایی مسنجر)
در `.env.production` روی سرور اضافه کنید:
```
LOVABLE_API_KEY=<کلید Lovable AI Gateway>
```
اگر ندارید، جست‌وجوی معنایی مسنجر روی سرور کار نمی‌کند ولی بقیه اپ سالم می‌ماند.

### ۷) Deploy کد اپ
دو حالت:

**حالت الف — اگر از image GHCR استفاده می‌کنید:**
```bash
export IMAGE_TAG=sha-<commit-جدید>
docker compose -f deploy/app/docker-compose.prod.yml pull web
docker compose -f deploy/app/docker-compose.prod.yml up -d web
```

**حالت ب — اگر LAN build محلی است:**
```bash
docker compose -f deploy/lan/docker-compose.yml build web
docker compose -f deploy/lan/docker-compose.yml up -d web
```

### ۸) Smoke test
```bash
bash deploy/migration/scripts/smoke-test.sh
curl -fsS http://192.168.170.8:3100/api/healthz
```
سپس از مرورگر باز کنید و این مسیرها را دستی چک کنید:
- `/documents` و `/admin/documents` — آپلود PDF/عکس بدون خطای crypto
- `/delivery-receipts` — آپلود رسید + ویدئو
- `/admin/penalties` و `/my-penalties`
- `/gamification/settings` — دکمه ساخت پارامتر، ثبت امتیاز دستی
- `/accounting/dynamic-capital`
- `/products` — جست‌وجوی «لباس شویی»، آپلود تصویر، صفحه محصول با آمار/تایم‌لاین
- `/api-keys` — ساخت کلید
- `/api/public/products` — پاسخ JSON بدون خطا
- `/messages` — سرچ معنایی + کارت استعلام قیمت‌دار
- `/admin/workflow-settings` — دیده‌شدن role‌های جدید

### ۹) Rollback در صورت خطا
- **فقط اپ خراب شد:** برگرداندن IMAGE_TAG به commit قبلی طبق بخش ۵ runbook.
- **migration مشکل ایجاد کرد:**
  ```bash
  DRY_RUN=false bash deploy/backups/scripts/restore-postgres.sh <dump-file>
  bash deploy/backups/scripts/verify-restore.sh
  ```

## ریسک‌ها
- **از دست رفتن embeddings مسنجر:** ستون از 768→1536 مهاجرت می‌کند؛ داده قدیمی حذف/بازسازی می‌شود. تاریخچه پیام‌ها سالم می‌ماند، فقط ایندکس معنایی خالی می‌شود و به‌مرور backfill می‌شود.
- **نبود `LOVABLE_API_KEY`:** فقط سرچ معنایی مسنجر غیرفعال می‌شود، بقیه اپ سالم است.
- **RLS جدید penalty/appeal:** اگر role کاربر روی سرور LAN با محیط توسعه یکسان نباشد، دسترسی متفاوت می‌بیند — بعد از deploy یک بار با role حسابدار/ادمین/کارمند تست کنید.

## سؤال‌های لازم قبل از اجرا
1. سرور شما از **image GHCR** استفاده می‌کند (سناریو رسمی production) یا **build محلی LAN** (`deploy/lan/docker-compose.yml`)؟
2. آیا `LOVABLE_API_KEY` را روی سرور LAN دارید یا فعلاً سرچ معنایی مسنجر را کنار می‌گذاریم؟
3. تایید می‌کنید که قبل از اجرا **backup کامل Postgres و Storage** گرفته می‌شود؟

بعد از پاسخ این سه سؤال، وارد build mode شوید تا هر اسکریپت/کمکی که لازم دارید (مثل یک اسکریپت single-command برای این deploy) را برای‌تان آماده کنم.