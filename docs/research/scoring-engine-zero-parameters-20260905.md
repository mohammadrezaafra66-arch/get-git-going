# پژوهش — چرا موتور امتیازدهی «۰ از ۱۰ پارامتر» را ارزیابی می‌کند

**READ-ONLY — هیچ چیزی تغییر نکرد.** تنها فایل نوشته‌شده در این مأموریت همین سند است.
هیچ migration، هیچ نصب، هیچ اصلاح کد، هیچ نوشتنی روی دیتابیس.
همهٔ statementها با `PGOPTIONS="-c default_transaction_read_only=on"` اجرا شدند.
`192.168.170.10` نه تماس گرفته شد، نه resolve، نه ping.

| | |
|---|---|
| مخزن | `D:\AfraKalaTest\app` · شاخهٔ `staging` |
| SHA خوانده‌شده | `49f11b1e84cd7733647b988d9c3123d632797ae8` |
| دیتابیس | `afrakala` روی `afrakala-lan-db` (`docker exec -u postgres`) |
| تاریخ | ۲۰۲۶-۰۹-۰۵ |
| مشتری موضوع بررسی | `d634ac60…` (در ادامه «مشتری‌الف») |
| وضعیت | **COMPLETE** — هر ۲۰ زیربند Q1–Q5 حکم دارد |

### وضعیت درخت کاری — ابتدا و انتهای مأموریت (verbatim)

```
$ git worktree list                                   # شروع، ۲۱:۰۷
D:/AfraKalaTest/app                                          49f11b1e [staging]
.../050740c7-.../wt-anonfix                                  e739723f [feature/close-anon-role-grant]
.../050740c7-.../wt-base                                     edf1001d [docs/wave1-completion-report]
.../050740c7-.../wt-t0                                       adbf5a5c [feature/credit-customers-honest-columns]
.../050740c7-.../wt-w1A                                      a897ff79 [feature/wave1-agentA]
.../050740c7-.../wt-w1B                                      f1642422 [feature/wave1-b7-rename-backups]
.../050740c7-.../wt-w1C                                      9fea8bb7 [feature/wave1-agentC]
.../050740c7-.../wt-w1D                                      5b81e934 [feature/wave1-agentD]
.../631fa7ea-.../wt/agentS                                   adbf5a5c [feature/wave2-agentS]
.../631fa7ea-.../wt/agentW                                   6bf2b593 [feature/wave2-agentW]
.../8c144667-.../wt-phonefix                                 6298b97d [hotfix/quote-link-empty-phone]
D:/AfraKalaTest/afrakala-deploy-sidebar                      257ba917 (detached HEAD)
D:/AfraKalaTest/app-docs-build                               33bc6704 [feature/documents-dual-filter-export]

$ git status --porcelain     # شروع و پایان، یکسان
?? .ship-state.json
?? docs/missions/

$ git rev-parse HEAD         # پایان
49f11b1e84cd7733647b988d9c3123d632797ae8
```

**درخت زیر پای من تکان نخورد.** HEAD در پایان همان `49f11b1e` روی `staging` بود و فهرست
untracked بدون تغییر ماند (این سند بعد از آخرین بررسی نوشته شد).

---

## Verdict

**یک علت است، نه ده تا — و علت «نبودِ داده» نیست، «نگاه‌کردن به ماه اشتباه» است.** [E]

مشتری‌الف **هر ده پارامتر را دارد** و اگر در ماه درست پرسیده شود امتیاز واقعی می‌دهد:
`calculate_dynamic_score('customer', d634ac60…, '2026-07-01')` همین حالا
**`10 active | 10 evaluated | weighted=0.188950`** برمی‌گرداند. همان فراخوان با
`'2026-08-01'` می‌دهد **`10 active | 0 evaluated | weighted=0.000000`**.

دلیلش در بدنهٔ `calculate_customer_realtime_credit` خط ۹۲ است: دورهٔ امتیاز از
**تاریخ آخرین snapshot سرمایه** گرفته می‌شود، نه از امروز و نه از آخرین ماهی که مشتری
امتیاز دارد:

```sql
-- calculate_customer_realtime_credit:92
v_score := public.calculate_dynamic_score('customer', p_customer_id, v_capital_date);
```

`v_capital_date` امروز `2026-08-31` است (خطوط ۶۹–۷۵، آخرین `daily_capital_settings`)، و
`calculate_dynamic_score:19` آن را با `date_trunc('month', …)` به **`2026-08-01`** تبدیل
می‌کند. مشتری‌الف در `dynamic_entity_scores` **فقط ۱۰ سطر برای `2026-07-01`** دارد و
**صفر سطر برای `2026-08-01`**. پس LEFT JOIN خط ۷۴ هیچ سطری نمی‌آورد، شمارندهٔ
`COUNT(*) FILTER (WHERE s.raw_score IS NOT NULL)` صفر می‌شود، و صفحه درست گزارش می‌دهد:
«۰ از ۱۰».

**این نقصِ موتور نیست؛ نقصِ تغذیهٔ آن است.** هر ده پارامتر **ورودی دستی** هستند —
`input_type` ∈ {`score_input`, `months`, `toman`, `score_100`} — و **هیچ تابع، تریگر یا
migrationی در کل سیستم در `dynamic_entity_scores` نمی‌نویسد.** تنها نویسنده یک upsert
مستقیم از UI است (`useUpsertEntityScore`)، و آن صفحه روی `currentPeriodMonth()` یعنی
**ماه جاری (`2026-09-01`)** می‌نویسد (`DynamicScoringSection.tsx:92`). یعنی صفحهٔ ورود
داده به شهریور می‌نویسد، در حالی که کارت اعتبارِ همان صفحه از مرداد می‌خواند. کسی در
شهریور هنوز چیزی وارد نکرده (`2026-09-01` → صفر سطر در کل جدول)، و در مرداد هم برای این
مشتری وارد نکرده بود.

