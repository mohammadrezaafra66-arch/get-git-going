# 01 — Project Charter | منشور پروژه Self-Host افراکالا

- Purpose: تعریف «چرا» و «موفقیت» برای مهاجرت کامل به self-host.
- Audience: PM، owner، تیم.
- Last updated: 2026-05-09
- Related: `03_REQUIREMENTS_REQ_SH.md`, `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`

## چرا self-host

- استقلال از سرویس‌های مسدود/تحریم‌شده در ایران.
- کنترل کامل دادهٔ مالی و مشتری.
- پایداری روی اینترنت ملی.
- هزینهٔ پیش‌بینی‌پذیر.

## تعریف ۱۰۰٪ Self-Host

1. اپ روی VPS لینوکس با Docker، بدون هیچ وابستگی به Lovable runtime، اجرا می‌شود.
2. Supabase self-host (Postgres + Auth + REST + Storage + Kong + Meta + Studio محدود) سالم و پشتیبان‌گیری‌شده.
3. Build از طریق GHCR و pull-only روی production.
4. Backup/Restore drill با موفقیت انجام شده و مستند است.
5. تمام REQ-SH-001..015 سبز است.

## Lovable = ابزار توسعه، نه وابستگی runtime

- Lovable فقط برای توسعه، preview و push به GitHub استفاده می‌شود.
- production هیچ‌گاه به Lovable Cloud وصل نمی‌شود.
- هیچ feature حیاتی نباید به Lovable runtime وابسته باشد.

## جداسازی Code/Data

- **Code** = GitHub repo + Docker image + scripts + docs + migrations.
- **Data** = volume‌های Postgres/Storage + backups + `.env` واقعی + گواهی‌ها.
- Code در Git/GHCR، Data فقط روی سرور (هرگز در repo و هرگز در image).

## In Scope

App stack, Supabase stack, Proxy/TLS, Backup, Migration, Runbook، اسناد حاکمیت.

## Out of Scope (این موج)

OCR محلی (پژوهش در SH-RA.9)، HA / multi-region، مهاجرت دادهٔ پروژهٔ قبلی.

## Stakeholders

- Owner: کاربر افراکالا
- Implementer: Lovable agent + اپراتور انسانی روی VPS
- Reviewer: کاربر + GPT

## اصول غیرقابل‌مذاکره

- هیچ secret در repo / client bundle / image.
- RBAC/RLS هرگز دور زده نشود؛ roles فقط در `user_roles` با `has_role()` security definer.
- production migration فقط دستی، با backup تازه، توسط اپراتور انسانی.
- هر integration خارجی → optional + feature flag + graceful fallback.
- هر فاز کوچک، تک‌هدف، قابل بازبینی، handoff-ready.

## Tooling Appendix

Git, GitHub, GitHub Actions, GHCR, Docker, Docker Compose v2, Node 20, Bun, Caddy, Supabase self-host stack (db/auth/rest/storage/kong/meta/studio محدود), age/sops (یا معادل) برای رمزگذاری backup secrets, UFW, fail2ban, unattended-upgrades, uptime-kuma.
