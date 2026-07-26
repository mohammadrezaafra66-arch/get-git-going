# پکیج E — مارکتینگ و پیشنهاد تبلیغات (آیتم‌های ۱۴۹، ۱۶۳–۱۶۸، ۱۹۲)

## خلاصهٔ پکیج
موتور «پیشنهاد تبلیغات» به‌صورت کامل و روی سرور (برنچ `feature/navigation-modernization`) موجود است: سه صفحهٔ UI مانت‌شده (`/marketing/suggestions`، `/marketing/suggestions-history`، `/admin/marketing-channels`)، جدول‌های `marketing_channels` / `promotion_nominations` / `promotion_nomination_policy`، ویوی دولاینِ `v_promotion_suggestions` و RPCهای `compute_promotion_scores`، `nominate_product_for_promotion`، `cancel_promotion_nomination`، `get_promotion_nomination_quota` — همه در دیتابیس زندهٔ `afrakala` تأیید شدند. الگوریتم امتیازدهی کاملاً **قطعی** است (هیچ تصادفی/random در ویو یا تابع نیست). دو شکاف اصلی: (۱) «سقف روزانهٔ کانال» یک **گیت بولی** است نه محدودکنندهٔ تعداد خروجی (اگر سقف=۵ باشد، دقیقاً ۵ محصول برنمی‌گرداند)؛ (۲) ثبت/تکمیل تبلیغ و «نامزدی» **به هیچ رویداد امتیاز گیمیفیکیشن وصل نیست** (نه تریگر، نه event_key در `gamification_kpi_rules`). همچنین «بوستِ نامزدی فروش» عملاً صفر است چون در تنها سطر سیاست، `boost_per_nomination = 0`.

---

### آیتم ۱۴۹ (E1) — الگوریتم تولید پیشنهاد در `/marketing/suggestions`

**وضعیت:** ✅ کامل

**پاسخ کوتاه:** صفحه و الگوریتم قطعیِ امتیازدهی کامل و روی سرور فعال‌اند؛ امتیاز = (مجموع وزن برچسب‌ها × وزن کانال × ضریب موجودی × ضریب فروش اخیر) + بوست نامزدی فروش.

**الگوریتم گام‌به‌گام (از بدنهٔ زندهٔ `v_promotion_suggestions` — منبع: مهاجرت `20260716162900_dbd_promotion_nomination_rpcs.sql`, تأییدشده در DB):**

پایه یک `CROSS JOIN` بین همهٔ محصولات فعال (`products.is_active`) و همهٔ کانال‌های فعال (`marketing_channels.is_active`) است. برای هر جفت (محصول، کانال):

1. **وزن برچسب‌ها (`label_weight_sum`)** = `COALESCE(SUM(pl.weight),0)` روی `product_label_links` جوین‌شده با `product_labels` که `is_active = true`. یعنی جمع وزن همهٔ برچسب‌های فعالِ محصول. (در DB: ۱۲ برچسب فعال، وزن‌ها بین ۰ تا ۳، ۶۹۴ لینک.)
2. **وزن کانال (`channel_weight`)** = `mc.weight` (عدد صحیح ۰..۱۰۰ از جدول کانال).
3. **ضریب موجودی (`stock_factor`)** = بر اساس `products.stock_status`: `available → 1.0`، `limited → 0.6`، `unknown → 0.4`، هر چیز دیگر (مثل ناموجود) `→ 0.0`.
4. **ضریب فروش اخیر (`recency_factor`)** = `LEAST(3.0, 1 + ln(1 + qty_90d) / 5)`؛ که `qty_90d` = مجموع `invoice_items.quantity` از فاکتورهای ۹۰ روز اخیر (`invoices.issue_date >= CURRENT_DATE - 90d` و `status <> 'cancelled'`). سقف این ضریب ۳.۰ است (لگاریتمی، اشباع‌شونده).
5. **امتیاز بازار (`market_score`)** = حاصل‌ضرب چهار مورد بالا: `label_weight_sum × channel_weight × stock_factor × recency_factor`.
6. **بوست نامزدی فروش (`sales_nomination_boost`)** = مجموع `boost_applied` نامزدی‌های فعال امروزِ همان محصول، سقف‌خورده به `boost_cap_per_product` سیاست پیش‌فرض. **در عمل صفر** چون `boost_per_nomination = 0` و `boost_cap_per_product = 0` در تنها سطر سیاست.
7. **امتیاز نهایی (`final_score` = ستون `score`)** = `market_score + sales_nomination_boost`. امروز `final_score == market_score`.

