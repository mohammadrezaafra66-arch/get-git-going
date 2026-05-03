## فاز SH.2 — نقشه معماری استقرار Self-Host افراکالا

گزارش معماری است. هیچ کد، migration یا فایل پیکربندی تغییر نمی‌کند.

---

### ۱) ساختار پوشه‌ها روی سرور Linux

```text
/opt/afrakala/
├─ app/
│  ├─ docker-compose.yml          # فقط سرویس web app (TanStack SSR، پورت 3000 داخلی)
│  ├─ .env                        # VITE_* + SUPABASE_URL داخلی
│  └─ image/                      # Dockerfile build context (یا pull از registry خصوصی)
│
├─ supabase/
│  ├─ docker-compose.yml          # کلون از supabase/docker (نسخه stable پین‌شده)
│  ├─ .env                        # POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, SMTP_*
│  ├─ volumes/
│  │  ├─ db/data/                 # دیتای Postgres
│  │  ├─ storage/                 # فایل‌های bucketها
│  │  ├─ api/kong.yml             # روتر Kong
│  │  └─ functions/               # خالی (استفاده نمی‌کنیم)
│  └─ migrations/                 # کپی از repo برای اجرای دستی
│
├─ proxy/                         # Caddy (پیشنهاد اصلی) — ساده‌ترین SSL
│  ├─ Caddyfile
│  └─ data/                       # گواهی‌های ACME
│
├─ backups/
│  ├─ pg/                        # daily pg_dump -Fc
│  ├─ storage/                   # rsync/restic snapshot
│  ├─ env/                       # نسخه رمزشده env (sops/age)
│  └─ scripts/                   # backup.sh, restore.sh, verify.sh
│
└─ logs/
   ├─ app/
   ├─ supabase/
   └─ proxy/
```

سه stack (`app`, `supabase`, `proxy`) compose مجزا و شبکه docker مشترک خارجی `afrakala-net` دارند تا مستقل به‌روزرسانی شوند.

---

### ۲) سرویس‌های Docker

**Stack `app`:**
| سرویس | تصویر | پورت | یادداشت |
|---|---|---|---|
| `web` | build از Dockerfile پروژه | 3000 داخلی | TanStack Start SSR (Node 20). فقط در شبکه داخلی |

**Stack `supabase` (کلون از supabase/docker):**
| سرویس | لازم؟ | دلیل |
|---|---|---|
| `db` (Postgres 15) | ✅ | پایگاه‌داده اصلی |
| `auth` (GoTrue) | ✅ | `supabase.auth` ایمیل/رمز |
| `rest` (PostgREST) | ✅ | کلاینت اپ مستقیم کوئری می‌زند |
| `storage` (storage-api) | ✅ | bucket `payment-receipt-documents` |
| `kong` | ✅ | gateway استاندارد |
| `meta` (postgres-meta) | ✅ | لازم برای Studio |
| `studio` | ⚠️ اختیاری | فقط bind روی `127.0.0.1` و SSH tunnel |
| `realtime` | ❌ | استفاده نمی‌شود — غیرفعال شود |
| `imgproxy` | ❌ | استفاده نمی‌شود |
| `edge-functions` (Deno) | ❌ | اپ از `createServerFn` استفاده می‌کند |
| `analytics` (Logflare) | ❌ | حذف برای کاهش بار |
| `vector` | ❌ | حذف |
| `inbucket` | ❌ پروداکشن | فقط dev |

**Stack `proxy`:**
| سرویس | پورت | یادداشت |
|---|---|---|
| `caddy` | 80, 443 | تنها سرویس exposed به اینترنت |

**Stack `backups`:**
| سرویس | یادداشت |
|---|---|
| `ofelia` یا host cron | اجرای روزانه `pg_dump`, `rsync storage`, چرخش لاگ |

---

### ۳) دامنه‌ها و URLها

