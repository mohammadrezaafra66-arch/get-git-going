# پکیج A — سرمایه روز و امتیازدهی کارشناس فروش

**آیتم‌ها:** ۱۴۰(ب)، ۱۴۱٫۱، ۱۴۱٫۲، ۱۴۱٫۳، ۱۵۳، ۱۵۴، ۱۵۵
**تاریخ تحقیق:** ۱۴۰۵/۰۵/۰۳ · برنچ سرور = `feature/navigation-modernization` (HEAD `a9315e78`) · DB زنده = `afrakala`

## خلاصهٔ پکیج (یک‌نگاه)

زنجیرهٔ هدف کاربر **به‌طور کامل در کد و پایگاه‌داده ساخته شده و به UI وصل است** — برخلاف گمان قبلی، حلقهٔ «کارشناس فروش» گم نیست. تابع واحد `run_daily_capital_allocation(date, numeric, text)` هر سه گام را در یک تراکنش انجام می‌دهد: (۱) حسابدار سرمایه کل را دستی وارد می‌کند، (۲) سیستم بر اساس امتیاز هر کارشناس (`calculate_dynamic_score('salesperson',...)`) سهم او را حساب می‌کند و در `salesperson_capital_allocations_dynamic` می‌ریزد، (۳) سهم هر کارشناس بین مشتریانِ همان کارشناس بر اساس امتیاز مشتری تقسیم و در `customer_capital_allocations_dynamic` ذخیره می‌شود. صفحهٔ زنده `‪/accounting/dynamic-capital‬` این تابع را صدا می‌زند.

**اما خروجی عملاً صفر است.** ریشهٔ «سقف اعتبار صفر»، نه وزن‌های صفر (وزن‌ها درست و غیرصفرند) بلکه **نبود دادهٔ امتیاز کارشناسان** است: جدول `dynamic_entity_scores` هیچ ردیفی برای `salesperson` ندارد (فقط ۴ مشتری در یک دوره امتیاز خورده‌اند). در نتیجه امتیاز وزنی همهٔ ۱۴ کارشناس صفر می‌شود → هر ۱۱۲ ردیف تخصیص کارشناس با `allocated_capital=0` ثبت شده → حلقهٔ مشتری (که فقط برای کارشناسِ دارای تخصیص>۰ اجرا می‌شود) اصلاً اجرا نمی‌شود → `customer_capital_allocations_dynamic` **صفر ردیف** دارد. مشکل جانبیِ مهم: تنها صفحهٔ ثبت امتیاز کارشناس (`/users/$userId`) پشت `requireAdmin()` است، پس حسابدار حتی نمی‌تواند این داده را وارد کند.

**نکتهٔ معماری:** دو سیستم موازی وجود دارد. مسیر **زنده (dynamic)** بالا. مسیر **قدیمی/مرده** شامل `daily_capital_snapshots` + `compute_salesperson_capital_allocations` + `compute_customer_capital_allocations` + `save_*` + `calculate_employee_score`→`employee_scores`؛ این توابع فقط در `types.ts` تولیدشده ظاهر می‌شوند و **در هیچ هوک/کامپوننت زنده‌ای فراخوانی نمی‌شوند**.

---

## دیاگرام متنی زنجیرهٔ واقعیِ موجود (نه ایده‌آل)