**پیامد عملی:** «recompute را اجرا کن» راه‌حل نیست. `recompute_customer_credit_scores`
یک سامانهٔ امتیازدهی **کاملاً جداگانه** است و یک سطر هم در `dynamic_entity_scores`
نمی‌نویسد. آنچه لازم است، ورود دستی ده عدد برای **ماه درست** توسط
admin/manager/accountant است.

---

## پارامترها

هر ده پارامتر `entity_type='customer'`، `is_active=true`، `direction='positive'`، و مجموع
وزن‌ها دقیقاً **۱٫۰۰۰** است. ستون «چه چیزی می‌خواند» برای هر ده تا **یکسان** است و از
بدنهٔ کد می‌آید، نه از نام پارامتر:

```sql
-- calculate_dynamic_score:74-78 — تنها منبع ورودیِ هر پارامتر
LEFT JOIN dynamic_entity_scores s
  ON s.parameter_id = p.id
  AND s.entity_type = p_entity_type
  AND s.entity_id   = p_entity_id
  AND s.period_month = v_period
```

هیچ‌کدام از این ده پارامتر به `sales_quotes`، `customer_credit_profile`، دفتر معین یا هر
جدول کسب‌وکاری دیگری وصل نیست. مقدارشان را **آدم تایپ می‌کند** در ستون `actual_value`، و
تریگر `trg_a_compute_raw_score` آن را به `raw_score` نرمال می‌کند:

```sql
-- compute_normalized_raw_score:23-27
v_norm := LEAST(1, GREATEST(0, (NEW.actual_value - p_min) / (p_max - p_min)));
IF p_direction = 'negative' THEN v_norm := 1 - v_norm; END IF;
NEW.raw_score := ROUND(v_norm::numeric, 3);
```

ستون‌های «تیر/مرداد/شهریور» یعنی: آیا مشتری‌الف برای آن دوره سطر دارد؟

| کد | برچسب فارسی | وزن | نوع ورودی | بازه | واحد | تیر (۰۷-۰۱) | مرداد (۰۸-۰۱) | شهریور (۰۹-۰۱) |
|---|---|---|---|---|---|---|---|---|
| `customer_payment_discipline` | انضباط در واریز و پرداخت | 0.150 | score_input | 0 .. 100 | — | بله | **خیر** | **خیر** |
| `customer_cooperation_months` | سابقه همکاری | 0.100 | months | 1 .. 360 | ماه | بله | **خیر** | **خیر** |
| `customer_profit_3m` | سود ۳ ماه گذشته | 0.200 | toman | 0 .. 2,500,000,000 | تومان | بله | **خیر** | **خیر** |
| `customer_purchase_3m` | خرید ۳ ماه گذشته | 0.100 | toman | 0 .. 10,000,000,000 | تومان | بله | **خیر** | **خیر** |
| `customer_purchase_1y` | خرید ۱ سال گذشته | 0.100 | toman | 0 .. 25,000,000,000 | تومان | بله | **خیر** | **خیر** |
| `customer_profit_1y` | سود ۱ سال گذشته | 0.150 | toman | 0 .. 5,000,000,000 | تومان | بله | **خیر** | **خیر** |
| `customer_purchase_3y` | خرید ۳ سال گذشته | 0.050 | toman | 0 .. 50,000,000,000 | تومان | بله | **خیر** | **خیر** |
| `customer_profit_3y` | سود ۳ سال گذشته | 0.050 | toman | 0 .. 15,000,000,000 | تومان | بله | **خیر** | **خیر** |
| `customer_professional_behavior` | رفتار حرفه‌ای و احترام | 0.050 | score_100 | 0 .. 100 | امتیاز | بله | **خیر** | **خیر** |
| `customer_availability` | میزان در دسترس بودن | 0.050 | score_100 | 0 .. 100 | امتیاز | بله | **خیر** | **خیر** |

**تست نام (self-check بند ۳):** جملهٔ ستون «چه می‌خواند» را از روی نام هیچ‌کدام از این
پارامترها نمی‌شد نوشت. نام‌ها — `customer_purchase_1y`، `customer_profit_3y`،
`customer_payment_discipline` — همگی القا می‌کنند که عددی از تاریخچهٔ خرید یا پرداخت
**محاسبه** می‌شود. بدنهٔ کد خلافش را نشان می‌دهد: `calculate_dynamic_score` هیچ‌جا
`sales_quotes` یا هیچ جدول تراکنشی را لمس نمی‌کند — تنها `dynamic_entity_scores` را
LEFT JOIN می‌کند و منتظر عددی است که آدم تایپ کرده باشد. `customer_purchase_1y` یعنی
«عددی که یک نفر به‌عنوان خرید یک‌سالهٔ این مشتری وارد کرده»، نه «مجموع خرید یک‌ساله».

---

## گروه‌بندی علت‌ها

**فقط یک گروه وجود دارد.** این پاسخ به سؤال «یک رفع همه را باز می‌کند یا ده رفع لازم است».

| گروه | پارامترها | علت مشترک | با رفع، چند تا زنده می‌شود |
|---|---|---|---|
| **الف — نبودِ سطر ورودی دستی در دورهٔ درخواستی** | **هر ۱۰ تا** | همهٔ پارامترها ورودی دستی‌اند و مشتری‌الف برای `2026-08-01` (دوره‌ای که تابع می‌پرسد) هیچ سطری ندارد | **۱۰ از ۱۰** |

گروه‌هایی که بریف پیش‌بینی کرده بود و **وجود ندارند** — این هم یافته است:

- **«جدول منبع خالی است»** — منتفی. هیچ پارامتری جدول منبع ندارد. [E]
- **«جدول منبع حذف شده (`invoices`)»** — منتفی برای این ده پارامتر.
  `calculate_dynamic_score` اصلاً `invoices` را نام نمی‌برد. `invoices` واقعاً حذف شده
  (`information_schema.tables` → ۰ سطر) و `calculate_credit_score` نُه بار به آن ارجاع
  می‌دهد، اما آن تابع در مسیر این ده پارامتر **نیست**. [E]
- **«فقط این مشتری داده ندارد»** — نیمه‌درست و گمراه‌کننده. مشتری‌الف داده **دارد**،
  فقط در ماه دیگری. مشکل انطباق دوره است، نه نبود داده. [E]

### Q1 — احکام

| زیربند | حکم |
|---|---|
| Q1.1 فهرست پارامترها | **پاسخ داده شد** — جدول بالا. جدول‌ها واقعاً `dynamic_scoring_parameters` و `dynamic_parameter_weights` نام دارند (تأیید شد، حدس نبود). ۱۰ پارامتر مشتری + ۶ پارامتر کارشناس = ۱۶ فعال. |
| Q1.2 هر کدام چه می‌خواند | **پاسخ داده شد** — هر ده تا از یک جا: `dynamic_entity_scores.actual_value`، ورودی دستی. نقل‌قول بالا. |
| Q1.3 آن ورودی امروز هست؟ | **پاسخ داده شد** — برای مشتری‌الف: ۱۰ سطر در تیر، ۰ در مرداد، ۰ در شهریور. |
| Q1.4 گروه‌بندی | **پاسخ داده شد** — یک گروه، ۱۰ از ۱۰. |

---

## Q2 — ارزیابی دقیقاً کجا متوقف می‌شود

**Q2.1 — تابع و شاخهٔ تصمیم‌گیرنده.** `params_evaluated` در دو تابع تولید می‌شود:
`calculate_dynamic_score` (اصل) و `calculate_customer_realtime_credit` (که آن را عبور
می‌دهد). شاخهٔ تعیین‌کننده:

```sql
-- calculate_dynamic_score:41-42, 68
SELECT
  COUNT(*) FILTER (WHERE s.raw_score IS NOT NULL),
  ...
INTO v_params_evaluated, v_breakdown
```

یک پارامتر وقتی «ارزیابی‌شده» شمرده می‌شود که **سطر متناظرش در `dynamic_entity_scores`
برای آن `period_month` وجود داشته باشد و `raw_score` آن NULL نباشد**. هیچ محاسبه، هیچ
fallback، هیچ تلاشی برای واکشی از منبع دیگر در کار نیست.

و دوره از اینجا می‌آید:

```sql
-- calculate_dynamic_score:19
v_period := date_trunc('month', COALESCE(p_period_month, current_date))::date;
```

**Q2.2 — فراخوانی read-only برای این مشتری.** (خروجی verbatim، سه دوره)

```
-- period arg 2026-07-01 --
10 active | 10 evaluated | weighted=0.188950 | total_w=1.000 | period=2026-07-01
-- period arg 2026-08-01 --
10 active | 0 evaluated  | weighted=0.000000 | total_w=0     | period=2026-08-01
-- period arg 2026-09-05 --
10 active | 0 evaluated  | weighted=0.000000 | total_w=0     | period=2026-09-01
```

توجه: `total_active_weight` هم صفر می‌شود، چون آن SELECT (خطوط ۲۱–۳۴) یک **INNER JOIN**
به `dynamic_entity_scores` دارد. پس شرط `IF v_total_active_weight > 0` در خط ۸۲ رد
می‌شود و `v_weighted_score` روی مقدار اولیهٔ `0` می‌ماند. `breakdown` هنوز هر ده پارامتر
را برمی‌گرداند (به‌خاطر LEFT JOIN) اما هر کدام با `has_score=false`، `actual_value=null`،
`normalized_weight=0`، `contribution=0` — یعنی صفحه ده ردیف خالی نشان می‌دهد، نه فهرست خالی.

**Q2.3 — سطرهای غایب یا شکستِ ارزیابی؟ قطعاً سطرهای غایب.** [E]
این دو با یک آزمایش از هم جدا شدند: همان تابع، همان مشتری، همان کد، فقط دورهٔ متفاوت →
۱۰ از ۱۰. اگر پارامترها در ارزیابی می‌شکستند، دورهٔ تیر هم صفر می‌داد. هیچ استثنایی،
هیچ NULL غیرمنتظره‌ای، هیچ خطای تبدیل نوعی رخ نمی‌دهد.

**Q2.4 — چه چیزی سطرهای تیر و مرداد را نوشت؟ یک آدم، از طریق یک صفحه.** [E]
شواهد، سه‌تایی و هم‌جهت:

1. **هیچ تابع دیتابیسی در این جدول نمی‌نویسد.** فهرست کامل توابعی که نام جدول را در
   بدنه دارند: `calculate_dynamic_score` — و آن `STABLE` است و فقط `SELECT` می‌کند.
2. **هیچ migrationی سطر درج نمی‌کند.**
   `grep -rn "INSERT INTO public.dynamic_entity_scores" -i supabase/migrations/` → خروجی خالی.
3. **پنج تریگر روی جدول هست، هیچ‌کدام سطر تولید نمی‌کند** — همه `BEFORE/AFTER` روی سطری‌اند
   که از بیرون می‌آید: `trg_a_compute_raw_score` (نرمال‌سازی)، `trg_validate_dyn_score`،
   `trg_dyn_scores_set_updated_at`، `trg_audit_dyn_score`،
   `trg_refresh_dyn_capital_after_score_change`.