پیشنهاد تک‌دامنه با subdomain:
- `app.afrakala.ir` → Caddy → `web:3000`
- `api.afrakala.ir` → Caddy → `kong:8000` (Auth + REST + Storage پشت یک دامنه)
- `studio.afrakala.ir` → فقط داخل VPN/IP allowlist یا SSH tunnel، بدون exposure عمومی

`VITE_SUPABASE_URL` در build = `https://api.afrakala.ir`.

**سازگاری اینترنت ایران:**
- همه دامنه‌ها روی IP داخلی ایران میزبانی شوند (نه Cloudflare، نه CDN خارجی).
- گزینه LAN-only: Caddy روی IP خصوصی + DNS داخلی + گواهی self-signed یا CA داخلی.
- Let’s Encrypt ممکن است در ایران محدود باشد؛ گزینه‌ها: ZeroSSL، گواهی DV ایرانی، یا CA داخلی mount در Caddy.

---

### ۴) متغیرهای محیطی

**Frontend (build-time، در `app/.env`):**
```
VITE_SUPABASE_URL=https://api.afrakala.ir
VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY>
VITE_SUPABASE_PROJECT_ID=afrakala-self
```

**App SSR (runtime):**
```
SUPABASE_URL=http://kong:8000          # داخل docker network
SUPABASE_PUBLISHABLE_KEY=<ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>   # فقط سرور
LOVABLE_API_KEY=<اختیاری؛ تا فاز حذف OCR>
```

**Supabase stack (در `supabase/.env`):**
```
POSTGRES_PASSWORD=
JWT_SECRET=                           # ≥ 32 کاراکتر
ANON_KEY=                             # JWT امضاشده با JWT_SECRET
SERVICE_ROLE_KEY=                     # JWT امضاشده با JWT_SECRET
SITE_URL=https://app.afrakala.ir
ADDITIONAL_REDIRECT_URLS=
DISABLE_SIGNUP=false
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_SENDER_NAME="افراکالا"
SMTP_ADMIN_EMAIL=
DASHBOARD_USERNAME=
DASHBOARD_PASSWORD=
```

**حساس (هرگز به فرانت نرود):**
`SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `POSTGRES_PASSWORD`, `SMTP_PASS`, `DASHBOARD_PASSWORD`, `LOVABLE_API_KEY`.

نمونه `*.env.example` بدون مقدار واقعی در ریپو git؛ مقادیر واقعی روی سرور با مالکیت `root:600` و backup رمزشده (sops/age).

---

### ۵) شبکه و امنیت

**پورت‌های exposed به اینترنت:** فقط `80` و `443` (Caddy).
**پورت‌های داخلی (در docker network):** Postgres 5432، Kong 8000، web 3000، meta 8080.

**شبکه:**
- `afrakala-net` (bridge، external) — همه stackها متصل.
- Postgres روی هیچ پورت host bind نشود.

**Firewall (ufw / nftables):**
```
allow 22/tcp   from <admin-ip>
allow 80/tcp
allow 443/tcp
deny  incoming default
allow outgoing default
```

**SSL:**
- مسیر اول: Caddy + ACME (ZeroSSL یا Let’s Encrypt اگر دسترس‌پذیر).
- مسیر دوم (ایران-safe): گواهی صادرشده توسط CA داخلی یا گواهی DV ایرانی، mount در Caddy.

**محدودسازی Studio:**
- بدون publish پورت روی host.
- دسترسی فقط از طریق `ssh -L 3001:studio:3000 user@server` و `http://localhost:3001`.
- یا Caddy روی `studio.afrakala.ir` با `basicauth` + IP allowlist.

**حفاظت Service Role Key:**
- فقط در `app/.env` (سرور SSR) و `supabase/.env`.
- چون پیشوند `VITE_` ندارد، خودکار از باندل کلاینت خارج است.
- Audit پیش از deploy: `grep -r SERVICE_ROLE` روی dist باید خالی برگردد.

