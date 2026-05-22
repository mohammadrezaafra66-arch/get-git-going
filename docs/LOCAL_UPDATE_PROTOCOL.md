# AfraKala Local Update Protocol

این سند دستورالعمل رسمی آپدیت نسخه Local افراکالا است.

هدف: نسخه Local باید بدون از بین رفتن دیتای عملیاتی، با کد و migrationهای جدید به‌روزرسانی شود.

---

## اصل‌های ثابت

1. Local منبع اصلی دیتای واقعی است.
2. GitHub منبع رسمی کد است.
3. Lovable فقط محیط توسعه و تولید تغییرات اولیه است.
4. هیچ export کامل دیتابیس Lovable نباید مستقیم روی دیتابیس Local restore شود، مگر در شرایط اضطراری و بعد از backup کامل.
5. قبل از هر آپدیت Local باید backup گرفته شود.
6. تغییرات دیتابیس فقط باید با migration کنترل‌شده یا delta مشخص اعمال شوند.
7. اگر گزارش Lovable شامل عبارت زیر بود، آپدیت بدون بررسی دستی ممنوع است:

`🚨 DATABASE_EXPORT_OR_BACKUP_REQUIRED 🚨`

---

## مسیر استاندارد آپدیت Local

### 1. خواندن گزارش Lovable

قبل از هر آپدیت، آخرین فایل گزارش در مسیر زیر بررسی شود:

`docs/lovable-change-reports/`

مواردی که باید بررسی شوند:

- Changed Files
- New Files
- Deleted Files
- Environment Variables
- Database Changes
- Schema Changes
- Storage Changes
- Migration Required
- Backup Required
- Export Required
- Risk Level
- Local Update Steps
- Rollback Plan
- Post-Update Tests

---

### 2. تعیین نوع آپدیت

آپدیت‌ها سه نوع هستند:

#### نوع A — فقط کد

نمونه‌ها:

- UI
- ظاهر صفحات
- اصلاح کامپوننت
- تغییر route بدون تغییر داده
- bug fix
- performance improvement

اقدام:

- backup سبک دیتابیس توصیه می‌شود.
- کد از GitHub گرفته شود.
- build و تست انجام شود.
- export دیتابیس لازم نیست.

#### نوع B — کد + migration

نمونه‌ها:

- ستون جدید
- جدول جدید
- enum جدید
- index جدید
- function جدید
- trigger جدید
- RLS/policy جدید

اقدام:

- backup کامل دیتابیس الزامی است.
- migration بررسی شود.
- migration روی Local اجرا شود.
- build و تست انجام شود.
- export کامل دیتابیس فقط زمانی لازم است که migration واضح یا قابل اعتماد نباشد.

#### نوع C — تغییرات پیچیده دیتابیس/storage/auth

نمونه‌ها:

- تغییر auth users یا auth config
- تغییر storage buckets یا storage policies
- تغییرات RLS پیچیده
- تغییرات trigger/function حساس
- تغییرات بدون migration واضح
- نیاز به داده seed یا فایل‌های storage از Lovable

اقدام:

- backup کامل دیتابیس Local الزامی است.
- snapshot یا export از Lovable برای مقایسه گرفته شود.
- هیچ data.sql کامل مستقیم روی Local restore نشود.
- فقط delta/missing data یا migration کنترل‌شده اعمال شود.
- تست کامل الزامی است.

---

## چک‌لیست قبل از آپدیت

1. Docker Desktop روشن باشد.
2. سرویس‌های فعلی بررسی شوند.
3. از دیتابیس Local backup گرفته شود.
4. گزارش Lovable خوانده شود.
5. مشخص شود migration لازم است یا نه.
6. مشخص شود env جدید لازم است یا نه.
7. مشخص شود storage تغییر کرده یا نه.
8. مشخص شود rollback plan چیست.

---

## Backup قبل از آپدیت

از مسیر پروژه LAN اجرا شود:

`C:\afrakala-lan\afrakala-lan\get-git-going`

نمونه دستور PowerShell:

```powershell
New-Item -ItemType Directory -Force C:\afra\backups
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
docker exec afrakala-lan-db pg_dump -U postgres -d postgres -Fc -f /tmp/afrakala-$ts.dump
docker cp afrakala-lan-db:/tmp/afrakala-$ts.dump C:\afra\backups\afrakala-$ts.dump
```

بعد از backup، وجود فایل بررسی شود:

```powershell
Get-ChildItem C:\afra\backups | Sort-Object LastWriteTime -Descending | Select-Object -First 5
```

