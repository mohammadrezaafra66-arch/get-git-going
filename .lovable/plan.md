## هدف
حذف کامل تابع `migrate-helper` موجود و ایجاد مجدد آن به‌صورت یک stub خالی، آماده برای دریافت کد جدید از Dreamlit.

## مراحل

1. **حذف تابع از Supabase**
   - فراخوانی `supabase--delete_edge_functions` با `["migrate-helper"]` برای حذف نسخه deploy‌شده.

2. **بازنویسی `supabase/functions/migrate-helper/index.ts`**
   - حذف کامل کد فعلی (Dreamlit + diag_db_url).
   - جایگزینی با یک stub حداقلی:
     ```ts
     Deno.serve(() =>
       new Response(JSON.stringify({ ok: true, status: "empty" }), {
         status: 200,
         headers: {
           "Content-Type": "application/json",
           "Access-Control-Allow-Origin": "*",
         },
       })
     );
     ```

3. **حفظ `supabase/config.toml`**
   - بلوک `[functions.migrate-helper] verify_jwt = false` دست‌نخورده بماند.

4. **Deploy مجدد**
   - فراخوانی `supabase--deploy_edge_functions` با `["migrate-helper"]`.

5. **گزارش URL عمومی تابع** به کاربر:
   `https://kwwkppkcihrbeurwudjh.supabase.co/functions/v1/migrate-helper`

## فایل‌های تحت تأثیر
- `supabase/functions/migrate-helper/index.ts` — بازنویسی به stub خالی.

## نکات امنیتی
- هیچ secret یا access key در stub جدید وجود ندارد.
- پس از دریافت کد جدید Dreamlit، کل محتوا جایگزین می‌شود.

## ریسک
- بسیار کم؛ تابع موقت و فقط برای migration است.
