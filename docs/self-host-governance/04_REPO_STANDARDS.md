# 04 — Repo Standards

- Purpose: ساختار repo، قواعد فایل، secrets و compose.
- Audience: Dev.
- Last updated: 2026-05-09
- Related: `06_PHASE_PROTOCOL.md`

## ساختار پوشه‌ها (تاییدشده)

```
deploy/app/        deploy/proxy/      deploy/supabase/
deploy/migration/  deploy/backups/
docs/              docs/self-host-governance/
supabase/migrations/
server/            src/               public/fonts/
```

## Branch / Commit / PR

- Branch: `main` (پایدار) و `phase/sh-<id>` (هر فاز).
- Commit: `[SH-<phase-id>] <action>: <subject>` — مثال `[SH-DOC.1] docs: add governance pack`.
- PR title = ID فاز + خلاصه. توضیح PR = Phase Completion Report.

## چه چیزی در Git **مجاز** است

source code، Dockerfile، compose templates، `.env.example`، migration scripts، backup scripts، docs، assetهای محلی، فونت‌های محلی.

## چه چیزی در Git **ممنوع** است

`.env` واقعی، service role key، JWT secret، DB password، SMTP password، گواهی‌ها، private keys، dump، backup، storage export، runtime volume، دادهٔ تولیدی، فایل `.bak` legacy.

## قوانین Secret

- **Client-safe:** فقط `VITE_*` که آگاهانه public است (anon/publishable key).
- **Server-only:** `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `POSTGRES_PASSWORD`, `SMTP_PASS`, `DASHBOARD_PASSWORD`, `LOVABLE_API_KEY`, OCR/AI keys, private keys.
- هیچ secret سرور هرگز prefix `VITE_` نمی‌گیرد.

## فایل‌های ممنوع برای دست زدن مستقیم

- `src/integrations/supabase/{client,types}.ts`
- `supabase/config.toml` (تنظیمات project-level)
- `.env`, `.env.local`, `.env.production`

## Legacy / Dead files

- اگر legacy و بدون رفرنس → حذف.
- `.bak` در repo نگه داشته نشود؛ تاریخچهٔ Git خودش backup است.

## Compose policy

- compose **build محلی** از compose **pull-only production** جداست.
- production compose: فقط `image:` از GHCR، بدون `build:`.
- root `docker-compose.yml` نباید مسیر production را مبهم کند → موضوع SH-RA.2A.

## Footer گزارش هر تحویل

- فایل‌های تغییرکرده / دست‌نخورده
- وضعیت secrets (safe/leaked)
- وابستگی خارجی اضافه شد؟
- feature flag لازم شد؟
- سازگاری Docker/Linux متاثر؟
- Supabase/RLS/RBAC متاثر؟
- backup/restore متاثر؟
- آماده فاز بعدی؟