```
[۱] حسابدار سرمایه کل روز را دستی وارد می‌کند
    UI: /accounting/dynamic-capital  (Input «سرمایه کل» → دکمه «محاسبه و ذخیره»)
    RPC: run_daily_capital_allocation(p_capital_date, p_total_capital, p_notes)
    Table: daily_capital_settings (scoring_mode همیشه 'auto')
    ✅ حلقه موجود و کامل — دادهٔ واقعی هست (۹ snapshot)
        │
        ▼
[۲] سیستم سهم هر «کارشناس فروش» را از امتیازش حساب می‌کند
    منبع امتیاز: calculate_dynamic_score('salesperson', user_id, capital_date)
                 → می‌خواند از dynamic_entity_scores × dynamic_parameter_weights
    Table خروجی: salesperson_capital_allocations_dynamic
    ✅ حلقه (کد+جدول+UI) موجود و وصل  ⚠️ ولی خروجی = ۰
        └── چون dynamic_entity_scores هیچ ردیف salesperson ندارد → weighted_score=0 برای همه
        │
        ▼
[۳] سهم هر مشتری از «سهمِ کارشناسِ خودش» حساب می‌شود  ← قلب آیتم ۱۴۱٫۳
    for each salesperson WHERE allocated_capital > 0:
        منبع امتیاز مشتری: calculate_dynamic_score('customer', c.id, ...)
        تقسیمِ v_sp.allocated_capital بین مشتریانِ responsible_id = آن کارشناس
    Table خروجی: customer_capital_allocations_dynamic
    ✅ منطق «از سهم کارشناس، نه از کل سرمایه» دقیقاً پیاده شده
    ⛔ ولی چون هیچ کارشناسی allocated_capital>0 ندارد، این حلقه هرگز اجرا نمی‌شود → ۰ ردیف
        │
        ▼
[۴] سقف مجاز استفادهٔ هر مشتری = final_limit (کف: overdue/credit_limit)
    Table: customer_capital_allocations_dynamic.final_limit
    مصرف زنده: capital_allocation_ledger (hold/consume/release)
    ⛔ عملاً صفر — هیچ سقفی تولید نمی‌شود
```

**جمع‌بندی دیاگرام:** هر چهار حلقه **از نظر کد/جدول/UI موجود و به‌درستی وصل‌اند**؛ زنجیره به‌خاطر **خلأ داده (امتیاز کارشناسان) + قفلِ دسترسیِ صفحهٔ امتیازدهی کارشناس** خروجیِ صفر می‌دهد.

---

## جدول یک‌نگاهِ شواهد کلیدی

| موضوع | یافته | شاهد |
|---|---|---|
| صفحهٔ زندهٔ ثبت سرمایه | `/accounting/dynamic-capital` | `_app.accounting.dynamic-capital.tsx:58-63` |
| سه صفحهٔ قدیمی | همه `redirect` به dynamic-capital | `daily-capital.tsx:13`, `salesperson-capital-allocations.tsx:11`, `customer-capital-allocations.tsx:11` |
| تابع مادرِ زنجیره | `run_daily_capital_allocation` هر ۳ گام | `pg_get_functiondef` |
| امتیاز کارشناس در زنجیره | `calculate_dynamic_score('salesperson')` | بدنهٔ تابع بالا |
| وزن‌ها | غیرصفر، معتبر از 2026-07-01 | `dynamic_parameter_weights` (۱۶ ردیف) |
| **دادهٔ امتیاز کارشناس** | **۰ ردیف** | `dynamic_entity_scores` فقط customer/۴ entity |
| تخصیص کارشناس | ۱۱۲ ردیف، همه score=0, alloc=0 | `SELECT ... salesperson_capital_allocations_dynamic` |
| تخصیص مشتری | **۰ ردیف** | `SELECT count(*) customer_capital_allocations_dynamic` |
| توابع قدیمی compute/save | فقط در `types.ts`، بدون فراخوان زنده | `rg` روی `src` |
| صفحهٔ امتیاز کارشناس | پشت `requireAdmin()` | `_app.users.$userId.tsx:18` |

---

### آیتم ۱۵۵ — ثبت دستی سرمایه روز توسط حسابدار

**وضعیت:** ✅ کامل

**پاسخ کوتاه:** حسابدار سرمایه کل روز را در صفحهٔ `/accounting/dynamic-capital` دستی وارد و ذخیره می‌کند؛ نقش `accountant` هم در Route guard و هم در RLS مجاز است و دادهٔ واقعی ثبت شده است.

**شواهد:**
- L1 (UI): `_app.accounting.dynamic-capital.tsx:315-326` — Input «سرمایه کل (ریال)»؛ `:376` دکمه «محاسبه و ذخیره». مسیر قدیمی `_app.accounting.daily-capital.tsx:13` فقط redirect است.
- L2 (front): هوک `useRunDailyAllocation` → `supabase.rpc("run_daily_capital_allocation", {p_capital_date, p_total_capital, p_notes})` — `useDynamicCapital.ts:101`.
- L3 (DB): جدول `daily_capital_settings` (ستون‌ها: `capital_date`, `total_capital`, `scoring_mode` default `'manual'`, `notes`, `created_by`). تابع همیشه `scoring_mode='auto'` درج می‌کند. آخرین ردیف‌های واقعی:

  | capital_date | total_capital | scoring_mode |
  |---|---|---|
  | 2026-07-22 | 2,150,000,000 | auto |
  | 2026-07-20 | 30,000,000,000 | auto |
  | 2026-07-17 | 10,000,000 | auto |

