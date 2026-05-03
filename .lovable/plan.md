## گزارش فاز SH.1 — ممیزی Self-Hosting افراکالا

این صرفاً گزارش است؛ هیچ کد یا دیتابیسی تغییر نمی‌کند.

---

### ۱) آمادگی استقرار اپ

**موجود:**
- `Dockerfile` دومرحله‌ای (Node 20 alpine + Bun) که خروجی TanStack Start را روی پورت **3000** اجرا می‌کند (`node .output/server/index.mjs`).
- `docker-compose.yml` با سرویس `app` و `postgres:16-alpine` (volume `pgdata`).
- `.dockerignore` تمیز.
- اسکریپت `bun run build` و SSR کامل (TanStack Start، نه static).

**ندارد / ریسک:**
- `vite.config.ts` از `@lovable.dev/vite-tanstack-config` استفاده می‌کند که داخلش پلاگین **Cloudflare Workers** فعال است. خروجی build روی Worker هدف می‌گیرد ولی همزمان `.output/server/index.mjs` (Node SSR) هم تولید می‌کند — باید روی سرور Linux فقط مسیر Node اجرا شود. ریسک: متوسط (نیاز به تست build روی هاست).
- `wrangler.jsonc` در پروژه هست (مخصوص Cloudflare) — برای self-host بی‌اثر اما باید نادیده گرفته شود.
- Healthcheck در Docker Compose تعریف نشده.
- Reverse proxy / SSL تعریف نشده.

---

### ۲) ممیزی وابستگی به Supabase

استفاده‌های فعلی:
- **Auth** ایمیل/رمز (`supabase.auth`) — وابسته به GoTrue.
- **Database + RLS** سنگین (۱۲۹ migration، نقش‌ها، `has_role`، policy گسترده).
- **Storage** بصورت bucket خصوصی `payment-receipt-documents` با policy روی `storage.objects` — نیاز به Storage API کامل.
- **Edge/Server functions:** اپ از `createServerFn` (TanStack) استفاده می‌کند، نه Edge Function سوپابیس. بنابراین Deno runtime لازم نیست. **پلاس بزرگ**.
- **Realtime:** استفاده نشده (هیچ `.channel(` در کد یافت نشد).
- **RPC/triggers/functions:** زیاد (مثلاً `bot_authenticate_key`, `create_bot_api_key`).

**نتیجه:** PostgreSQL تنها کافی **نیست**. حداقل به این اجزای Supabase نیاز است:
- PostgreSQL + extensions
- **GoTrue** (Auth)
- **PostgREST** (پایه REST و RLS از کلاینت)
- **Storage API** (bucket و RLS روی storage.objects)
- **Kong/Gateway** (روتر استاندارد جلوی این‌ها) — یا یک پراکسی سبک معادل

به Edge Runtime, Realtime, Studio (اختیاری برای ادمین)، Image transformer نیاز نیست.

**توصیه:** Supabase self-hosted رسمی از طریق `supabase/docker` (نسخه استاندارد) با غیرفعال‌سازی سرویس‌های غیرضروری.

---

### ۳) ممیزی Migration ها

- تعداد: **۱۲۹** فایل، نام‌گذاری زمان‌مند، ترتیب درست.
- **Extensionها:** `pgcrypto` (با schema=extensions), `pg_trgm`, و تلاش اختیاری `pg_cron` (با fallback). همگی در self-hosted Supabase پیش‌فرض موجود/قابل نصب‌اند.
- **Bucket:** فقط `payment-receipt-documents` (private) داخل migration ساخته می‌شود — قابل اجرا روی self-hosted.
- **RLS و policy:** کامل و خودکفا، بدون وابستگی به feature خاص Lovable Cloud.
- **Triggerها:** `updated_at`، audit log، gamification و... — همه استاندارد plpgsql.
- **وابستگی Lovable Cloud اختصاصی:** یافت نشد. ✅

ریسک کلی: **پایین**.

---

### ۴) ممیزی مهاجرت Auth

