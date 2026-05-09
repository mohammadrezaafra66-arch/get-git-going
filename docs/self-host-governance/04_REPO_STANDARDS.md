# 04 — Repo Standards

- Purpose: قوانین ثابت برای commit/PR/فایل تا کار چند نفره منظم بماند.
- Audience: Dev.
- Last updated: 2026-05-09
- Related: `06_PHASE_PROTOCOL.md`

## Branch

- `main` — پایدار، deployable.
- `phase/sh-<id>` — هر فاز یک branch (مثال: `phase/sh-ra-2a`).

## Commit

قالب:
```
[SH-<phase-id>] <action>: <subject>
```
مثال: `[SH-DOC.1] docs: add governance pack`

## PR

- عنوان = ID فاز + خلاصه.
- توضیح = Phase Completion Report (طبق `06_PHASE_PROTOCOL.md`).
- لینک به REQ-SHهای متأثر.

## فایل‌ها

| نوع | محل | نکته |
|---|---|---|
| Migration | `supabase/migrations/` | timestamp جدید، reversible، idempotent |
| Server fn | `src/lib/*.functions.ts` یا کنار route | هرگز در `src/server/` که client از آن import کند |
| اسناد حاکمیت | `docs/self-host-governance/` | فقط در فاز SH-DOC.* |
| Compose production | `deploy/app/docker-compose.prod.yml` | pull-only |
| Secrets | فقط .env سرور (chmod 600) | هرگز در repo |

## ممنوعیت‌های ثابت

- commit کردن `.env`, dump, certificate, key.
- prefix `VITE_` روی secret سرور.
- ذخیرهٔ role در `profiles` یا `users`.
- استفاده از CDN خارجی برای font/JS/CSS.
- تغییر `src/integrations/supabase/{client,types}.ts` و `supabase/config.toml` (project-level).
- ادغام PR بدون Phase Completion Report.