- L4 (access): guard `requireAnyRole(["admin","accountant"])` (`dynamic-capital.tsx:60`) + داخل RPC دوباره `has_role(admin/accountant)` چک می‌شود. RLS `daily_capital_settings`: `dcs_admin_accountant_all` = `has_role(uid,'admin') OR has_role(uid,'accountant')`؛ خواندن برای همه (`dcs_select_authenticated`).

**نکتهٔ scoring_mode:** ستون فقط برای نمایش `select` می‌شود و **هیچ‌جای کد روی آن branch نمی‌زند**؛ همهٔ ردیف‌های زنده `'auto'` هستند. مقدار `'manual'` (default جدول) عملاً بلااستفاده است.

**نکتهٔ جدول قدیمی:** `daily_capital_inputs` (با ستون‌های ترکیب سرمایه: `bank_balance, cash_balance, incoming_checks, ...`) و `upsert_daily_capital_input`/`compute_daily_capital` بخشی از مسیر قدیمیِ مرده‌اند؛ **در هیچ کد فرانتی استفاده نمی‌شوند** (فقط ۲ ردیف تستی). ورودی زنده فقط «سرمایه کل» تک‌عددی است، نه ترکیب تفصیلی.

**شکاف نسبت به نیازمندی:** هیچ؛ ثبت دستی کامل و کارکردی است.

**برنچ:** بله، روی سرور/nav.

**وابستگی‌ها:** —

**برای رفع چه لازم است:** رفع لازم نیست.

**ریسک/پیچیدگی:** پایین.

---

### آیتم ۱۴۱٫۱ و ۱۵۴ — تخصیص سرمایه در سطح «کارشناس فروش» (حلقهٔ مشکوکِ گم‌شده)

**وضعیت:** ⚠️ ناقص (مکانیزم کامل و وصل است، ولی خروجی به‌خاطر خلأ داده صفر می‌ماند)

**پاسخ کوتاه:** حلقهٔ کارشناس فروش **قطعاً وجود دارد** — جدول `salesperson_capital_allocations_dynamic` و منطق محاسبه در `run_daily_capital_allocation` و نمایش در UI همه هستند؛ اما چون هیچ امتیازی برای کارشناسان ثبت نشده، هر ۱۱۲ ردیف با تخصیص صفر ذخیره شده‌اند.

**شواهد:**
- L3 (DB — تأیید وجود حلقه): در `run_daily_capital_allocation`:
  ```sql
  INSERT INTO _sp_alloc(salesperson_id, weighted_score)
  SELECT ur.user_id,
    COALESCE((calculate_dynamic_score('salesperson', ur.user_id, p_capital_date)->>'weighted_score')::numeric,0)
  FROM user_roles ur WHERE ur.role='sales' GROUP BY ur.user_id;
  -- سپس share_ratio = weighted_score/SUM، raw = share*total، با تقسیم largest-remainder
  INSERT INTO salesperson_capital_allocations_dynamic(capital_setting_id, salesperson_id, weighted_score, share_ratio, allocated_capital) ...
  ```
  یعنی سهم هر کارشناس دقیقاً «به نسبت امتیازش از کل سرمایه» است (largest-remainder برای گرد کردن).
- L1 (UI): `dynamic-capital.tsx:658-688` جدول «تخصیص هر کارشناس» (ستون‌های امتیاز وزنی، سهم٪، تخصیص)؛ هوک `useSalespersonAllocations` می‌خواند از `salesperson_capital_allocations_dynamic` (`useDynamicCapital.ts:122`).
- L4 (access): RLS — `scad_owner_select` (کارشناس فقط خودش) + `scad_admin_accountant_select`.
- **دادهٔ واقعی (چرا صفر):**

  | شاخص | مقدار |
  |---|---|
  | تعداد ردیف تخصیص کارشناس | ۱۱۲ |
  | ردیف با weighted_score>0 | **۰** |
  | ردیف با allocated_capital>0 | **۰** |
  | ردیف dynamic_entity_scores برای salesperson | **۰** |

