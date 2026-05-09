
# پلن: Self-Host ۱۰۰٪ افراکالا — معماری، فازبندی و گردش‌کار توسعه با Lovable

## وضعیت فعلی پروژه (آنچه از قبل آماده است)

پروژه از قبل بخش بزرگی از زیرساخت self-host را دارد و نیازی به ساخت دوباره نیست:

- `Dockerfile` + `docker-compose.yml` در ریشه + `server/node-entry.mjs` (Node SSR adapter — مستقل از Cloudflare).
- `deploy/app/` — استک اپ + healthcheck `/api/healthz`.
- `deploy/proxy/` — Caddy reverse-proxy (تنها سرویس public).
- `deploy/supabase/` — استک Supabase خودمیزبان (Postgres + GoTrue + PostgREST + Storage + Kong + Studio).
- `deploy/migration/` — اسکریپت‌های مهاجرت از Cloud به self-host (auth, storage, db, smoke-test).
- `deploy/backups/` — backup/restore برای Postgres + Storage + cron.
- `docs/SELF_HOSTING.md` و `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md` — runbook کامل و قانون مادر.

پس این پلن **چیز جدیدی از صفر نمی‌سازد**؛ فقط ۱) گردش‌کار «توسعه در Lovable → استقرار روی سرور» را تثبیت می‌کند، ۲) شکاف‌های باقی‌مانده برای ۱۰۰٪ self-host را شناسایی و می‌بندد، ۳) چک‌لیست گزارش پایان‌هر-تغییر را اجباری می‌کند.

---

## پاسخ کوتاه به سوالات شما

| سوال | پاسخ |
|---|---|
| ۱) ابزارها | GitHub (sync دوطرفه با Lovable) + Docker + Docker Compose + Caddy + Supabase self-host stack + GitHub Actions (CI build image) + GHCR (registry) + watchtower یا Portainer (auto-update روی سرور). |
| ۵) جداسازی کد و دیتا | ✅ از قبل رعایت شده: کد در image؛ دیتا در `/opt/afrakala/data/{postgres,storage,caddy}` بیرون از image. |
| ۶-۹) سرور اجاره‌ای | حداقل: ۴ vCPU، ۸ GB RAM، ۱۰۰ GB SSD NVMe، Ubuntu 22.04 LTS، IP عمومی، پهنای‌باند نامحدود. توصیه‌شده برای رشد: ۸ vCPU، ۱۶ GB RAM، ۲۰۰ GB SSD + ۵۰۰ GB backup storage جدا. |
| ۱۰-۱۲) لپ‌تاپ | Docker Desktop + Git + VS Code + Bun + Node 20 + GitHub CLI. حداقل ۸ GB RAM آزاد. |

---

## فاز ۱ — آماده‌سازی محیط محلی (لپ‌تاپ) | ۱ روز

### چه نصب کنید
1. **Git** + حساب GitHub.
2. **Docker Desktop** (Windows/Mac) یا **Docker Engine + Compose v2** (Linux).
3. **Node 20 LTS** + **Bun** (`curl -fsSL https://bun.sh/install | bash`).
4. **VS Code** + افزونه‌های Docker و GitLens.
5. **GitHub CLI** (`gh`) برای auth و branch.

### اتصال Lovable به GitHub
- در Lovable: + → GitHub → Connect → ساخت repo جدید (یا اتصال به repo موجود).
- از این لحظه هر تغییر Lovable خودکار push می‌شود و هر push در GitHub خودکار به Lovable می‌آید.

### تست محلی
```bash
git clone <repo>
cp deploy/app/.env.production.example deploy/app/.env.production    # مقادیر تست
docker compose -f deploy/app/docker-compose.yml build
docker compose -f deploy/app/docker-compose.yml up -d
curl http://localhost:3000/api/healthz
```

---

## فاز ۲ — Supabase Self-Host روی لپ‌تاپ | ۱ روز

### پیش‌نیاز
طبق `deploy/supabase/README.md`:
- ساخت `deploy/supabase/.env` از `.env.example` (تولید JWT_SECRET، ANON_KEY، SERVICE_ROLE_KEY با اسکریپت داخل README).
- ساخت کاربر Postgres و رمزها.

### اجرا
```bash
docker compose -f deploy/supabase/docker-compose.yml up -d
docker compose -f deploy/supabase/docker-compose.yml ps   # همه healthy
```

