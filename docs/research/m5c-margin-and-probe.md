# M5C — بستن OG-52، و آنچه جارو پیدا کرد

> اجرا روی `staging = 5ef692a7`، برنچ `feature/m5c-margin-and-probe`، پایگاه‌داده `afrakala`
> روی `afrakala-lan-db`. تولید `192.168.170.10` لمس نشد.

---

## ۰. تأیید پیش از شروع — گزارشی که با مخزن نمی‌خواند

مالک گزارشی از اتمام M5C دریافت کرده بود که PR #346، برنچ `feature/m5c-margin-and-probe` و
مهاجرت ۳۹۰ را نام می‌برد. هر چهار شاهد مستقلاً بازسنجی شد:

```
gh pr view 346                  -> Could not resolve to a PullRequest with the number of 346
git branch -a --list '*m5c*'    -> (خالی)
git ls-remote --heads origin    -> هیچ refs/heads/*m5c*
ls supabase/migrations | 39x    -> ۰ فایل
has_column_privilege('anon','categories','base_margin_percent','SELECT') -> TRUE
```

**یکی از این چهار نیاز به تصحیح داشت و ثبتش مهم است.** پرس‌وجوی اول من
`schema_migrations WHERE version LIKE '%390%'` بود و **یک ردیف برگرداند** — که شبیه اثبات
اعمال‌شدنِ مهاجرت است. آن ردیف `20260701163903` بود، timestamp تیرماه که تصادفاً «۳۹۰» دارد.
شمارشی که با زیررشته مچ شده باشد، واقعیت نیست.

---

## ۱. سنجش فاز ۰ — پیش از هر تغییر

```
public.categories : 11 ستون، همه خواندنی برای anon
relacl            : {postgres=arwdDxt, anon=arwdDxt, authenticated=arwdDxt, service_role=arwdDxt}
attacl            : ۰ ستون
RLS               : روشن؛ سیاست categories_public_read با qual = true برای {anon}
base_margin_percent: 15.00 روی هر ۱۲ ردیف
```

`anon=arwdDxt` همان گرنت یک‌جای OG-30 است. حاشیه ستونی جدا نبود؛ از همان گرنت کلی می‌آمد.

### تنها مصرف‌کنندهٔ عمومی

جست‌وجوی کل `src/` برای جدول `categories` بیست‌وچند ارجاع داد که همه داخل `_app`اند، جز یکی:

```
src/lib/public/get-public-sale-list.ts:118
  .from("categories").select("id, name").in("id", categoryIds)
```

پس نیاز واقعی anon دو ستون است. شش ستون گرنت شد (`id, name, slug, parent_id, description,
is_active`) چون شکل کاتالوگ دارند و ردیف‌ها از قبل عمومی‌اند؛ و همین‌جا نوشته می‌شود که فقط
دو تا مصرف می‌شوند، تا مأموریت بعدی بتواند بدون اندازه‌گیری دوباره به دو تا باریکش کند.

---

## ۲. جاروی توابع definer — و چیزی که از خودِ OG-52 بزرگ‌تر بود

مالک صریح خواسته بود پیش از ادعای بستن، توابع definer جارو شوند. این همان نظمی است که
مهاجرت ۳۸۹ گران یاد گرفت.

**دقیقاً یک تابع نام `base_margin_percent` را می‌برد:**

```
calculate_adjusted_price(uuid) | SECURITY DEFINER | VOLATILE | anon_exec = t | RETURNS numeric
```

بدنه‌اش `product_computed_prices` را می‌خواند — جدولی که `anon` رویش `42501` می‌گیرد و همان
انکاری است که OG-29 و `PUBLISH_PUBLIC_PRICES = false` بر آن تکیه دارند — در حاشیهٔ دسته ضرب
می‌کند، سطل روزهای نگهداری را اضافه می‌کند و عدد را برمی‌گرداند.

### سنجش زنده، داخل BEGIN … ROLLBACK

```
as anon: SELECT از product_computed_prices     -> DENIED, 42501
as anon: calculate_adjusted_price(<product>)   -> 38,985,000
قیمت واقعی ذخیره‌شدهٔ همان محصول                -> 33,900,000
نسبت                                            -> دقیقاً 1.15
```

