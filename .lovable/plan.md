# گزارش ممیزی Self-Host Readiness — افراکالا

این گزارش فقط بر اساس **بررسی واقعی فایل‌های repo در همین لحظه** نوشته شده. هیچ کد، migration، dump، secret یا داده‌ای تغییر/اجرا نشد.

---

## 1) خلاصه اجرایی

پروژه از نظر **زیرساخت self-host** بسیار جلو است: scaffold کامل برای Supabase self-host (Postgres + GoTrue + PostgREST + Storage + Kong + Studio + Meta)، Caddy reverse-proxy، Dockerfile production-ready (Node SSR، non-root، healthcheck، secret-leak guard)، اسکریپت‌های backup/restore/migration کامل، و GitHub Actions برای ساخت image. اما **سه گلوگاه واقعی** برای رسیدن به ۱۰۰٪ self-host باقی است:

1. **ENV runtime ناقص:** فایل `.env` فعلی ریشه به Supabase Cloud (`kwwkppkcihrbeurwudjh.supabase.co`) اشاره دارد و مقادیر default در `vite.config.ts` نیز همان است. هیچ runtime override برای self-host تنظیم نشده.
2. **OCR وابسته به `https://ai.gateway.lovable.dev` با `LOVABLE_API_KEY`:** دو فایل `src/lib/receipt-ocr.functions.ts` و `receipt-ocr-bytes.functions.ts` این endpoint را hard-coded صدا می‌زنند. اگرچه graceful-fallback دارد (وقتی key نیست، warning برمی‌گرداند)، اما تنها مسیر OCR موجود است.
3. **تست واقعی self-host هرگز انجام نشده:** stack های Supabase / app / proxy فقط **scaffold** هستند؛ روی هیچ ماشین لینوکس واقعی end-to-end smoke-test گرفته نشده.

**Score: 78/100**

---

## 2) امتیاز آمادگی Self-Host (0–100)

| محور | امتیاز | توضیح |
|---|---|---|
| Code/Data separation | 95 | Dockerfile + .gitignore + .dockerignore بسیار خوب جدا کرده‌اند |
| Supabase scaffold | 90 | همه ۶ سرویس لازم (db/auth/rest/storage/kong/meta+studio) آماده |
| Auth model | 90 | فقط email/password + RLS + has_role؛ بدون OAuth وابسته به Google |
| Storage | 85 | bucketها مشخص؛ فقط createSignedUrl استفاده می‌شود (هم در self-host کار می‌کند) |
| Backup/Restore | 88 | همه اسکریپت‌ها + restore-drill.md + offsite-sync نمونه |
| Reverse proxy | 85 | Caddy + ACME + manual TLS + studio با IP allowlist |
| CI/CD | 80 | GitHub Actions GHCR push آماده؛ deploy دستی |
| Runtime ENV setup | 50 | .env ریشه به Cloud اشاره دارد؛ override برای self-host لازم است |
| External runtime deps | 60 | OCR یک نقطه وابستگی فعال به Lovable AI Gateway |
| End-to-end test | 0 | روی Linux واقعی هرگز اجرا نشده |
| **مجموع** | **78/100** | |

---

## 3) آنچه آماده است ✅

