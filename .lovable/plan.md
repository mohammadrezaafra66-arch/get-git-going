## هدف
Deploy مجدد تابع `migrate-helper` با کد فعلی موجود در `supabase/functions/migrate-helper/index.ts`.

## مراحل
1. فراخوانی `supabase--deploy_edge_functions` با `["migrate-helper"]`.
2. گزارش وضعیت deploy و URL عمومی:
   `https://kwwkppkcihrbeurwudjh.supabase.co/functions/v1/migrate-helper`

## نکات
- `verify_jwt = false` در `supabase/config.toml` از قبل تنظیم است.
- کد فعلی شامل بررسی `x-access-key`، `SUPABASE_DB_URL`، و `SUPABASE_SERVICE_ROLE_KEY` است.
- هیچ تغییری در سورس انجام نمی‌شود؛ فقط deploy.

## ریسک
بسیار کم — فقط redeploy کد موجود.