پس حاشیه نه‌فقط به‌عنوان ستون خواندنی بود، بلکه **از خروجی تابع بازیابی‌پذیر بود، و قیمت
واقعی فروش هم با آن بیرون می‌آمد.** این در OG-55 جدا ثبت شد، نه ذیل OG-52، چون بزرگ‌تر از
ردیفی است که پیدایش کرد.

### دو تصحیح که این جارو تحمیل کرد

۱. **تابع هیچ نمی‌نویسد.** `prosrc` هیچ `INSERT`/`UPDATE`/`DELETE` ندارد، پس برچسب `VOLATILE`
   اشتباه است. M5B آن را «صدا زده نشد چون VOLATILE می‌نویسد» ثبت کرده بود؛ آن احتیاط یک
   مأموریت هزینه داشت.
۲. **۱۲ تابع definer دیگر که `categories` را می‌خوانند، تک‌تک بررسی شدند نه نمونه‌برداری.**
   همه `jsonb_build_object('id', c.id, 'name', c.name)` می‌سازند و هیچ‌کدام `to_jsonb(c)`
   نیست، پس حاشیه از آن‌ها بیرون نمی‌آید. بند F دروازه همین خاصیت را پین می‌کند.

---

## ۳. ترتیب فایل‌ها — rollback اول

`docs/verification/390-down.sql` **پیش از** فایل جلوبرنده نوشته شد و با dry-run داخل
`BEGIN … ROLLBACK` اثبات شد:

```
BEFORE           : tbl=t  margin=t  fexec=t  attacl=0
پس از FORWARD    : tbl=f  margin=f  name=t   fexec=f  attacl=6
پس از ROLLBACK   : tbl=t  margin=t  fexec=t  attacl=0     ← دقیقاً برابر BEFORE
relacl پس از rollback : {postgres=arwdDxt,anon=arwdDxt,authenticated=arwdDxt,service_role=arwdDxt}
proacl پس از rollback : شامل =X/supabase_admin و anon=X/supabase_admin
```

ترتیب داخل فایل rollback **معکوس** فایل جلوبرنده است و دلیلش در سربرگش نوشته شده: در جلو
باید `REVOKE` اول بیاید وگرنه گرنت‌های ستونی پاک می‌شوند؛ در برگشت باید `GRANT` اول بیاید
وگرنه لحظه‌ای بدون هیچ SELECT پدید می‌آید.

---

## ۴. دروازه — دوطرفه به‌طور ساختاری

| بند | چه می‌گوید | کدام شکستِ گذشته را می‌گیرد |
|---|---|---|
| A0 | تابع وجود دارد؛ جدول گُنده‌تر از فهرست گرنت است | ۳۸۹ — `has_function_privilege` روی نام ناموجود **raise** می‌کند نه false |
| A | **برابری مجموعه** روی هر ستون زنده | ۳۸۹ — دو فهرست نام‌برده، ستون فردا را نمی‌بیند |
| B | anon هیچ SELECT سطح‌جدول ندارد | گرنت ستونی جمع‌شونده است و هرگز چیزی را دریغ نمی‌کند |
| C | **authenticated هنوز هر ۱۱ ستون را می‌خواند** | ۳۸۶ — دروازهٔ یک‌طرفه که فقط جهتِ بازشدن را می‌سنجید |
| D | هر دو revoke، به‌علاوهٔ فراخوانی که باید زنده بماند | ۳۸۱ — revoke از anon تنها، وقتی PUBLIC گرنت دارد |
| E | **anon هنوز ردیف می‌بیند، با خواندن به‌عنوان anon** | ۳۸۶ — «ستون‌ها درست، جدول خالی» از A تا D رد می‌شود |
| F | هیچ definer دیگری حاشیه را بیرون نمی‌برد | ۳۸۸ — تابع definer از گرنت ستونی رد می‌شود |

### ده اختلال، همه گرفته شد

| اختلال | نتیجه |
|---|---|
| خط پایه (وضعیت اصلاح‌نشده) | CAUGHT — A |
| P1 GRANT پیش از REVOKE | CAUGHT — A |
| P2 revoke فقط از anon | CAUGHT — D |
| P3 revoke فقط از PUBLIC | CAUGHT — D |
| P4 authenticated هم EXECUTE را از دست بدهد | CAUGHT — D |
| P5 حاشیه دوباره گرنت شود | CAUGHT — A |
| P6 authenticated هم باریک شود | CAUGHT — C |
| P7 سیاست سطری anon حذف شود | CAUGHT — E |
| P8 تابع definer تازه با نام حاشیه | CAUGHT — F |
| P9 تابع definer با `to_jsonb(c)` | CAUGHT — F |
| **P10 خودِ اصلاح** | **PASSED** |

