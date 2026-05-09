# 06 — Phase Protocol

- Purpose: قالب ثابت پرامپت فاز + قالب گزارش پایان فاز.
- Audience: همه.
- Last updated: 2026-05-09
- Related: `04_REPO_STANDARDS.md`, `05_MASTER_EXECUTION_PLAN.md`

## قالب پرامپت فاز

```
Phase <ID> — <Title>

Read ONLY:
- docs/AFRAKALA_ACCEPTANCE_CRITERIA.md
- docs/self-host-governance/06_PHASE_PROTOCOL.md
- <فایل‌های صراحتاً مجاز این فاز>

Allowed actions:
- <لیست دقیق>

Forbidden:
- تغییر کد اپ خارج از مسیرهای مجاز
- تغییر OCR (مگر فاز OCR)
- تغییر Dockerfile / compose (مگر فاز مربوطه)
- اجرای migration
- ساخت secret یا .env واقعی
- deploy واقعی
- اجرای typecheck/build/tests

End with:
- Phase Completion Report (قالب پایین)
- جملهٔ پایانی استاندارد فاز
```

## قالب Phase Completion Report

```
Phase Completion Report — <ID>

1. فایل‌های ساخته/اصلاح‌شده:
   - <path>
2. کد اپ تغییر کرد؟ بله/خیر — توضیح
3. OCR تغییر کرد؟ بله/خیر
4. Docker/Compose تغییر کرد؟ بله/خیر
5. Migration اجرا شد؟ بله/خیر
6. Auth/Storage/Data تغییر کرد؟ بله/خیر
7. Secret/env/cert ساخته شد؟ بله/خیر
8. Deployment انجام شد؟ بله/خیر
9. REQ-SHهای متأثر و وضعیت جدید: <لیست>
10. فاز بعدی: <ID> — منتظر تأیید کاربر
```

## قواعد ثابت

- یک فاز = یک هدف.
- بدون تأیید کاربر، فاز بعدی شروع نمی‌شود.
- اگر هر معیار acceptance قابل رعایت نیست، توقف و گزارش.