### مهاجرت داده از Lovable Cloud به استک محلی
طبق `deploy/migration/`:
1. `dump-auth.sh` — صدور کاربران از Cloud.
2. `apply-project-migrations.sh` — اعمال همه `supabase/migrations/*.sql`.
3. `restore-auth.sh` — وارد کردن کاربران.
4. `export-storage.mjs` + `import-storage.mjs` — انتقال فایل‌ها.
5. `verify-db-counts.sh` + `smoke-test.sh` — تأیید.

### اتصال اپ به Supabase محلی
ویرایش `deploy/app/.env.production`:
```
SUPABASE_URL=http://kong:8000
SUPABASE_PUBLISHABLE_KEY=<از فاز ۲>
SUPABASE_SERVICE_ROLE_KEY=<server-only>
```
سپس `docker compose ... restart web` و تست login.

---

## فاز ۳ — Reverse Proxy + HTTPS | نیم روز

طبق `deploy/proxy/`:
1. کپی `Caddyfile.example` → `Caddyfile` و درج دامنه‌ها.
2. اجرای `docker compose -f deploy/proxy/docker-compose.yml up -d`.
3. روی لپ‌تاپ از self-signed یا `localhost` استفاده کنید؛ روی سرور Caddy خودش Let's Encrypt می‌گیرد.

دامنه‌ها:
- `app.afrakala.ir` → web:3000
- `api.afrakala.ir` → kong:8000
- `studio.afrakala.ir` → studio:3000 (basic auth + IP allowlist)

---

## فاز ۴ — انتقال به سرور لینوکس اجاره‌ای | ۱ روز

### مشخصات سرور (پاسخ ۷-۹)

| منبع | حداقل | توصیه‌شده | Production | چرا |
|---|---|---|---|---|
| CPU | ۴ vCPU | ۶ vCPU | ۸ vCPU | Postgres + Node SSR + Kong هر کدام CPU می‌خواهد |
| RAM | ۸ GB | ۱۲ GB | ۱۶ GB | Postgres شیفت کش + Node + Caddy |
| Disk | ۱۰۰ GB SSD NVMe | ۲۰۰ GB | ۲۰۰ + ۵۰۰ backup | NVMe برای Postgres ضروری |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS | پایدار، مستندات فراوان |
| شبکه | ۱ Gbps + IP ثابت | همان | DDoS protection | Caddy روی 80/443 |
| Backup | روزانه | روزانه + offsite | روزانه + هفتگی offsite | Storage جدا (S3-compatible ایرانی مثل ArvanCloud) |

### مراحل
1. SSH key، فعال‌سازی UFW (فقط 22، 80، 443)، fail2ban.
2. نصب Docker + Compose v2.
3. کاربر غیر-root با sudo.
4. ساختار `/opt/afrakala/{deploy,data,backups,logs}` (طبق SELF_HOSTING.md §۴).
5. clone repo داخل `/opt/afrakala/`.
6. کپی `.env` واقعی (هرگز در git نباشد).
7. اجرای فازهای ۲ و ۳ روی سرور.
8. زمان‌بندی cron برای `deploy/backups/scripts/backup-all.sh` (روزانه).
9. تست restore drill طبق `deploy/backups/scripts/restore-drill.md`.

---

## فاز ۵ — گردش‌کار توسعه روزانه (بهترین قسمت) | همیشگی

### چرخه «توسعه در Lovable → نسخه روی سرور»

```text
[Lovable Editor] ── auto push ──► [GitHub main] ── trigger ──► [GitHub Actions]
                                                                     │
                                                                     │ build & push
                                                                     ▼
                                                              [GHCR registry]
                                                                     │
                                                                     │ pull
                                                                     ▼
                                                            [سرور افراکالا]
                                                            docker compose pull
                                                            docker compose up -d
```

### پیاده‌سازی (یک بار):

**۵.۱ — GitHub Actions workflow** (فایل جدید `.github/workflows/build-image.yml`)
- روی push به `main` اجرا می‌شود.
- `docker build` و push به `ghcr.io/<user>/afrakala-web:latest` و tag با commit SHA.

**۵.۲ — روی سرور**
دو روش:
- **روش A (دستی، امن‌تر):** بعد از هر تغییر مهم در Lovable، SSH بزنید و `cd /opt/afrakala/deploy/app && docker compose pull && docker compose up -d web`.
- **روش B (خودکار):** نصب **Watchtower** فقط برای کانتینر `web`، بررسی هر ۱۵ دقیقه، با notification به تلگرام/ایمیل. Migrationها همیشه جداگانه اعمال می‌شوند، نه خودکار.

**۵.۳ — Migrationهای دیتابیس**
- هر تغییر دیتابیس از Lovable → فایل جدید در `supabase/migrations/`.
- روی سرور: `bash deploy/migration/scripts/apply-project-migrations.sh` (دستی، با backup قبلی).
- هرگز migration خودکار اعمال نشود؛ این مرز ایمنی برای دیتای production است.

