# بستن ابهام‌های G-01 تا G-08 فاز صفر

Phase Label: PHASE-0  
Owner: محمدرضا افرا  
Status: Active

## هدف

این سند ابهام‌های اصلی قبل از اجرای فاز صفر را می‌بندد تا تیم، Cursor و Lovable وارد مسیرهای موازی، پرریسک یا خارج از scope نشوند.

| ID | سؤال | تصمیم | مالک | Acceptance Criteria | Forbidden Actions | Required File/PR |
|---|---|---|---|---|---|---|
| G-01 | Core رسمی چیست؟ | ریپوی `get-git-going` تنها Control Plane / Core رسمی است. | محمدرضا افرا | ADR-0001 در GitHub پذیرفته شده باشد. | ساخت Laravel/Core/backend جدید بدون ADR. | `docs/adr/ADR-0001-phase0-architecture-freeze.md` |
| G-02 | Source of Truth چیست؟ | GitHub برای کد/سند، Supabase/Postgres برای runtime data، Drive فقط mirror. | محمدرضا افرا | `SOURCE_OF_TRUTH.md` فعال باشد و Drive به commit/tag اشاره کند. | تصمیم‌گیری از روی Drive بدون commit متناظر. | `docs/process/SOURCE_OF_TRUTH.md` |
| G-03 | مرز UI و Worker چیست؟ | UI فقط React/TanStack/Lovable؛ Worker logic جدا و بیرون از UI. | محمدرضا افرا | Task Packetها فایل‌های UI و Worker را مخلوط نکنند. | اجرای Worker، secrets یا scraping داخل UI. | ADR-0001 + Task Packet |
| G-04 | مدل صف فاز صفر چیست؟ | فقط database-backed automation tables. Redis/RabbitMQ فقط با ADR جدید. | محمدرضا افرا | جدول‌های automation تعریف شوند و Worker Dummy با DB کار کند. | اضافه‌کردن Redis/RabbitMQ بدون ADR. | migrationهای automation |
| G-05 | آیا real bot در فاز صفر مجاز است؟ | خیر. هیچ real bot مجاز نیست. | محمدرضا افرا | PRها صراحتاً تأیید کنند real bot ندارند. | Divar/WhatsApp/Instagram/Torob real/OCR/STT/AI. | PR template + DoD |
| G-06 | قرارداد Control Plane و Worker چیست؟ | `automation/openapi/automation-v1.yaml` (ADR-0007). مسیر `openapi/` فقط stub deprecated است. | محمدرضا افرا | endpointهای heartbeat و claim در canonical تعریف شوند؛ run/events در فاز بعد هم‌راستا شوند. | endpoint اختصاصی هر ربات واقعی در فاز صفر؛ پیاده‌سازی علیه stub root. | `automation/openapi/automation-v1.yaml` |
| G-07 | auth/RLS/secrets چطور مدیریت می‌شود؟ | no service role in browser، RLS فعال، secret فقط server/worker side. | محمدرضا افرا | Security Baseline رعایت شود. | قراردادن secret در Lovable/React/Drive/prompt. | `docs/security/SECURITY_BASELINE.md` |
| G-08 | تعریف E2E فاز صفر چیست؟ | UI command → DB command → Dummy Worker claim → event → UI status. | محمدرضا افرا | مسیر کامل بدون real bot تست شود. | تست real platform یا external bot. | `docs/automation/task-packets/WPC-0-001-worker-dummy.md` |

## قانون نهایی

تا زمانی که این ۸ ابهام در PR فاز صفر رعایت نشوند، ورود به Phase-1 واقعی ممنوع است.