تنها نویسنده در کل مخزن `useUpsertEntityScore` است
(`src/hooks/credit/useDynamicScoring.ts:167-215`) — یک `insert`/`update` مستقیم روی جدول
از سمت مرورگر. و همهٔ ۱۵۰ سطر موجود `scored_by` غیر NULL دارند (یعنی شناسهٔ یک کاربر ثبت شده).

> **این دقیقاً همان چیزی است که بریف گفت مالک باید بداند: «recompute را اجرا کن» رفع
> نیست.** هیچ recomputeی وجود ندارد که این جدول را پر کند. داده باید تایپ شود.

**بازاندازه‌گیری شمارش‌ها `[P]` در برابر `[E]` — پیشین درست بود:**

| دوره | `[P]` | `[E]` (اندازه‌گیری اینجا) | حکم |
|---|---|---|---|
| 2026-07-01 | ۵۵ | ۵۵ (۳۸ customer + ۱۷ salesperson) | **تأیید** |
| 2026-08-01 | ۹۵ | ۹۵ (۵۳ customer + ۴۲ salesperson) | **تأیید** |
| 2026-09-01 | ۰ | ۰ (اصلاً سطری با این دوره وجود ندارد) | **تأیید** |
| «هیچ تابعی این جدول را نمی‌نویسد» | ادعا | تأیید شد | **تأیید** |

---

## Q3 — آیا اختلاف امتیاز واقعی است؟

**بله، واقعی است — ولی نه آن‌طور که گزارش شده بود، و روی مشتری‌الف بازتولید نمی‌شود.** [E]

**Q3.1 — روی مشتری‌الف.** صفحه دو محل نمایش امتیاز دارد و هر دو **از یک منبع** می‌آیند:

```tsx
// _app.sales_.customers_.$customerId.credit.tsx:114
{toFaDigits(Number(realtime?.weighted_score ?? latestAlloc.weighted_score).toFixed(3))}
```
```tsx
// DynamicScoringSection.tsx:288
امتیاز وزنی: {toFaDigits(Number(realtimeQ.data.weighted_score ?? 0).toFixed(3))}
```

هر دو `calculate_customer_realtime_credit` را می‌خوانند، و امروز هر دو `0.000` می‌دهند.
**پس گزارش قبلیِ «۰٫۲۱۳ در برابر ۰٫۰۰۰» روی این مشتری بازتولید نمی‌شود — این را صریح
می‌نویسم، همان‌طور که بریف خواسته بود.**

**اما دو سازوکار واقعی برای اختلاف در کد هست، و عدد ۰٫۲۱۳ ساختگی نبوده:**

**سازوکار ۱ — عملگر `??` در خط ۱۱۴ یک fallback به snapshot است.** اگر `realtime`
تعریف‌نشده باشد (خطای RPC، یا کاربری که admin/manager/accountant نیست — تابع در خطوط
۲۸–۳۴ صراحتاً استثنا پرتاب می‌کند)، همان کارت **`latestAlloc.weighted_score`** یعنی عدد
**منجمدشدهٔ snapshot** را نشان می‌دهد، در حالی که بخش پایین‌تر صفحه چیز دیگری می‌گوید.
برای مشتری‌الف این دو عدد `0.234050` و `0.000` هستند.

**سازوکار ۲ — عدد ۰٫۲۱۳ وجود دارد، روی مشتری دیگری.**

```sql
select dcs.capital_date, left(cad.customer_id::text,8), cad.weighted_score
from customer_capital_allocations_dynamic cad
join daily_capital_settings dcs on dcs.id=cad.capital_setting_id
where round(cad.weighted_score,3)=0.213;
```
```
2026-08-28|61ba4ba6|0.213150
2026-08-29|61ba4ba6|0.213150
2026-08-31|61ba4ba6|0.213150
```

پس گزارش قبلی به احتمال زیاد دربارهٔ مشتری `61ba4ba6…` بوده، نه مشتری‌الف. **رد نمی‌شود؛
جابه‌جا می‌شود.**

**Q3.2 — آیا کسی امتیاز غیرصفر دارد؟ بله.**

| منبع | یافته |
|---|---|
| `dynamic_entity_scores` | ۵ مشتری در تیر، ۶ مشتری در مرداد سطر دارند (از ۹۱ مشتری) |
| `customer_capital_allocations_dynamic` (snapshot) | آخرین تخصیص `2026-08-31`: ۸ مشتری سطر دارند، **۵ تا `final_limit>0`** و ۳ تا صفر |
| مشتری‌الف با فراخوان زنده در دورهٔ تیر | `0.188950` |

**Q3.3 — یک اختلاف سومِ اندازه‌گیری‌شده که در بریف نبود.** [E]
snapshot مشتری‌الف در `2026-07-29` عدد **`0.234050`** را نگه داشته، اما فراخوان امروزِ
همان تابع برای **همان دورهٔ تیر** عدد **`0.188950`** می‌دهد. علت، دقیقاً همان تلهٔ بند ۱۰
در `CLAUDE.md` است: migration 411 بازه‌ها را پهن کرد و با `SET actual_value = actual_value`
(خط ۶۰) تریگر نرمال‌سازی را دوباره شلیک کرد، پس `raw_score`های تیر **پایین‌تر بازنویسی
شدند**. شاهدش در خود داده هست:

```
period_month | created            | updated
2026-07-01   | 2026-07-13..07-30  | 2026-07-13..2026-08-29   <-- سطرهای تیر در مرداد به‌روز شدند
2026-08-01   | 2026-08-02..08-31  | 2026-08-02..2026-08-31
```

یعنی **snapshotهای تاریخی با هر بازمحاسبه‌ای دیگر بازتولید نمی‌شوند.** این برای هر گزارش
تاریخیِ اعتبار پیامد دارد.

---

## Q4 — دروازهٔ معوق

**Q4.1 — از بدنه، تأیید شد.** هر دو ادعای `[P]` دقیقاً درست‌اند، با همان شماره خط:

```sql
-- calculate_customer_realtime_credit:36-42
SELECT c.responsible_id, COALESCE(cp.credit_limit,0), COALESCE(cp.has_overdue,false)
INTO v_responsible, v_credit_limit, v_has_overdue
FROM public.customers c
LEFT JOIN public.customer_credit_profile cp ON cp.customer_id = c.id   -- خط ۴۱
WHERE c.id = p_customer_id;

-- خط ۴۸
IF v_has_overdue THEN
  RETURN jsonb_build_object('weighted_score', 0, ... 'binding_constraint','overdue', ...);
```

و `customer_credit_profile` **کاملاً خالی است**:
`select count(*) from customer_credit_profile;` → **`0`**.
پس `LEFT JOIN` همیشه NULL می‌دهد، `COALESCE(...,false)` همیشه `false`، و شاخهٔ خط ۴۸
**هرگز اجرا نمی‌شود**. همچنین `v_credit_limit` همیشه `0` است، پس گیرهٔ سقف اعتبار در خط
۱۲۳ (`IF v_credit_limit > 0 AND …`) هم هرگز فعال نمی‌شود. **هر دو تأیید.**

**Q4.2 — آیا چیز دیگری جلوی مشتری معوق را می‌گیرد؟ بله — و این مهم‌ترین نکتهٔ این بخش است.**

مسیر ثبت پیش‌فاکتور `calculate_customer_realtime_credit` را **اصلاً صدا نمی‌زند**. تابع
دیگری صدا می‌زند:

```sql
-- create_sales_quote_with_items (بلوک «۲۱۲ — strict credit/overdue/accounting paths»)
SELECT * INTO _credit FROM public.get_customer_dynamic_credit(p_customer_id);

IF COALESCE(_credit.has_overdue,false) OR COALESCE(_credit.binding_constraint,'')='overdue' THEN
  IF p_quote_exception_type IS DISTINCT FROM 'overdue_salesperson_commitment' THEN
    RAISE EXCEPTION 'مشتری مانده معوق دارد. …' USING ERRCODE='22023';
  END IF;
ELSIF _credit IS NULL OR NOT COALESCE(_credit.has_allocation,false)
      OR COALESCE(_credit.available_credit,0) <= 0 THEN
  IF p_quote_exception_type IS DISTINCT FROM 'accounting_approval' THEN
    RAISE EXCEPTION 'برای این مشتری اعتبار قابل استفاده ثبت نشده است. …' USING ERRCODE='22023';
  END IF;
ELSIF COALESCE(_credit.available_credit,0) >= _sum_final THEN
  … 'credit_ok' …
ELSE
  … کسری اعتبار: فقط با تعهد کارشناس، و مبلغ کسری باید با محاسبه بخواند …
```

**دروازهٔ معوق آنجا هم کور است، به همان دلیل:** `get_customer_dynamic_credit` هم
`has_overdue` را از همان جدول خالی می‌خواند:

```sql
-- get_customer_dynamic_credit:52-60
SELECT …, COALESCE(p.has_overdue,false), p.overdue_since
INTO   …, v_has_overdue, v_overdue_since
FROM public.customer_credit_profile p
WHERE p.customer_person_id = _person_id;
```

**اما شاخهٔ دوم واقعاً شلیک می‌کند.** `available_credit` چنین ساخته می‌شود:

```sql
-- get_customer_dynamic_credit:63
GREATEST(v_final_limit - COALESCE(v_outstanding,0) - COALESCE(v_held,0), 0)::numeric AS available_credit
```

و `v_final_limit` از آخرین سطر `customer_capital_allocations_dynamic` می‌آید — که برای
مشتری‌الف و برای هر مشتری‌ای که امتیازش صفر شده، **صفر** است. پس ثبت عادی پیش‌فاکتور با
`22023` رد می‌شود و فقط با «تأیید حسابداری» ادامه پیدا می‌کند.

**Q4.3 — ریسک واقعی، در یک جمله:**
**امروز یک مشتری معوق نمی‌تواند بی‌سروصدا اعتباری خرید کند — نه به‌خاطر دروازهٔ معوق که
کور است، بلکه چون سقف اعتبارش صفر است و او را به شاخهٔ «تأیید حسابداری» می‌اندازد؛ اما
این محافظت تصادفی و شکننده است: به محض اینکه کسی برای یک مشتری امتیاز وارد کند و
`final_limit` او مثبت شود، معوق‌بودنش دیگر هیچ‌جا بررسی نمی‌شود و او مسیر `credit_ok` را
عادی رد می‌کند.** [E]

امروز **۵ مشتری `final_limit>0` دارند** — یعنی پنج مشتری همین حالا در آن وضعیت‌اند. اینکه
هیچ‌کدام واقعاً معوق باشند یا نه **قابل بررسی نیست**، چون جدولی که معوقیت را نگه می‌دارد
خالی است. این یعنی سیستم امروز **نمی‌داند** چه کسی معوق است.

**Q4.4 — هیچ تلاشی برای رفع نشد.** فقط اندازه‌گیری و گزارش.

> **نکتهٔ جانبی که حین خواندن پیدا شد و ثبتش لازم است:**
> `get_customer_dynamic_credit` در خط ۳۰ `PERFORM public._ensure_credit_balance(p_customer_id)`
> دارد — یعنی این تابعِ ظاهراً خواندنی **می‌نویسد**. به همین دلیل عمداً آن را در این
> مأموریت فراخوانی **نکردم**؛ در تراکنش read-only شکست می‌خورد و در تراکنش عادی سطر
> می‌ساخت. هر کسی که آن را «فقط برای دیدن» صدا بزند، داده تولید می‌کند.

---

## پیش‌نیازها، مرتب‌شده — Q5

