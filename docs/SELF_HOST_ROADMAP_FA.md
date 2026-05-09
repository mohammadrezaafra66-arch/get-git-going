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
2. `docker login ghcr.io` با PAT.
3. ساخت `.env` واقعی برای `deploy/supabase/` و `deploy/app/` (رمزهای قوی، دامنه واقعی).
4. کپی `deploy/proxy/Caddyfile.example` → `Caddyfile` و جایگزینی دامنه.
5. اجرای stackها به ترتیب:
   ```bash
   docker compose -f deploy/supabase/docker-compose.yml up -d
   docker compose -f deploy/proxy/docker-compose.yml up -d
   docker compose -f deploy/app/docker-compose.yml up -d
   ```
6. Caddy خودکار TLS از Let's Encrypt می‌گیرد.
7. اجرای migration و import داده از Lovable Cloud طبق `docs/SELF_HOSTING.md`.

---

## فاز ۶ — چرخه روزمره توسعه

```
Lovable → (auto-sync) → GitHub main → (Actions) → GHCR → (دستی SSH) → سرور
```

روی سرور برای هر آپدیت:
```bash
cd /opt/afrakala
git pull
docker compose -f deploy/app/docker-compose.yml pull web
docker compose -f deploy/app/docker-compose.yml up -d web
# اگر migration جدید بود:
bash deploy/migration/scripts/apply-project-migrations.sh
```

> migration **دستی** است — مرز امنیتی؛ Actions هیچ‌وقت به DB production دسترسی ندارد.

---

## فاز ۷ — Backup و نگهداری

اسکریپت‌ها در `deploy/backups/scripts/` آماده است.

1. **Cron روزانه روی سرور:**
   - `pg_dump` → `/backup/db-YYYYMMDD.sql.gz` (رمزنگاری‌شده).
   - `rsync` پوشه storage → دیسک backup.
   - Off-site هفتگی (S3 یا ابری ایرانی).
2. **Monitoring:** `docker stats` + `uptime-kuma`.
3. **به‌روزرسانی امنیتی:** `unattended-upgrades` + بازبینی ماهانه image ها.

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