- جدول `auth.users` (مدیریت GoTrue) + جداول اپ: `profiles`, `user_roles` (با enum `app_role`).
- نقش‌ها از طریق تابع `has_role()` چک می‌شوند.
- **Export پسوردها:** هش‌های bcrypt در `auth.users.encrypted_password` قابل dump/restore به GoTrue self-hosted **هستند** (هر دو bcrypt). نیازی به reset عمومی نیست **اگر** نسخه GoTrue سازگار باشد.
- **Reset لازم؟** فقط در صورت ناسازگاری نسخه — توصیه: ارسال لینک reset برای کاربران فعال به‌عنوان احتیاط.
- OAuth provider خاصی فعال نیست (فقط ایمیل/رمز).

ریسک: **متوسط** (تست restore در staging قبل از پروداکشن).

---

### ۵) ممیزی مهاجرت Storage

- یک bucket: `payment-receipt-documents` (خصوصی).
- جدول `payment_receipt_documents` با ستون `storage_path` به فایل اشاره می‌کند.
- **مهاجرت فایل‌ها:** دانلود کل bucket از Supabase managed با `supabase storage` CLI یا اسکریپت Node + سرویس‌رل، سپس آپلود مشابه به نمونه self-hosted با حفظ همان `storage_path`.
- **اعتبارسنجی:** مقایسه چک‌سام (sha256) فایل‌ها + شمارش رکورد در `payment_receipt_documents` با تعداد objectها.

ریسک: **پایین** (یک bucket کوچک و ساختار مسطح).

---

### ۶) متغیرهای محیطی و Secrets

| متغیر | مکان | حساسیت |
|---|---|---|
| `VITE_SUPABASE_URL` | فرانت | عمومی |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | فرانت | عمومی (anon) |
| `VITE_SUPABASE_PROJECT_ID` | فرانت | عمومی |
| `SUPABASE_URL` | سرور (SSR) | عمومی |
| `SUPABASE_PUBLISHABLE_KEY` | سرور | عمومی |
| `SUPABASE_SERVICE_ROLE_KEY` | فقط سرور | **مخفی** |
| `LOVABLE_API_KEY` | فقط سرور (`receipt-ocr.functions.ts`) | **مخفی + خارجی** |

