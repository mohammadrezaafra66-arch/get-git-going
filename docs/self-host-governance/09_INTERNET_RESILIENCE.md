# 09 — Internet Resilience

- Purpose: قاعدهٔ کار در دو حالت اینترنت ملی و بین‌الملل.
- Audience: Dev/DevOps.
- Last updated: 2026-05-09
- Related: `docs/INTERNET_RESILIENCE.md` (مرجع کامل)

## سناریوها

- **A) International OK:** همه چیز در دسترس.
- **B) Iran national / restricted:** سرویس‌های خارجی ممکن است قطع باشند.

## Coreهایی که در هر دو حالت باید کار کنند

login/auth، products، pricing، purchase prices، currency rates، sale price list، invoices/pre-invoices، accounting basics، internal tasks، internal reports، local backup/restore.

## جدول وابستگی‌های خارجی

| Dependency | Core? | وضعیت فعلی | Feature flag | Fallback | Blocking 100% self-host? |
|---|---|---|---|---|---|
| OCR Lovable gateway | خیر | پیاده‌سازی شد در SH-RA.2B (default OFF در production) | `EXTERNAL_OCR_ENABLED` (سازگار با legacy `OCR_ENABLED`) | ورود دستی فیلدهای رسید | خیر |
| AI APIs (LLM) | خیر | TBD | `EXTERNAL_AI_ENABLED` | پنهان‌سازی feature | خیر |
| SMS provider | خیر | TBD | `SMS_ENABLED` | OTP via email/manual | خیر |
| SMTP | نیمه‌core (auth emails) | TBD | `SMTP_ENABLED` | manual reset توسط ادمین | خیر |
| WhatsApp/Telegram/Eitaa/Bale/Rubika links | خیر | لینک خروجی | `EXTERNAL_MESSAGING_LINKS_ENABLED` | حذف دکمه | خیر |
| GitHub/GHCR (release) | بله (build) | OK | — | image cache محلی | خیر (در runtime) |
| ACME / Let's Encrypt | نیمه (TLS) | OK | — | manual cert | خیر |
| External fonts/CDN | خیر | باید local | — | local assets | بله اگر استفاده شود |

## Flagهای پیش‌فرض production

```
OCR_ENABLED=false
EXTERNAL_OCR_ENABLED=false
AI_ENABLED=false
EXTERNAL_AI_ENABLED=false
SMS_ENABLED=false
SMTP_ENABLED=true
EXTERNAL_MESSAGING_LINKS_ENABLED=true
EXTERNAL_API_TIMEOUT_MS=15000
```

## قوانین

- OCR/AI/SMTP خارجی هرگز core را block نکنند.
- لینک‌های پیام‌رسان فقط outbound link هستند.
- فونت/JS/CSS فقط local؛ هیچ CDN خارجی برای core.
- timeout هر integration خارجی ≥ ۱۵ ثانیه + graceful fallback + پیام واضح.
- `/api/healthz` فقط داخلی را بسنجد، نه external.

## SH-RA.2B — وضعیت OCR

- متغیرهای رسمی: `EXTERNAL_OCR_ENABLED` و `EXTERNAL_API_TIMEOUT_MS`.
- پیش‌فرض production self-host: `EXTERNAL_OCR_ENABLED=false` (هیچ تماسی با `ai.gateway.lovable.dev`).
- پیش‌فرض dev/preview: `true` برای حفظ رفتار قبلی.
- legacy `OCR_ENABLED` هنوز خوانده می‌شود (سازگاری عقب)؛ تنظیم جدید اولویت دارد.
- وقتی flag خاموش است، server function خروجی typed برمی‌گرداند: `{ ok: false, disabled: true, reason: "ocr_disabled", method: "unsupported", raw_text: "", warnings: [...] }` و هرگز fetch به سرویس خارجی نمی‌زند.
- timeout سخت: کف ۱۵۰۰۰ms در کد clamp می‌شود (مقادیر کمتر بالا کشیده می‌شوند). فراخوانی fetch با `AbortController` مقید است؛ در صورت timeout/خطای شبکه پاسخ `ok:false, reason:"ocr_timeout"|"ocr_network_error"` برمی‌گردد.
