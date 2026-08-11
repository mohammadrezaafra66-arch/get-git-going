# گزارش تغییر: حذف `# syntax=docker/dockerfile:1.7` از Dockerfile

## تاریخ
2026-05-27

## تغییر
فایل: `Dockerfile`

### قبل
```dockerfile
# syntax=docker/dockerfile:1.7

# ====== Build stage ======
FROM oven/bun:1-debian AS builder
```

### بعد
```dockerfile
# ====== Build stage ======
FROM oven/bun:1-debian AS builder
```

## دلیل
در محیط ایران/LAN، وجود `# syntax=docker/dockerfile:1.7` باعث می‌شود Docker هنگام build تلاش کند `docker/dockerfile:1.7` را از Docker Hub pull کند. این عملیات در سیستم موردنظر با خطای TLS/certificate شکست خورده است.

## تحلیل
- Dockerfile هیچ قابلیت اختصاصی frontend نسخه 1.7 (heredoc، `--mount`، `--link`، `--exclude`) استفاده نمی‌کند.
- تمام دستورات با Dockerfile frontend پیش‌فرض Docker Engine مدرن سازگار است.
- حذف این خط **امن** است؛ رفتار build تغییری نمی‌کند.

## فایل‌های تغییرکرده
- `Dockerfile` — فقط خط 1 (syntax directive) و خط 2 (blank line مربوط به آن) حذف شد.

## دستور تست LAN
```bash
docker compose -f deploy/lan/docker-compose.yml build web
```

انتظار: build باید بدون تلاش برای pull `docker/dockerfile:1.7` موفق شود. در خروجی نباید متن `Pulling from docker/dockerfile` دیده شود.

## ریسک
بسیار کم. اگر در آینده از heredoc یا cache mount خواستیم استفاده کنیم، می‌توان `# syntax=docker/dockerfile:1` (بدون pinned minor) را اضافه کرد.