برای self-host Supabase، اضافه می‌شوند: `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `SITE_URL`, `SMTP_*` (برای ایمیل reset/تأیید).

OCR/AI/SMS/Currency: تنها سرویس بیرونی فعال = **Lovable AI Gateway** برای OCR رسید.

---

### ۷) وابستگی‌های خارجی و سازگاری اینترنت ملی

| منبع | استفاده | وضعیت برای ایران |
|---|---|---|
| `cdn.gpteng.co` (preconnect در `__root.tsx`) | ویجت‌های ادیتور Lovable | فقط در preview؛ در build پروداکشن خودکار حذف می‌شود (`componentTagger` فقط در dev). preconnect باقی‌مانده بی‌خطر اما **بی‌فایده** — توصیه به حذف برای سلف‌هاست. |
| `ai.gateway.lovable.dev` (OCR رسید) | فعال | **فیلتر ایران**. باید جایگزین شود با: Tesseract محلی، یا API ایرانی (مثل Hamravesh OCR / پارس‌AI)، یا اختیاری کردن OCR. |
| فونت Vazirmatn | کاملاً local در `public/fonts/vazirmatn/` ✅ | بدون مشکل |
| Google Fonts/Gstatic | یافت نشد ✅ | — |
| Supabase managed (`*.supabase.co`) | فعال | بعد از self-host حذف |
| `rubika.ir`, `wa.me`, `eitaa.com`, `ble.ir`, `chat.whatsapp.com` | فقط لینک‌های UI به پلتفرم پیام‌رسان | بی‌اثر روی عملکرد |

**اقدامات اجباری برای ایران:**
1. حذف یا جایگزینی OCR Gateway.
2. حذف preconnect به `cdn.gpteng.co` در `__root.tsx`.
3. ست‌کردن cache headers روی Nginx برای فونت‌های `/fonts/vazirmatn/*` (طبق Lighthouse، الان `cacheLifetimeMs=0`).

---

### ۸) Backup

اهداف:
- **Postgres:** `pg_dump -Fc` روزانه + WAL (در صورت لزوم).
- **Storage:** rsync/restic از volume `storage` به مخزن دوم.
- **env / secrets:** ذخیره‌ی جداگانه و رمزگذاری‌شده (مثلاً `age` یا `sops`).
- **migrations:** در ریپو git (موجود ✅).
- **uploaded files (همان bucket):** پوشش با backup storage.

پیشنهاد: cron روزانه ۰۲:۰۰، نگهداری ۱۴ روز local + ۳۰ روز offsite. تست restore ماهانه روی محیط staging.

---

### ۹) معماری پیشنهادی روی سرور Linux

```text
/opt/afrakala/
├─ app/                  # docker-compose اپ (port 3000)
├─ supabase/             # supabase/docker (postgres, gotrue, postgrest, storage, kong)
├─ proxy/                # nginx یا caddy + certbot/acme (SSL)
├─ backups/
│  ├─ pg/
│  └─ storage/
└─ logs/
```

- **Reverse proxy:** Caddy (ساده‌ترین SSL) یا Nginx + acme.sh.
- دامنه: `app.example.ir` → اپ، `api.example.ir` → kong (Supabase).
- Firewall: فقط 80/443 باز، پایگاه‌داده فقط داخل docker network.
- مانیتورینگ سبک: `docker logs` + logrotate (بدون Grafana برای کاهش بار).

---

### ۱۰) جمع‌بندی نهایی

**آنچه داریم ✅**
- Dockerfile + docker-compose پایه.
- فونت محلی، بدون CDN در رانتایم پروداکشن.
- Migrationهای کامل و خودکفا، بدون قفل به Lovable Cloud.
- صفر استفاده از Realtime و Edge Function.
- معماری بک‌اند تمیز با `createServerFn` (Node-friendly).

**آنچه نداریم / بلاکر ❌**
1. **OCR رسید وابسته به `ai.gateway.lovable.dev`** — بلاکر برای ایران.
2. **پشته self-host Supabase** (GoTrue/PostgREST/Storage/Kong) آماده نیست — باید از `supabase/docker` افزوده شود.
3. **Reverse proxy + SSL** پیکربندی نشده.
4. **Healthcheck** در docker-compose نیست.
5. **Cache headers فونت‌ها** صفر است (هشدار Lighthouse).
6. **Backup script** آماده نیست.
7. **پلاگین Cloudflare** در vite config — نیاز به تأیید build روی Node target.

**آنچه Lovable می‌تواند انجام دهد**
- حذف preconnect خارجی، اختیاری/local کردن OCR (با fallback به Tesseract.js یا پراویدر ایرانی).
- اضافه‌کردن healthcheck و cache headers (در Nginx config sample).
- نوشتن اسکریپت‌های backup/restore و راهنمای migration.
- جداکردن build target (Node-only) از Cloudflare config.
- اسکریپت اتوماتیک مهاجرت Auth و Storage.

**آنچه دستی روی سرور لازم است**
- نصب Docker + docker compose.
- بالاآوردن `supabase/docker` و تنظیم secrets.
- DNS، SSL (Let’s Encrypt یا گواهی داخلی)، Firewall.
- اجرای migrations و import داده‌ها.
- تنظیم cron برای backup.

**فازهای پیشنهادی بعدی**

| فاز | عنوان | ریسک |
|---|---|---|
| SH.2 | حذف وابستگی OCR خارجی (Tesseract.js محلی یا پراویدر ایرانی + fallback) | متوسط |
| SH.3 | پاکسازی build برای Node-only (حذف Cloudflare plugin، تست `.output/server`) | متوسط |
| SH.4 | افزودن Healthcheck + Nginx/Caddy reverse proxy + SSL در docker-compose | پایین |
| SH.5 | افزودن compose سرویس‌های Supabase (gotrue/postgrest/storage/kong) با env نمونه | متوسط |
| SH.6 | اسکریپت Migration Auth (dump/restore `auth.users`) و راهنمای reset احتیاطی | متوسط |
| SH.7 | اسکریپت Migration Storage + اعتبارسنجی sha256 | پایین |
| SH.8 | اسکریپت Backup روزانه (pg_dump + rsync storage) + تست restore | پایین |
| SH.9 | مستندسازی نهایی فارسی استقرار + Runbook عملیات | پایین |

منتظر تأیید برای ورود به فاز SH.2.