---

## دریافت کد جدید

اگر Git نصب است:

```powershell
cd C:\afrakala-github\get-git-going
git pull
```

اگر Git نصب نیست، باید ZIP جدید از GitHub دریافت و در مسیر جدا extract شود. هرگز پوشه عملیاتی Local را کورکورانه overwrite نکنید.

---

## اجرای migration

اگر migration وجود دارد، قبل از اجرا بررسی شود:

- آیا جدول حذف می‌کند؟
- آیا ستون حذف می‌کند؟
- آیا داده را پاک می‌کند؟
- آیا enum تغییر می‌دهد؟
- آیا trigger/function حساس دارد؟
- آیا RLS/policy تغییر می‌دهد؟

قانون:

اگر migration شامل `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `DELETE` بدون شرط، یا تغییر auth/storage بود، اجرای آن بدون بررسی دستی ممنوع است.

---

## Build وب‌اپ

از مسیر سورس کد:

```powershell
cd C:\afrakala-source\get-git-going-main
docker build -t afrakala-app:lan --build-arg VITE_SUPABASE_URL=http://192.168.170.10:8000 --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="<ANON_KEY>" --build-arg VITE_SUPABASE_PROJECT_ID=afrakala-lan .
```

نکته:

`<ANON_KEY>` باید از فایل `.env.lan` برداشته شود. کلید service_role هرگز داخل frontend یا build client استفاده نشود.

---

## Recreate سرویس web

از مسیر LAN:

```powershell
cd C:\afrakala-lan\afrakala-lan\get-git-going
docker compose -f .\deploy\lan\docker-compose.yml --env-file .\deploy\lan\.env.lan up -d --force-recreate web
```

بررسی وضعیت:

```powershell
docker compose -f .\deploy\lan\docker-compose.yml --env-file .\deploy\lan\.env.lan ps
```

---

## تست‌های بعد از آپدیت

حداقل تست‌ها:

1. باز شدن سایت:

`http://localhost:3000`

2. health check:

```powershell
Invoke-WebRequest http://localhost:3000/api/healthz -UseBasicParsing
```

3. تست CSS/asset:

```powershell
Invoke-WebRequest http://localhost:3000/assets/styles-DsftBBE6.css -UseBasicParsing
```

4. تست Supabase REST:

```powershell
Invoke-WebRequest "http://localhost:8000/rest/v1/products?select=id&limit=1" -Headers @{ "apikey"="<ANON_KEY>"; "Authorization"="Bearer <ANON_KEY>" } -UseBasicParsing
```

5. تست صفحات اصلی:

- ورود
- محصولات
- قیمت‌ها
- مشتریان
- فاکتورها
- بخش‌هایی که در گزارش Lovable تغییر کرده‌اند

---

## Rollback

اگر آپدیت خراب شد:

1. سرویس web را با image قبلی برگردانید، اگر موجود است.
2. اگر migration اجرا شده و دیتابیس خراب شده، restore از backup انجام شود.
3. تغییرات env بررسی و برگردانده شود.
4. لاگ‌ها بررسی شوند.

Restore دیتابیس فقط زمانی انجام شود که مطمئن هستید backup سالم است.

---

## قوانین ممنوعه

1. اجرای `docker compose down -v` بدون backup ممنوع است.
2. restore کامل data.sql Lovable روی Local عملیاتی ممنوع است مگر با تأیید دستی.
3. commit کردن `.env.lan` واقعی ممنوع است.
4. commit کردن backup دیتابیس واقعی ممنوع است.
5. دادن SERVICE_ROLE_KEY به bot، frontend یا کاربر بیرونی ممنوع است.
6. اجرای migration حذف‌کننده بدون بررسی ممنوع است.

---

## چه زمانی export از Lovable لازم می‌شود؟

فقط در این شرایط:

- migration واضح وجود ندارد.
- schema در Lovable تغییر کرده ولی فایل migration قابل اعتماد نداریم.
- bucket یا storage policy تغییر کرده.
- auth structure یا auth config تغییر کرده.
- داده seed/demo مهمی در Lovable ساخته شده که باید به Local منتقل شود.
- لازم است schema Lovable با Local مقایسه شود.

حتی در این شرایط، export کامل Lovable معمولاً برای مقایسه است، نه برای restore مستقیم روی Local.

---

## نتیجه

مسیر امن آپدیت:

`Lovable report → Backup Local → Pull/Receive Code → Review Migration → Apply Migration → Build → Recreate Web → Test → Rollback if needed`
