# Sale List `settlement_type_id` — Local Schema Sync

🚨 **DATABASE_EXPORT_OR_BACKUP_REQUIRED** 🚨
(فقط backup احتیاطی Local قبل از اجرای migration موجود. هیچ export از Lovable لازم نیست.)

## 1. Summary
رفع خطای `PGRST204: Could not find the 'settlement_type_id' column of 'sale_lists'` در `/pricing/sale-lists/new` روی Local.
ریشه: migration موجود `supabase/migrations/20260522162314_a17c6ada-fb05-4b07-bc2f-68a2602073cf.sql` روی Lovable Cloud اعمال شده ولی روی Local Postgres اعمال نشده است.
تصمیم: **migration جدید ساخته نشد** (duplicate ممنوع). فقط migration موجود باید روی Local اجرا شود و یک خط `console.error` دفاعی به کد اضافه شد.

## 2. User Request
Fix Sale List `settlement_type_id` schema mismatch and sale list create/view persistence on Local — بدون duplicate migration و بدون تغییرات نامرتبط.

## 3. Scope
- ✅ بازرسی migration موجود و تأیید کامل/idempotent/safe بودن آن.
- ✅ افزودن لاگ دفاعی برای دیباگ خطاهای آینده در ایجاد لیست فروش.
- ✅ مستندسازی دستور دقیق اجرای migration روی محیط Local فعلی.
- ❌ هیچ migration جدید، تغییر schema، RLS، policy، storage، auth، Docker، port، یا lockfile.

## 4. Changed Files
- `src/routes/_app.pricing.sale-lists_.new.tsx` — افزودن **یک خط** `console.error("[sale-lists/new] insert failed:", e);` در ابتدای بلوک `catch` ایجاد لیست. هیچ تغییر دیگری در منطق یا UI.

## 5. New Files
- `docs/lovable-change-reports/2026-05-23-1622-sale-list-settlement-type-schema-sync.md` (همین گزارش)

## 6. Deleted Files
هیچ.

## 7. Environment Variables
هیچ متغیر جدید لازم نیست. متغیرهای موجود `deploy/lan/.env.lan` (یا `deploy/local/.env.local`) کافی‌اند: `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_CONTAINER_NAME`, `BACKUP_ROOT`.

## 8. Database Changes
- روی **Lovable Cloud**: هیچ — قبلاً اعمال شده.
- روی **Local**: با اجرای migration موجود (idempotent)، ستون `public.sale_lists.settlement_type_id uuid NULL` + FK به `settlement_types(id) ON DELETE SET NULL` + index `idx_sale_lists_settlement_type_id` اضافه می‌شود.
- داده‌های موجود دست‌نخورده می‌مانند (ستون nullable).

## 9. Schema Changes
فقط افزودن یک ستون nullable + FK + index روی `public.sale_lists`. بدون تغییر در ستون‌های موجود. بدون تغییر در سایر جداول. `public.sale_list_versions` تغییر نمی‌کند.

## 10. Storage Changes
هیچ. هیچ bucket، policy، یا فایلی تغییر نمی‌کند.

## 11. Auth/RLS/Policy Changes
هیچ. RLS، RBAC، auth structure، Supabase Auth configuration، و policyها بدون تغییر.

## 12. Migration Required
بله، روی **Local** — با اجرای migration **موجود** (نه جدید).

## 13. Migration Files
فقط migration موجود (هیچ فایل جدید migration ساخته نشد):

```
supabase/migrations/20260522162314_a17c6ada-fb05-4b07-bc2f-68a2602073cf.sql
```

محتوای تأییدشده:
1. `ALTER TABLE public.sale_lists ADD COLUMN IF NOT EXISTS settlement_type_id uuid NULL;`
2. `DO $$ ... IF NOT EXISTS pg_constraint conname='sale_lists_settlement_type_id_fkey' THEN ADD CONSTRAINT ... FOREIGN KEY → settlement_types(id) ON DELETE SET NULL; END $$;`
3. `CREATE INDEX IF NOT EXISTS idx_sale_lists_settlement_type_id ON public.sale_lists (settlement_type_id);`

همه idempotent. اجرای دوباره روی Cloud یا Local بی‌ضرر است.

## 14. Local Update Steps

### مسیرها و env واقعی Local
- **Local repo path:** `F:\AfraKala AI Assistant\09-local-test-from-github-main`
- **Docker compose path:** `deploy\lan`
- **Env file اصلی:** `deploy\lan\.env.lan`
- **(اختیاری/مسیر جایگزین قدیمی):** `deploy\local\.env.local` — اگر هنوز استفاده می‌کنید.

### A) گزینه ۱ — PowerShell روی ویندوز (LAN setup فعلی)