**Q5.1 و Q5.2 — برای اینکه *یک* پارامتر برای *یک* مشتری ارزیابی شود، چه باید باشد:**

| # | پیش‌نیاز | هست؟ | چند پارامتر را باز می‌کند | چه کسی می‌تواند فراهمش کند |
|---|---|---|---|---|
| ۱ | **سطر در `dynamic_entity_scores` با `entity_id` مشتری و `period_month` برابر با ماهِ `capital_date`** | **نیست** (برای مشتری‌الف در مرداد صفر سطر) | **۱۰ از ۱۰** | admin / manager / accountant، دستی از صفحهٔ امتیازدهی |
| ۲ | پارامتر فعال با وزن معتبر در آن دوره | **هست** — ۱۰ پارامتر، مجموع وزن ۱٫۰۰۰، `valid_from='2026-07-01'`، `valid_to=NULL` | پیش‌شرط همه | — |
| ۳ | `actual_value` یا `raw_score` غیر NULL (تریگر در غیر این صورت استثنا می‌دهد) | مشروط به ۱ | همان ۱۰ | همان |
| ۴ | `customers.responsible_id` غیر NULL (خط ۵۸ وگرنه `no_salesperson`) | **هست برای مشتری‌الف** | دروازهٔ خروجی، نه پارامتر | admin |
| ۵ | snapshot سرمایهٔ کارشناس (خط ۷۷ وگرنه `no_capital`) | **هست** — `2026-08-31`، ۳۱۱ میلیون | دروازهٔ خروجی | — |
| ۶ | نقش فراخوان admin/manager/accountant (خطوط ۲۸–۳۴) | **هست** | دروازهٔ دسترسی | — |
| ۷ | هم‌راستایی دورهٔ نوشتنِ UI با دورهٔ خواندنِ تابع | **نیست** — UI به `2026-09-01` می‌نویسد، تابع از `2026-08-01` می‌خواند | **۱۰ از ۱۰** (پیش‌نیاز ۱ را بی‌اثر می‌کند) | تصمیم مالک/توسعه‌دهنده |

**پاسخ Q5.5 — رتبه‌بندی:** **یک چیز، هر ده پارامتر را باز می‌کند: وجود سطرهای دستی در
دورهٔ درست.** پیش‌نیازهای ۲، ۴، ۵ و ۶ همگی امروز برقرارند. تنها پیش‌نیازهای ۱ و ۷ غایب‌اند
و در واقع **یک مسئله‌اند از دو سو**: داده در ماهی نوشته می‌شود که خوانده نمی‌شود.

**نکتهٔ حیاتی برای مالک:** حتی اگر همین امروز کسی هر ده پارامتر مشتری‌الف را از صفحهٔ
امتیازدهی وارد کند، **امتیاز صفحهٔ اعتبار همچنان ۰ می‌ماند** — چون آن ورودی به
`2026-09-01` می‌رود و کارت اعتبار از `2026-08-01` می‌خواند. این تا وقتی یک
`daily_capital_settings` با `capital_date` در شهریور ساخته نشود ادامه دارد.

**Q5.3 — آیا `recompute_customer_credit_scores` اصلاً قابل استفاده است؟
قابل استفاده هست، ولی به این مسئله ربطی ندارد.** [E] — و این ادعای `[P]` را اصلاح می‌کند.

پروب read-only، خروجی verbatim:
```
$ psql -c "select public.recompute_customer_credit_scores(1,0);"
ERROR:  unauthenticated
CONTEXT:  PL/pgSQL function recompute_customer_credit_scores(integer,integer) line 11 at RAISE
```
این خطا از خط ۱۵–۱۷ می‌آید (`IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'`) و
صرفاً به این دلیل است که `auth.uid()` زیر psql تهی است — **نه** به دلیل `invoices`. برای
رسیدن به بدنه باید JWT شبیه‌سازی می‌شد؛ چون تابع `SECURITY DEFINER` است و در مسیرش
`INSERT/UPDATE` وجود دارد، عمداً این کار را **نکردم** (بند «change nothing»).

سه چیز اما بدون فراخوانی اثبات شد:

1. **این تابع یک سطر هم در `dynamic_entity_scores` نمی‌نویسد.**
   `pg_get_functiondef(calculate_credit_score) ILIKE '%dynamic_entity_scores%'` → **`f`**،
   و بدنهٔ `recompute_customer_credit_scores` هم نامی از آن نمی‌برد. **پس اجرای آن
   «۰ از ۱۰» را درست نمی‌کند.** این پاسخ مستقیم به نگرانی بریف است.
2. **`calculate_credit_score` واقعاً `invoices` را می‌خواند** — ۹ بار رشتهٔ `invoices` در
   بدنه‌اش هست، و `invoices` در `information_schema.tables` **۰ سطر** دارد (حذف‌شده).
3. **اما خطا کل اجرا را نمی‌کشد.** خطوط ۳۷ و ۴۸–۵۵ هر مشتری را در
   `BEGIN … EXCEPTION WHEN OTHERS` می‌پیچند و `status='error'` برمی‌گردانند. یعنی این تابع
   امروز به احتمال زیاد برای هر مشتری یک سطر `error` می‌دهد و **بی‌صدا هیچ کاری نمی‌کند** —
   بدترین حالت برای کسی که فکر می‌کند «recompute را زدم، پس درست شد».

**Q5.4 — `responsible_id`، بازاندازه‌گیری.**
```sql
select count(*) total, count(responsible_id) with_resp, count(*)-count(responsible_id) without
from customers;
```
```
91|14|77
```
`[P]` گفته بود ۷۳ از ۸۶ بدون مسئول. `[E]` می‌گوید **۷۷ از ۹۱**. نسبت تقریباً یکسان است
(۸۴٫۹٪ در برابر ۸۴٫۸٪) و تعداد کل مشتری‌ها از ۸۶ به ۹۱ رسیده — یعنی داده جابه‌جا شده، نه
اینکه یکی از دو اندازه‌گیری غلط باشد.

