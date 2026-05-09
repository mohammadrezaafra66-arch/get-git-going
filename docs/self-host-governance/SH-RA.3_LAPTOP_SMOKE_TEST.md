# SH-RA.3 — راهنمای Smoke Test روی لپ‌تاپ

> این سند فقط راهنمای **اجرای محلی برای smoke test** توسعه‌دهنده است؛
> برای production از `docs/SELF_HOST_UPDATE_RUNBOOK.md` و
> `docs/self-host-governance/08_OPS_RUNBOOK.md` استفاده شود.

مرجع پروتکل فاز: `docs/self-host-governance/06_PHASE_PROTOCOL.md`
مرجع متغیرهای محیطی: `docs/self-host-governance/10_ENVIRONMENT_MATRIX.md`
مرجع مقاومت اینترنت: `docs/self-host-governance/09_INTERNET_RESILIENCE.md`

---

## ۱) دامنه و هدف

- بالاآوردن کامل stackهای **Supabase + App + Proxy** روی یک لپ‌تاپ.
- اعتبارسنجی پایه: healthz، login، products، pricing، نبود خطای console،
  نبود درخواست به CDN خارجی.
- این محیط **dev/staging سبک** است؛ نه production. هیچ secret واقعی،
  دامنه واقعی، یا داده production نباید استفاده شود.

---

## ۲) پیش‌نیازها

- Docker Engine **24+** یا Docker Desktop
- Docker **Compose v2** (`docker compose version`)
- Git
- حداقل **۸ گیگ RAM آزاد** و **۲۰ گیگ دیسک خالی**
- دسترسی به اینترنت برای pull اولیه‌ی imageها

بررسی سریع:

```bash
docker --version
docker compose version
git --version
```

---

## ۳) Clone مخزن

```bash
git clone <REPO_URL> afrakala
cd afrakala
```

> در ادامه فرض می‌شود ریشه‌ی پروژه CWD است.

---

## ۴) ساخت فایل‌های env محلی

مقادیر **dummy/local** پر کنید. هرگز از مقادیر production کپی نگیرید.
مرجع کامل هر متغیر: `docs/self-host-governance/10_ENVIRONMENT_MATRIX.md`.

```bash
# Supabase stack
cp deploy/supabase/.env.example deploy/supabase/.env
chmod 600 deploy/supabase/.env

# App stack (build محلی)
cp deploy/app/.env.production.example deploy/app/.env.production
chmod 600 deploy/app/.env.production

# Proxy
cp deploy/proxy/.env.example deploy/proxy/.env
cp deploy/proxy/Caddyfile.example deploy/proxy/Caddyfile
chmod 600 deploy/proxy/.env

# Backups (اختیاری برای smoke)
cp deploy/backups/.env.example deploy/backups/.env
chmod 600 deploy/backups/.env
```

نکات کلیدی هنگام پر کردن مقادیر لوکال:

- `JWT_SECRET` در `deploy/supabase/.env` و `deploy/app/.env.production`
  باید **یکسان** باشد.
- `POSTGRES_PASSWORD`, `DASHBOARD_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY` فقط
  مقادیر dummy لوکال؛ هرگز در git commit نشود (همه‌ی `.env`ها در
  `.gitignore` هستند).
- در `deploy/proxy/Caddyfile` برای smoke لوکال از `http://localhost`
  استفاده کنید (TLS واقعی نیاز نیست).
- هیچ متغیر سرور با prefix `VITE_` اضافه نکنید.

---

## ۵) ساخت شبکه مشترک Docker

یک‌بار:

```bash
docker network create afrakala-net
```

اگر قبلاً ساخته شده پیام `network with name afrakala-net already exists` می‌دهد و مشکلی نیست.

---

## ۶) بالاآوردن stack Supabase

```bash
docker compose -f deploy/supabase/docker-compose.yml up -d
```

صبر کنید تا همه‌ی سرویس‌ها healthy شوند:

```bash
docker compose -f deploy/supabase/docker-compose.yml ps
```

