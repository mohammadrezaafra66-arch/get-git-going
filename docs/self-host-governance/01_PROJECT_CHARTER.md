# 01 — Project Charter | منشور پروژه Self-Host افراکالا

- Purpose: تعریف «چرا» و «موفقیت» برای مهاجرت کامل به self-host.
- Audience: PM، owner، تیم.
- Last updated: 2026-05-09
- Related: `03_REQUIREMENTS_REQ_SH.md`, `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`

## چرا self-host

- استقلال از سرویس‌های مسدود/تحریم‌شده در ایران.
- کنترل کامل داده‌های مالی و مشتری.
- پایداری روی اینترنت ملی.
- هزینهٔ پیش‌بینی‌پذیر.

## تعریف موفقیت (Definition of Done پروژه)

1. اپ روی VPS لینوکس با Docker بدون وابستگی به Lovable runtime اجرا می‌شود.
2. Supabase self-host (Postgres + Auth + REST + Storage + Kong + Meta) سالم و پشتیبان‌گیری‌شده است.
3. Build از طریق GHCR و pull-only روی production انجام می‌شود.
4. Backup/Restore drill با موفقیت انجام شده و مستند است.
5. تمام REQ-SH-001..015 سبز است.

## In Scope

- App stack, Supabase stack, Proxy/TLS, Backup, Migration, Runbook، اسناد حاکمیت.

## Out of Scope (این موج)

- OCR محلی (پژوهش در SH-RA.9).
- HA / multi-region.
- مهاجرت داده از پروژه قبلی.

## Stakeholders

- Owner: کاربر افراکالا
- Implementer: Lovable agent
- Reviewer: کاربر + GPT

## محدودیت‌های ثابت

- هیچ secret در repo.
- هیچ وابستگی حیاتی به CDN خارجی.
- RBAC/RLS هرگز دور زده نشود.