- **Dockerfile production-grade** (`Dockerfile`): دومرحله‌ای، `node:20-alpine`، tini، non-root user `app`، HEALTHCHECK، `SELF_HOST_NODE=1` برای غیرفعال‌کردن Cloudflare plugin، **secret-leak guard** که build را fail می‌کند اگر `SERVICE_ROLE`/`JWT_SECRET`/`POSTGRES_PASSWORD`/`LOVABLE_API_KEY` در `dist/client/` پیدا شود.
- **Healthcheck route** (`src/routes/api.healthz.ts`) — برمی‌گرداند `{ok:true}` با `cache-control: no-store`.
- **Server entry مستقل از Cloudflare** (`server/node-entry.mjs`): http server خام Node که `dist/server/index.js` را mount می‌کند، graceful shutdown دارد.
- **vite.config.ts switch دارد:** `SELF_HOST_NODE=1` → Cloudflare plugin خاموش، Node bundle خالص.
- **Stack کامل Supabase self-host** (`deploy/supabase/docker-compose.yml`): db, auth (GoTrue v2.158.1), rest (PostgREST v12.2.0), storage (v1.11.13), meta, studio (محدود به internal+afrakala-net), kong (declarative). هیچ پورت publish روی host نمی‌کند. Realtime / Edge Functions / imgproxy / analytics عمداً غیرفعال (تا اثبات نیاز).
- **Kong declarative config نمونه** (`deploy/supabase/kong.yml.example`): consumer برای anon و service_role، route برای auth/rest/storage/meta با key-auth + acl + cors.
- **Caddy proxy** (`deploy/proxy/`): security headers، snippet برای ACME یا manual TLS (مسیر ایران-safe)، Studio پشت basic_auth + IP allowlist.
- **اسکریپت‌های backup/restore کامل** (`deploy/backups/scripts/`): backup-postgres, backup-storage, backup-env-secrets (با age encryption)، restore-* + verify-restore + cron.example + offsite-sync.example + restore-drill.md (تمرین ماهانه).
- **اسکریپت‌های migration کامل** (`deploy/migration/scripts/`): apply-project-migrations, dump-auth, restore-auth, export-storage.mjs, import-storage.mjs, verify-db-counts, verify-storage, smoke-test, cutover-checklist, freeze-writes.
- **GitHub Actions** (`.github/workflows/build-image.yml`): اضافه شده برای push خودکار به GHCR.
- **Auth بدون وابستگی خارجی:** فقط `signInWithPassword` و `signUp` (`src/lib/auth/AuthProvider.tsx`) + جدول `user_roles` با `has_role()` security definer.
- **184 migration** در `supabase/migrations/` با timestamp استاندارد، 57 فایل دارای `ENABLE ROW LEVEL SECURITY`، 135 جدول.
- **فونت محلی:** `public/fonts/vazirmatn/` — هیچ Google Fonts.
- **gitignore/dockerignore عالی:** همه `.env`, `*.dump`, `*.tar.gz`, `*.age`, `*.pem/*.key/*.crt`, `volumes/`, `dumps/` exclude شده‌اند.
- **مستندات فارسی کامل:** `docs/AFRAKALA_ACCEPTANCE_CRITERIA.md`, `SELF_HOSTING.md`, `OPERATIONS_QUICK_REFERENCE.md`, `SELF_HOST_ROADMAP_FA.md`.

---

## 4) آنچه نیمه‌آماده است ⚠️

| مورد | وضعیت | دلیل |
|---|---|---|
| `docker-compose.yml` ریشه | قدیمی | فقط `app + postgres` ساده؛ با stack جدید `deploy/*` همخوان نیست. ممکن است گمراه‌کننده باشد. |
| `wrangler.jsonc` در ریشه | باقی‌مانده | برای مسیر Cloudflare Lovable لازم است؛ در self-host بی‌ضرر اما باعث سردرگمی می‌شود. |
| Caddyfile واقعی | فقط example | کاربر باید روی سرور `cp Caddyfile.example Caddyfile` بزند. |
| supabase/.env واقعی | فقط example | باید روی سرور با مقادیر تولید‌شده ساخته شود. |
| supabase/volumes/api/kong.yml | فقط example | روی سرور باید کپی شود. |
| GitHub Actions | تک workflow | فقط build؛ deploy خودکار نیست (عمداً، مرز امنیتی). |
| OCR محلی | غایب | جایگزین self-hostable (مثل Tesseract) برای OCR وجود ندارد. |
| Realtime در self-host | غیرفعال | اگر آینده لازم شد، باید سرویس realtime به stack اضافه شود. |
| تست end-to-end لینوکس | انجام نشده | لازم است حداقل یک‌بار روی laptop/VM تمرین شود. |

---

## 5) آنچه مانع ۱۰۰٪ self-host است 🚧

### P0 — قبل از self-host واقعی باید رفع شود

1. **OCR وابسته به `ai.gateway.lovable.dev`** — `src/lib/receipt-ocr.functions.ts:199` و `src/lib/receipt-ocr-bytes.functions.ts:150`.
   - وضعیت فعلی: graceful fallback دارد (اگر key نباشد warning می‌دهد، crash نمی‌کند).
   - اقدام لازم: یا OCR را با feature-flag `OCR_ENABLED=false` غیرفعال کن، یا adapter برای Tesseract محلی اضافه کن، یا قبول کن که OCR یک "feature اختیاری online" است.