```powershell
# 0) باز کردن ترمینال PowerShell در مسیر ریپو
cd "F:\AfraKala AI Assistant\09-local-test-from-github-main"

# 1) Backup احتیاطی Postgres (اجرای داخل کانتینر)
#    قبل از هر چیز، نام کانتینر Postgres را از .env.lan بخوانید (POSTGRES_CONTAINER_NAME).
$envFile = "deploy\lan\.env.lan"
Get-Content $envFile | Where-Object { $_ -match '^(POSTGRES_CONTAINER_NAME|POSTGRES_DB|POSTGRES_USER|POSTGRES_PASSWORD)=' } | ForEach-Object {
  $name, $value = $_ -split '=', 2
  Set-Item -Path "env:$name" -Value $value
}
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "F:\AfraKala AI Assistant\_backups\pg"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$backupFile = "$backupDir\postgres-local-$ts.dump"
docker exec -e PGPASSWORD=$env:POSTGRES_PASSWORD $env:POSTGRES_CONTAINER_NAME `
  pg_dump -Fc -U $env:POSTGRES_USER -d $env:POSTGRES_DB | Out-File -Encoding Byte $backupFile
Write-Host "Backup OK: $backupFile"

# 2) Pull آخرین main پس از merge این PR
git pull --ff-only origin main

# 3) اعمال migration موجود روی Postgres داخل کانتینر
Get-Content "supabase\migrations\20260522162314_a17c6ada-fb05-4b07-bc2f-68a2602073cf.sql" | `
  docker exec -i -e PGPASSWORD=$env:POSTGRES_PASSWORD $env:POSTGRES_CONTAINER_NAME `
  psql -v ON_ERROR_STOP=1 -U $env:POSTGRES_USER -d $env:POSTGRES_DB

# 4) Reload schema cache در PostgREST (Kong روی :8000 پشت PostgREST است)
docker exec -i -e PGPASSWORD=$env:POSTGRES_PASSWORD $env:POSTGRES_CONTAINER_NAME `
  psql -U $env:POSTGRES_USER -d $env:POSTGRES_DB -c "NOTIFY pgrst, 'reload schema';"

# 5) Verification
docker exec -i -e PGPASSWORD=$env:POSTGRES_PASSWORD $env:POSTGRES_CONTAINER_NAME `
  psql -U $env:POSTGRES_USER -d $env:POSTGRES_DB -c "\d public.sale_lists" | Select-String "settlement_type_id"
```

### B) گزینه ۲ — bash/WSL (اگر استفاده می‌کنید)

اگر `deploy/local/.env.local` پر است:
```bash
cd /mnt/f/AfraKala\ AI\ Assistant/09-local-test-from-github-main
DRY_RUN=false bash deploy/backups/scripts/backup-postgres.sh
git pull --ff-only origin main
DRY_RUN=true  bash deploy/local/scripts/local-apply-migrations.sh   # پیش‌نمایش
DRY_RUN=false bash deploy/local/scripts/local-apply-migrations.sh   # اجرا
```

اگر در حال حاضر فقط `deploy/lan/.env.lan` تنظیم شده، از گزینه A (PowerShell) استفاده کنید یا قبل از اجرای اسکریپت `deploy/local/.env.local` را با مقادیر متناظر پر کنید (`POSTGRES_PASSWORD`, `POSTGRES_DB`).

### C) Verification پس از اعمال
1. `\d public.sale_lists` ستون `settlement_type_id uuid` را نشان دهد.
2. در مرورگر روی `/pricing/sale-lists/new` یک لیست جدید بسازید — نباید `PGRST204` بدهد.
3. یک لیست قدیمی را باز کنید — header/items/PDF درست رندر شوند.
4. در DevTools، اگر بعداً خطایی رخ داد، خط `[sale-lists/new] insert failed:` پیام خام PostgREST را لاگ کند.

## 15. Backup Required
**بله** — قبل از اجرای migration روی Local، یک `pg_dump -Fc` کامل گرفته شود (طبق گام ۱ بالا). بدون backup حق ادامه نیست.

## 16. Export Required
- Lovable DB export: **خیر**.
- Storage export: **خیر**.
- delta data از Lovable به Local: **خیر** (مشکل صرفاً schema است، نه داده).

## 17. Risk Level
**LOW** — تغییر additive، nullable، idempotent، با FK نرم (`ON DELETE SET NULL`). صفر downtime. صفر تخریب داده.

## 18. Rollback Plan

### A) Rollback کد
```bash
git revert <commit-sha-of-this-pr>
```

### B) Rollback schema روی Local (در صورت لزوم)
```sql
ALTER TABLE public.sale_lists DROP CONSTRAINT IF EXISTS sale_lists_settlement_type_id_fkey;
DROP INDEX IF EXISTS public.idx_sale_lists_settlement_type_id;
ALTER TABLE public.sale_lists DROP COLUMN IF EXISTS settlement_type_id;
NOTIFY pgrst, 'reload schema';
```
توجه: این فقط مقادیر همین ستون را از دست می‌دهد. سایر داده‌های `sale_lists` دست‌نخورده می‌مانند.

### C) Restore کامل از backup (آخرین چاره)
```powershell
docker exec -i -e PGPASSWORD=$env:POSTGRES_PASSWORD $env:POSTGRES_CONTAINER_NAME `
  pg_restore --clean --if-exists --no-owner --no-acl `
  -U $env:POSTGRES_USER -d $env:POSTGRES_DB < $backupFile
