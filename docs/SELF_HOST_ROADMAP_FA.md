# نقشه راه خود‌میزبانی ۱۰۰٪ افراکالا (صفر تا صد)

این فایل راهنمای عملیاتی نهایی است. هر فاز به فایل‌های موجود repo وصل شده تا
بدون سردرگمی، گام‌به‌گام پیش بروی.

مرجع قوانین: `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`
جزئیات عملیاتی: `docs/SELF_HOSTING.md` و `docs/OPERATIONS_QUICK_REFERENCE.md`

---

## فاز ۱ — لپ‌تاپ شخصی

**نصب:** Git ≥ 2.40 · Docker Desktop (یا Engine + Compose v2) · Node 20 LTS · Bun · VS Code · GitHub CLI · کلید SSH ed25519

**کار:**
1. اتصال پروژه Lovable به GitHub (منوی + → GitHub → Connect).
2. `git clone <repo>` روی لپ‌تاپ.
3. `bun install && bun run build` — تست build محلی.

---

## فاز ۲ — Supabase Self-host محلی (پیش از اجاره سرور)

همه فایل‌ها در `deploy/supabase/` آماده است. مرجع کامل: `deploy/supabase/README.md`.

1. کپی env: `cp deploy/supabase/.env.example deploy/supabase/.env` و پر کردن
   `POSTGRES_PASSWORD`, `JWT_SECRET` (≥32 char), `ANON_KEY`, `SERVICE_ROLE_KEY`,
   `DASHBOARD_USERNAME/PASSWORD`, `SITE_URL=http://localhost:3000`.
2. اجرای stack: `docker compose -f deploy/supabase/docker-compose.yml up -d`
3. اجرای migrationها: `bash deploy/migration/scripts/apply-project-migrations.sh`
4. (اختیاری) مهاجرت داده از Lovable Cloud طبق `deploy/migration/README.md`.
5. اجرای app محلی: `docker compose -f deploy/app/docker-compose.yml up -d`
6. تست: `bash deploy/migration/scripts/verify-db-counts.sh` و `smoke-test.sh`.

---

## فاز ۳ — CI/CD خودکار

فایل آماده: `.github/workflows/build-image.yml`

1. در GitHub → Settings → Actions → General → Workflow permissions → **Read and write**.
2. هر push روی `main` خودکار image در `ghcr.io/<user>/<repo>-web:latest` و `:sha-<commit>` می‌سازد.
3. Visibility: private (امن‌تر). روی سرور `docker login ghcr.io` با PAT (scope: `read:packages`).

---

## فاز ۴ — اجاره سرور

**حداقل توصیه‌شده:** 8 vCPU / 16 GB RAM / 200 GB NVMe + 500 GB backup · Ubuntu 22.04 LTS · IP ثابت · دامنه (مثلاً `app.afrakala.ir`).

**ارائه‌دهنده:** ابرآروان / پارس‌پک / آسیاتک (داخل) یا Hetzner / Contabo (خارج).

**کار اولیه:**
1. ساخت user غیر‌root + sudo، غیرفعال‌کردن root login.
2. نصب Docker Engine + Compose v2 + UFW + fail2ban.
3. UFW: فقط `22, 80, 443` باز.
4. DNS: A record دامنه → IP سرور.

---

## فاز ۵ — استقرار اولیه روی سرور

1. `git clone` پروژه در `/opt/afrakala`.
2. `docker login ghcr.io` با PAT (scope: `read:packages`).
3. ساخت `.env` واقعی برای `deploy/supabase/`, `deploy/app/` (`.env.production`), `deploy/proxy/` (رمزهای قوی، دامنه واقعی، `GHCR_OWNER`/`GHCR_REPO`/`IMAGE_TAG`).
4. کپی `deploy/proxy/Caddyfile.example` → `Caddyfile` و جایگزینی دامنه.
5. اجرای stackها به ترتیب درست (supabase → app → proxy):
   ```bash
   docker network create afrakala-net || true
   docker compose -f deploy/supabase/docker-compose.yml up -d
   docker compose -f deploy/app/docker-compose.prod.yml up -d   # production: pull from GHCR
   docker compose -f deploy/proxy/docker-compose.yml up -d
   ```
   دلیل: Caddy باید پس از app و supabase بالا بیاید تا upstreamها (`web:3000`, `kong:8000`) قابل دسترس باشند.
6. **TLS — دو مسیر:**
   - مسیر A (وقتی اینترنت بین‌الملل و DNS سالم): Caddy خودکار از Let's Encrypt / ZeroSSL.
   - مسیر B (ایران-safe): گواهی DV از CA داخلی، فایل‌ها در `deploy/proxy/certs/` (هرگز در Git)، Caddyfile با `tls /etc/caddy/certs/fullchain.pem /etc/caddy/certs/privkey.pem`.
7. اجرای migration و import داده طبق `docs/SELF_HOST_UPDATE_RUNBOOK.md` (بخش ۴ — اجرای واقعی فقط با `DRY_RUN=false`).

