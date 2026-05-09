# SH-RA.7 — چک‌لیست آمادگی VPS برای Production افراکالا

- Purpose: چک‌لیست رسمی آماده‌سازی سرور VPS قبل از استقرار production افراکالا (self-host).
- Audience: اپراتور / DevOps.
- Last updated: 2026-05-09
- Related: `02_ARCHITECTURE_OVERVIEW.md`, `10_ENVIRONMENT_MATRIX.md`, `06_PHASE_PROTOCOL.md`, `08_OPS_RUNBOOK.md`
- Scope: Documentation only. این فایل **اجرا نمی‌شود**؛ صرفاً مرجع آماده‌سازی دستی توسط اپراتور است.

> ⚠️ هیچ بخش از این چک‌لیست توسط Lovable یا CI اجرا نمی‌شود. تمام مراحل باید توسط اپراتور انسانی روی VPS واقعی انجام و در drill log ثبت شود.

---

## ۱) OS Baseline

- [ ] سیستم‌عامل: **Ubuntu Server 22.04 LTS** (نسخه LTS، نه interim)
- [ ] اجرای `apt update && apt upgrade` و reboot اولیه
- [ ] نصب و فعال‌سازی `unattended-upgrades` فقط برای security updates
  - [ ] فایل `/etc/apt/apt.conf.d/50unattended-upgrades` تنظیم شده (فقط `${distro_id}:${distro_codename}-security`)
  - [ ] `Unattended-Upgrade::Automatic-Reboot "false";` (reboot دستی توسط اپراتور)
- [ ] NTP فعال: `timedatectl set-ntp true` و وضعیت `systemctl status systemd-timesyncd` سالم
- [ ] Timezone: `timedatectl set-timezone Asia/Tehran`
- [ ] Hostname معنادار تنظیم شده (مثلاً `afrakala-prod-01`) و در `/etc/hosts` ثبت شده
- [ ] Locale فارسی موجود: `locale-gen fa_IR.UTF-8` و `update-locale`

## ۲) User Hardening

- [ ] کاربر non-root ساخته شده (مثلاً `afrakala`) با `adduser afrakala`
- [ ] عضو گروه `sudo`: `usermod -aG sudo afrakala`
- [ ] SSH key اپراتور در `~/.ssh/authorized_keys` کاربر non-root نصب شده
- [ ] ورود با رمز SSH **غیرفعال**:
  - [ ] `/etc/ssh/sshd_config` → `PasswordAuthentication no`
  - [ ] `/etc/ssh/sshd_config` → `PermitRootLogin no`
  - [ ] `/etc/ssh/sshd_config` → `ChallengeResponseAuthentication no`
  - [ ] `systemctl restart ssh`
- [ ] ورود مستقیم root از SSH تست و تایید شده که **مسدود** است
- [ ] رمز کاربر non-root برای `sudo` تنظیم شده و در محل امن نگهداری می‌شود (نه در repo)
- [ ] (اختیاری) تغییر پورت SSH از 22 به پورت غیراستاندارد + به‌روزرسانی UFW

## ۳) Firewall و Brute-force Protection

- [ ] UFW نصب و فعال: `ufw enable`
- [ ] قاعده پیش‌فرض: `ufw default deny incoming` + `ufw default allow outgoing`
- [ ] فقط پورت‌های مجاز:
  - [ ] `ufw allow 22/tcp` (SSH — یا پورت سفارشی)
  - [ ] `ufw allow 80/tcp` (HTTP — برای ACME challenge)
  - [ ] `ufw allow 443/tcp` (HTTPS)
- [ ] هیچ پورت دیگری باز نیست (`ufw status verbose` بررسی شده)
- [ ] پورت‌های دیتابیس (5432) و Storage داخلی **هرگز** روی اینترنت expose نشوند
- [ ] `fail2ban` نصب و فعال:
  - [ ] jail پیش‌فرض `sshd` فعال
  - [ ] `bantime`، `findtime`، `maxretry` بازبینی شده
- [ ] (اختیاری) فعال‌سازی jail برای nginx در صورت expose

## ۴) Docker Engine + Compose v2

- [ ] نصب Docker Engine از repo رسمی Docker (نه `docker.io` از Ubuntu)
- [ ] نسخه Docker: حداقل `24.x` با پشتیبانی Compose v2 (`docker compose version`)
- [ ] افزودن کاربر non-root به گروه docker (با آگاهی از پیامد امنیتی): `usermod -aG docker afrakala`
- [ ] فعال‌سازی `systemctl enable --now docker`
- [ ] `daemon.json` تنظیم شده با log rotation:
  - [ ] `"log-driver": "json-file"`
  - [ ] `"log-opts": { "max-size": "10m", "max-file": "5" }`
- [ ] تست `docker run --rm hello-world` موفق
- [ ] تست `docker compose version` موفق

## ۵) ساختار پوشه‌ها

