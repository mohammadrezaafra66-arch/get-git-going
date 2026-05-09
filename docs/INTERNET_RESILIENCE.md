# Resilience اینترنت ملی / بین‌الملل

سیستم core افراکالا باید در هر دو حالت زیر بدون اختلال جدی کار کند:
1. اینترنت بین‌الملل فعال (دسترسی کامل).
2. فقط اینترنت ملی ایران / محدودیت دسترسی خارجی.

## Core features (همیشه باید کار کنند)
- login / auth (email + password)
- products (CRUD)
- pricing و purchase prices
- currency rates (با منابع داخلی fallback)
- sales price list / live price list
- invoices / pre-invoices
- accounting basics (دریافت/پرداخت/سرمایه)
- tasks و عملیات داخلی
- گزارش‌های داخلی

## سرویس‌های وابسته به اینترنت بین‌الملل (همگی باید optional + flagged)
| سرویس | Flag | رفتار در حالت ملی |
|---|---|---|
| OCR خارجی (ai.gateway.lovable.dev) | `EXTERNAL_OCR_ENABLED=false` | UI پیام «OCR در دسترس نیست، دستی وارد کنید» نشان دهد. |
| AI خارجی | `EXTERNAL_AI_ENABLED=false` | feature غیرفعال + پیام واضح. |
| Messaging خارجی (WhatsApp/Telegram link) | `EXTERNAL_MESSAGING_LINKS_ENABLED=true` | فقط لینک تولید شود؛ هرگز core را block نکند. |
| SMTP خارجی | `SMTP_ENABLED=true|false` | login پایه نباید وابسته باشد. |
| SMS | `SMS_ENABLED=false` | optional. |

## Feature flag های پیشنهادی در `.env.production`
```
OCR_ENABLED=false
AI_ENABLED=false
EXTERNAL_AI_ENABLED=false
EXTERNAL_OCR_ENABLED=false
EXTERNAL_MESSAGING_LINKS_ENABLED=true
SMTP_ENABLED=true
SMS_ENABLED=false
EXTERNAL_API_TIMEOUT_MS=15000
```

## قواعد پیاده‌سازی
- timeout هر فراخوانی API خارجی **حداقل ۱۵ ثانیه** (`EXTERNAL_API_TIMEOUT_MS`).
- خطای سرویس خارجی هرگز نباید باعث ۵xx در core شود؛ باید graceful degradation داشته باشد.
- هیچ asset/font/JS از CDN خارجی load نشود؛ همه local در `src/assets`.
- pre-bundle همه dependencyها در image (no runtime CDN).
- health endpoint `/api/healthz` فقط وضعیت داخلی را بسنجد، نه دسترسی خارجی.