سپس `compute_promotion_scores(_channel_id,_min_score,_limit)` روی این ویو فیلتر می‌زند: `WHERE score > 0 AND score >= _min_score AND (daily_quota IS NULL OR daily_quota=0 OR used_today < daily_quota) ORDER BY final_score DESC, score DESC LIMIT GREATEST(_limit,1)`.

**شواهد:**
- L1 (UI): `src/routes/_app.marketing.suggestions.tsx:32` روت `/_app/marketing/suggestions`؛ جدول با ۱۱ ستون (خطوط ۲۴۴–۲۵۴)؛ در منو: `src/lib/navigation/registry.ts:476` («پیشنهادهای تبلیغاتی», `module: "reports"`, `group: "reports"`).
- L2 (front): `useQuery` خط ۱۱۶ → `(supabase as any).rpc("compute_promotion_scores", {_min_score,_limit:200,_channel_id?})` خط ۱۲۷. دادهٔ زنده، نه mock.
- L3 (DB): ویوی زندهٔ `v_promotion_suggestions` و `compute_promotion_scores(uuid,numeric,int)` تأیید موجود؛ بدنهٔ زنده شامل `LEAST(3.0, 1 + ln(1+qty_90d)/5)` و ضرایب موجودی ۱.۰/۰.۶/۰.۴/۰.۰.
- L4 (access): گارد فرانت خط ۸۴–۸۵ نقش `admin|manager|accountant`؛ `ALTER VIEW ... SET (security_invoker=true)`؛ RPC فقط به `authenticated` گرنت شده.

**شکاف نسبت به نیازمندی:** هیچ‌کدام از ضرایب/coefficientها از UI قابل تنظیم نیستند (سخت‌کدشده در بدنهٔ ویو)؛ فقط وزن کانال و وزن برچسب داده‌ای‌اند.

**برنچ:** بله — سرور = nav؛ فایل و ویو در working tree و DB زنده موجودند.

**وابستگی‌ها:** `product_labels`/`product_label_links`، `marketing_channels`، `invoice_items`/`invoices`، `promotion_nomination_policy`.

**برای رفع چه لازم است:** چیزی برای «کارکردن» لازم نیست؛ اگر تنظیم‌پذیری ضرایب مدنظر است باید ضرایب موجودی/سقف recency از سخت‌کد به یک جدول تنظیمات منتقل شوند.

**ریسک/پیچیدگی:** پایین — کاملاً کار می‌کند و قطعی است.

---

### آیتم ۱۴۹ (E2) — ستون دهم «سهمیه امروز» و پرسش تصادفی/قطعی بودن

**وضعیت:** ✅ کامل

**پاسخ کوتاه:** ستون «سهمیه امروز» به‌صورت `used_today / daily_quota` (یا «نامحدود») نمایش داده می‌شود و کاملاً قطعی است؛ **هیچ تصادفی‌ای در کار نیست** و رتبه‌بندی صرفاً بر اساس `final_score` نزولی است.

**شواهد:**
- L1 (UI): `src/routes/_app.marketing.suggestions.tsx:253` سرستون «سهمیه امروز» (ستون دهم از ۱۱)؛ رندر خطوط ۳۲۲–۳۳۰: اگر `daily_quota` نال یا ۰ باشد بَج «نامحدود»، وگرنه `used_today / daily_quota` با رنگ قرمز در صورت اتمام.
- L3 (DB): در ویو، `used_today` = `COUNT(*)` از `audit_logs` با `action='promotion_suggestion_used'` برای آن `channel_id` از ابتدای امروزِ Asia/Tehran؛ و `remaining_today = GREATEST(daily_quota - used_today, 0)`. تأیید مستقیم: جست‌وجوی `random|hashtext|rotation` در بدنهٔ زندهٔ ویو و تابع = **false** (هر دو).
- L2 (front): `ORDER BY final_score DESC, score DESC` در `compute_promotion_scores` — رتبه‌بندی قطعی، بدون شافل.

