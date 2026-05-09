# 03 — Requirements REQ-SH-001..015

- Purpose: الزامات self-host و ماتریس پذیرش.
- Audience: همه.
- Last updated: 2026-05-09
- Related: `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md` (مرجع حاکم)، `05_MASTER_EXECUTION_PLAN.md`

> این فایل فقط الزامات **self-host** را سازمان می‌دهد و جایگزین `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md` نیست.

## وضعیت‌ها
⬜ Unknown · 🟡 Partial · ✅ OK · ❌ Missing/Blocking

## فهرست الزامات

| ID | عنوان | تعریف کوتاه |
|---|---|---|
| REQ-SH-001 | بدون وابستگی به Lovable Cloud | production runtime نباید به Lovable Cloud متصل باشد. |
| REQ-SH-002 | جدایی Code/Data | code در Git/Image، data فقط روی VPS. |
| REQ-SH-003 | بدون `.env` واقعی در repo | فقط `.env.example`. |
| REQ-SH-004 | service role key فقط server | هرگز در client bundle. |
| REQ-SH-005 | Auth روی Supabase self-host | login/signup/reset سالم. |
| REQ-SH-006 | Storage روی Supabase self-host | upload/download سالم. |
| REQ-SH-007 | Core روی اینترنت ملی | core بدون اینترنت بین‌الملل کار کند. |
| REQ-SH-008 | OCR/AI/SMS/SMTP optional + fallback | feature flag + graceful. |
| REQ-SH-009 | Backup شامل تست restore | backup بدون restore-test معتبر نیست. |
| REQ-SH-010 | Migration production دستی + backup | هرگز توسط Actions. |
| REQ-SH-011 | Caddy تنها ورودی public | فقط 80/443. |
| REQ-SH-012 | Studio بدون IP allowlist + basic auth public نشود | ترجیحاً فقط SSH tunnel. |
| REQ-SH-013 | بدون legacy compose ریشه | مسیر production مبهم نباشد. |
| REQ-SH-014 | جدایی compose pull-only و build محلی | prod = pull از GHCR. |
| REQ-SH-015 | هر فاز Phase Completion Report | طبق `06_PHASE_PROTOCOL.md`. |

## ماتریس پذیرش

| REQ | Status | Evidence | Verification | Blocking? |
|---|---|---|---|---|
| 001 | ⬜ |  |  |  |
| 002 | ⬜ |  |  |  |
| 003 | ⬜ |  |  |  |
| 004 | ⬜ |  |  |  |
| 005 | ⬜ |  |  |  |
| 006 | ⬜ |  |  |  |
| 007 | ⬜ |  |  |  |
| 008 | ⬜ |  |  |  |
| 009 | ⬜ |  |  |  |
| 010 | ⬜ |  |  |  |
| 011 | ⬜ |  |  |  |
| 012 | ⬜ |  |  |  |
| 013 | ⬜ |  |  |  |
| 014 | ⬜ |  |  |  |
| 015 | 🟡 | SH-DOC.1 درحال اجرا |  |  |

> به‌روزرسانی Status فقط در فاز مربوطه و با ثبت در `05_MASTER_EXECUTION_PLAN.md`.

## Self-Host Acceptance Gate (چک‌لیست نهایی)

- [ ] root `.env` track نشده
- [ ] هیچ legacy compose ریشه برای production استفاده نمی‌شود
- [ ] OCR خارجی optional و flag شده
- [ ] app image از GHCR pull می‌شود
- [ ] Supabase stack روی staging سالم بالا می‌آید
- [ ] Auth کار می‌کند
- [ ] Storage upload/download کار می‌کند
- [ ] migrations روی staging اعمال شده
- [ ] backup سالم تولید می‌شود
- [ ] restore drill موفق
- [ ] smoke test سبز
- [ ] Caddy فقط 80/443
- [ ] Studio public نیست
- [ ] هیچ CDN/Google Fonts/وابستگی runtime خارجی برای core
- [ ] حالت اینترنت ملی، core را نمی‌شکند
- [ ] هیچ secret در client bundle
- [ ] هیچ data در Git
- [ ] هیچ data در Docker image