**هر وضعیت اختلالی پیش از قضاوت، چاپ و تأیید شد که واقعاً ساخته شده** — این همان چیزی است
که در M5B سه اختلال را به‌غلط «PASSED» نشان داد، چون وضعیتشان هرگز ساخته نشده بود.

**یک صداقت لازم:** بند **B هرگز مستقلاً فعال نشد.** هر وضعیتی که SELECT سطح‌جدول داشته باشد
اول در A می‌افتد. B دفاع در عمق است، نه اثبات‌شده.

---

## ۵. تأیید زنده پس از اعمال

```
anon  select=base_margin_percent      -> 401
anon  select=*                        -> 401
anon  order=base_margin_percent       -> 401     (مسیر فقط-order)
anon  base_margin_percent=eq.15       -> 401     (مسیر فقط-فیلتر)
anon  select=id,name                  -> 200  [{"id":"5ec5e053…","name":"صوتی تصویری"}]
anon  rpc/calculate_adjusted_price    -> 401  42501 permission denied for function

auth  select=*                        -> 200
auth  select=base_margin_percent      -> 200  [{"base_margin_percent":15.00}]
auth  rpc/calculate_adjusted_price    -> 200

/api/public/products                  -> 200، ۱۹۹ ردیف، بدون sku، price:0
/api/healthz                          -> 200
```

---

## ۶. probe دوم — `m6-content-probe.spec.ts`

سه اثبات پیش از انتقال، و **یافته‌اش از آنچه انتظار می‌رفت قوی‌تر بود**:

۱. **تنها ادعایش ابطال‌ناپذیر است.** `expect(out.length).toBeGreaterThan(0)` روی آرایه‌ای است
   که در هر مسیر سه بار بی‌قیدوشرط `push` می‌شود: ۳ × ۴ مسیر = **۱۲، همیشه**. و هر `await`
   با `.catch(() => {})` خطایش را می‌بلعد. ناوبری‌ای که هرگز نمی‌رسد، صفحه‌ای که هیچ
   نمی‌سازد و صفحه‌ای که چیز غلط می‌سازد، هر سه یک نتیجهٔ سبز می‌دهند.
۲. **تنها راه قرمزشدنش timeout است.** چهار ناوبری، هرکدام تا ۲۰ ثانیه `networkidle`، در
   بودجهٔ ۴۵ ثانیه — بدترین حالت ۸۰ ثانیه. تنها شکست ممکنش بی‌ربط به چیزی است که می‌سنجد.
۳. هیچ‌چیز import‌ش نمی‌کند و ۲ آزمون به مجموعهٔ دائمی می‌افزود.

این همان نقصی است که `m6-guard-probe` را همان روز بیرون برد، از جهت مخالف: آن یکی برای
تمام‌شدن خیلی کند است، این یکی هرگز نمی‌تواند بیفتد.

```
مجموعه: 605 آزمون / 87 فایل  →  596 / 86 (پس از guard-probe)  →  594 / 85 (پس از content-probe)
```

هر دو نگه داشته شدند نه حذف — سربرگ هرکدام می‌گوید چطور عمداً اجرا شوند.

---

## ۷. OG-53 عمداً باز ماند

`effective_currencies_view` برای `anon` از ۲۰۰-خالی به ۴۲۵۰۱ رفت. **دسترسی در هر دو حالت
یکسان است** — anon هیچ نمی‌خواند — پس این رگرسیون امتیاز نیست، تغییر **شکل خطا**ست. هیچ
فراخوان بدون‌احرازهویتی در `src/` این view را نمی‌خواند، پس اثر امروزش صفر است.

باز می‌ماند چون اصلاحش بستگی دارد به اینکه کدام شکل **مقصود** است، و آن تصمیم مالک است نه
ایجنت: اگر قرار نیست هیچ سطح عمومی ارزها را بخواند، ۴۰۱ درست است و این ردیف به‌عنوان
مستندسازی بسته می‌شود؛ اگر قرار است، view گرنت می‌خواهد و شکل ۲۰۰-خالی برمی‌گردد.