- [ ] ساخت ساختار استاندارد:
  - [ ] `/opt/afrakala/repo` — clone شده از GitHub (read-only deploy key یا https + token محدود)
  - [ ] `/opt/afrakala/deploy` — کپی فایل‌های `deploy/` (یا symlink به repo)
  - [ ] `/opt/afrakala/backups` — مقصد backup‌های Postgres و Storage
  - [ ] `/opt/afrakala/certs` — گواهی‌های TLS (private key + fullchain)
- [ ] مالکیت: `chown -R afrakala:afrakala /opt/afrakala`

## ۶) Permissions / chmod

- [ ] پوشه ریشه: `chmod 750 /opt/afrakala`
- [ ] فایل‌های `.env` واقعی: `chmod 600` و owner = `afrakala`
- [ ] پوشه `certs`: `chmod 700 /opt/afrakala/certs`
- [ ] فایل private key TLS: `chmod 600`
- [ ] پوشه `backups`: `chmod 700` (دسترسی فقط برای کاربر backup/operator)
- [ ] توکن GHCR (در فایل): `chmod 600`
- [ ] هیچ فایل حساس قابل خواندن برای `others` نباشد (`find /opt/afrakala -perm -o+r -type f` خروجی خالی)

## ۷) Docker Network

- [ ] ساخت شبکه اختصاصی: `docker network create afrakala-net`
- [ ] تایید نام شبکه با تنظیمات `docker-compose.prod.yml` هماهنگ است
- [ ] هیچ container روی `bridge` پیش‌فرض اجرا نمی‌شود

## ۸) Time + Locale

- [ ] `timedatectl` → timezone = `Asia/Tehran`، NTP synchronized = yes
- [ ] `locale` → `LANG=fa_IR.UTF-8` یا حداقل `en_US.UTF-8` فعال
- [ ] container Postgres با `TZ=Asia/Tehran` و `lang/locale` مناسب اجرا شود
- [ ] ساعت سرور با ساعت ایران مطابقت دارد (`date` بررسی شده)

## ۹) Monitoring

- [ ] حداقل یکی از موارد زیر فعال:
  - [ ] **Uptime Kuma** روی همان VPS یا VPS جداگانه با probe HTTPS به `app.afrakala.ir` و `api.afrakala.ir`
  - [ ] **External probe** (UptimeRobot / StatusCake / probe داخلی) برای healthcheck
- [ ] healthcheck endpoint اپ (`/api/healthz`) به probe متصل
- [ ] alert (ایمیل/تلگرام/SMS) در صورت downtime > 2 دقیقه فعال
- [ ] مانیتورینگ منابع سرور:
  - [ ] CPU / RAM / Disk usage (مثلاً `htop`، `node_exporter`، یا dashboard کاربردی)
  - [ ] alert برای disk usage > 80%

## ۱۰) Disk Layout

- [ ] مسیرهای دیتای حساس روی volume یا partition جدا از root file system:
  - [ ] `pgdata` (Postgres) — مسیر مستقل، ترجیحاً SSD، با snapshot capability
  - [ ] `storagedata` (Supabase Storage) — مسیر مستقل
  - [ ] `backups` — مسیر مستقل (ترجیحاً disk جدا یا remote mount)
- [ ] quota plan مستند:
  - [ ] حداقل ۲ برابر اندازه فعلی DB برای رشد ۶ ماهه
  - [ ] حداقل ۳ نسخه backup کامل + WAL/incremental فضا داشته باشد
  - [ ] alert disk قبل از پر شدن (در ۸۰٪)
- [ ] فایل‌سیستم: ext4 یا xfs با mount option `noatime` برای pgdata
- [ ] هیچ container داده ماندگار را روی FS داخل image ذخیره نمی‌کند (همیشه volume)

## ۱۱) DNS

- [ ] رکورد A برای `app.afrakala.ir` به IP عمومی VPS اشاره می‌کند
- [ ] رکورد A برای `api.afrakala.ir` به همان IP اشاره می‌کند
- [ ] TTL مناسب برای cutover (مثلاً 300 ثانیه در زمان migration، سپس بازگشت به 3600)
- [ ] propagation تایید شده با `dig app.afrakala.ir +short` و `dig api.afrakala.ir +short`
- [ ] reverse DNS (PTR) سرور تنظیم شده (در صورت استفاده از ایمیل خروجی از سرور)
- [ ] هیچ رکورد CNAME به سرویس خارجی (Lovable / Vercel / Cloudflare) برای production نهایی استفاده نمی‌شود

## ۱۲) TLS