**دربارهٔ توابع قدیمی `compute_salesperson_capital_allocations`/`save_salesperson_capital_allocations`:** این‌ها مسیر **قدیمیِ جدا** هستند که امتیاز را از `employee_scores.monthly_score` می‌گیرند (نه dynamic). فقط در `types.ts` ظاهر می‌شوند و در هیچ کامپوننت/هوک زنده‌ای فراخوانی نمی‌شوند → **مرده**. پس حلقهٔ زندهٔ کارشناس همان مسیر dynamic است، نه این‌ها.

**شکاف نسبت به نیازمندی:** حلقه هست ولی بی‌داده؛ تا وقتی امتیاز کارشناسان وارد نشود، تخصیص صفر است.

**برنچ:** بله.

**وابستگی‌ها:** آیتم ۱۴۱٫۲ (ثبت امتیاز کارشناس) و رفع قفلِ دسترسیِ صفحهٔ امتیازدهی.

**برای رفع چه لازم است:** ثبت امتیاز برای کارشناسان در `dynamic_entity_scores` (دوره جاری) لازم است تا `weighted_score>0` شود؛ و مسیر دسترسی حسابدار به صفحهٔ امتیازدهی کارشناس باز شود.

**ریسک/پیچیدگی:** متوسط — کد درست است؛ مسئله داده و دسترسی است.

---

### آیتم ۱۴۱٫۲ — منابع دقیق امتیاز کارشناس فروش و وزن‌ها

**وضعیت:** ⚠️ ناقص (پارامترها و وزن‌ها تعریف شده‌اند، ولی UI ثبتِ امتیاز فقط برای admin و بدون داده)

**پاسخ کوتاه:** امتیاز کارشناس از فرمول وزنیِ `calculate_dynamic_score` می‌آید که ۶ پارامترِ **دستی‌واردشده** (`dynamic_entity_scores`) را با وزن‌های جدول `dynamic_parameter_weights` ترکیب می‌کند؛ وزن‌ها configurable و غیرصفرند، اما هیچ امتیازی ثبت نشده و صفحهٔ ثبت پشت `requireAdmin` است.

**شواهد:**
- L3 (DB): فرمول در `calculate_dynamic_score`:
  `weighted_score = SUM(raw_score × weight / total_active_weight)` که `total_active_weight` = مجموع وزنِ پارامترهایی که برای آن entity در آن ماه `raw_score` دارند. دوره = `date_trunc('month', capital_date)`.
- **منابع (پارامترهای فعالِ salesperson) + وزن‌های واقعی جاری:**

  | code | برچسب | input_type | وزن |
  |---|---|---|---|
  | salesperson_sales_amount_monthly | مبلغ فروش ماهانه | toman | 0.300 |
  | salesperson_profit_monthly | سود ماهانه | toman | 0.250 |
  | salesperson_discipline | انضباط کاری | score_100 | 0.150 |
  | salesperson_inbound_calls | تماس‌های ورودی | months | 0.100 |
  | salesperson_outbound_calls | تماس‌های خروجی | months | 0.100 |
  | salesperson_talk_time_minutes | دقایق مکالمه | months | 0.100 |

  جمع وزن = 1.000. وزن‌ها در جدول `dynamic_parameter_weights` (نه هاردکد) با `valid_from=2026-07-01, valid_to=NULL` تعریف شده‌اند.
- L1 (UI ثبت): `DynamicScoringSection entityType="salesperson"` در `_app.users.$userId.tsx:139`؛ نوشتن با `useUpsertEntityScore` روی `dynamic_entity_scores`.
- L4 (access): صفحهٔ `/users/$userId` پشت `requireAdmin()` (`:18`). RLS نوشتنِ `dynamic_entity_scores`: `dyn_scores_write_admin_accountant` (admin یا accountant مجاز) — یعنی **RLS به حسابدار اجازه می‌دهد ولی UI نمی‌دهد** (ناهماهنگی).
- منابع «raw_score» **دستی** هستند: کاربر actual_value وارد می‌کند و از min/max به raw نگاشت می‌شود؛ هیچ منبع خودکاری (مثل sales_quotes) این پارامترها را پر نمی‌کند.