باید `db`, `auth`, `rest`, `storage`, `meta`, `kong`, `studio` در حالت
`running` و در صورت تعریف healthcheck، `healthy` باشند.

مشاهده‌ی log در صورت خطا:

```bash
docker compose -f deploy/supabase/docker-compose.yml logs -f db
```

---

## ۷) اجرای migration (کنترل‌شده)

> پیش‌فرض **dry-run** است و هیچ تغییری روی DB نمی‌دهد. فقط در صورت نیاز
> عمدی برای smoke واقعی، آن را با `DRY_RUN=false` اجرا کنید.

مرجع کامل: `deploy/migration/README.md`.

بررسی dry-run (ایمن):

```bash
DRY_RUN=true bash deploy/migration/scripts/apply-project-migrations.sh
```

اعمال واقعی روی DB لوکال (در صورت نیاز):

```bash
DRY_RUN=false bash deploy/migration/scripts/apply-project-migrations.sh
```

در محیط لوکال smoke، اگر فقط می‌خواهید UI را بالا بیاورید و نیازی به
داده‌ی دامنه‌ای ندارید، می‌توانید این مرحله را skip کنید.

---

## ۸) بالاآوردن stack اپ (build محلی)

```bash
docker compose -f deploy/app/docker-compose.yml up -d --build
```

> این فایل برای **build محلی** است. برای production از
> `deploy/app/docker-compose.prod.yml` استفاده می‌شود (pull از GHCR) که
> در این فاز کاری با آن نداریم.

بررسی وضعیت:

```bash
docker compose -f deploy/app/docker-compose.yml ps
docker compose -f deploy/app/docker-compose.yml logs -f web
```

---

## ۹) بالاآوردن stack Proxy

```bash
docker compose -f deploy/proxy/docker-compose.yml up -d
docker compose -f deploy/proxy/docker-compose.yml logs -f caddy
```

برای smoke لوکال در `Caddyfile` از `:80` یا `localhost` استفاده کنید تا
Caddy تلاشی برای گرفتن گواهی Let's Encrypt نکند.

---

## ۱۰) چک‌لیست Smoke

همه‌ی موارد زیر باید پاس شوند:

- [ ] **Healthz**
      ```bash
      curl -fsS http://localhost/api/healthz
      ```
      پاسخ باید `ok` (یا JSON معتبر شامل `status: ok`) باشد.

- [ ] صفحه‌ی `http://localhost/login` بدون خطا لود شود.
- [ ] صفحه‌ی `http://localhost/products` بدون خطا لود شود (برای صفحات
      محافظت‌شده ابتدا یک کاربر تست بسازید یا login کنید).
- [ ] صفحه‌ی `http://localhost/pricing` بدون خطا لود شود.
- [ ] در DevTools → **Console** هیچ error قرمز نباشد.
- [ ] در DevTools → **Network**: هیچ درخواستی به دامنه‌های CDN خارجی
      (مثلاً `fonts.googleapis.com`, `cdn.jsdelivr.net`,
      `cdnjs.cloudflare.com`, `unpkg.com`) دیده نشود. تمام assetها باید از
      دامنه‌ی لوکال شما (`localhost`) سرو شوند.

اگر هرکدام شکست خورد، به بخش Troubleshooting بروید.

---

## ۱۱) Tear-down و پاک‌سازی Volume

به ترتیب معکوس بالاآمدن:

```bash
# Proxy
docker compose -f deploy/proxy/docker-compose.yml down

# App
docker compose -f deploy/app/docker-compose.yml down

# Supabase — حذف volumeها (تمام داده لوکال پاک می‌شود)
docker compose -f deploy/supabase/docker-compose.yml down -v
```

> **هشدار:** فلگ `-v` همه‌ی volumeهای Supabase (DB، storage، auth state)
> را پاک می‌کند. اگر می‌خواهید داده‌ی smoke حفظ شود، `-v` را نزنید.

حذف اختیاری شبکه:

```bash
docker network rm afrakala-net
```

پاک‌سازی imageهای استفاده‌نشده (اختیاری):

```bash
docker image prune -f
```

---

## ۱۲) Troubleshooting

### تداخل پورت (80 / 443 / 5432 / 8000)

```bash
sudo lsof -i :80
sudo lsof -i :443
sudo lsof -i :5432
```

سرویس متعارض را stop کنید (مثلاً Apache/nginx لوکال) یا port mapping را
در compose لوکال تغییر دهید.

### `network afrakala-net not found`

مرحله‌ی ۵ را اجرا کنید:

```bash
docker network create afrakala-net
```

### env mismatch بین stackها

علامت رایج: app به Supabase وصل می‌شود ولی توکن JWT را نمی‌پذیرد، یا
`401`/`403` در REST می‌گیرد.

- مطمئن شوید `JWT_SECRET` در `deploy/supabase/.env` و
  `deploy/app/.env.production` **عیناً یکسان** است.
- مطمئن شوید `SUPABASE_URL`/`VITE_SUPABASE_URL` به آدرس Kong لوکال
  اشاره می‌کند (نه به دامنه‌ی production).
- پس از تغییر env، حتماً restart:
  ```bash
  docker compose -f deploy/app/docker-compose.yml up -d --force-recreate web
  ```

### گیج‌شدن روی dry-run migration

- پیش‌فرض `DRY_RUN=true` است؛ اسکریپت فقط لاگ می‌گیرد و **هیچ نوشتنی روی
  DB انجام نمی‌دهد**.
- برای اعمال واقعی روی DB لوکال، صریحاً `DRY_RUN=false` ست کنید.
- در محیط lokal smoke اگر نیازی به seed دامنه‌ای ندارید، می‌توانید این
  مرحله را کامل skip کنید.

### Caddy گواهی نمی‌گیرد

- در smoke لوکال **هرگز** دامنه‌ی واقعی را در `Caddyfile` نگذارید.
- از بلاک‌های ساده مثل `:80 { reverse_proxy web:3000 }` یا `localhost {
  ... }` استفاده کنید.
- TLS واقعی فقط در سرور production و با دامنه‌ی DNS-resolved معنی دارد.

### درخواست به CDN خارجی در Network tab

اگر چنین درخواستی دیده شد، نقض قانون مادر است. منبع را پیدا کنید
(معمولاً font یا script). راهنما: `docs/self-host-governance/09_INTERNET_RESILIENCE.md`.

---

## مراجع متقاطع

- `06_PHASE_PROTOCOL.md` — قواعد اجرای فاز و گزارش پایان
- `09_INTERNET_RESILIENCE.md` — الزامات مقاومت در برابر اینترنت ضعیف ایران
- `10_ENVIRONMENT_MATRIX.md` — مرجع کامل متغیرهای محیطی
- `08_OPS_RUNBOOK.md` — عملیات production (نه smoke لوکال)
- `deploy/app/README.md`, `deploy/supabase/README.md`, `deploy/proxy/README.md`

---

## Phase Completion Report — SH-RA.3

- **Phase:** SH-RA.3 — Laptop smoke-test guide
- **Status:** success
- **Files created:**
  - `docs/self-host-governance/SH-RA.3_LAPTOP_SMOKE_TEST.md`
- **Files modified:** none
- **Code changed?** no
- **OCR changed?** no
- **Docker/Compose changed?** no
- **Migration changed/executed?** no
- **Auth/Storage/Data changed?** no
- **Secret/env/cert created?** no (فقط مرجع به `.env.example`ها)
- **Deployment executed?** no
- **External dependency added?** no
- **Feature flag required?** no
- **Supabase/RLS/RBAC affected?** no
- **Backup/restore affected?** no
- **SH-RA.3 ready for review?** yes
- **SH-RA.4 blocked pending user approval?** yes
- **Ready for handoff?** yes

SH-RA.3 completed. Laptop smoke-test guide ready for review. Awaiting approval before SH-RA.4.