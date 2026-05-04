
## مشکل

پیش‌نمایش (و سایت published) با خطای **`Internal server error / 502`** برمی‌گردد. لاگ‌های worker این پیام تکرار شونده را نشان می‌دهد:

```
Error: No such module "h3-v2". imported from "server.js"
```

## ریشه

در فاز SH.3A فایل `vite.config.ts` این خط را گرفت:

```ts
cloudflare: false,
```

با این تنظیم، Vite خروجی Node-SSR تولید می‌کند (مناسب Docker self-host)، اما **پیش‌نمایش و سایت منتشر شده Lovable روی Cloudflare Workers اجرا می‌شوند** و به bundling مخصوص Worker (که `h3-v2` و سایر ماژول‌ها را inline می‌کند) نیاز دارند. نتیجه: bundle برای Lovable نامعتبر است → Worker در زمان اجرا fail می‌کند → 502.

پس هم‌زمان هر دو هدف لازم است:
- **Lovable preview / published** → باید `cloudflare` plugin **روشن** باشد.
- **Self-host Docker (SH.3A)** → باید `cloudflare` plugin **خاموش** باشد تا خروجی Node SSR ساخته شود.

## راه‌حل

این رفتار را به یک **متغیر محیطی build-time** گره می‌زنیم به جای ثابت بودن.

### تغییر ۱ — `vite.config.ts`

`cloudflare` را شرطی کنیم:

```ts
// SELF_HOST_NODE=1 → خروجی Node SSR برای Docker
// در غیر این صورت (پیش‌فرض) → Cloudflare Workers برای Lovable preview/published
cloudflare: process.env.SELF_HOST_NODE === "1" ? false : undefined,
```

پیش‌فرض = Worker (همان رفتار اصلی Lovable). فقط وقتی `SELF_HOST_NODE=1` ست شود، plugin خاموش می‌شود.

### تغییر ۲ — `Dockerfile`

قبل از `bun run build` این flag را ست کنیم:

```dockerfile
ENV SELF_HOST_NODE=1
RUN bun run build
```

این تضمین می‌کند:
- build در Docker → خروجی Node SSR (`server/node-entry.mjs` کار می‌کند).
- build در Lovable cloud → خروجی Cloudflare Worker (preview و published کار می‌کنند).

### تغییر ۳ — به‌روزرسانی مستندات self-host

در `docs/SELF_HOSTING.md` و `deploy/app/README.md` ذکر شود که build دستی خارج از Docker نیاز به `SELF_HOST_NODE=1 bun run build` دارد.

## اثرات جانبی

- هیچ تغییر داده‌ای، migration یا تغییر سطح دسترسی نیست — صرفاً تنظیم build.
- استراتژی self-host strict دست‌نخورده می‌ماند: Dockerfile همچنان خروجی pure Node می‌سازد.
- پس از اعمال، preview در عرض چند ثانیه باید سالم بالا بیاید (rebuild خودکار).

## فایل‌های تحت تأثیر

- `vite.config.ts` — شرطی کردن `cloudflare`
- `Dockerfile` — افزودن `ENV SELF_HOST_NODE=1`
- `docs/SELF_HOSTING.md` — یادداشت کوتاه درباره flag
- `deploy/app/README.md` — همان یادداشت

## تأیید پس از اجرا

پس از تأیید، در حالت default این موارد را چک می‌کنم:
1. preview باز می‌شود و صفحه اصلی بدون 502 لود می‌شود.
2. لاگ worker دیگر `No such module "h3-v2"` ندارد.