**تمایز مهم با آیتم ۱۵۳:** امتیازِ به‌کاررفته در زنجیرهٔ سرمایه از این مسیر (`calculate_dynamic_score`، دستی) می‌آید — **نه** از `calculate_employee_score`/`employee_scores` (که خودکار و برای gamification است).

**شکاف نسبت به نیازمندی:** خلأ داده + قفل دسترسی حسابدار.

**برنچ:** بله.

**وابستگی‌ها:** ۱۴۱٫۱.

**برای رفع چه لازم است:** باز کردن مسیر ثبت امتیاز کارشناس برای حسابدار (یا صفحهٔ اختصاصی)، و ورود دادهٔ ماهانه.

**ریسک/پیچیدگی:** متوسط.

---

### آیتم ۱۴۱٫۳ — تخصیص سطح مشتری از «سهمِ کارشناس» (قلب نیازمندی)

**وضعیت:** ✅ کامل (منطق) / ⛔ خروجی صفر به‌خاطر خلأ بالادست

**پاسخ کوتاه:** سهم مشتری **قطعاً از سهمِ کارشناسِ خودش** محاسبه می‌شود، نه مستقیم از کل سرمایه؛ منطق دقیقاً مطابق نیازمندی است اما چون تخصیص کارشناسان صفر است، حلقهٔ مشتری اجرا نمی‌شود.

**شواهد:**
- L3 (DB): در `run_daily_capital_allocation` حلقهٔ بیرونی روی کارشناسانِ `allocated_capital>0`:
  ```sql
  FOR v_sp IN SELECT salesperson_id, allocated_capital FROM _sp_alloc WHERE allocated_capital>0 LOOP
    INSERT INTO _sp_cust(customer_id, weighted_score)
    SELECT c.id, calculate_dynamic_score('customer', c.id, p_capital_date)->>'weighted_score'
    FROM customers c WHERE c.responsible_id = v_sp.salesperson_id AND c.is_active;
    -- floor((score/SUM_within_sp) * v_sp.allocated_capital)  ← از سهم کارشناس، نه کل
  ```
  یعنی مخرجِ نرمال‌سازی، مجموع امتیاز مشتریانِ همان کارشناس است و صورت‌کسر در `v_sp.allocated_capital` ضرب می‌شود → **تفکیک per-salesperson دقیق**.
- کف نهایی: `final_limit = CASE overdue→0 / credit_limit اگر raw>limit / else raw` و `binding_constraint` متناظر (`customer_credit_profile`).
- تابع `compute_customer_capital_allocations` قدیمی هم همین ایده را دارد ولی از `salesperson_capital_allocations` قدیمی و `credit_score` می‌خواند — **مرده** (فقط types.ts).
- L1 (UI): Drawer «مشتریان کارشناس» در `dynamic-capital.tsx:492-608`؛ هوک `useCustomerAllocations` از ویو `v_dynamic_customer_capital_balances` (`useDynamicCapital.ts:169`).
- **دادهٔ واقعی:** `customer_capital_allocations_dynamic` = **۰ ردیف** (چون هیچ کارشناسی تخصیص>۰ نگرفت).

**شکاف نسبت به نیازمندی:** صرفاً وابسته به حلقهٔ بالادست؛ منطق خودش کامل است.

**برنچ:** بله.

**وابستگی‌ها:** ۱۴۱٫۱ و ۱۴۱٫۲.

**برای رفع چه لازم است:** با ثبت امتیاز کارشناسان و اجرای مجدد snapshot، این حلقه خودبه‌خود پر می‌شود.

**ریسک/پیچیدگی:** پایین (منطق آماده است).

---

### آیتم ۱۵۳ — تابع امتیازدهی کارمند (`calculate_employee_score`)

**وضعیت:** 🔶 جزئی — تابع کامل و کارکردی است، اما **از زنجیرهٔ سرمایهٔ زنده جداست** (مسیر gamification/قدیمی)

**پاسخ کوتاه:** `calculate_employee_score` یک موتور امتیازِ **خودکار** بر پایهٔ KPIهای gamification است که در `employee_scores` می‌نویسد؛ زنجیرهٔ سرمایهٔ زنده از این تابع استفاده نمی‌کند (از `calculate_dynamic_score` استفاده می‌کند).

