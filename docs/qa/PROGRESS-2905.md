# PROGRESS — بستهٔ نیازمندی‌های ۱۴۰۵/۰۴/۲۹

> ترتیب اجرا: A → B → C → D → E → F → G → H → I → J
> وضعیت‌ها: ⬜ نشده · 🔄 نیمه‌کاره · ✅ تمام
> branch: `security/rls-permissive-select-fix`

| # | فاز | ریسک | وضعیت | commit |
|---|---|---|---|---|
| A | «انتخاب همهٔ محصولاتِ منطبق با فیلتر» (کمبود قابلیت، نه باگ) | کم | ✅ تمام | `fc1c5b02` |
| B | باگ: دکمهٔ «ارسال» در پیش‌فاکتور (`type:public text`) | کم | ✅ تمام | `841a7781` |
| C | تعداد در هر صفحه: ورودی عددی آزاد | کم | ✅ تمام | `d9dadee9` |
| D | حذف سقف مبالغ در مشتریان | کم | ✅ تمام (no-op) | — |
| E | انضباط واریز: عدد ۰ تا ۱۰۰ | کم | ✅ تمام | `06a669ff` |
| F | جستجو با کد آسان در اعتبار مشتری | کم | ✅ تمام | `d2c0a10b` |
| G | مسئول محصول: همهٔ کاربران ثبت‌نام‌شده | متوسط | ✅ تمام | `c2de5130` |
| H | نمایش قیمت + انتخابگر ترم در لیست محصولات | متوسط | ✅ تمام | `154cb145` |
| I | مرتب‌سازی محصولات (۵ حالت) | متوسط | ✅ تمام | `b0df5d0f` |
| J | انتخابگر تسویه + کف قیمت در پیش‌فاکتور | بالا | ✅ تمام | `73fe02a6` |