**نکته تاریخی:** دو مهاجرت قدیمی‌تر (`...add_daily_weighted_promotion_rotation.sql`، `...promotion_daily_rotation.sql`) روزگاری منطق «چرخش» داشتند، اما نسخهٔ زندهٔ فعلی (DB-D، دولاین با `final_score`/`boost`) آن‌ها را جایگزین کرده و هیچ چرخش/تصادفی ندارد (تأییدشده روی viewdef زنده).

**شکاف:** ندارد.

**برنچ:** بله.

**ریسک/پیچیدگی:** پایین.

---

### آیتم ۱۶۳ (E3) — تعریف کانال: وجود جدول، افزودن از UI، فهرست کانال‌های فعلی

**وضعیت:** ✅ کامل

**پاسخ کوتاه:** جدول `marketing_channels` وجود دارد و از صفحهٔ ادمین قابل افزودن/ویرایش/فعال‌غیرفعال‌سازی است؛ در حال حاضر **۵۶ کانال** (همه فعال) ثبت شده‌اند.

**شواهد:**
- L1 (UI): `src/routes/_app.admin.marketing-channels.tsx:390` روت `/_app/admin/marketing-channels`؛ دکمهٔ «افزودن کانال» خط ۱۹۶ + دیالوگ ساخت/ویرایش (نام، وزن ۰..۱۰۰، ترتیب، سهمیه روزانه، فعال).
- L2 (front): `createMarketingChannel` / `updateMarketingChannel` / `toggleMarketingChannelActive` serverFn (`src/lib/marketing/marketing-channels.functions.ts`) — با چک نقش سمت سرور و لاگ ممیزی.
- L3 (DB): ستون‌ها: `id, name, weight(int, def 50), is_active(def true), sort_order(def 0), created_at, updated_at, daily_quota(int null)`. `SELECT count(*)=56`، همه `is_active=t`. نمونه: «پیام در کانال ایتا افرا کالا» وزن ۵۰، «پیام در کانال سروش افرا کالا» وزن ۱۱، «استاتوس واتس اپ 09122270261» وزن ۶ با `daily_quota=5`.
- L4 (access): صفحه گارد `admin|accountant` (خط ۴۹)؛ در nav با `adminOnly:true` (registry خط ۶۳۹)؛ RLS نوشتن `mc_write_admin_accountant`.

**شکاف:** ندارد.

**برنچ:** بله.

**ریسک/پیچیدگی:** پایین.

---

### آیتم ۱۶۴ و ۱۶۵ (E4) — سقف روزانهٔ هر کانال

**وضعیت:** 🔶 جزئی

**پاسخ کوتاه:** ستون `marketing_channels.daily_quota` وجود دارد و از UI قابل‌تنظیم است و سهمیه اعمال می‌شود، **اما به‌صورت گیت بولی**: اگر سقف=۵ باشد الگوریتم دقیقاً ۵ محصول برنمی‌گرداند؛ بلکه همهٔ محصولات واجدشرایط آن کانال را نشان می‌دهد تا وقتی که ۵ پیشنهاد «استفاده‌شده» ثبت شود، سپس کل کانال از خروجی حذف می‌شود.

**شواهد:**
- L3 (DB — ستون/جدول): `daily_quota integer NULL` روی `marketing_channels` (تأییدشده). مقداردهی از UI: `_app.admin.marketing-channels.tsx:259–281` (خالی/۰ = نامحدود، سقف ۱۰۰۰۰).
- L3 (منطق فیلتر): در `compute_promotion_scores`: `AND (daily_quota IS NULL OR daily_quota = 0 OR used_today < daily_quota)`. این یک شرط **بولی روی کل کانال** است، نه `LIMIT` per-channel. تا وقتی `used_today < daily_quota`، همهٔ ردیف‌های محصولِ آن کانال (تا سقف `_limit=200`) برمی‌گردند.
- L2 (اعمال هنگام ثبت): `markPromotionSuggestionUsed` (`promotion-suggestions.functions.ts:99–110`) قبل از درج، تعداد رویدادهای امروز آن کانال را می‌شمارد و اگر `>= quota` شد `quota_exhausted` برمی‌گرداند و دکمه غیرفعال می‌شود.
- **توجه به دو مفهوم مجزا:** `marketing_channels.daily_quota` (سقف «ثبت استفاده» هر کانال) با `promotion_nomination_policy.per_product_daily_cap` (سقف نامزدیِ هر محصول برای هر نمایندهٔ فروش) کاملاً متفاوت است.

