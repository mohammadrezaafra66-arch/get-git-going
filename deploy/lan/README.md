# AfraKala — LAN Pilot Deployment

اجرای آزمایشی AfraKala روی یک لپ‌تاپ داخل شبکه شرکت، بدون Caddy، بدون SSL و بدون دامنه. مخصوص تست ۱ تا ۲ ماهه داخلی.

## ۱. هدف LAN Pilot

- اجرای کامل اپ و Supabase موردنیاز روی یک لپ‌تاپ با Docker.
- دسترسی همکاران داخل شبکه شرکت با مرورگر از طریق IP لپ‌تاپ.
- چرخه سریع update از Lovable → GitHub → لپ‌تاپ.
- این فاز **production نیست**.

## ۱.۵ اجرای واقعی روی لپ‌تاپ شرکت — مسیر پیشنهادی

مسیر سریع و قابل تکرار برای راه‌اندازی روی لپ‌تاپ داخل شرکت (IP پیش‌فرض `192.168.170.10`):

1. نصب [Git for Windows](https://git-scm.com/download/win).
2. نصب [Docker Desktop](https://www.docker.com/products/docker-desktop) و یک بار اجرای آن.
3. clone کردن repo در یک مسیر بدون فاصله، مثلاً `C:\afrakala`:

   ```powershell
   git clone <repo-url> C:\afrakala
   cd C:\afrakala
   ```

4. اجازه موقت اجرای اسکریپت در همین session:

   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   ```

5. نمایش IPهای لپ‌تاپ و تأیید `192.168.170.10`:

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\show-ip.ps1
   ```

6. آماده‌سازی `.env.lan` و kong و secretها (Enter بزنید تا IP پیش‌فرض `192.168.170.10` استفاده شود):

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\init-lan.ps1
   ```

   این اسکریپت `POSTGRES_PASSWORD`، `JWT_SECRET`، `ANON_KEY` و `SERVICE_ROLE_KEY` را در صورت خالی بودن خودش تولید می‌کند. مقادیر در console چاپ نمی‌شوند.

7. باز کردن پورت‌های Firewall فقط با **PowerShell Admin**:

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\firewall-lan-admin.ps1
   ```

   بعد از موفقیت، این پنجره Admin را ببندید.

8. build و اجرای stack با PowerShell **عادی**:

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\update-lan.ps1
   ```

9. بررسی سلامت:

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\check-lan.ps1
   ```

10. اعلام آدرس به همکاران:

    ```
    http://192.168.170.10:3000
    ```

### آپدیت روزهای بعد

بعد از هر تغییر در Lovable و sync روی GitHub، روی لپ‌تاپ کافی است:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\update-lan.ps1
```

### هشدارها

- این deployment فقط داخل شبکه شرکت است؛ روی اینترنت عمومی expose نشود.
- روی router هیچ port forwarding انجام نشود.
- بدون SSL است و برای production نهایی نیست (production از `deploy/supabase` + `deploy/proxy` استفاده می‌کند).
- فایل `deploy/lan/.env.lan` هرگز commit نشود.

## ۲. تفاوت با Production Self-host

| موضوع | LAN Pilot (این فاز) | Production (`deploy/supabase`, `deploy/proxy`) |
|---|---|---|
| Reverse proxy | ندارد | Caddy |
| SSL/TLS | ندارد، فقط HTTP | دارد، Let's Encrypt |
| دامنه | ندارد، فقط IP داخلی | دامنه عمومی |
| Publish پورت | `3000` و `8000` روی LAN | فقط `80/443` از طریق Caddy |
| دیتا | تست، migration واقعی ندارد | backup/restore واقعی |
| Studio | پیش‌فرض خاموش، فقط با profile | پشت Caddy basic_auth |
| هدف | تست داخلی شرکت | استقرار نهایی |

این stack جدا از `deploy/supabase` است و آن را تغییر نمی‌دهد. فقط فایل‌های init و `kong.yml` به‌صورت read-only از آن مشترک استفاده می‌شوند تا duplication نباشد.

## ۳. پیش‌نیازهای لپ‌تاپ

- Windows 10 یا 11
- [Docker Desktop](https://www.docker.com/products/docker-desktop) (با WSL2 توصیه می‌شود)
- Git for Windows
- اتصال کابل LAN یا Wi-Fi به شبکه شرکت
- یک **IP ثابت داخلی** برای لپ‌تاپ (ترجیحاً static lease روی روتر)

## ۴. پیدا کردن IP لپ‌تاپ

```powershell
powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\show-ip.ps1
```

IP اینترفیس متصل به شبکه شرکت را یادداشت کنید (مثلاً `192.168.1.50`).

## ۵. ساخت `.env.lan`

```powershell
Copy-Item deploy\lan\.env.lan.example deploy\lan\.env.lan
notepad deploy\lan\.env.lan
```

مقادیر زیر را پر کنید:

- `LAN_HOST_IP` = IP لپ‌تاپ (از مرحله ۴)
- `VITE_SUPABASE_URL` = `http://<LAN_HOST_IP>:8000`
- `SITE_URL` = `http://<LAN_HOST_IP>:3000`
- `API_EXTERNAL_URL` = `http://<LAN_HOST_IP>:8000`
- `ADDITIONAL_REDIRECT_URLS` = `http://<LAN_HOST_IP>:3000,http://localhost:3000`
- `POSTGRES_PASSWORD`، `JWT_SECRET`، `ANON_KEY`، `SERVICE_ROLE_KEY`، `VITE_SUPABASE_PUBLISHABLE_KEY`، `SUPABASE_PUBLISHABLE_KEY` با ابزار رسمی Supabase تولید کنید.

> ⚠️ `.env.lan` در `.gitignore` ignore شده است. هرگز آن را commit نکنید.

## ۶. تنظیم `LAN_HOST_IP`

مقدار `LAN_HOST_IP` باید با IP فعلی لپ‌تاپ روی شبکه شرکت یکی باشد. اگر IP عوض شد، باید `.env.lan` را به‌روزرسانی کرده و دوباره build کنید (چون `VITE_SUPABASE_URL` در زمان build داخل bundle قرار می‌گیرد).

> اگر `APP_PORT` یا `SUPABASE_API_PORT` را تغییر دادید، اسکریپت‌های `update-lan.ps1` و `check-lan.ps1` مقدارها را از `.env.lan` می‌خوانند و health check و آدرس‌های نمایش‌داده‌شده با همان portها تطبیق پیدا می‌کنند. در حالت پیش‌فرض آدرس کاربران `http://LAN_HOST_IP:3000` و API روی `http://LAN_HOST_IP:8000` است.

## ۷. اجرای اولیه

ابتدا `kong.yml` را از example بسازید (یک بار):

```powershell
New-Item -ItemType Directory -Force deploy\supabase\volumes\api | Out-Null
Copy-Item deploy\supabase\kong.yml.example deploy\supabase\volumes\api\kong.yml
```

سپس:

```powershell
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan build
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan up -d
```

یا کوتاه‌تر:

```powershell
powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\update-lan.ps1
```

## ۸. آپدیت بعد از تغییر در Lovable/GitHub

```powershell
powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\update-lan.ps1
```

این اسکریپت: `git pull` → `docker compose build` → `up -d` → health check.

## ۹. آدرس کاربران

همکاران داخل شبکه شرکت با مرورگر می‌توانند به آدرس زیر بروند:

```
http://<LAN_HOST_IP>:3000
```

## ۱۰. پورت‌هایی که در Windows Firewall باید باز شوند

- TCP **3000** (اپ)
- TCP **8000** (Supabase API / Kong)

مثال (PowerShell Admin):

```powershell
New-NetFirewallRule -DisplayName "AfraKala LAN App"       -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow -Profile Private,Domain
New-NetFirewallRule -DisplayName "AfraKala LAN Supabase"  -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Private,Domain
```

> فقط روی پروفایل `Private`/`Domain` باز کنید، نه `Public`.

## ۱۱. هشدارهای امنیتی ⚠️

- این deployment **فقط برای شبکه داخلی شرکت** است.
- بدون SSL است؛ ترافیک رمزنگاری نمی‌شود.
- **به اینترنت عمومی expose نکنید.** Port forwarding روی روتر انجام ندهید.
- IP عمومی به لپ‌تاپ ندهید.
- secret واقعی (`.env.lan`) را commit نکنید.
- Studio به‌صورت پیش‌فرض خاموش است. اگر روشن کردید (`--profile studio`)، فقط روی `127.0.0.1:3001` در دسترس است نه روی LAN.
- Postgres روی LAN publish نمی‌شود. برای debug می‌توانید خط `ports` در `docker-compose.yml` را uncomment کنید (`127.0.0.1:5432:5432`).

## ۱۲. خاموش کردن

```powershell
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan down
```

برای پاک کردن دیتا (⚠️ غیرقابل بازگشت):

```powershell
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan down -v
```

## ۱۳. دیدن log

```powershell
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan logs -f
# یا فقط یک سرویس
docker compose -f deploy\lan\docker-compose.yml --env-file deploy\lan\.env.lan logs -f web
```

## ۱۴. Rebuild

```powershell
powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\update-lan.ps1
```

## ۱۵. بررسی وضعیت

```powershell
powershell -ExecutionPolicy Bypass -File deploy\lan\scripts\check-lan.ps1
```

## ۱۶. RBAC و کنترل دسترسی

کنترل دسترسی کاربران داخل اپ همان RBAC فعلی AfraKala است (جدول `user_roles` + `has_role()`). این deployment فقط مسیر شبکه را فراهم می‌کند و امنیت ورود و نقش‌ها از داخل اپ کنترل می‌شود. این مسیر نباید روی اینترنت عمومی expose شود.

## ۱۷. محدودیت‌ها

- تعداد کاربران همزمان روی یک لپ‌تاپ محدود است (مناسب چند کاربر داخل شرکت).
- بدون realtime/analytics گسترده، بدون edge functions، بدون imgproxy.
- OCR در LAN pilot غیرفعال است (`OCR_ENABLED=false`).
- migration واقعی، backup/restore production و انتقال دیتای واقعی جزو این فاز نیست.