**Hardening Postgres:**
- `pg_hba.conf` فقط از داخل docker network.
- پسوردهای قوی، چرخش `JWT_SECRET` هر ۶ ماه (با re-issue کلیدهای ANON/SERVICE).

---

### ۶) Backup

| هدف | ابزار | تناوب | نگهداری |
|---|---|---|---|
| Postgres | `pg_dump -Fc -j 2` داخل کانتینر db | روزانه ۰۲:۰۰ | ۱۴ روز local + ۳۰ روز offsite |
| Storage volume | `restic` (یا rsync + tar) از `volumes/storage` | روزانه ۰۲:۳۰ | همان |
| env/secrets | `sops` با کلید `age` | هنگام تغییر + هفتگی | نامحدود (encrypted) |
| migrations | git (در ریپو) | هر تغییر | نامحدود |

**Offsite:** سرور دوم داخل ایران (آروان/پارس‌پک) با `rclone` روی WebDAV یا S3-compatible.

**Restore-test:** اسکریپت ماهانه `verify-restore.sh` یک کانتینر موقت بالا می‌آورد، آخرین dump را restore می‌کند، تعداد رکوردهای `payment_receipts`, `profiles`, `user_roles`, `payment_receipt_documents` را با پروداکشن مقایسه و گزارش می‌دهد.

---

### ۷) مسیر مهاجرت از Lovable Cloud

**۷.۱ Migrations:**
- پس از بالا آمدن `db`، اجرای ترتیبی همه ۱۲۹ فایل:
  ```
  for f in supabase/migrations/*.sql; do psql -f "$f"; done
  ```
- یا `supabase db push` (CLI) با `supabase/config.toml` موجود.

**۷.۲ Auth users:**
- روی Lovable Cloud با service role، `pg_dump --data-only -t auth.users -t auth.identities`.
- روی self-host پس از init، restore. هش‌های bcrypt سازگار → کاربران بدون reset لاگین می‌کنند.
- پس از تست، ایمیل اطلاع‌رسانی + reset اختیاری.

**۷.۳ Storage files:**
- اسکریپت Node با service role: list همه objectهای bucket `payment-receipt-documents`، download، upload با همان `path` به self-host.
- بدون تغییر `storage_path` در دیتابیس → لینک‌های موجود کار می‌کنند.
- اعتبارسنجی: sha256 مبدا/مقصد + شمارش رکورد.

**۷.۴ Rebuild اپ:**
- `app/.env` با `VITE_SUPABASE_URL=https://api.afrakala.ir` و `ANON_KEY` جدید.
- `docker compose -f app/docker-compose.yml build --no-cache web && up -d`.
- DNS cutover پس از smoke test.

**۷.۵ ترتیب اجرا (downtime ~۳۰ دقیقه):**
```
1) freeze writes روی Lovable Cloud (maintenance flag)
2) dump auth + data + storage
3) restore روی self-host
4) verify
5) DNS switch
6) unfreeze
```

---

### ۸) استراتژی وابستگی‌های خارجی (فقط گزارش)

**OCR رسید (`ai.gateway.lovable.dev`):**
- وضعیت: تنها وابستگی خارجی فعال در رانتایم. در ایران فیلتر/کند است.
- استراتژی پیشنهادی برای فاز بعد (نه اکنون):
  - گزینه A: Tesseract.js در سرور SSR (fa+eng)، رایگان، کیفیت متوسط.
  - گزینه B: PaddleOCR/EasyOCR در سرویس Python جدا (کیفیت بالاتر).
  - گزینه C: API ایرانی (هم‌راوش/پارس‌AI) با کلید سرور-only.
  - گزینه D: Feature flag `OCR_ENABLED=false` + ورودی دستی به‌عنوان fallback.
- در SH.2 هیچ تغییری اعمال نمی‌شود.