**شکاف نسبت به نیازمندی:** اگر انتظار این است که «الگوریتم فقط N محصول برتر هر کانال را پیشنهاد دهد»، این رفتار وجود ندارد؛ سقف صرفاً تعداد **ثبت‌های استفاده‌شدهٔ روزانه** را محدود می‌کند نه تعداد ردیف‌های پیشنهادی.

**برنچ:** بله.

**وابستگی‌ها:** `audit_logs` (شمارش `used_today`).

**برای رفع چه لازم است:** اگر «سقف = تعداد پیشنهاد نمایش‌داده‌شده» مدنظر است، باید در ویو/تابع یک رتبه‌بندی per-channel (`ROW_NUMBER() OVER (PARTITION BY channel ORDER BY final_score DESC)`) و برش به `daily_quota` افزوده شود.

**ریسک/پیچیدگی:** متوسط — نیازمند بازنویسی ویو/تابع و تعریف دقیق معنای «سقف».

---

### آیتم ۱۶۶ (E5) — وزن محصول در پیشنهادها

**وضعیت:** 🔶 جزئی

**پاسخ کوتاه:** «وزن محصول» در الگوریتم مستقل نیست؛ فقط از **مجموع وزن برچسب‌های فعالِ محصول** (`product_labels.weight`) می‌آید. جدول `product_recommendation_overrides` وجود دارد ولی **در موتور پیشنهاد تبلیغات اصلاً استفاده نمی‌شود**.

**شواهد:**
- L3 (DB): در ویو، تنها منبع وزنِ محصول `label_sums` است: `SUM(pl.weight)` از `product_label_links + product_labels(is_active)`. هیچ ستون «product weight» مستقلی روی `products` در محاسبه دخیل نیست.
- L3 (overrides): `product_recommendation_overrides` در DB موجود است، اما `pg_get_viewdef(v_promotion_suggestions) ILIKE '%recommendation_override%'` = **false** → بی‌ارتباط با این ویو (احتمالاً مربوط به توصیهٔ محصولات مرتبط/فروش، نه تبلیغ).
- L3 (داده): `product_labels`: ۱۲ برچسب فعال، وزن ۰..۳؛ `product_label_links`: ۶۹۴ ردیف.
- L1 (UI): ستون «وزن برچسب‌ها» در صفحهٔ پیشنهادها (`_app.marketing.suggestions.tsx:246`, مقدار `label_weight_sum`).

**شکاف نسبت به نیازمندی:** اگر منظور «وزن‌دهی مستقیم به تک‌محصول (جدا از برچسب)» است، چنین چیزی در الگوریتم نیست؛ وزن‌دهی فقط غیرمستقیم و از طریق برچسب‌گذاری است.

**برنچ:** بله.

**برای رفع چه لازم است:** افزودن یک ستون/جدول «وزن دستی محصول برای تبلیغ» و واردکردن آن در فرمول ویو، یا استفاده از `product_recommendation_overrides` در ویو.

**ریسک/پیچیدگی:** متوسط — تغییر فرمول ویو و افزودن مدل داده.

---

### آیتم ۱۶۷ و ۱۶۸ (E6) — آیا تکمیل تبلیغ توسط فرد مارکتینگ ثبت و به رویداد امتیاز گیمیفیکیشن وصل است؟

**وضعیت:** ⚠️ ناقص

**پاسخ کوتاه:** بله، «استفاده از پیشنهاد» و «نامزدی» در `audit_logs` ثبت می‌شوند، اما **به هیچ رویداد امتیاز گیمیفیکیشن متصل نیستند** — نه تریگری روی جدول‌ها هست، نه `event_key`ی برای تبلیغ در `gamification_kpi_rules`.

