## هدف
ایجاد یک Edge Function موقت به نام `migrate-helper` برای ابزار Dreamlit (Lovable Cloud → Supabase Exporter)، جایگزینی محتوای آن با کد Dreamlit، deploy، و ارائه URL عمومی.

## مراحل

1. **ایجاد ساختار فایل**
   - `supabase/functions/migrate-helper/index.ts` با یک stub اولیه (Deno + `serve`)
   - در `supabase/config.toml` بلوک `[functions.migrate-helper]` با `verify_jwt = false` تا Dreamlit بتواند بدون JWT صدا بزند (ابزار export معمولاً service_role در body/header می‌فرستد، نه JWT کاربر)

2. **درخواست کد از شما**
   - بعد از ایجاد stub، از شما می‌خواهم کد کامل تولیدشده توسط Dreamlit را paste کنید
   - شما کد را در چت می‌فرستید

3. **جایگزینی محتوا**
   - کل محتوای `supabase/functions/migrate-helper/index.ts` را با کد Dreamlit جایگزین می‌کنم
   - اگر Dreamlit به secret خاصی نیاز داشت (مثل `SUPABASE_SERVICE_ROLE_KEY` که به‌صورت پیش‌فرض موجود است، یا secret سفارشی)، قبل از deploy اضافه می‌کنم

4. **Deploy**
   - با `supabase--deploy_edge_functions` تابع را deploy می‌کنم
   - با `supabase--edge_function_logs` تأیید می‌کنم deploy موفق بوده

5. **ارائه URL عمومی**
   - URL استاندارد: `https://kwwkppkcihrbeurwudjh.supabase.co/functions/v1/migrate-helper`
   - این URL را به شما می‌دهم تا در Dreamlit وارد کنید

## هشدارهای امنیتی مهم (طبق قوانین پروژه)

- این تابع **موقت** است. بعد از پایان migration حتماً با `supabase--delete_edge_functions` حذف می‌شود.
- اگر کد Dreamlit از `SUPABASE_SERVICE_ROLE_KEY` استفاده می‌کند → این تابع عملاً دسترسی کامل به DB می‌دهد. باید:
  - `verify_jwt = false` فقط برای پنجره migration باز بماند
  - بلافاصله بعد از اتمام، تابع حذف شود
  - logها بعد از migration بررسی شوند که سوءاستفاده‌ای رخ نداده
- اگر کد Dreamlit شامل secret یا token در hard-code است، **deploy نمی‌کنم** و از شما می‌خواهم به env منتقل کنیم.

## بعد از تأیید این plan

روی Implement بزنید تا step 1 (ایجاد stub) را انجام دهم و سپس از شما کد Dreamlit را بخواهم.