2. **`.env` ریشه و defaults در `vite.config.ts`** اشاره به Lovable Cloud دارد. در runtime self-host **باید** override شود (در `deploy/app/.env.production`). این صرفاً hygiene است نه bug، اما باید مستند و تست شود.
3. **`docker-compose.yml` ریشه** قدیمی و گمراه‌کننده — یا remove یا با pointer به `deploy/app/` جایگزین شود.

### P1 — قبل از production

4. **اولین smoke-test کامل روی Linux**: stack ها bring-up + apply migrations + auth signup + storage upload/download + RLS check + restore drill.
5. **مهاجرت داده Lovable Cloud → self-host**: dump-auth + pg_dump + storage-export طبق `deploy/migration/scripts/cutover-checklist.md`.
6. **TLS واقعی**: ACME (Let's Encrypt) یا certificate ایرانی manual.
7. **Cron backup + offsite**: فعال‌سازی `deploy/backups/scripts/cron.example`.

### P2 — بعداً

8. حذف `wrangler.jsonc` بعد از قطع کامل از Lovable preview.
9. Monitoring (uptime-kuma + Loki/Grafana اختیاری).
10. مهاجرت OCR به Tesseract self-host.

---

## 6) وابستگی‌های runtime خارجی فعلی

| دامنه | فایل | نوع | وضعیت |
|---|---|---|---|
| `ai.gateway.lovable.dev` | `src/lib/receipt-ocr.functions.ts:199`, `receipt-ocr-bytes.functions.ts:150` | C — runtime | فقط OCR، graceful-fallback |
| `kwwkppkcihrbeurwudjh.supabase.co` | `vite.config.ts:11`, `.env` ریشه | B — build/dev default | در self-host با env override جایگزین |
| Google Fonts / CDN خارجی / Sentry / GA / Maps | — | — | **هیچ‌کدام نیست** ✅ |
| لینک‌های شبکه‌های اجتماعی (wa.me, eitaa, ble.ir, rubika) | `src/routes/_app.admin.settings.tsx`, `src/lib/sales/quote-share.ts` | فقط `<a href>` خروجی | runtime dependency نیست؛ کاربر کلیک می‌کند |
| Lovable preview (`cdn.gpteng.co`, lovableproject.com) | — | — | یافت نشد ✅ |

---

## 7) Code/Data Separation

| ابعاد | وضعیت | مدرک |
|---|---|---|
| App code مستقل از داده | ✅ | Dockerfile فقط `dist + server + package.json` کپی می‌کند |
| Data volumes خارج از git | ✅ | `.gitignore`: `deploy/supabase/volumes/`, `deploy/backups/{pg,storage,storage-safety,env}/` |
| Dumps/backups خارج از git | ✅ | `*.dump`, `*.tar`, `*.tar.gz`, `*.age` |
| Real `.env` خارج از git | ⚠️ | الگوها در .gitignore، اما `.env` ریشه (Cloud keys) **در repo است** و در dev sandbox commit شده |
| Certificates خارج از git | ✅ | `*.pem/*.key/*.crt/*.csr/*.p12/*.pfx` و `deploy/proxy/certs/` |
| Examples قابل commit | ✅ | الگوهای `!deploy/**/.env.*.example` allow شده |
| Volume data داخل image نیست | ✅ | `.dockerignore`: `deploy/**/.env`, `volumes/`, `dumps/` |

> **توجه:** `.env` ریشه فقط شامل publishable key + URL است (نه service-role)، اما هنوز بهتر است در `.gitignore` صریح باشد. در `.gitignore` خط `.env` وجود دارد ولی فایل قبلاً commit شده — باید `git rm --cached .env` انجام شود.

---

## 8) Supabase / Auth / Storage Readiness

### سرویس‌های لازم (بر اساس کد فعلی)

| سرویس | لازم؟ | مدرک |
|---|---|---|
| Postgres | بله | 184 migration |
| Auth (GoTrue) | بله | `signInWithPassword`, `signUp`, `auth.uid()` در RLS |
| PostgREST | بله | کل کلاینت supabase-js از REST استفاده می‌کند |
| Storage API | بله | `feedback-attachments`, `payment-receipt-documents` buckets |
| Kong (یا gateway معادل) | بله | برای routing امن anon/service_role |
| Postgres Meta + Studio | اختیاری (admin) | فقط برای ادمین داخلی، در stack هست با محدودیت IP |
| Realtime | **خیر فعلاً** | فقط یک خط comment "No realtime" در `quote-pdf.ts` |
| Edge Functions | **خیر** | همه backend با TanStack `createServerFn` و `createFileRoute` server handlers |
| imgproxy | **خیر** | `ENABLE_IMAGE_TRANSFORMATION: false` |
| Analytics/Logflare/Vector | **خیر** | استفاده نمی‌شود |
| Inbucket | **خیر** | SMTP واقعی استفاده می‌شود (env vars) |

### Auth migration plan

- فقط email/password — قابل migration کامل با `dump-auth.sh`/`restore-auth.sh`.
- جدول `auth.users` + `public.user_roles` + `public.profiles`.
- بدون OAuth → نیاز به provider config در self-host نیست.
- Password reset از طریق SMTP کار می‌کند (env vars در `deploy/supabase/.env.example`).

### Storage

- ۲ bucket فعال: `feedback-attachments`, `payment-receipt-documents`.
- فقط `createSignedUrl` و `remove` — هم در Cloud هم در self-host یکسان.
- Storage backend = `file` (دیسک محلی)، `FILE_SIZE_LIMIT=50MB`.

---

## 9) Docker / Proxy / Deployment

| مورد | وضعیت |
|---|---|
| Dockerfile production-ready | ✅ multi-stage, non-root, tini, healthcheck |
| Secret leak guard | ✅ build fail روی dist/client اگر service_role/jwt پیدا شود |
| ENV variable strategy | ✅ VITE_* در build، server-only در runtime |
| Reverse proxy فقط 80/443 | ✅ Caddy تنها سرویس public |
| Postgres/Kong/Studio internal | ✅ هیچ `ports:` publish نمی‌کند |
| Persistent volumes | ✅ `db-data`, `storage-data`, `caddy_data`, `caddy_config` |
| Generated files خارج از image | ✅ `.dockerignore` |
| `afrakala-net` external network | ✅ مستند شده |
| compose validity | ⚠️ syntax-only inspection شد، روی هاست واقعی validate نشد |

---

## 10) Backup / Restore Readiness

| نیاز | وجود دارد؟ | فایل |
|---|---|---|
| Postgres backup | ✅ | `backup-postgres.sh` |
| Storage backup | ✅ | `backup-storage.sh` |
| Env/secrets backup | ✅ | `backup-env-secrets.sh` (age-encrypted) |
| Restore script | ✅ | `restore-postgres.sh`, `restore-storage.sh` |
| Verify restore | ✅ | `verify-restore.sh` |
| Retention/cleanup | ✅ | `cleanup-old-backups.sh` + `cron.example` |
| Offsite plan | ✅ نمونه | `offsite-sync.example.sh` (rclone-based) |
| Monthly drill SOP | ✅ | `restore-drill.md` |
| Smoke test پس از restore | ✅ | `deploy/migration/scripts/smoke-test.sh` |
| **اجرا تست شده؟** | ❌ | هرگز روی production/staging واقعی |

---

## 11) Internet Resilience (Iran national + International)

| Dependency | فایل | نوع | اقدام در شبکه ملی |
|---|---|---|---|
| Lovable AI Gateway (OCR) | `src/lib/receipt-ocr*.functions.ts` | C — required when used | feature flag `OCR_ENABLED`؛ یا fallback به ورود دستی |
| ACME / Let's Encrypt | Caddy | معمولاً قابل دسترس، گاهی ناپایدار | `Caddyfile` snippet manual TLS آماده است |
| GitHub container registry | فقط زمان pull image | A در سرور (هنگام release) | از mirror ایرانی یا VPN فقط هنگام `docker pull` |
| GitHub git pull | فقط هنگام release | A در سرور | mirror/proxy fallback |
| External fonts/CDN/maps/sentry | — | — | **یافت نشد** ✅ |
| SMTP خارجی | env-based | B | از SMTP داخلی (مثلاً sendinblue ایرانی) قابل تعویض |

**جمع‌بندی:** runtime روزمره روی شبکه ملی کار می‌کند. release/update نیاز به international دارد (فقط برای docker pull و git fetch).

---

## 12) لپ‌تاپ شخصی برای تست محلی

| مورد | حداقل | بهتر |
|---|---|---|
| OS | Ubuntu 22.04 / Win11+WSL2 / macOS 13+ | Ubuntu 22.04 |
| Docker | Desktop یا Engine + Compose v2 | Engine روی Linux native |
| RAM | 8 GB | 16 GB |
| CPU | 4 core | 6+ core |
| Disk | 30 GB free SSD | 60 GB NVMe |
| Node/Bun | Node 20 + Bun 1.1+ | همان |
| پورت‌های آزاد | 80, 443, 3000, 5432 | همان |
| local DNS | hosts: `127.0.0.1 app.afrakala.local api.afrakala.local studio.afrakala.local` | همان |
| TLS dev | HTTP-only (Caddy `tls internal`) | local CA |

سرویس‌های سنگین: Postgres + Studio + Kong + GoTrue + Storage + app — مجموعاً **حدود 2.5–3 GB RAM** زمان idle.

---

## 13) سرور Linux (سه tier)

| Tier | CPU | RAM | SSD | Backup disk | Bandwidth | OS | Swap | Backup server جداگانه؟ |
|---|---|---|---|---|---|---|---|---|
| **A. تست/Staging** | 2 vCPU | 4 GB | 60 GB | — | 1 TB/m | Ubuntu 22.04 | 4 GB | خیر |
| **B. Production کوچک** | 4 vCPU | 8 GB | 100 GB NVMe | 200 GB external | 3 TB/m | Ubuntu 22.04 LTS | 8 GB | اختیاری (offsite rclone) |
| **C. Production امن** | 8 vCPU | 16 GB | 200 GB NVMe | 500 GB جدا + offsite | 5 TB/m | Ubuntu 22.04 LTS | 8 GB | بله، یا S3 ایرانی |

**موارد عمومی:**
- DC ایران (آروان/پارس‌پک/آسیاتک) → latency بهینه برای کاربر، چالش ACME.
- DC خارج (Hetzner/Contabo) → ACME راحت، latency 100-300ms از ایران.
- UFW: فقط 22, 80, 443. fail2ban فعال.
- DNS: A record + CAA. CDN ایرانی اختیاری برای static.

---

## 14) Workflow توسعه آینده

```
┌────────┐    auto    ┌────────┐    Actions   ┌──────────┐    SSH+manual   ┌──────────┐
│ Lovable │──sync────→│ GitHub │─────build───→│  GHCR    │────pull──────→│  Server  │
└────────┘             │  main  │              │ image    │                │ (compose)│
                       └────────┘              └──────────┘                └──────────┘
```

- **Branch strategy توصیه‌شده:** فقط `main` در ابتدا (KISS). وقتی تیم رشد کرد: `main` (production) + `develop` (Lovable sync) + `feature/*`.
- **Lovable→GitHub:** auto sync دو طرفه فعال است.
- **Build:** GitHub Actions روی هر push به main → GHCR `:latest` و `:sha-<commit>`.
- **Deploy:** **دستی** روی سرور (`docker compose pull web && up -d web`). دلیل: هیچ secret production در GitHub نیست؛ هیچ runner خارجی به DB دست نمی‌زند.
- **Migration:** کاملاً دستی (`bash deploy/migration/scripts/apply-project-migrations.sh`). چک backup قبل از هر migration الزامی.
- **Rollback اپ:** ساده — `docker compose pull web --tag=:sha-<old>`.
- **Rollback DB:** سخت — هر migration باید reversible باشد، یا restore از pg_dump.

پیشنهاد فعلی: **manual** برای ۳ ماه اول، بعد **semi-auto** با GitHub Actions که فقط image را push می‌کند ولی deploy را webhook‌محور می‌کند.

---

## 15) تغییرات لازم — اولویت‌بندی شده

### P0 (قبل از هر deploy واقعی)
- **حذف `.env` ریشه از git** و افزودن `.env` به فایل‌های ignore-only (نه commit شده). انجام: `git rm --cached .env` در sandbox محلی کاربر.
- **حذف یا بازنویسی `docker-compose.yml` ریشه** تا با `deploy/app/` تداخل نکند.
- **OCR feature flag**: متغیر `OCR_ENABLED` (default=false در self-host) — وقتی false باشد UI پیام «OCR در این محیط فعال نیست، لطفاً دستی وارد کنید» نشان دهد.
- **یک‌بار smoke-test کامل** روی laptop:
  ```
  docker network create afrakala-net
  docker compose -f deploy/supabase/docker-compose.yml up -d
  bash deploy/migration/scripts/apply-project-migrations.sh
  docker compose -f deploy/proxy/docker-compose.yml up -d
  docker compose -f deploy/app/docker-compose.yml up -d
  bash deploy/migration/scripts/smoke-test.sh
  ```

### P1 (قبل از production)
- TLS strategy نهایی (ACME یا manual).
- Cron backup فعال + اولین offsite sync.
- اولین monthly restore drill.
- مهاجرت داده Cloud→self-host طبق `cutover-checklist.md`.
- مستندسازی `deploy/app/.env.production` با همه متغیرها.

### P2 (پس از production)
- حذف `wrangler.jsonc` و `@cloudflare/vite-plugin` پس از قطع کامل از Lovable preview (یا نگه‌داشتن برای مسیر dual-mode).
- Tesseract محلی برای OCR.
- Monitoring stack (uptime-kuma + Loki/Grafana).
- branch strategy `develop`/`main`.

---

## 16) فایل‌های بررسی‌شده (مدرک)

```
.gitignore, .dockerignore, .env, .env.example, Dockerfile,
docker-compose.yml, vite.config.ts, wrangler.jsonc, package.json,
server/node-entry.mjs,
src/integrations/supabase/{client.ts,client.server.ts,auth-middleware.ts,types.ts},
src/lib/auth/AuthProvider.tsx,
src/lib/receipt-ocr.functions.ts, src/lib/receipt-ocr-bytes.functions.ts,
src/routes/api.healthz.ts, src/routes/api.public.bot.products.ts,
src/shared/components/FeedbackAttachmentUploader.tsx,
src/components/accounting/PaymentReceiptDocuments.tsx,
src/lib/shop/settings.ts, src/lib/sales/quote-share.ts,
supabase/config.toml, supabase/migrations/* (184 file، نمونه‌برداری شد),
deploy/app/{docker-compose.yml,.env.production.example,README.md},
deploy/proxy/{docker-compose.yml,Caddyfile.example,.env.example,README.md},
deploy/supabase/{docker-compose.yml,kong.yml.example,.env.example,README.md},
deploy/backups/scripts/* (۱۲ فایل),
deploy/migration/scripts/* (۱۰ فایل),
docs/{AFRAKALA_ACCEPTANCE_CRITERIA.md,SELF_HOSTING.md,OPERATIONS_QUICK_REFERENCE.md,SELF_HOST_ROADMAP_FA.md},
.github/workflows/build-image.yml,
public/fonts/vazirmatn/
```

## 17) دستورات اجراشده (همه فقط read-only)

```
ls، cat، head، sed -n، rg (ripgrep)، wc -l
```

## 18) دستورات اجرا **نشده** و چرا

| دستور | دلیل |
|---|---|
| `docker compose up` | حالت plan mode — هیچ side-effect |
| `bash deploy/migration/scripts/*.sh` | همان دلیل + داده production |
| `pg_dump` / `pg_restore` | داده زنده |
| `git rm --cached .env` | تغییر state — کاربر باید خودش انجام دهد |
| `bun install` / `bun run build` | build/state change |
| migration tool | هیچ تغییر schema لازم نیست در این فاز |

---

## 19) فازهای بعدی Lovable (اعتبار-جو)

برای حفظ credit، هر prompt را کوچک نگه دار. ترتیب پیشنهادی:

| فاز | عنوان | اسکوپ | تخمین credit |
|---|---|---|---|
| **SH-RA.2** | فقط P0 cleanup | حذف `docker-compose.yml` ریشه + اضافه‌کردن feature-flag `OCR_ENABLED` در دو فایل OCR + UI پیام | کوچک |
| **SH-RA.3** | تست محلی روی laptop (دستی، بدون Lovable) | کاربر خودش روی لپ‌تاپ smoke-test می‌کند طبق `SELF_HOST_ROADMAP_FA.md` | صفر |
| **SH-RA.4** | اضافه کردن `OCR_ENABLED` به `deploy/app/.env.production.example` و document | فقط 2 فایل docs | خیلی کوچک |
| **SH-RA.5** | `.env` ریشه پاک‌سازی (راهنما به کاربر) + بازبینی `wrangler.jsonc` (نگه یا حذف؟) | با ask_questions تصمیم‌گیری | خیلی کوچک |
| **SH-RA.6** | Cutover واقعی Cloud → self-host | روی سرور توسط کاربر، Lovable فقط راهنمایی | صفر |
| **SH-RA.7** | (اختیاری بعداً) Tesseract OCR محلی | کوچک تا متوسط | متوسط |

---

> **Do not proceed to implementation until this report is reviewed.**
> **No code was modified in this audit.**
> **No data, auth users, storage files, migration, backup or restore was executed.**
