## هدف
خود‌میزبانی ۱۰۰٪ افراکالا روی سرور لینوکس شخصی، با چرخه توسعه: Lovable → GitHub → GHCR → سرور.

---

## فاز ۱ — آماده‌سازی لپ‌تاپ شخصی (یک‌بار)

**ابزارها:**
- Git (≥ 2.40)
- Docker Desktop (Win/Mac) یا Docker Engine + Compose v2 (Linux)
- Node.js 20 LTS + Bun
- VS Code + افزونه‌های Docker و GitLens
- GitHub CLI (`gh`)
- یک SSH key (`ssh-keygen -t ed25519`) برای ورود به سرور

**کارها:**
1. اتصال پروژه Lovable به GitHub (منوی + → GitHub → Connect).
2. `git clone` پروژه روی لپ‌تاپ.
3. تست build محلی: `bun install && bun run build`.

---

## فاز ۲ — راه‌اندازی Supabase Self-host به‌صورت محلی (تست کامل)

**هدف:** قبل از اجاره سرور، کل stack را روی لپ‌تاپ اجرا کن تا مطمئن شوی همه چیز کار می‌کند.

**مراحل:**
1. `cp deploy/supabase/.env.example deploy/supabase/.env` و پر کردن مقادیر:
   - `POSTGRES_PASSWORD`, `JWT_SECRET` (≥ 32 char), `ANON_KEY`, `SERVICE_ROLE_KEY`, `DASHBOARD_USERNAME/PASSWORD`, `SITE_URL=http://localhost:3000`.
2. `docker compose -f deploy/supabase/docker-compose.yml up -d` → بررسی healthcheck همه سرویس‌ها (db, auth, rest, storage, kong, studio).
3. اجرای migrationها: `bash deploy/migration/apply-project-migrations.sh`.
4. مهاجرت داده از Lovable Cloud (اختیاری در این فاز):
   - `dump-auth.sh` → users
   - `pg_dump` از Cloud → restore به local
   - `export-storage.mjs` + `import-storage.mjs` برای فایل‌ها
5. اجرای app: `docker compose -f deploy/app/docker-compose.yml up -d` با `.env` که به Supabase محلی اشاره می‌کند.
6. تست: `verify-db-counts.sh` + `smoke-test.sh` + لاگین/ساخت محصول/آپلود فایل.

---

## فاز ۳ — CI/CD: ساخت خودکار Docker image روی GitHub

**فایل آماده است:** `.github/workflows/build-image.yml`

**کاری که باید انجام دهی:**
1. در GitHub → Settings → Actions → General → Workflow permissions → **Read and write** فعال کن (برای پوش به GHCR).
2. هر push به `main` خودکار image می‌سازد و در `ghcr.io/<user>/<repo>-web:latest` و `:sha-<commit>` می‌گذارد.
3. Image را public یا private نگه دار (private امن‌تر؛ روی سرور `docker login ghcr.io` لازم می‌شود).

---

## فاز ۴ — اجاره و آماده‌سازی سرور لینوکس

**حداقل سخت‌افزار توصیه‌شده:**
- 8 vCPU / 16 GB RAM / 200 GB NVMe SSD + 500 GB دیسک backup
- Ubuntu 22.04 LTS
- IP ثابت + دامنه (مثلاً `app.afrakala.ir`)

**ارائه‌دهنده‌های پیشنهادی (داخل ایران برای latency کمتر):** ابرآروان، پارس‌پک، آسیاتک، یا خارجی Hetzner/Contabo.

**کارهای اولیه روی سرور:**
1. `ssh root@server` → ساخت user غیر‌root + sudo.
2. نصب Docker Engine + Compose v2 + UFW + fail2ban + certbot.
3. UFW: فقط 22, 80, 443 باز.
4. تنظیم DNS: A record دامنه → IP سرور.

---

## فاز ۵ — استقرار اولیه روی سرور

1. `git clone` پروژه روی سرور (یا فقط پوشه `deploy/`).
2. `docker login ghcr.io` با Personal Access Token (scope: `read:packages`).
3. ساخت `.env` واقعی برای Supabase و App (همان الگوی فاز ۲ ولی با دامنه واقعی و رمزهای قوی).
4. اجرای stack:
   ```
   docker compose -f deploy/supabase/docker-compose.yml up -d
   docker compose -f deploy/proxy/docker-compose.yml up -d   # Caddy
   docker compose -f deploy/app/docker-compose.yml up -d
   ```
5. Caddy خودکار TLS از Let's Encrypt می‌گیرد.
6. اجرای migration اولیه + import داده از Lovable Cloud (طبق `docs/SELF_HOSTING.md`).

---

## فاز ۶ — چرخه روزمره توسعه (پس از استقرار)

```text
Lovable (تغییر کد) 
   ↓ auto-sync
GitHub (main branch)
   ↓ Actions auto-build
GHCR (image جدید)
   ↓ ssh + دستور دستی
سرور (pull + restart)
```

**روی سرور برای هر آپدیت:**
```bash
cd /opt/afrakala
git pull
docker compose -f deploy/app/docker-compose.yml pull web
docker compose -f deploy/app/docker-compose.yml up -d web
# اگر migration جدید بود:
bash deploy/migration/apply-project-migrations.sh
```

> **چرا migration دستی؟** مرز امنیتی — هیچ‌وقت Actions نباید به DB production دسترسی داشته باشد.

---

## فاز ۷ — Backup و نگهداری

1. **Cron روزانه روی سرور:**
   - `pg_dump` از Postgres → فایل رمزنگاری‌شده در `/backup/`
   - `rsync` پوشه storage → دیسک backup
   - آپلود هفتگی به یک off-site (مثلاً S3/ابری ایرانی)
2. **Monitoring:** `docker stats` + سرویس ساده `uptime-kuma` برای healthcheck.
3. **به‌روزرسانی امنیتی:** `unattended-upgrades` فعال + بازبینی ماهانه image ها.

---

## چک‌لیست تأیید Self-Host (پایان هر تغییر در Lovable)

طبق `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`:
- [ ] هیچ secret در bundle کلاینت نیست
- [ ] هیچ import از CDN خارجی اضافه نشده
- [ ] migration در `supabase/migrations/` با timestamp جدید
- [ ] RLS روی جداول جدید فعال
- [ ] build روی Docker لینوکس پاس می‌شود
- [ ] healthcheck `/api/healthz` دست‌نخورده
- [ ] گزارش پایان کار به کاربر داده شده

---

## خلاصه ابزارها

| لایه | ابزار |
|---|---|
| توسعه | Lovable + VS Code |
| نسخه‌گذاری | Git + GitHub |
| CI | GitHub Actions |
| Registry | GHCR (ghcr.io) |
| Runtime | Docker + Compose v2 |
| Backend | Supabase Self-host (Postgres+Auth+REST+Storage+Kong) |
| Reverse Proxy + TLS | Caddy |
| OS | Ubuntu 22.04 LTS |
| Backup | pg_dump + rsync + cron |

---

## ترتیب پیشنهادی اجرا

1. **این هفته:** فاز ۱ + ۲ (لپ‌تاپ + Supabase محلی) — بدون هزینه، تست کامل.
2. **هفته بعد:** فاز ۳ (فعال‌سازی Actions) + اجاره سرور.
3. **هفته سوم:** فاز ۴ + ۵ (استقرار production + مهاجرت داده).
4. **دائمی:** فاز ۶ + ۷ (چرخه توسعه + backup).

در این مود فقط برنامه‌ریزی انجام شد؛ پس از تأیید، فاز به فاز پیش می‌رویم.