**شرح گام‌به‌گام فرمول (فارسی):**
1. تشخیص نقش: `_is_sales = has_role(employee,'sales')`. سوئیچ منبع فروش از `shop_settings.gamification_sales_source` (پیش‌فرض `'manual'`).
2. **تماس/دقایق مکالمه** (همیشه از `staff_daily_performance_metrics`): مجموع `inbound_calls_count`, `outbound_calls_count`, `talk_time_minutes` در چهار بازهٔ روز/هفته/ماه/کل.
3. **مبلغ فروش** (فقط نقش sales): حالت `auto` = مجموع `final_amount` از `sales_quotes` با `status='accepted'` و `salesperson_id`؛ حالت `manual` = `sales_amount` از `staff_daily_performance_metrics`. رشد ماهانه: `((فروش‌ماه − فروش‌ماه‌قبل)/فروش‌ماه‌قبل)×100`.
4. **سود** همیشه دستی: `profit_amount` از `staff_daily_performance_metrics`.
5. **وصولی** (`_collected_amount`): تخصیص‌های رسیدِ approved روی کوت‌های accepted در پنجرهٔ ۶ ماه، سقف‌شده per-quote تا `final_amount` (از `payment_receipt_links`+`payment_receipts`).
6. **ترکیب فروش:** `blended = 0.8×وصولی + 0.2×فروش‌صادرشده`.
7. **دقایق فعال:** `GREATEST(talk_m + deals_m×3 + sales_count_m×2, 1)`.
8. حلقه روی `gamification_kpis` (enabled): برای هر KPI مقدارِ بازه انتخاب، برای `total_sales`/`cumulative_sales` مقیاس لگاریتمی `ln(x+1)`، سپس `score += scaled × weight`. برچسب‌ها: daily/weekly/monthly/total.
9. `normalized = monthly / active_minutes`.
10. خروجی در `employee_scores` (upsert روی `employee_id`) + `breakdown` JSON.

**ورودی از جداول:** `staff_daily_performance_metrics`, `sales_quotes`, `payment_receipt_links`, `payment_receipts`, `customers`, `shop_settings`, `gamification_kpis`.
**خروجی:** `employee_scores` (daily/weekly/monthly/total/normalized_score/breakdown).
**محرک (trigger):** خودکار از طریق تریگرها: `trg_call_logs_recompute_employee_score` (call_logs)، `trg_payment_receipt_links_recompute_employee_score`، `trg_payment_receipts_recompute_employee_score`، `trg_invoices_recompute_employee_score`؛ و توابع دستی `recompute_all_employee_scores`. پس از درج، `trg_employee_scores_award_xp` امتیاز XP می‌دهد.
**دادهٔ واقعی:** `employee_scores` = ۳ ردیف (هر ۳ با monthly_score>0). `gamification_kpis` = ۱۲ KPI (۱۰ فعال).

**`calculate_dynamic_score` (مقایسه):** موتور دیگری است که **دستی** امتیاز می‌دهد؛ `weighted_score = SUM(raw_score×weight/total_active_weight)` از `dynamic_entity_scores`×`dynamic_parameter_weights`×`dynamic_scoring_parameters`. **این** موتوری است که زنجیرهٔ سرمایه واقعاً استفاده می‌کند. `STABLE` است و چیزی ذخیره نمی‌کند (فقط JSON برمی‌گرداند).

**شکاف نسبت به نیازمندی:** اگر نیازمندیِ ۱۵۳ «امتیازِ محرکِ تخصیص سرمایه» باشد، این تابع آن نقش را ندارد؛ نقش امتیازدهیِ سرمایه با `calculate_dynamic_score` است. `calculate_employee_score` صرفاً gamification/XP را تغذیه می‌کند.

**برنچ:** بله (هر دو تابع روی سرور موجودند).

**وابستگی‌ها:** —

**برای رفع چه لازم است:** روشن‌سازی اینکه کدام امتیاز مبنای سرمایه است؛ اگر باید `employee_scores` مبنا باشد، زنجیرهٔ dynamic باید به آن وصل شود (فعلاً نیست).

**ریسک/پیچیدگی:** متوسط — دو موتور موازی، ابهام نیازمندی.

---

### آیتم ۱۴۰(ب) — زنجیرهٔ سرتاسری: سقف مصرف مشتری از سرمایهٔ روز