**شواهد:**
- L3 (ثبت شدن): `markPromotionSuggestionUsed` یک ردیف `audit_logs` با `action='promotion_suggestion_used'` درج می‌کند (خط ۱۲۹–۱۳۵)؛ `nominate_product_for_promotion` یک ردیف `action='promotion_nominated'` درج می‌کند (migration خط ۳۰۵–۳۰۹). `promotion_nominations` هم ستون‌های `cancelled_at/cancelled_by/boost_applied` دارد (وضعیت نامزدی).
- L3 (نبود اتصال به گیمیفیکیشن):
  - تریگر روی `promotion_nominations`: `pg_trigger WHERE tgrelid='promotion_nominations'` → **۰ ردیف**.
  - `gamification_kpi_rules.event_key`های موجود: `crm_note_created, followup_completed, inbound_call, new_customer_created, outbound_call, payment_late_pay_score, purchase_long_term_score, sale_closed, task_completed, test11` — **هیچ کلید مرتبط با تبلیغ/نامزدی نیست**.
  - `employee_score_events`: هیچ ردیفی با `event_type/source_table ILIKE '%promot%|%nomin%'` نیست (count=0)؛ event_typeهای موجود فقط `manual_adjustment, receipt_link_delete, purchase_long_term_score`.
  - grep کد `src/lib/gamification` برای `promotion_nominated|promotion_suggestion_used` → بدون نتیجه.
- L1 (گزارش): کارت گزارشی `MarketingPromotionSuggestionsUsedCard.tsx` و صفحهٔ `/marketing/suggestions-history` رخدادهای استفاده را نمایش می‌دهند (منبع: همان `audit_logs`) — پس «ثبت» هست، ولی صرفاً ممیزی/گزارشی.

**شکاف نسبت به نیازمندی:** تکمیل/ثبت تبلیغ به XP یا امتیاز کارمند وصل نیست؛ برای گیمیفیکیشن باید یک `event_key` (مثلاً `promotion_completed`/`promotion_nominated`) در `gamification_kpi_rules` تعریف و یک تریگر/سرویس که از `audit_logs` یا `promotion_nominations` به `employee_score_events` امتیاز بدهد اضافه شود.

**برنچ:** بله (بخش ثبت روی سرور هست؛ بخش گیمیفیکیشن اصلاً وجود ندارد).

**وابستگی‌ها:** `gamification_kpi_rules`, `employee_score_events`, سرویس محاسبهٔ امتیاز.

**برای رفع چه لازم است:** افزودن سطر قاعده در `gamification_kpi_rules` با `event_key` تبلیغ + یک هوک/تریگر که هنگام درج رویداد تبلیغ در `audit_logs`/نامزدی، رکورد `employee_score_events` با XP بسازد.

**ریسک/پیچیدگی:** متوسط — نیازمند مدل‌سازی رویداد و اتصال به موتور امتیاز موجود.

---

### آیتم ۱۹۲ (E7) — «نامزدی تبلیغات» چیست؛ منطق کامل و شرایط ورود/خروج حالت «نامزد»

**وضعیت:** ✅ کامل (منطق DB و دکمهٔ UI کامل است؛ فقط بوست عملاً صفر است)

**پاسخ کوتاه:** «نامزدی تبلیغات» یعنی یک **کارشناس فروش** یک محصول را (با دلیل و کانال اختیاری) برای تبلیغ پیشنهاد می‌کند؛ این نامزدیِ فعالِ امروز به «بوستِ فروش» در امتیاز پیشنهاد می‌افزاید. ورود = درج ردیف در `promotion_nominations`؛ خروج = `cancelled_at` پرشدن یا پایان همان روز (نامزدی فقط برای `nominated_on = امروزِ Asia/Tehran` فعال حساب می‌شود).