## یادداشت‌های اجرا
- **فاز A:** تشخیص تجربی نشان داد backend سالم است (step-nav کلاینت‌ساید؛ `.in()` ۳۷۴ id → 200؛ درج ۳۷۴ آیتم → 201). مشکل واقعی: «انتخاب همه» فقط صفحهٔ جاری را می‌گرفت. رفع: دکمهٔ «انتخاب همهٔ {total} محصول» (batch ۱۰۰۰‌تایی) + rename به «انتخاب این صفحه» + شمارندهٔ «{n} از {total}» + «حذف انتخاب‌ها». `fc1c5b02`.
- migrationهای فعال روی DB زندهٔ `afrakala`: `…120000_rls_permissive_select_fix`، `…130000_quote_price_bounds_validation`، `…140000_sale_lists_pdf_column_widths` (جلسهٔ قبل)، `…20260720100000_fix_update_sales_quote_status_text_cast` (فاز B).
- **فاز E:** فیلد = `customer_payment_discipline` (پارامتر در `dynamic_scoring_parameters`، label «انضباط در واریز و پرداخت»). از `boolean` (toggle) به ورودی متنی ۰–۱۰۰ تبدیل شد. **تصمیم (قانون #۳):** به‌جای `score_100` (که اسلایدر است و سند «نه اسلایدر» گفت) و به‌جای دست‌زدن به ۲ پارامتر score_100 دیگر، نوعِ جدید `score_input` (متنی) ساخته شد. نگاشت مقادیر: actual 1→100 (raw_score=1.0 حفظ). بکاپ `backup_pre_E.sql`. `06a669ff`.
- **فاز J:** `sales_quotes.settlement_type_id` (nullable FK+index) + RPC `p_settlement_type_id` + **کف قیمتِ per-settlement** در RPC اتمیک (کف = `product_computed_prices.rounded_sale_price` برای (محصول، sale_price_type آیتم، تسویهٔ quote)؛ زیر کف → rollback کل؛ بدون قیمت ترم → ثبت؛ manual/quick معاف). **تعارض حل‌شده:** کف تسویه‌ایِ J جایگزین چک base قبلی (`get_product_price_bounds`) شد که ترم‌های ارزان‌تر را اشتباه رد می‌کرد. فرم: Select الزامی «نوع تسویه» + هشدار تغییر ترم + گارد نرم موجودی (J-4). تست RPC: بالای‌کف→ok، زیرکف→رد(اتمیک)، manual→ok، بی‌قیمت→ok. quoteهای قدیمی (settlement NULL) دست‌نخورده. بکاپ `backup_pre_J.sql`. `73fe02a6`.
- **فاز I:** انتخابگر «مرتب‌سازی» (۵ حالت). default/newest سمت‌سرور با `.order().range()`. cheapest/expensive/most_viewed: رتبه‌بندی روی **همهٔ idهای فیلترشده** (id+برچسب گرفته می‌شود، سپس قیمت دسته‌ای برای ترم انتخابی یا RPC جدید `get_product_view_counts_7d`)، مرتب با no-value→ته، سپس صفحه‌بندیِ لیست مرتب‌شده و گرفتن ردیف‌های صفحه → صفحه‌بندی روی کل نتایج درست است (نه per-page). **تصمیم:** تجمیع سمت‌سرور (RPC/batch)، مرتب‌سازی نهایی روی لیست idها (کاتالوگ ۳۷۴ → ~۲-۴ms). تست: base vs ترم متفاوت (10k vs 3M)، پربازدید 6/5/3، ۵۹ محصول بی‌قیمت ته. `b0df5d0f`.
- **فاز H:** ستون «قیمت فروش» + انتخابگر «نوع تسویه» (پیش‌فرض «قیمت پایه»=settlement NULL). **تصمیم (قانون #۱):** sale_price_type = اولین فعال بر اساس `sort_order` (نقدی)، چون `is_default` نیست و این با `effective-currencies.ts` سازگار است. کوئری دسته‌ای واحد (`product_computed_prices`، ~۲-۴ms/۵۰). تست: base avg 74.7M ≠ term avg 66.0M؛ ۳۰/۲۵ از ۵۰ قیمت دارند («قیمت ثبت نشده» برای بقیه). ⚠️ RLSِ `product_computed_prices` = admin/manager/accountant → ستون برای این نقش‌ها معنادار (RLS دست‌نخورده). `154cb145`.
- **فاز G:** علت = RLSِ `profiles` (نقش‌پایین فقط `uid()=id`). **تصمیم (قانون #۳):** به‌جای باز کردن policy، serverFn `listAssignableUsers` با service-role که فقط `id`+`full_name` می‌دهد (نه email/phone/role). `OwnerAssignDialog` به آن وصل شد و ستون phone حذف. عملِ انتساب دست‌نخورده (RLSِ `product_owner_assignments`). ۴۱ کاربر قابل‌فهرست. `c2de5130`.
- **فاز F:** جستجوی «کد آسان» — `list_trusted_credit_customers`: `easy_code` از `NULL` به `c.accounting_code` + گسترش `p_search` (ILIKE) + placeholder. `d2c0a10b`.
- **فاز D (no-op، تأییدشده):** هیچ سقف مبلغی وجود ندارد. UI بدون `max=` مبلغ؛ zod بدون `.max()` مبلغ؛ همهٔ ستون‌های مبلغ `numeric`/`numeric(15)` (نه integer، بدون سرریز)؛ و از قبل floor `CHECK credit_limit>=0` منفی را رد می‌کند. تست عملی: ۹۹۹,۹۹۹,۹۹۹,۹۹۹ ذخیره و بازخوانی شد؛ `-1` رد شد. ⚠️ اگر صفحهٔ خاصی هست که مبلغ بزرگ را رد می‌کند (که من نیافتم) نامش را بده تا بررسی کنم. (numeric(15) سقف نظری ~۱۰^۱۵ دارد؛ اگر «نامحدودِ واقعی» می‌خواهی، به `numeric` بی‌قید گسترش می‌دهم.)
- **فاز B:** دکمهٔ «ارسال» **کد مرده نبود** — گذار وضعیت draft→sent. علت خطا: تابع زندهٔ `update_sales_quote_status` از منبع منحرف شده بود و به نوعِ ناموجودِ `public.text[]` cast می‌کرد (drift دستی). رفع با بازگرداندن `::public.app_role[]`. تأیید: draft→sent کار کرد. `841a7781`. (بدون تغییر frontend/redeploy.)