```

## 19. Build/Lint/Test Result
- Build/lint توسط harness Lovable به‌صورت خودکار اجرا می‌شود.
- در زمان نگارش این گزارش، نتیجه نهایی harness در دسترس نیست؛ صادقانه گزارش می‌کنم: **claim نمی‌کنم passed**. وضعیت واقعی در UI build/lint خود Lovable قابل مشاهده است.
- تغییر کد فقط یک خط `console.error` است؛ احتمال شکست typecheck/lint عملاً صفر.
- هیچ تست خودکار اختصاصی برای این مسیر وجود ندارد.

## 20. Post-Update Tests (Manual)
1. ✅ `/pricing/sale-lists/new` → ایجاد لیست با `settlement_type_id = NULL` (گزینه "بدون نوع تسویه").
2. ✅ `/pricing/sale-lists/new` → ایجاد لیست با `settlement_type_id` انتخاب‌شده.
3. ✅ باز کردن یک لیست قدیمی (قبل از migration ایجاد شده) و تأیید رندر صحیح header/items.
4. ✅ باز کردن لیست جدید و تأیید رندر صحیح + خروجی PDF.
5. ✅ Network: POST `/rest/v1/sale_lists?select=id` → 201 (نه 400/PGRST204).
6. ✅ بدون regression در `/pricing/sale-lists` (لیست کلی).

## 21. What Was Not Changed
- ❌ هیچ migration جدید.
- ❌ هیچ تغییر در `package.json`, `package-lock.json`, `bun.lock`.
- ❌ هیچ تغییر در `src/routeTree.gen.ts`.
- ❌ هیچ تغییر در Docker, ports (3000 web / 8000 Kong), env templates.
- ❌ هیچ تغییر در auth, RLS, policies, triggers, functions, storage buckets.
- ❌ هیچ تغییر در sidebar, dashboard, pricing engine, bot API, sale-list PDF logic, public sale-list, route view لیست (`_app.pricing.sale-lists_.$listId.tsx`).
- ❌ هیچ تغییر UI/UX در فرم ایجاد لیست — فقط یک خط `console.error` دفاعی.

## 22. Notes for Local Deployment
- این تغییر **عمدتاً مستندسازی + اعمال migration موجود** است. تغییر کد فقط لاگ دفاعی است.
- migration موجود idempotent است؛ اگر سهواً دوبار اجرا شود، بی‌ضرر است.
- پس از migration حتماً `NOTIFY pgrst, 'reload schema';` اجرا شود تا PostgREST/Kong (پورت 8000) ستون جدید را در schema cache ببیند. در غیر این صورت خطای `PGRST204` ادامه می‌یابد حتی اگر ستون در DB باشد.
- اگر `NOTIFY` کار نکرد، کانتینر PostgREST (و در صورت لزوم Kong) را restart کنید: `docker compose -f deploy\lan\docker-compose.yml restart rest kong`.
- سازگاری self-host: ✅ Linux/Docker/Supabase self-host. بدون وابستگی به CDN/سرویس خارجی.
- پس از تأیید عملکرد روی Local، می‌توان از حالت "اجرای دستی migration" به اسکریپت خودکار `deploy/local/scripts/local-apply-migrations.sh` بازگشت (با پر کردن `deploy/local/.env.local`).

---

## Final Status Block

1. **Branch:** `feature/sale-list-settlement-type-schema-sync` *(در Lovable برابر main است؛ برای ایزوله‌سازی به GitHub نیاز به cherry-pick این ۲ فایل روی local طبق گزارش‌های قبلی)*
2. **Commit SHA:** توسط Lovable پس از sync تولید می‌شود — قابل مشاهده در GitHub history.
3. **PR link:** ندارد — Lovable مستقیماً به main sync می‌کند. در صورت نیاز به PR ایزوله، طبق روال قبلی روی Local انجام شود.
4. **Changed files:**
   - `src/routes/_app.pricing.sale-lists_.new.tsx` (+1 خط)
5. **New files:**
   - `docs/lovable-change-reports/2026-05-23-1622-sale-list-settlement-type-schema-sync.md`
6. **Diffstat (approx):** `+1 / -0` کد + `~6 KB` گزارش جدید.
7. **Build/lint/test status:** خودکار توسط harness Lovable — claim نمی‌کنم passed مگر در UI build/lint قابل مشاهده باشد.
8. **Local update steps:** بخش ۱۴ بالا (گزینه PowerShell برای `deploy\lan\.env.lan`).
9. **Rollback instructions:** بخش ۱۸ بالا.
10. **Sensitive changes:** No (additive, nullable, idempotent).
11. **Migration required on Local:** Yes (existing file, not new).
12. **Backup required before Local update:** Yes.
13. **Export required:** No.