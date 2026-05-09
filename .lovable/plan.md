سلام. این بررسی فقط review/confirmation است؛ هیچ فایلی تغییر نکرد.

## ۱. تأیید کلی معماری

**بله — معماری پیشنهادی شما 100% با repo فعلی سازگار است و من به‌عنوان سازنده آن را تأیید می‌کنم.**

این نسخه نسبت به roadmap قبلی **امن‌تر، کم‌ریسک‌تر و عملی‌تر** است چون:
- فاز SH-RA.2 را به سه زیرفاز کوچک (2A/2B/2C) شکسته که هر کدام در یک نشست قابل اجرا و rollback است.
- staging را قبل از production قطعی کرده.
- code/data separation را به اصل قطعی تبدیل کرده.
- migration دستی + قطع دسترسی Actions به production DB را صریحاً قانون کرده.

## ۲. وضعیت واقعی repo (مقایسه با معماری)

| موضوع | وضعیت در repo | نتیجه |
|---|---|---|
| `.env` ریشه tracked در Git | **خیر** — خط ۳۵ `.gitignore` پوشش می‌دهد. فایل `.env` فقط روی filesystem لپ‌تاپ موجود است. | ✅ امن |
| `docker-compose.yml` ریشه | موجود ولی **legacy** — به Postgres ساده و `VITE_SUPABASE_URL` Cloud اشاره دارد، با `deploy/supabase/` تناقض دارد. | ⚠️ نیاز به archive/delete در 2A |
| `deploy/app/docker-compose.prod.yml` | در فاز قبلی (SH-ROADMAP.2) ساخته شد، pull-from-GHCR. | ✅ آماده |
| OCR external dep | `src/lib/receipt-ocr.functions.ts` و `receipt-ocr-bytes.functions.ts` به `ai.gateway.lovable.dev` متصل. هیچ feature flag ندارد. | ⚠️ هدف 2B |
| Supabase stack | `deploy/supabase/docker-compose.yml` فقط سرویس‌های لازم را دارد (db, auth, rest, storage, kong, meta, studio). realtime/edge/imgproxy/analytics غیرفعال. | ✅ مطابق معماری |
| Backup scripts | `deploy/backups/scripts/` کامل (postgres, storage, env با age). | ✅ آماده |
| Docs | runbook/migration-safety/internet-resilience از فاز قبلی موجود. | ✅ |

## ۳. پاسخ نقطه‌به‌نقطه به ۱۸ سؤال

1. ✅ سازگار.
2. ✅ بهتر، امن‌تر، کم‌ریسک‌تر از پیشنهاد قبلی.
3. ✅ شکستن SH-RA.2 به 2A/2B/2C تأیید می‌شود — کاهش credit و قابل rollback مستقل.
4. ✅ ترتیب درست است؛ تنها یک پیشنهاد: **SH-RA.4 (Production Compose) را قبل از SH-RA.5 (Runbook) نگه‌دار** چون runbook به فایل prod compose ارجاع می‌دهد. در فازبندی شما همین ترتیب رعایت شده.
5. ⚠️ دو نقض موجود است (هردو در 2A حل می‌شوند):
   - `docker-compose.yml` ریشه legacy و گمراه‌کننده.
   - `.env.example` ریشه فقط متغیرهای Cloud دارد، فاقد بخش self-host و feature flags.
6. ✅ ابزارها درست‌اند: Caddy (proxy)، GHCR (registry)، age (encryption)، GitHub Actions (build only)، Docker Compose v2.
7. **اضافه:** `unattended-upgrades` و `uptime-kuma` (هردو در roadmap هست). **حذف:** هیچ‌چیز.
8. **خیر — Realtime و Edge Functions لازم نیستند.** بررسی کد نشان می‌دهد منطق‌های real-time موجود (مثل pricing board presence) با polling/optimistic update هم قابل کار است. اگر در آینده یک feature صریحاً نیاز ثابت کرد، آن موقع روشن کن. این با قانون «only proven needed» سازگار است.
9. ✅ split لازم است و در فاز قبلی انجام شد: `docker-compose.yml` (build-local)، `docker-compose.prod.yml` (pull GHCR).
10. ✅ feature flags پیشنهادی کافی‌اند. فقط دقت کن: flags سمت سرور باشند (بدون prefix `VITE_`)، و در صورت نیاز client به وضعیت، یک endpoint سبک `/api/runtime-config` آن را برگرداند.
11. ✅ کاملاً تأیید: GitHub Actions فقط image می‌سازد. Migration روی production فقط دستی، با backup تازه، توسط اپراتور.
12. ✅ مسیر laptop → staging → production تأیید می‌شود. برای شروع، staging می‌تواند روی همان لپ‌تاپ با compose جدا باشد تا هزینه VPS اضافی نخواهد.
13. ✅ تعریف code/data جدا کامل و درست است. Dockerfile موجود non-root و فاقد data است؛ workflow scan روی client bundle این را تضمین می‌کند.
14. ✅ مناسب هردو حالت اینترنت ملی/بین‌الملل، مشروط به اجرای SH-RA.2B (OCR flag) و SH-RA.2C (env docs + flags).
15. **ریسک‌های باقی‌مانده:**
   - **P1:** فونت Vazirmatn به‌صورت b64 inline است (`src/assets/fonts/vazirmatn-*.b64`) — خوب است، اما باید در 2C تأیید شود که هیچ `@import` از Google Fonts باقی نمانده.
   - **P1:** Supabase Auth در self-host برای recovery email نیاز به SMTP دارد. بدون SMTP، password reset کار نمی‌کند → fallback ادمینی لازم است.
   - **P2:** Studio container روی `afrakala-net` exposed است؛ Caddy باید basic_auth + IP allowlist داشته باشد قبل از publish دامنه.
   - **P2:** فایل `.lovable/plan.md` ممکن است حجیم شود؛ نگهداری خارج از Git قابل بحث است (الان tracked).
   - **P2:** جداسازی data به دیسک backup مجزا روی VPS (mount جدا) باید در SH-RA.7 چک‌لیست شود.
16. **قبل از شروع SH-RA.2A باید بدانیم:**
   - تأیید کاربر برای **archive یا delete** فایل `docker-compose.yml` ریشه. پیشنهاد من: rename به `docker-compose.legacy.yml.bak` + کامنت deprecation در بالای فایل، تا تاریخچه حفظ شود ولی گمراه نکند.
   - بررسی شود که هیچ مستند یا CI به `docker-compose.yml` ریشه ارجاع نمی‌دهد (الان در workflow ارجاعی نیست).
   - هیچ secret واقعی در `.env` ریشه فعلی نیست (فقط placeholder Cloud)، ولی برای اطمینان قبل از 2A یک‌بار محتوا چک شود.

## ۴. نتیجه

**Approved. Start with SH-RA.2A.**

محدوده دقیق SH-RA.2A (پیشنهاد من برای فاز بعدی، بعد از تأیید شما):
- Archive کردن `docker-compose.yml` ریشه با rename + deprecation header.
- ✅ تأیید مستند که `.env` ریشه tracked نیست (یک گزارش کوتاه).
- اضافه‌کردن یک‌خط در `README.md` که بگوید: «برای deploy از `deploy/` استفاده کنید، نه compose ریشه».
- بدون تغییر OCR، بدون تغییر feature module، بدون migration، بدون secret، بدون deploy.

وقتی این پلن را تأیید کنی، با Implement شروع می‌کنم.