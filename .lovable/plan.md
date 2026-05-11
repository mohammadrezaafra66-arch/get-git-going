## مشکل
در Dockerfile، نصب bun از طریق `npm install -g bun@1.1.38` روی `node:20-alpine` شکست می‌خورد. bun به‌صورت رسمی از طریق npm روی Alpine (musl) به‌خوبی نصب نمی‌شود — باید از image رسمی `oven/bun` استفاده کرد.

## راه‌حل
استفاده از image رسمی `oven/bun:1-debian` در stage builder (پایدار، شامل bun stable، سازگار با glibc و pre-built binaryها)، و حفظ `node:20-alpine` در stage runtime برای کوچک ماندن image نهایی.

## تغییرات

### 1) `Dockerfile` (builder stage)
```dockerfile
# ====== Build stage ======
FROM oven/bun:1-debian AS builder
WORKDIR /app

COPY package.json bun.lock* bun.lockb* ./
RUN bun install --frozen-lockfile || bun install

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    NODE_ENV=production \
    SELF_HOST_NODE=1

RUN bun run build

# secret leak guard (همان منطق فعلی)
RUN set -e; \
    if [ -d "dist/client" ]; then \
      if grep -REIn --binary-files=without-match \
          -e 'SERVICE_ROLE' -e 'SUPABASE_SERVICE_ROLE_KEY' \
          -e 'JWT_SECRET' -e 'POSTGRES_PASSWORD' -e 'LOVABLE_API_KEY' \
          dist/client; then \
        echo "FATAL: secret-like token found in client bundle" >&2; exit 1; \
      fi; \
    fi
```

### 2) `Dockerfile` (runtime stage)
بدون تغییر — همچنان `node:20-alpine` با کاربر non-root و tini.

### 3) `.github/workflows/build-image.yml`
- نسخه‌های action فعلی (`checkout@v4`, `setup-buildx-action@v3`, `login-action@v3`, `build-push-action@v5`) همگی Node 20–compatible و up-to-date هستند → نیاز به تغییر ندارند.
- افزودن `platforms: linux/amd64` صریح برای جلوگیری از build چندمعماری ناخواسته (سرور هدف x86_64 است).

### 4) Cache
استفادهٔ موجود از `cache-from: type=gha` و `cache-to: type=gha,mode=max` حفظ می‌شود؛ image رسمی bun لایه‌های پایدار و قابل cache فراهم می‌کند.

## چرا این انتخاب؟
- **`oven/bun:1-debian`**: تگ رسمی، همیشه آخرین نسخهٔ stable از bun 1.x، بدون نیاز به نصب دستی، سازگار با glibc → نه musl issue، نه npm install fragility.
- **پایدار در برابر آپگرید**: تگ `1` به آخرین minor/patch stable می‌چسبد بدون breaking change.
- **runtime همچنان Alpine**: image نهایی کوچک، بدون bun در runtime (فقط Node SSR لازم است).
- **سازگار با self-host**: تنها از Docker Hub رسمی استفاده می‌شود؛ هیچ وابستگی جدید به CDN/registry غیرقابل دسترس از ایران (build روی GitHub Actions اجرا می‌شود، نه سرور ایران).

## معیارهای پذیرش
- `docker build` در GitHub Actions روی commit جدید سبز شود.
- image در `ghcr.io/.../...-web:latest` و `:sha-<commit>` push شود.
- secret-leak scan pass شود.
- روی سرور `docker compose pull && docker compose up -d web` بدون خطا اجرا شود.

## ریسک
- اگر bun 1.x در آینده breaking change بدهد، تگ `1` هم آپدیت می‌شود؛ در صورت نیاز به pin، می‌توان به `oven/bun:1.1` تغییر داد.
- image builder بزرگ‌تر از alpine است (~150MB بیشتر) ولی فقط در build مرحله مصرف می‌شود؛ runtime image تأثیر نمی‌گیرد.
