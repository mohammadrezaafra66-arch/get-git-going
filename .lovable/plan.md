
# Phase SH-RA.5 — Update + Rollback Runbook (Documentation Only)

## هدف

اضافه کردن procedureهای دقیق و تکرارپذیر برای بروزرسانی و rollback production self-host به مستندات، طبق scope فاز SH-RA.5. هیچ تغییر کد، compose، migration، secret یا اجرای deploy/build/test انجام نمی‌شود.

## تحلیل وضعیت موجود

دو فایل عملیاتی مرتبط در پروژه وجود دارد:

- **`docs/self-host-governance/08_OPS_RUNBOOK.md`** — runbook عملیات روزانه؛ بخش‌های update/rollback آن خلاصه و فاقد جزئیات لازم برای SH-RA.5 است (مثلاً curl health check، record IMAGE_TAG، stop conditions، DB-rollback warning، post-update report).
- **`docs/SELF_HOST_UPDATE_RUNBOOK.md`** — runbook کاملِ به‌روزرسانی موجود است و بسیاری از سناریوها را پوشش می‌دهد. با spec فاز هم‌خوانی خوبی دارد و نیازی به تغییر اساسی ندارد.

طبق دستور فاز:
> docs/SELF_HOST_UPDATE_RUNBOOK.md only if a small consistency fix is required; otherwise link only.

تصمیم: فقط `08_OPS_RUNBOOK.md` را با بخش‌های SH-RA.5 گسترش می‌دهیم و به `SELF_HOST_UPDATE_RUNBOOK.md` لینک می‌دهیم. به فایل دوم دست نمی‌زنیم.

## فایل‌های مجاز برای تغییر در این فاز

- ویرایش: `docs/self-host-governance/08_OPS_RUNBOOK.md`
- ایجاد/حذف: هیچ‌کدام

## محتوای تغییر در 08_OPS_RUNBOOK.md

بخش‌های فعلی «آپدیت فقط اپ» و «آپدیت با migration» و «Emergency Rollback» با ساختار رسمی SH-RA.5 جایگزین/گسترش می‌شوند. ساختار نهایی فایل به این صورت خواهد بود:

```text
1. ترتیب راه‌اندازی stackها                     (بدون تغییر)
2. عملیات روزانه                                (بدون تغییر)
3. Update — Scenario A: app-only, no migration
   - verify current IMAGE_TAG (grep .env.production / docker inspect)
   - set new IMAGE_TAG
   - docker login ghcr.io (in case PAT expired)
   - docker compose -f deploy/app/docker-compose.prod.yml pull web
   - docker compose -f deploy/app/docker-compose.prod.yml up -d web
   - curl -fsS https://app.afrakala.ir/api/healthz
   - docker compose logs --tail=200 web
   - record deployed IMAGE_TAG in deploy log
4. Update — Scenario B: with migration
   - fresh backup (deploy/backups/scripts/backup-postgres.sh)
   - git pull && review supabase/migrations diff
   - confirm no destructive SQL without owner/devops approval
   - DRY_RUN=false bash deploy/migration/scripts/apply-project-migrations.sh
   - pull + up -d web
   - smoke-test.sh + curl /api/healthz
   - monitor logs (15 min minimum)
5. App rollback (by previous IMAGE_TAG)
   - export IMAGE_TAG=sha-<previous-good>
   - pull + up -d
   - healthcheck + logs
   - record rollback in incident log
6. DB rollback — DANGER
   - DB rollback ≠ app rollback
   - requires verified backup restore OR approved reverse migration
   - NEVER run without admin/devops written approval
   - production restore requires fresh incident note
   - reference: deploy/backups/scripts/restore-postgres.sh + verify-restore.sh
7. GHCR image consistency note
   - production image MUST follow:
     ghcr.io/${GHCR_OWNER}/${GHCR_REPO}-web:${IMAGE_TAG:-latest}
   - same pattern as .github/workflows/build-image.yml and
     deploy/app/docker-compose.prod.yml
   - GHCR_OWNER and GHCR_REPO must be set in deploy/app/.env.production
   - tag mismatch → docker pull fails or wrong code is deployed
8. Stop conditions (operator MUST stop and escalate if ANY apply)
   - missing/old backup
   - smoke test fails
   - unknown migration content
   - destructive SQL without approval
   - unknown IMAGE_TAG
   - GHCR pull fails
   - healthcheck fails
   - logs show startup errors
   - any secret/env/cert appears in `git status`/`git diff`
9. Post-update report template (copyable)
   - date/time, operator
   - previous IMAGE_TAG, new IMAGE_TAG
   - migration: yes/no
   - backup file path
   - healthcheck result
   - smoke test result
   - rollback needed: yes/no
   - notes
10. Backup / Restore policy                     (بدون تغییر)
11. Disaster Recovery scenarios                 (بدون تغییر)
12. Monitoring                                  (بدون تغییر)
13. Reference: docs/SELF_HOST_UPDATE_RUNBOOK.md (link only)
```

دستورات داخل بخش‌های ۳ تا ۵ همان الگوی موجود در `SELF_HOST_UPDATE_RUNBOOK.md` و `deploy/app/README.md` را دقیقاً بازتاب می‌دهند تا inconsistency ایجاد نشود. بدون hard-code کردن owner/repo واقعی.

## آنچه تغییر نمی‌کند (Forbidden)

- هیچ فایل کد، compose، Dockerfile، migration، script، .env یا certificate.
- بدون اجرای deploy/build/test/migration/backup/restore.
- بدون تغییر در `src/`, `server/`, `supabase/`, `deploy/`, `.github/`.
- بدون تغییر در `docs/SELF_HOST_UPDATE_RUNBOOK.md` (فقط لینک از داخل 08).

## Validation checklist (پس از پیاده‌سازی)

- [ ] فقط `08_OPS_RUNBOOK.md` تغییر کرده.
- [ ] هر هفت بخش الزامی SH-RA.5 موجود است (Scenario A, Scenario B, App rollback, DB rollback warning, GHCR note, Stop conditions, Post-update report).
- [ ] هیچ دستوری اجرا نشده.
- [ ] هیچ secret/env/cert ساخته نشده.
- [ ] هیچ تغییر در deploy/, src/, supabase/, server/, .github/.
- [ ] الگوی GHCR image با compose و workflow هم‌خوان است.

## Rollback note

برگرداندن این فاز ساده است: revert تنها commit مربوط به `08_OPS_RUNBOOK.md`. هیچ side-effect عملیاتی ندارد چون فقط documentation است.

## Phase Completion Report (پس از اجرا تکمیل می‌شود)

طبق قالب `06_PHASE_PROTOCOL.md` در پایان اجرا گزارش رسمی شامل: Files edited (تنها 08_OPS_RUNBOOK.md)، تمام پاسخ‌های yes/no صفر برای OCR/Auth/Storage/Migration/Secret/Deploy/Docker/Database، Verification = grep بر روی فایل برای حضور هر هفت بخش، Next recommended phase = SH-RA.6A، Ready for handoff = yes.