**و مهم: مشتری‌الف `responsible_id` دارد.** پس این **علت دوم مستقلِ صفر بودن نیست** —
فرضیهٔ بریف در این مورد رد می‌شود. اگر نداشت، `binding_constraint` روی صفحه
`no_salesperson` می‌شد، نه «فرمول امتیاز». همان‌طور که مالک دید «فرمول امتیاز» نمایش داده
شده — که با خط ۱۲۸ (`v_binding := 'formula'`) می‌خواند و تأیید می‌کند که تابع تا انتها
رفته و صرفاً امتیازی برای تقسیم نداشته.

---

## Contradictions with prior art

| # | ادعای `[P]` | اندازه‌گیری `[E]` | حکم |
|---|---|---|---|
| ۱ | `unwired-inventory-20260905.md` «untracked، فقط در main tree» | در main tree **نیست**؛ در چهار worktree موج ۱ هست (`wt-w1A/B/C/D`) | **تناقض** — بریف اشتباه بود |
| ۲ | `recompute_customer_credit_scores` به `calculate_credit_score` می‌رسد که `invoices` را می‌خواند | درست، ولی **پروب مستقیم `unauthenticated` می‌دهد نه `42P01`** — و مهم‌تر: این تابع اصلاً `dynamic_entity_scores` را نمی‌نویسد، پس به «۰ از ۱۰» ربطی ندارد | **اصلاح مهم** |
| ۳ | «۷۳ از ۸۶ مشتری `responsible_id` ندارند» | ۷۷ از ۹۱ | **جابه‌جایی داده**، نه تناقض (نسبت یکسان) |
| ۴ | `calculate_credit_score` در **شش** جا `invoices` را می‌خواند | ۹ بار رشتهٔ `invoices` در بدنه | **قابل جمع** — «جا» و «رخداد رشته» یکی نیستند؛ تناقض ثبت نکردم |
| ۵ | «۰٫۲۱۳ در برابر ۰٫۰۰۰ روی مشتری‌الف بازتولید نشد» | تأیید — بازتولید **نمی‌شود**؛ ولی ۰٫۲۱۳۱۵۰ روی مشتری `61ba4ba6` واقعاً وجود دارد | **تأیید + جابه‌جایی هدف** |
| ۶ | `calculate_customer_realtime_credit` خط ۴۱ `customer_credit_profile`، خط ۴۸ `v_has_overdue` | هر دو دقیقاً همان خط | **تأیید کامل** |
| ۷ | `dynamic_entity_scores`: ۵۵ / ۹۵ / ۰ | ۵۵ / ۹۵ / ۰ | **تأیید کامل** |
| ۸ | «هیچ تابعی `dynamic_entity_scores` را نمی‌نویسد» | تأیید — تنها `calculate_dynamic_score` نامش را دارد و `STABLE` است | **تأیید** |
| ۹ | SHA پیشین `6c812f08` | من `49f11b1e` خواندم | تفاوت مقطع تاریخ، نه تناقض |
| ۱۰ | چارچوب بریف: «موتور به هر پارامتر می‌رسد و چیزی برای امتیازدادن پیدا نمی‌کند» | دقیق‌تر: موتور به هر پارامتر می‌رسد و در **ماه اشتباه** دنبال داده می‌گردد؛ داده وجود دارد، یک ماه عقب‌تر | **اصلاح چارچوب** |

---

## Numbers

```sql
-- ۱۶ پارامتر فعال، ۱۰ تای مشتری
select entity_type,is_active,count(*) from dynamic_scoring_parameters group by 1,2 order by 1,2;
--> customer|t|10     salesperson|t|6

-- مجموع وزن مشتری = ۱٫۰۰۰ (جمع ستون weight در جدول پارامترها بالا)

-- سطرهای امتیاز به تفکیک دوره
select period_month,entity_type,count(*),count(distinct entity_id),
       count(*) filter (where raw_score is not null)
from dynamic_entity_scores group by 1,2 order by 1,2;
--> 2026-07-01|customer|38|5|38      2026-07-01|salesperson|17|3|17
--> 2026-08-01|customer|53|6|53      2026-08-01|salesperson|42|7|42
--> (هیچ سطری با period_month = 2026-09-01 وجود ندارد)

-- سطرهای مشتری‌الف
select period_month,count(*),count(*) filter (where raw_score is not null)
from dynamic_entity_scores where entity_id='d634ac60-…';
--> 2026-07-01|10|10          (مرداد و شهریور: هیچ)

-- دوره‌ای که تابع زنده انتخاب می‌کند (آینهٔ خطوط ۶۹–۷۵)
select dcs.capital_date, date_trunc('month',dcs.capital_date)::date
from salesperson_capital_allocations_dynamic sca
join daily_capital_settings dcs on dcs.id=sca.capital_setting_id
where sca.salesperson_id=(select responsible_id from customers where id='d634ac60-…')
order by dcs.capital_date desc, sca.created_at desc limit 1;
--> 2026-08-31|2026-08-01

-- امتیاز زنده در سه دوره (خروجی کامل در Q2.2)
select public.calculate_dynamic_score('customer','d634ac60-…','2026-07-01'::date);
--> 10 active | 10 evaluated | weighted=0.188950

-- snapshotهای مشتری‌الف
--> 2026-07-29|0.234050|share=1.0|raw=3000000000|final=3000000000|formula
--> 2026-08-02 .. 2026-08-31 | 0.000000 | 0 | 0 | 0 | formula   (شش سطر)

-- profile اعتباری: کاملاً خالی
select count(*), count(*) filter (where has_overdue) from customer_credit_profile;
--> 0|0

-- مسئول فروش
select count(*),count(responsible_id),count(*)-count(responsible_id) from customers;
--> 91|14|77

-- آخرین تخصیص هر مشتری
--> ۸ مشتری تخصیص دارند · ۵ تا final_limit>0 · ۳ تا صفر

select count(*) from customer_credit_balance;                       --> 25
select count(*) from information_schema.tables
  where table_schema='public' and table_name='invoices';            --> 0

-- تنها تابعی که نام dynamic_entity_scores را در بدنه دارد
--> calculate_dynamic_score              (و آن STABLE است)

-- هیچ migrationی سطر درج نمی‌کند
grep -rn "INSERT INTO public.dynamic_entity_scores" -i supabase/migrations/   --> خالی

-- RLS روشن است
select relrowsecurity from pg_class where oid='public.dynamic_entity_scores'::regclass;  --> t
--> policies: dyn_scores_read_authenticated (SELECT) · dyn_scores_write_admin_accountant (ALL) · viewer_restricted (ALL)
```

