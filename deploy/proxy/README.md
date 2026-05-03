# AfraKala — Caddy Reverse Proxy (Phase SH.4)

این stack فقط یک reverse proxy سبک با Caddy است. **تنها سرویسی که به اینترنت expose می‌شود همین است** (پورت‌های 80 و 443). اپلیکیشن `web` و سرویس‌های Supabase باید فقط داخل شبکه docker `afrakala-net` بمانند و هرگز روی host پورت publish نکنند.

## ساختار

```
deploy/proxy/
├── docker-compose.yml      # سرویس caddy
├── Caddyfile.example       # نمونه پیکربندی (commit می‌شود)
├── Caddyfile                # نسخه واقعی (در .gitignore)
├── .env.example             # نمونه متغیرها (commit می‌شود)
├── .env                     # مقادیر واقعی روی سرور (در .gitignore)
└── certs/                   # فقط روی سرور — هرگز commit نشود
```

## آماده‌سازی

```bash
# 1) شبکه مشترک (یک‌بار)
docker network create afrakala-net

# 2) کپی فایل‌های نمونه
cp deploy/proxy/Caddyfile.example deploy/proxy/Caddyfile
cp deploy/proxy/.env.example     deploy/proxy/.env
chmod 600 deploy/proxy/.env

# 3) دامنه‌ها و مقادیر را در Caddyfile و .env ویرایش کنید
```

## اجرا

```bash
cd deploy/proxy
docker compose up -d
```

## مشاهده log

```bash
docker compose logs -f caddy
```

## reload بدون downtime

```bash
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

## تست از داخل proxy

```bash
docker compose exec caddy wget -qO- http://web:3000/api/healthz
```

---

## SSL / TLS

### حالت A — ACME خودکار

پیش‌فرض Caddy گواهی را از Let's Encrypt یا ZeroSSL می‌گیرد. کافی است در بالای `Caddyfile` ایمیل ادمین تنظیم شود. این مسیر سریع‌ترین حالت است **اگر** سرور به ACME endpoint دسترسی داشته باشد.

### حالت B — Manual certificate (مسیر ایران-safe)

اگر دسترسی به Let's Encrypt پایدار نیست، گواهی را خارج از repo تهیه کنید (CA داخلی، DV ایرانی، یا ZeroSSL با DNS challenge):

1. فایل‌های `fullchain.pem` و `privkey.pem` را روی سرور در `deploy/proxy/certs/<domain>/` قرار دهید.
2. در هر site بلاک‌های مربوط به `tls` را در `Caddyfile` فعال کنید (نمونه‌ها در `Caddyfile.example` به‌صورت comment موجود است).
3. هرگز فایل گواهی یا کلید را در git قرار ندهید — این مسیر در `.gitignore` نادیده گرفته می‌شود.

---

## دسترسی به Studio (هشدار امنیتی)

- **بهترین گزینه:** Studio را اصلاً publish نکنید و فقط از طریق SSH tunnel به آن وصل شوید:

  ```bash
  ssh -L 3001:studio:3000 user@server
  # سپس در مرورگر: http://localhost:3001
  ```

- اگر چاره‌ای نیست:
  - حتماً `ADMIN_ALLOWED_IP` را روی IP ثابت ادمین تنظیم کنید.
  - Basic auth فعال نگه دارید (`STUDIO_BASIC_AUTH_USER` + `STUDIO_BASIC_AUTH_HASH`).
  - hash را روی سرور با دستور زیر تولید کنید:

    ```bash
    docker compose exec caddy caddy hash-password
    ```

  - رمز واقعی یا hash آن را هرگز در ریپو commit نکنید.

---

## قواعد امنیتی این stack

- فقط پورت‌های `80` و `443` روی host expose می‌شوند.
- `web`, `kong`, `db`, `studio` نباید پورتی روی host داشته باشند.
- هیچ secret واقعی، گواهی، یا کلید خصوصی در ریپو قرار نگیرد.
- Basic auth و IP allowlist روی Studio همیشه فعال باشد.
- Security headers پایه (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `HSTS`) به‌صورت snippet در `Caddyfile.example` تعریف شده است.
- compression (`gzip`/`zstd`) فعال است تا با اینترنت ملی ایران سازگار باشد.

---

## محدوده این فاز

- این فاز فقط **scaffold** است: Supabase stack، migration، Auth users، Storage files، یا SSL واقعی production در این فاز ساخته/منتقل/صادر نمی‌شود.
- سرویس‌های `kong` و `studio` که در `Caddyfile.example` آمده‌اند، در فاز SH.5 با supabase stack بالا می‌آیند.