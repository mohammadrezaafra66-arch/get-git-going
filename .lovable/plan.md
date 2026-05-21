## هدف
بدون افشای هیچ رازی، ساختار `SUPABASE_DB_URL` داخل runtime تابع `migrate-helper` را بررسی کنیم تا مشخص شود Dreamlit از سرور خودش می‌تواند به این Postgres وصل شود یا نه.

## تغییر پیشنهادی (کوچک، موقت، قابل حذف)

افزودن یک اکشن جدید `diag_db_url` به `supabase/functions/migrate-helper/index.ts` که:

1. همان `x-access-key: ELPlSz3PLGPJ1mST` فعلی را الزامی می‌کند.
2. `Deno.env.get("SUPABASE_DB_URL")` را با `new URL(...)` پارس می‌کند.
3. فقط فیلدهای زیر را برمی‌گرداند — هیچ‌گاه کل رشته یا پسورد را:
   - `protocol` (مثلاً `postgresql:`)
   - `host` (فقط hostname)
   - `port`
   - `database` (نام DB از pathname)
   - `username` (مثلاً `postgres` یا `postgres.<ref>`)
   - `sslmode` از querystring (اگر بود)
   - `password_present: true/false` (فقط بولین)
   - `password_length: number` (فقط طول، نه مقدار)
   - `is_pooler: boolean` — true اگر host شامل `pooler.supabase.com` یا port برابر `6543` باشد
   - `looks_internal: boolean` — true اگر host به `.internal`, `.svc`, `localhost`, `127.0.0.1`, یا IP خصوصی (`10.`, `172.16-31.`, `192.168.`) شبیه باشد
   - `masked_url`: دقیقاً به فرم `postgresql://USER:***@HOST:PORT/DB?sslmode=...` (password ثابت `***`)

4. هیچ پاسخی شامل: `service_role`, `access_key`, `password`, `token`, یا کل connection string نخواهد بود. لاگ‌ها هم چیزی چاپ نمی‌کنند.

## نمونه پاسخ (نمونه — مقادیر واقعی پس از اجرا)
```json
{
  "build_id": "2026-03-04",
  "protocol": "postgresql:",
  "host": "db.kwwkppkcihrbeurwudjh.supabase.co",
  "port": "5432",
  "database": "postgres",
  "username": "postgres",
  "sslmode": "require",
  "password_present": true,
  "password_length": 40,
  "is_pooler": false,
  "looks_internal": false,
  "masked_url": "postgresql://postgres:***@db.kwwkppkcihrbeurwudjh.supabase.co:5432/postgres?sslmode=require"
}
```

## نحوه فراخوانی
```
curl -X POST https://kwwkppkcihrbeurwudjh.supabase.co/functions/v1/migrate-helper \
  -H "x-access-key: ELPlSz3PLGPJ1mST" \
  -H "content-type: application/json" \
  -d '{"action":"diag_db_url"}'
```

## تفسیر نتیجه برای دسترس‌پذیری از سرور Dreamlit

پس از دریافت پاسخ، این قاعده‌ها را اعمال می‌کنیم:

- اگر `host` به `db.<ref>.supabase.co` ختم شود و `port=5432` → **Direct Postgres**. از اینترنت قابل دسترسی است اما در Supabase امروزی برای پروژه‌های جدید IPv4 مستقیم محدود است (معمولاً فقط IPv6 یا از طریق pooler). ممکن است سرور Dreamlit بدون IPv6 وصل نشود.
- اگر `host` شامل `pooler.supabase.com` و `port=6543` (یا `5432` با username `postgres.<ref>`) → **Supavisor Pooler**. از اینترنت قابل دسترسی است و توصیه‌شده برای ابزارهای خارجی مثل Dreamlit. این بهترین مسیر است.
- اگر `looks_internal=true` (مثلاً `.supabase.internal` یا IP خصوصی) → **داخلی**؛ از سرور Dreamlit قابل دسترسی نیست و مسیر فعلی Dreamlit شکست خواهد خورد. باید pooler URL عمومی به Dreamlit بدهیم (نه از env پیش‌فرض edge function).

## ملاحظات امنیتی
- اکشن جدید فقط با `x-access-key` فعلی قابل دسترسی است.
- هیچ رازی برگردانده یا لاگ نمی‌شود.
- پس از اتمام مهاجرت، کل تابع `migrate-helper` حذف و service-role key چرخانده می‌شود (طبق برنامه قبلی).

## فایل‌های تحت تأثیر
- `supabase/functions/migrate-helper/index.ts` — فقط افزودن یک شاخه `if (action === "diag_db_url")` قبل از پاسخ پیش‌فرض. بقیه کد دست‌نخورده.

## ریسک
- بسیار کم. فقط متادیتای ساختاری URL برگردانده می‌شود.
- تابع موقت است و در پایان مهاجرت حذف می‌شود.