---

## فاز ۶ — چرخه روزمره توسعه (با staging)

```
Lovable → GitHub main → Actions → GHCR (sha-<commit>)
        → staging → smoke test → production (دستی، با backup)
```

جزئیات کامل دو سناریو (app-only و migration) و rollback در:
**`docs/SELF_HOST_UPDATE_RUNBOOK.md`**

قواعد ثابت:
- migration **دستی** است؛ GitHub Actions هرگز به DB production دسترسی ندارد.
- migration **قبل** از deploy app اجرا می‌شود (مگر backward-compatible صریح).
- destructive migration بدون backup ممنوع — رجوع به `docs/MIGRATION_SAFETY_POLICY.md`.
- production compose از GHCR pull می‌کند (`deploy/app/docker-compose.prod.yml`)؛ build محلی فقط برای local/staging (`deploy/app/docker-compose.yml`).

---

## فاز ۷ — Backup, Restore-Test و نگهداری

اسکریپت‌ها در `deploy/backups/scripts/` آماده است.

**Backup روزانه (cron):**
- `pg_dump` → `db-YYYYMMDD.sql.gz`
- `rsync` پوشه storage → دیسک backup
- env/secrets رمزنگاری‌شده با `age` (کلید عمومی در سرور، خصوصی offline)

**Retention:**
- local: ۱۴ روز
- offsite (S3 یا ابری ایرانی): ۳۰ روز

**Restore Test (اجباری ماهانه):**
- اجرای `restore-postgres.sh` و `restore-storage.sh` روی محیط staging.
- اجرای `verify-restore.sh` و `smoke-test.sh`.
- ثبت گزارش نتیجه (تاریخ، حجم، مدت زمان، نتیجه).
- backup بدون restore-test معتبر نیست.

**Encryption:** همه backup های env/secrets با `age` (یا `sops`/`restic`) رمزنگاری شوند. کلید رمزگشایی هرگز روی همان سرور backup نگه داشته نشود.

**Monitoring:** `docker stats` + `uptime-kuma` (self-host).
**به‌روزرسانی امنیتی:** `unattended-upgrades` + بازبینی ماهانه imageها.

---

## ضمیمه — Server Sizing (سه سطح)

| سطح | vCPU | RAM | دیسک | کاربرد |
|---|---|---|---|---|
| A — Local/Staging/Min | 4 | 8 GB | 100 GB SSD | تست و staging سبک |
| B — Small Production | 8 | 16 GB | 200 GB NVMe + backup جدا/offsite | شروع واقعی شرکت |
| C — Safer Production | 8–12 | 32 GB | 300–500 GB NVMe + backup storage جدا | پایداری و رشد داده‌ها |

محل سرور:
- داخل ایران → latency بهتر برای کاربران ایرانی، سازگاری با اینترنت ملی. **ترجیح این پروژه.**
- خارج ایران → دسترسی راحت‌تر به سرویس‌های بین‌المللی، اما ریسک اختلال در اینترنت ملی.

---

## ضمیمه — Code / Data Separation (اصل قطعی)

| Code (در Git + Image) | Data (فقط روی سرور، هرگز در Git) |
|---|---|
| GitHub repo | Postgres volume (`db-data`) |
| Docker image (GHCR) | Storage volume (`storage-data`) |
| compose / deploy scripts | پوشه backup و dumpها |
| migration files | export های storage |
| Caddyfile.example | `.env.production` و `.env` واقعی |
|  | گواهی‌های TLS واقعی |

- Docker image هرگز شامل data یا secret نیست (workflow scan روی client bundle این را تضمین می‌کند).
- volume های DB و Storage مستقل و backup-able.
- secret ها فقط روی filesystem سرور.

---

## ضمیمه — اسناد مرتبط
- `docs/SELF_HOST_UPDATE_RUNBOOK.md` — چرخه به‌روزرسانی، rollback، دو سناریو
- `docs/MIGRATION_SAFETY_POLICY.md` — سیاست امنیت migration
- `docs/INTERNET_RESILIENCE.md` — رفتار در اینترنت ملی، feature flags
- `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md` — قانون مادر

---

## چک‌لیست تأیید پایان هر تغییر

طبق `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`:
- [ ] هیچ secret در bundle کلاینت
- [ ] هیچ import از CDN خارجی
- [ ] migration در `supabase/migrations/` با timestamp جدید
- [ ] RLS روی جداول جدید فعال
- [ ] build روی Docker لینوکس پاس
- [ ] healthcheck `/api/healthz` دست‌نخورده
- [ ] گزارش پایان کار به کاربر

---

## ترتیب اجرا

| هفته | فاز |
|---|---|
| ۱ | فاز ۱ + ۲ — لپ‌تاپ + Supabase محلی (بدون هزینه) |
| ۲ | فاز ۳ + اجاره سرور |
| ۳ | فاز ۴ + ۵ — استقرار production + مهاجرت داده |
| دائمی | فاز ۶ + ۷ — توسعه + backup |
