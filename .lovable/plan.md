
## هدف
بازنویسی `supabase/functions/migrate-helper/index.ts` به یک edge function کاملاً خالی (بدون منطق، بدون احراز هویت، بدون secret) و سپس redeploy.

## تغییرات

**فایل:** `supabase/functions/migrate-helper/index.ts`

محتوای جدید:
```ts
Deno.serve(() => new Response("ok", { status: 200 }));
```

این تمام محتوای منطق فعلی (احراز با `x-access-key`، خواندن `SUPABASE_DB_URL` / `SUPABASE_SERVICE_ROLE_KEY`، `jsonResponse`/`errorResponse` helperها، action `ping`) را حذف می‌کند.

## فایل‌های بدون تغییر

- `supabase/config.toml`: بلوک `[functions.migrate-helper] verify_jwt = false` دست‌نخورده باقی می‌ماند.
- هیچ کد frontend به این function ارجاع ندارد، پس نیازی به تغییر `src/` نیست.

## مراحل اجرا

1. جایگزینی محتوای `supabase/functions/migrate-helper/index.ts` با خط بالا.
2. فراخوانی `supabase--deploy_edge_functions` با `["migrate-helper"]`.
3. گزارش URL نهایی: `https://kwwkppkcihrbeurwudjh.supabase.co/functions/v1/migrate-helper`.

## ریسک

- تقریباً صفر. این function در هیچ مسیر production استفاده نمی‌شود و فقط ابزار جانبی migration بوده.
- اگر بعداً Dreamlit یا ابزار دیگری دوباره به منطق نیاز داشت، محتوای قبلی در history قابل بازیابی است.