- [ ] طرح صدور گواهی مشخص:
  - [ ] **ACME (Let's Encrypt)** با `certbot` یا `acme.sh` — برای هر دو دامنه
  - [ ] یا **گواهی manual** از CA معتبر داخلی، با procedure تمدید مستند
- [ ] گواهی شامل هر دو ساب‌دامنه (`app.afrakala.ir` و `api.afrakala.ir`) — یا گواهی جداگانه
- [ ] private key با `chmod 600` و owner مناسب
- [ ] auto-renewal تست شده (`certbot renew --dry-run`)
- [ ] reverse proxy (nginx/caddy/traefik) برای TLS termination پیکربندی شده
- [ ] HSTS فعال در reverse proxy
- [ ] redirect 80 → 443 فعال
- [ ] هیچ گواهی واقعی در git commit نشده

## ۱۳) GHCR Access

- [ ] توکن GHCR از نوع **Personal Access Token (classic) با scope محدود** فقط `read:packages`
- [ ] توکن در فایل `/opt/afrakala/.ghcr-token` ذخیره و `chmod 600` و owner = `afrakala`
- [ ] هیچ توکن GHCR در repo، در `.env.production.example`، یا در history shell نیست
- [ ] login تست شده: `cat /opt/afrakala/.ghcr-token | docker login ghcr.io -u <user> --password-stdin`
- [ ] قابلیت `docker pull ghcr.io/<owner>/<repo>-web:<tag>` تایید شده
- [ ] انقضای توکن در تقویم اپراتور یادداشت شده (rotation plan)

## ۱۴) Final Preflight Checklist (قبل از Cutover Production)

- [ ] تمام بخش‌های ۱ تا ۱۳ بالا تیک خورده‌اند
- [ ] فایل `.env.production` نهایی روی سرور با `chmod 600` آماده است (هیچ مقدار placeholder ندارد)
- [ ] هیچ کلید با prefix `VITE_` در فایل‌های server-side نیست
- [ ] `service_role` key فقط در فایل server-side، نه در image و نه در client bundle
- [ ] migrationهای production مرور شده و هیچ destructive SQL بدون تایید ندارند (طبق `07_MIGRATION_SAFETY.md`)
- [ ] backup baseline اولیه گرفته شده (Postgres + Storage) و در `/opt/afrakala/backups` ذخیره است
- [ ] **SH-RA.6B drill اجرا و موفق گزارش شده** (restore drill واقعی روی نسخه disposable)
- [ ] healthcheck endpoint اپ تست شده و `200 OK` برمی‌گرداند
- [ ] reverse proxy روی `app.afrakala.ir` و `api.afrakala.ir` با گواهی معتبر سرویس می‌دهد
- [ ] `docker compose -f deploy/docker-compose.prod.yml config` بدون خطا
- [ ] image tag مشخص و در `IMAGE_TAG` فایل `.env.production` ست شده (نه `latest` بدون نسخه)
- [ ] runbook `08_OPS_RUNBOOK.md` در دسترس اپراتور است
- [ ] rollback plan خوانده شده و اپراتور `IMAGE_TAG` قبلی را می‌داند
- [ ] cutover window و افراد on-call مشخص شده‌اند
- [ ] DNS TTL پایین آورده شده (≤ 300s) برای امکان rollback سریع
- [ ] لاگ‌های ۲۴ ساعت اول cutover تحت نظر قرار می‌گیرند

---

## نکات نهایی

- این چک‌لیست **پیش‌نیاز** فاز SH-RA.GATE است؛ بدون تکمیل کامل آن، هیچ cutover production مجاز نیست.
- هر مورد تیک‌خورده باید توسط اپراتور و در tracker داخلی timestamp و مسئول داشته باشد.
- در صورت تغییر زیرساخت (مهاجرت VPS، تغییر دامنه، تغییر provider TLS)، این چک‌لیست از ابتدا اجرا شود.

---

## Phase Completion Report

```
Phase: SH-RA.7 — VPS readiness checklist
Status: success

Files created:
- docs/self-host-governance/SH-RA.7_VPS_CHECKLIST.md
Files edited:
- (none)
Files deleted:
- (none)

OCR changed? no
Auth changed? no
Storage changed? no
Migration changed/executed? no
Secret/env/certificate created? no
Deploy/build/test executed? no
Docker/Compose changed? no
Database/Data changed? no

Verification commands run:
- ls docs/self-host-governance/  (تایید نبود فایل قبلی هم‌نام)
- code--view docs/self-host-governance/06_PHASE_PROTOCOL.md (مرور قواعد فاز)

Verification results:
- فایل جدید فقط در مسیر مجاز ساخته شد.
- محتوای فارسی، RTL-friendly، با فرمت checkbox.
- تمام ۱۳ بخش الزامی + Final Preflight (۱۴) پوشش داده شد:
  OS baseline, User hardening, Firewall+fail2ban, Docker+Compose v2,
  Folders, Permissions/chmod, docker network, Time+locale,
  Monitoring, Disk layout, DNS, TLS, GHCR, Final preflight.
- هیچ تغییری در src/, server/, supabase/, deploy/, .github/, scripts/ ایجاد نشد.

Known issues:
- SH-RA.6B (drill واقعی) هنوز اجرا نشده؛ در Final Preflight به‌عنوان gate الزامی ذکر شد.

Manual actions required:
- اپراتور باید چک‌لیست را روی VPS واقعی اجرا کرده و نتایج را در tracker داخلی ثبت کند.
- SH-RA.6B باید پیش از cutover production کامل شود.

Next recommended phase: SH-RA.6B (در صورت اجرا نشدن drill واقعی) سپس SH-RA.GATE

Ready for handoff: yes
```

فاز SH-RA.7 با موفقیت پایان یافت. شروع SH-RA.GATE انجام نشد.