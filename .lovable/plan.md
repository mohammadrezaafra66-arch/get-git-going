## چرا این خطا رخ می‌دهد؟

خطای «دسترسی به سرویس دستیار محلی برقرار نشد؛ تنظیمات OLLAMA_API_URL را بررسی کنید» معادل `fetch_failed` در backend است. این یعنی کانتینر app **اصلاً نتوانست به آدرس Ollama متصل شود** (قبل از هر پاسخ HTTP). با خطای قبلی `http_403` فرق دارد:

- `http_403` = اتصال برقرار شد، ولی سرور مقصد رد کرد (proxy/firewall/auth)
- `fetch_failed` = اتصال TCP/DNS اصلاً برقرار نشد

## علت‌های محتمل (به ترتیب شیوع)

1. **`OLLAMA_API_URL` در `.env` سرور تنظیم نشده یا خالی است**
   - اگر خالی باشد کد پیام `disabled` می‌دهد، ولی اگر مقدار نامعتبر داشته باشد `fetch_failed` می‌دهد.

2. **مقدار `OLLAMA_API_URL` اشتباه است**
   - نمونه‌های اشتباه: `localhost:11434` بدون `http://`، آدرس با endpoint کامل مثل `/api/chat`، آدرس داخلی که از کانتینر app قابل دسترس نیست.
   - مقدار درست: `http://IP_OR_HOST:11434` یا `https://ollama.your-domain.com`

3. **کانتینر app به شبکه Ollama دسترسی ندارد**
   - Ollama روی سرور دیگر است و port `11434` روی فایروال آن سرور بسته است.
   - Ollama فقط روی `127.0.0.1` bind شده (نه `0.0.0.0`) و از بیرون قابل دسترس نیست.
   - DNS نام دامنه در کانتینر app resolve نمی‌شود.

4. **کانتینر app بعد از تغییر `.env` restart نشده**
   - env جدید فقط با `docker compose up -d --force-recreate app` بارگذاری می‌شود.

5. **TLS/گواهی نامعتبر** (اگر https استفاده می‌کنید)
   - certificate self-signed یا expired → fetch در Node رد می‌کند.

## بله، قابل حل است

مشکل صرفاً پیکربندی سرور است، نه باگ کد. مراحل تشخیص و رفع:

### ۱. مقدار فعلی env را ببینید
```bash
docker exec <app-container> printenv OLLAMA_API_URL OLLAMA_MODEL OLLAMA_API_KEY
```

### ۲. از داخل کانتینر app تست اتصال بگیرید
```bash
docker exec <app-container> sh -c 'curl -sS -o /dev/null -w "HTTP %{http_code}  time %{time_total}s\n" --max-time 10 "$OLLAMA_API_URL/api/tags"'
```
- خروجی `HTTP 200` → اتصال سالم است، مشکل جای دیگر.
- خطای `Could not resolve host` → DNS مشکل دارد.
- خطای `Connection refused` → Ollama روی این آدرس/پورت گوش نمی‌دهد یا فقط `127.0.0.1` bind است.
- خطای `Connection timed out` → فایروال بین کانتینر app و سرور Ollama بسته است.
- خطای `SSL certificate problem` → گواهی نامعتبر.

### ۳. اطمینان از bind درست Ollama روی سرور Ollama
```bash
# روی سرور Ollama
ss -tlnp | grep 11434
```
باید `0.0.0.0:11434` یا `*:11434` باشد، نه `127.0.0.1:11434`. اگر روی localhost است، در systemd unit یا docker compose بگذارید:
```
OLLAMA_HOST=0.0.0.0:11434
```
سپس Ollama را restart کنید.

### ۴. باز کردن فایروال سرور Ollama برای IP سرور app
```bash
# نمونه ufw
sudo ufw allow from <APP_SERVER_IP> to any port 11434 proto tcp
```

### ۵. اصلاح `.env` سرور app و restart
```
OLLAMA_API_URL=http://<OLLAMA_HOST_OR_IP>:11434
OLLAMA_MODEL=llama3.2:8b
```
```bash
docker compose up -d --force-recreate app
```

### ۶. اگر پشت reverse proxy با auth است
- علاوه بر آدرس صحیح، `OLLAMA_API_KEY` را هم در `.env` بگذارید (کد قبلاً هدر `Authorization: Bearer` را server-side می‌فرستد).

## بدون تغییر کد

هیچ تغییر کدی لازم نیست — کد فعلی این خطاها را درست مدیریت و پیام مناسب فارسی نشان می‌دهد. مشکل کاملاً در لایه زیرساخت/شبکه سرور است.

## اگر می‌خواهید کمک بیشتری بدهم

لطفاً یکی از این‌ها را بفرستید تا تشخیص دقیق‌تر بدهم:
- خروجی دستور `curl` مرحله ۲ از داخل کانتینر app
- مقدار فعلی `OLLAMA_API_URL` (بدون IP واقعی اگر حساس است، فقط الگو مثلاً `http://<ip>:11434`)
- محل اجرای Ollama: همان سرور app، سرور دیگر در LAN، یا سرور دیگر روی اینترنت