**منطق کامل (از `nominate_product_for_promotion` / `cancel_promotion_nomination`, migration DB-D):**
1. **مجوز:** فقط نقش‌های `sales|admin|manager` (خط ۲۵۲)؛ در UI دکمه فقط برای `sales` نمایش داده می‌شود (`PromotionNominateButton.tsx:53`).
2. **اعتبارسنجی:** `reason_code` باید یکی از ۷ مقدار مجاز باشد؛ محصول باید موجود باشد؛ وگرنه `invalid_reason_code`/`product_not_found`.
3. **سیاست:** از `_promo_policy_for(uid)` مقادیر `daily_quota`(پیش‌فرض ۳)، `per_product_daily_cap`(۱)، `boost_per_nomination`(۰) خوانده می‌شود. تنها سطر سیاست در DB: `role=NULL, user_id=NULL, daily_quota=3, per_product_daily_cap=1, boost_per_nomination=0, boost_cap_per_product=0`.
4. **Idempotent:** اگر همان نماینده همان محصول را امروز نامزد کرده باشد، همان ردیف بازمی‌گردد و سهمیهٔ جدید مصرف نمی‌شود.
5. **سهمیهٔ روزانهٔ نماینده:** اگر تعداد نامزدی‌های فعال امروزِ نماینده `>= daily_quota` → خطای `daily_quota_exceeded`.
6. **سقف هر محصول (`per_product_daily_cap`):** اگر تعداد نامزدی‌های فعالِ امروزِ آن محصول (روی همهٔ نماینده‌ها) `>= cap` باشد، نامزدی همچنان **ثبت می‌شود اما `boost_applied=0`** و پرچم `capped=true` (در UI: «سهمیهٔ محصول پر بود، بدون امتیاز اضافه»).
7. **درج + ممیزی:** ردیف در `promotion_nominations` با `UNIQUE(nominated_by, product_id, nominated_on)` درج و رویداد `promotion_nominated` در `audit_logs` ثبت می‌شود.

**شرایط حالت «نامزد» (nominated):**
- **ورود:** ردیفی در `promotion_nominations` با `nominated_on = امروز` و `cancelled_at IS NULL`. این ردیف در `nom_today` ویو جمع می‌شود و به `sales_nomination_boost` می‌افزاید.
- **خروج:** یا `cancel_promotion_nomination` که `cancelled_at`/`cancelled_by` را پر می‌کند (فقط توسط خود نماینده و فقط در همان روز)، یا صرفاً گذشتن روز (چون ویو و کوئری‌ها بر `nominated_on = today` قید دارند). حذف مستقیم هم با RLS `promo_nom_delete_own_today` فقط برای ردیف امروزِ خودِ نماینده مجاز است.

**شواهد:**
- L1 (UI): `src/components/sales/PromotionNominateButton.tsx` — مانت‌شده در `src/routes/_app.sales.search.tsx:1439` (`<PromotionNominateButton productId={product.id} />`). دیالوگ کانال/دلیل/یادداشت + نمایش سهمیه.
- L2 (front): `get_promotion_nomination_quota` (خط ۸۲)، `nominate_product_for_promotion` (خط ۹۸)، هر دو با `(supabase as any).rpc`. **`cancel_promotion_nomination` در UI فراخوانی نمی‌شود** (فقط RLS `delete_own_today` برای حذف مستقیم موجود است).
- L3 (DB): جدول `promotion_nominations` (۱۱ ستون، تأییدشده، count=0 رکورد فعلاً)؛ `promotion_nomination_policy` (۱ سطر پیش‌فرض)؛ توابع RPC همه در DB زنده موجودند.
- L4 (access): توابع `SECURITY DEFINER`، فقط `authenticated` گرنت؛ نقش‌سنجی داخل تابع؛ RLS جدول‌ها طبق migration.

**شکاف نسبت به نیازمندی:** (۱) بوست عملاً بی‌اثر است چون `boost_per_nomination=0` — تا زمان کالیبراسیون، نامزدی هیچ تأثیر عددی بر رتبه ندارد. (۲) لغو نامزدی از UI در دسترس نیست (فقط RPC/RLS backend). (۳) نامزدی به گیمیفیکیشن وصل نیست (رجوع به E6).

**برنچ:** بله.

**وابستگی‌ها:** `products`, `marketing_channels`, `user_roles`/`has_any_role`, `audit_logs`, `promotion_nomination_policy`.

**برای رفع چه لازم است:** مقداردهی `boost_per_nomination`/`boost_cap_per_product` در سیاست برای فعال‌شدن اثر بوست؛ افزودن دکمهٔ «لغو نامزدی» به UI؛ و اتصال به گیمیفیکیشن (E6).

**ریسک/پیچیدگی:** پایین برای فعال‌کردن بوست (فقط داده)؛ متوسط برای UI لغو و اتصال گیمیفیکیشن.
