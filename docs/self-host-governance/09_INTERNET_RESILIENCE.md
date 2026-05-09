# 09 — Internet Resilience (Pointer)

- Purpose: قاعدهٔ کار در دو حالت اینترنت ملی و بین‌الملل.
- Audience: Dev.
- Last updated: 2026-05-09
- Related: `docs/INTERNET_RESILIENCE.md`

## مرجع کامل

`docs/INTERNET_RESILIENCE.md` — حاکم است.

## خلاصه

- Core (auth, products, pricing, sales, invoices, accounting, tasks, reports) **همیشه** بدون اینترنت بین‌الملل کار کند.
- هر سرویس خارجی (OCR/AI/SMTP/SMS/Messaging) باید:
  - feature flag داشته باشد،
  - timeout ≥ ۱۵ ثانیه (`EXTERNAL_API_TIMEOUT_MS`),
  - graceful fallback (پیام واضح + ورود دستی)،
  - هرگز core را block نکند.
- هیچ font/JS/CSS از CDN خارجی load نشود.
- `/api/healthz` فقط داخلی را بسنجد.

## Flagهای پیش‌فرض production

```
OCR_ENABLED=false
EXTERNAL_OCR_ENABLED=false
EXTERNAL_AI_ENABLED=false
AI_ENABLED=false
EXTERNAL_MESSAGING_LINKS_ENABLED=true
SMTP_ENABLED=true
SMS_ENABLED=false
EXTERNAL_API_TIMEOUT_MS=15000
```