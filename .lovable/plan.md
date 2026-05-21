## وضعیت فعلی
تابع `migrate-helper` از قبل در `supabase/functions/migrate-helper/index.ts` وجود دارد و حاوی منطق احراز هویت با `x-access-key` و خواندن `SUPABASE_DB_URL` / `SUPABASE_SERVICE_ROLE_KEY` است. در `supabase/config.toml` نیز با `verify_jwt = false` ثبت شده.

## هدف
بازنویسی `supabase/functions/migrate-helper/index.ts` به یک stub کاملاً خالی (بدون منطق، بدون secret، فقط 200 OK) و سپس redeploy.

## مراحل
1. جایگزینی محتوای `supabase/functions/migrate-helper/index.ts` با:
   ```ts
   Deno.serve(() => new Response("ok", { status: 200 }));
   ```
2. `supabase/config.toml` بدون تغییر باقی می‌ماند (بلوک `[functions.migrate-helper] verify_jwt = false` حفظ می‌شود).
3. فراخوانی `supabase--deploy_edge_functions` با `["migrate-helper"]`.
4. گزارش URL: `https://kwwkppkcihrbeurwudjh.supabase.co/functions/v1/migrate-helper`.

## ریسک
- بسیار کم. تابع فعلاً فقط برای helperهای موقت migration استفاده می‌شود و در هیچ مسیر production فراخوانی نمی‌شود (در `src/` هیچ referenceی نیست).
- اگر بعداً برای ابزار Dreamlit به منطق نیاز شد، دوباره پر می‌شود.

## تایید لازم
آیا واقعاً می‌خواهید منطق فعلی (احراز با `x-access-key` و خواندن envها) حذف شود و فقط stub خالی بماند؟ اگر هدف صرفاً redeploy همان کد فعلی است، به‌جای این پلن بگویید تا فقط deploy کنم.