**سایر external:**
- لینک‌های UI به `wa.me`, `eitaa.com`, `ble.ir`, `rubika.ir` — anchor هستند، روی عملکرد بی‌اثر، نگه‌داری شود.
- `cdn.gpteng.co` فقط در dev/preview Lovable. در باندل پروداکشن خودکار حذف می‌شود؛ preconnect باقی‌مانده در `__root.tsx` در فاز SH.3 پاک می‌شود.

---

### ۹) استراتژی Docker Compose (سه stack مجزا)

```text
docker network create afrakala-net   # یک‌بار

docker compose -f /opt/afrakala/supabase/docker-compose.yml up -d
docker compose -f /opt/afrakala/app/docker-compose.yml up -d
docker compose -f /opt/afrakala/proxy/docker-compose.yml up -d
```

مزیت تفکیک:
- آپدیت Supabase بدون restart اپ.
- rollback مستقل proxy.
- backup/restore فقط روی stack دیتابیس.

Healthchecks:
- `web`: `wget -qO- http://localhost:3000/ || exit 1`
- `kong`: `curl -f http://localhost:8000/`
- `db`: `pg_isready -U postgres`

---

### ۱۰) فازهای پیشنهادی بعدی

| فاز | عنوان | خروجی | ریسک |
|---|---|---|---|
| **SH.3** | پاکسازی build برای Node-only + حذف preconnect خارجی + Healthcheck Docker | `vite.config.ts`, `__root.tsx`, `docker-compose.yml` | متوسط |
| **SH.4** | ایجاد stack `proxy` (Caddyfile نمونه) و راهنمای SSL | `deploy/proxy/` | پایین |
| **SH.5** | ایجاد stack `supabase` (نسخه پین‌شده supabase/docker با سرویس‌های لازم) | `deploy/supabase/` | متوسط |
| **SH.6** | جایگزینی OCR خارجی (Tesseract.js + flag) | `src/server/receipt-ocr.functions.ts` | متوسط |
| **SH.7** | اسکریپت‌های مهاجرت Auth + Storage | `deploy/migration/` | متوسط |
| **SH.8** | اسکریپت‌های Backup + Restore + Verify | `deploy/backups/` | پایین |
| **SH.9** | Runbook فارسی استقرار + Operations + Disaster Recovery | `docs/SELF_HOSTING.md` | پایین |

---

### ۱۱) ریسک‌ها و بلاکرها

| مورد | ریسک | کاهش |
|---|---|---|
| دسترسی Let’s Encrypt از ایران | متوسط | ZeroSSL یا گواهی DV داخلی |
| سازگاری نسخه GoTrue با hashهای فعلی | پایین (هر دو bcrypt) | تست restore در staging |
| build اپ روی Node-only با Cloudflare plugin موجود | متوسط | SH.3 تأیید build روی Linux |
| حجم image سرویس‌های Supabase (~۱.۵GB) | پایین | pull-once، registry mirror در صورت نیاز |
| pg_cron در self-host همیشه قابل نصب نیست | پایین | کد فعلی fallback دارد |
| OCR خارجی تا SH.6 فعال می‌ماند | متوسط | flag `OCR_ENABLED` در همان فاز |

---

### ۱۲) نقش‌ها

**Lovable در فازهای بعد می‌سازد:**
- پیکربندی `vite.config.ts` Node-only + healthcheck Docker.
- نمونه `Caddyfile`، `docker-compose.yml` پراکسی، supabase stack.
- اسکریپت مهاجرت Auth/Storage و Backup.
- جایگزین OCR محلی.
- مستندات runbook فارسی.

**روی سرور دستی:**
- نصب OS، Docker، Docker Compose.
- DNS و گواهی SSL (یا CA داخلی).
- پر کردن `.env` با مقادیر واقعی + قفل دسترسی فایل.
- اجرای اولیه stackها به ترتیب، اجرای migrationها.
- پیکربندی firewall و SSH hardening.
- کرون‌های backup و آزمون restore ماهانه.

---

منتظر تأیید برای ورود به **SH.3** (پاکسازی build و پراکسی) هستم.
