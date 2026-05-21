## هدف
بازنویسی `supabase/functions/migrate-helper/index.ts` به یک edge function خالی و deploy آن.

## مراحل
1. جایگزینی محتوای `supabase/functions/migrate-helper/index.ts` با یک stub خالی:
   - فقط CORS handling
   - پاسخ `{ ok: true }` با status 200
   - بدون access key، بدون env check، بدون منطق DB
2. حفظ `[functions.migrate-helper] verify_jwt = false` در `supabase/config.toml` (تغییری لازم نیست).
3. اجرای `supabase--deploy_edge_functions` با `["migrate-helper"]`.
4. گزارش URL عمومی.

## ریسک
بسیار کم — کد فعلی با stub جایگزین می‌شود و عملکرد قبلی (auth/DB check) حذف می‌گردد.