---

## Coverage

**بررسی‌شده — ۲۰ از ۲۰ زیربند Q1–Q5 حکم دارند.** حساب بسته می‌شود:

| سؤال | زیربندها | حکم‌دار |
|---|---|---|
| Q1 | ۴ | ۴ |
| Q2 | ۴ | ۴ |
| Q3 | ۳ | ۳ |
| Q4 | ۴ | ۴ |
| Q5 | ۵ | ۵ |
| **جمع** | **۲۰** | **۲۰** |

**خوانده‌شده (بدنهٔ کامل، از دیتابیس زنده با `pg_get_functiondef`):**
`calculate_dynamic_score` (۱۱۹ خط) · `calculate_customer_realtime_credit` (۱۴۷ خط) ·
`get_customer_dynamic_credit` (۷۷ خط) · `create_sales_quote_with_items` (۳۳۹ خط، بلوک
اعتبار کامل) · `recompute_customer_credit_scores` (۶۱ خط) · `compute_normalized_raw_score`
(۳۶ خط).

**خوانده‌شده (مخزن):** `src/hooks/credit/useDynamicScoring.ts` ·
`src/components/credit/DynamicScoringSection.tsx` ·
`src/routes/_app.sales_.customers_.$customerId.credit.tsx` ·
`supabase/migrations/…_411_…sql` (خط ۶۰).

**بررسی‌نشده، با دلیل:**

| مورد | چرا |
|---|---|
| بدنهٔ کامل `calculate_credit_score` | فقط شمارش ارجاع به `invoices` لازم بود؛ در مسیر این ده پارامتر نیست |
| اجرای واقعی `recompute_customer_credit_scores` با JWT شبیه‌سازی‌شده | `SECURITY DEFINER` با `INSERT/UPDATE` در مسیر — «change nothing» |
| فراخوانی `get_customer_dynamic_credit` | خط ۳۰ `PERFORM _ensure_credit_balance` می‌نویسد |
| ثبت آزمایشی پیش‌فاکتور برای اثبات دروازهٔ معوق | نوشتن روی داده — فقط از بدنه استدلال شد |
| ۶ پارامتر `salesperson` | خارج از سؤال؛ فقط شمارش شدند |
| صفحه در مرورگر | نیازی نبود؛ هر سه محل نمایش از کد ردیابی شد |
| `zz_retired_dynamic_parameter_weights_backup_*` | جدول‌های بازنشسته |

---

## UNVERIFIED / UNKNOWN

1. **`[?]` آیا واقعاً کسی از این ۹۱ مشتری معوق است؟** غیرقابل تعیین — جدولی که معوقیت را
   نگه می‌دارد (`customer_credit_profile`) صفر سطر دارد. سیستم امروز **نمی‌داند**. این
   پاسخ «نامعلومِ صریح» است که بریف ترجیح داده بود، نه یک اطمینان غلط.
2. **`[?]` چه کسی و با چه قصدی سطرهای تیر و مرداد را وارد کرد؟** `scored_by` در همهٔ ۱۵۰
   سطر پر است، اما نگاشت آن به یک شخص واقعی انجام نشد (نیازی به دادهٔ شخصی نبود).
3. **`[?]` چرا در مرداد ۶ مشتری امتیاز گرفتند ولی مشتری‌الف نه؟** تصمیم انسانی بوده؛ در
   داده ردی از دلیلش نیست.
4. **`[?]` خروجی واقعی `recompute_customer_credit_scores` با کاربر معتبر.** پروب فقط تا
   گارد احراز هویت رفت. پیش‌بینی «برای هر مشتری `status='error'`» از بدنه **استنتاج** شده
   و اجرا نشده — عمداً برچسب‌گذاری می‌کنم.
5. **`[?]` آیا `capital_date` تازه (شهریور) خودکار ساخته می‌شود یا دستی؟**
   `daily_capital_settings` بررسی شد (آخرین: `2026-08-31`) ولی سازوکار تولیدش دنبال نشد.
   این تعیین می‌کند که مسئلهٔ دوره خودبه‌خود حل می‌شود یا نه.
6. **`[!]` نکتهٔ جانبی خارج از حوزه:** `dynamic_entity_scores` به نقش `anon` مجوز
   `INSERT/UPDATE/DELETE/TRUNCATE` دارد (RLS جلویش را می‌گیرد، ولی grant وجود دارد).
   شاخهٔ `feature/close-anon-role-grant` ظاهراً همین را هدف گرفته — گزارش می‌کنم، دنبالش نرفتم.

---

**وضعیت نهایی: COMPLETE** — حساب پوشش بسته است (۲۰/۲۰)، هیچ ادعایی بدون نقل‌قول یا خروجی
verbatim نیست، و **هیچ چیزی تغییر نکرد**.