**۵.۴ — Branch strategy ساده**
- `main` = production، فقط بعد از تست.
- در Lovable از feature branch استفاده کنید (Account Settings → Labs → GitHub Branch Switching).
- `staging` (اختیاری) = یک کانتینر دوم روی همان سرور با دیتابیس جدا برای QA.

---

## فاز ۶ — استانداردهای کد که Lovable باید رعایت کند

این چک‌لیست در پایان **هر تغییر** Lovable باید pass شود (طبق `AFRAKALA_ACCEPTANCE_CRITERIA.md`):

### الف) Secret Hygiene
- هیچ secret با prefix `VITE_` نباشد.
- اسکن خروجی build:
  ```
  grep -R "SERVICE_ROLE\|JWT_SECRET\|POSTGRES_PASSWORD" dist/client deploy src
  ```
  باید خالی برگردد.
- فقط `*.example` در git؛ `.env` واقعی هرگز.

### ب) Dependency Hygiene
- هیچ import از `fonts.googleapis.com`، `cdn.jsdelivr.net`، CDN خارجی.
- هر integration خارجی feature flag دارد و در حالت off، سیستم کار می‌کند.
- هیچ پکیج Node-only که در Worker یا Node SSR کار نمی‌کند (sharp, canvas, puppeteer, child_process).

### ج) DB & RLS
- هر جدول جدید RLS دارد.
- migration در `supabase/migrations/` با timestamp و قابل rollback.
- نقش‌ها فقط در `user_roles` با `has_role()` security definer.

### د) Build & Runtime
- `bun run build` و `SELF_HOSTING_NODE=1 bun run build` هر دو موفق.
- `docker compose -f deploy/app/docker-compose.yml build` موفق.
- `/api/healthz` پاسخ ۲۰۰ بدون auth و بدون اتصال DB.

### ه) UX
- RTL، فارسی، mobile-first.
- query با pagination و limit.

---

## فاز ۷ — گزارش الزامی پایان هر کار توسط Lovable

پس از هر تغییر، Lovable باید این گزارش کوتاه را در پاسخ بدهد (Self-Host Acceptance Check):

```
✅ Secret scan: clean
✅ No external CDN imports
✅ RLS on new tables: <لیست>
✅ Migration files: <لیست>
✅ Build: pass
✅ Healthcheck route untouched
⚠️ Items needing manual ops on server: <مثلاً apply migration>
```

اگر یکی از این موارد نقض شد، Lovable باید **قبل از تغییر کد توقف کند** و گزارش بدهد.

---

## شکاف‌های باقی‌مانده برای ۱۰۰٪ self-host (کارهای بعدی)

این موارد در runbook به‌عنوان «باقی‌مانده» علامت خورده‌اند و باید در فازهای بعدی بسته شوند:

1. **OCR خارجی** (فاز SH.6 در runbook) — حذف یا جایگزینی با Tesseract محلی.
2. **Lovable AI Gateway** — بررسی feature flag برای حالت offline (اگر مدل خارجی استفاده می‌شود، باید optional باشد).
3. **GitHub Actions workflow** برای build خودکار image — هنوز در repo نیست (در فاز ۵.۱ بالا اضافه می‌شود).
4. **Watchtower / auto-update config** — اختیاری ولی توصیه شده.
5. **Offsite backup script واقعی** — فعلاً فقط `.example` هست؛ باید با مقصد ابری ایرانی (ArvanCloud Object Storage یا مشابه) تنظیم شود.

---

## اولویت‌بندی پیشنهادی برای شما

اگر می‌خواهید کم‌ترین کریدیت مصرف شود، این ترتیب را برگزینید:

1. **همین الان (دستی، بدون Lovable):** فاز ۱ و ۲ روی لپ‌تاپ — فقط Docker و دستورات ترمینال. Lovable نیاز نیست.
2. **یک تسک Lovable:** افزودن GitHub Actions workflow (فاز ۵.۱) + اسکریپت‌های کوچک کمکی. ~۱ تسک.
3. **یک تسک Lovable دیگر:** تکمیل OCR محلی (شکاف ۱) و حذف Lovable AI Gateway hard-dependency. ~۱-۲ تسک.
4. **خودتان روی سرور:** فاز ۴ و استقرار — نیازی به Lovable نیست.

این‌طوری تمام بار سنگین استقرار سمت ترمینال شماست و Lovable فقط برای تغییرات کد استفاده می‌شود.