**وضعیت:** ⚠️ ناقص — کل زنجیره ساخته و وصل است ولی خروجیِ نهایی (سقف مشتری) عملاً صفر است

**پاسخ کوتاه:** مسیر «سرمایهٔ دستی → سهم کارشناس → سهم مشتری → سقف مجاز» به‌طور کامل کدنویسی و به UI و RLS و ledger وصل شده، اما به‌دلیل نبود امتیاز کارشناسان هیچ سقفی تولید نمی‌شود.

**شواهد:**
- زنجیره در یک تابع `run_daily_capital_allocation` + مصرف زنده در `capital_allocation_ledger` (توابع `hold/consume/release/refund_capital_allocation`, `can_use_customer_capital_allocation`).
- ویوهای تراز: `v_dynamic_salesperson_capital_balances`, `v_dynamic_customer_capital_balances` (held/consumed/remaining) — در UI drawer نمایش داده می‌شوند (`dynamic-capital.tsx:511-534, 558-607`).
- صفحه هشدارهای دقیق «چرا صفر شد» دارد (`dynamic-capital.tsx:225-255`) — یعنی طراحی از این حالتِ صفر آگاه است.
- خروجی نهایی: `customer_capital_allocations_dynamic` = ۰ ردیف.

**ریشهٔ صفر بودن (تأیید/رد):**
- ❌ رد: «وزن‌های صفر/NULL» — وزن‌ها کامل و غیرصفرند.
- ✅ تأیید: «نبود دادهٔ `dynamic_entity_scores` برای کارشناسان» علتِ اصلی است. ثانیاً صفحهٔ ثبت امتیاز کارشناس فقط admin است.

**شکاف:** صرفاً داده + یک قفل دسترسی؛ زیرساخت کامل است.

**برنچ:** بله.

**وابستگی‌ها:** ۱۴۱٫۱، ۱۴۱٫۲، ۱۴۱٫۳.

**برای رفع چه لازم است:** (۱) دسترسی حسابدار به ثبت امتیاز کارشناس، (۲) ورود امتیاز ماهانهٔ کارشناسان، (۳) اجرای مجدد snapshot. هیچ تغییر منطقی لازم نیست.

**ریسک/پیچیدگی:** متوسط.

---

## پاسخ به سؤالات جانبی تحقیق

- **A2 (scoring_mode):** مقادیر ممکن `'manual'`/`'auto'`؛ default جدول `'manual'` ولی `run_daily_capital_allocation` همیشه `'auto'` درج می‌کند. **هیچ‌جای کد روی این ستون branch نمی‌زند** — فقط برای نمایش خوانده می‌شود (`useDynamicCapital.ts:67,83`). عملاً بلااستفاده.
- **A8 (`/accounting/dynamic-capital`):** دکمهٔ «محاسبه و ذخیره» → `run_daily_capital_allocation`. آخرین اجرا: `salesperson_capital_allocations_dynamic` → ۱۱۲ ردیف، آخرین `created_at = 2026-07-22 11:27`. `customer_capital_allocations_dynamic` → **۰ ردیف** (max NULL).
- **A9 (`DynamicScoringSection`/`useDynamicScoring`):** فایل‌ها: `src/components/credit/DynamicScoringSection.tsx` و `src/hooks/credit/useDynamicScoring.ts`. محاسبهٔ نمایشِ فرانت **از منطق DB جدا نیست** — از طریق `useCalculatedScore` مستقیماً RPC `calculate_dynamic_score` را صدا می‌زند (`useDynamicScoring.ts:136`)؛ یعنی **تک‌منبعِ حقیقت**، بدون منطق موازی. صفحات `salesperson-capital-allocations`/`customer-capital-allocations` هر دو redirect به dynamic-capital هستند.
- **A7 (بک‌آپ‌ها):** `dynamic_parameter_weights_backup_142` و `_backup_20260722` هر کدام ۱۸ ردیف (در مقابل ۱۶ ردیف فعلی) — نشان می‌دهد پیش‌تر ۱۸ وزن بوده و اکنون به ۱۶ کاهش/بازتعریف شده (تاریخچهٔ اصلاح وزن‌ها). وزن‌های فعلی سالم‌اند؛ بک‌آپ‌ها ریشهٔ مشکل نیستند.
