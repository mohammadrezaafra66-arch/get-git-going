
## Task ID
credit-realtime-customer

## Classification
PLAN ONLY — File edits allowed: No (awaiting approval)

## Goal
هر تغییر پارامتر امتیازدهی مشتری، بلافاصله `weighted_score`، `final_limit` و `binding_constraint` را زنده بازمحاسبه کند — بدون وابستگی به snapshot امروز.

---

## پاسخ به سوال‌های شما (بر اساس بررسی schema)

1. **رابطه مشتری-کارشناس:** بله، `customers.responsible_id uuid` وجود دارد. تأیید شد.
2. **آیا `calculate_dynamic_score` برای salesperson هم صدا زده شود؟**
   بله — برای محاسبه سهم کارشناس از کل سرمایه، نیاز به `weighted_score` او داریم. اما راه ساده‌تر: از آخرین ردیف `salesperson_capital_allocations_dynamic` (بر اساس `capital_date` DESC) `allocated_capital` را بگیریم؛ این ستون از قبل «سهم کارشناس از سرمایه روز» را ذخیره کرده و نیازی به بازمحاسبه ندارد. RPC مشتری فقط نسبت مشتری‌ها را داخل سهم کارشناس زنده حساب کند.
3. **اگر `responsible_id` null باشد؟** پیشنهاد: `final_limit = LEAST(credit_limit, 0)` نیست — بلکه `raw_allocation = 0`, `binding = 'no_salesperson'`, و `final_limit = 0`. علت: بدون کارشناس، سهمی از سرمایه فروش تخصیص داده نمی‌شود. کاربر می‌تواند دستی `credit_limit` را ست کند ولی این binding جدید باعث می‌شود مشکل قابل دیدن باشد. **نیاز به تأیید شما.**
4. **Migration:** بله — یک migration برای ایجاد RPC جدید `calculate_customer_realtime_credit`. بدون تغییر schema جداول. فقط `CREATE OR REPLACE FUNCTION` (STABLE, SECURITY DEFINER با `has_role` check برای admin/accountant/manager).

---

## Scope (فاز اول قابل تحویل)

### Phase 1 — Migration (backend)
- ایجاد RPC `public.calculate_customer_realtime_credit(p_customer_id uuid) RETURNS jsonb`
- STABLE، SECURITY DEFINER، `SET search_path = public`
- منطق داخل RPC:
  1. گرفتن `responsible_id`, `credit_limit`, `has_overdue` از `customers` + `customer_credit_profile`
  2. اگر `has_overdue` → return با `binding='overdue'`, `final_limit=0`
  3. اگر `responsible_id IS NULL` → return با `binding='no_salesperson'`, `final_limit=0`
  4. گرفتن آخرین `salesperson_capital_allocations_dynamic` برای این کارشناس (max `capital_date`) → `allocated_capital` + `capital_date_used`
  5. صدا زدن `calculate_dynamic_score('customer', p_customer_id, capital_date_used)` → `weighted_score_self`, `breakdown`, `params_evaluated`, `params_active`
  6. مجموع امتیاز همه مشتریان فعال این کارشناس در همان period → `sum_scores`
  7. `share_ratio = weighted_score_self / NULLIF(sum_scores, 0)`
  8. `raw_allocation = allocated_capital * share_ratio`
  9. `final_limit = LEAST(raw_allocation, credit_limit)` با binding مطابق
- خروجی jsonb مطابق مشخصات شما + فیلد `is_capital_stale` (اگر `capital_date_used < CURRENT_DATE`)
- GRANT EXECUTE فقط به `authenticated`

### Phase 2 — Hook و UI (فقط بعد از تأیید Phase 1)
- `src/hooks/credit/useDynamicScoring.ts`: افزودن `useCustomerRealtimeCredit(customerId)` با key `["dyn-customer-realtime-credit", customerId]`، `staleTime: 30s`
- `DynamicScoringSection.tsx`:
  - `onSuccess` upsert امتیاز → `invalidateQueries(['dyn-customer-realtime-credit', entityId])`
  - کارت خلاصه real-time: `final_limit` + Badge سبز «زنده»، `weighted_score` + «X از Y پارامتر»، `binding_constraint` real-time، Badge زرد «سرمایه: DD/MM (قدیمی)» اگر stale
- `_app.sales_.customers_.$customerId.credit.tsx`:
  - کارت metric «سقف اعتبار مؤثر» → از `useCustomerRealtimeCredit` (نه snapshot)
  - Badge «🟢 زنده» کنار عدد
  - حفظ کارت‌های snapshot به عنوان reference پایینی

---

## Out of scope
- تغییر منطق تخصیص سرمایه کارشناس (خودش snapshot می‌ماند)
- Realtime WebSocket (فقط invalidate query — کافی است)
- تغییر UI صفحه امتیازدهی salesperson
- Recalc خودکار snapshot روزانه
- تغییر `dynamic_entity_scores` schema
- migration جدید برای جداول موجود

---

## Files likely to change
- `supabase/migrations/<ts>_calculate_customer_realtime_credit.sql` (جدید)
- `src/hooks/credit/useDynamicScoring.ts` (افزودن hook)
- `src/components/credit/DynamicScoringSection.tsx` (کارت خلاصه + invalidate)
- `src/routes/_app.sales_.customers_.$customerId.credit.tsx` (metric card)

## Files likely to inspect again
- `src/hooks/credit/useDynamicScoring.ts` (تایپ‌ها + pattern)
- تعریف فعلی `calculate_dynamic_score` (برای امضا و return shape)

---

## Database / migration impact
- فقط ایجاد یک function جدید (`CREATE OR REPLACE`). Reversible: `DROP FUNCTION` در rollback.
- بدون تغییر جدول، بدون تغییر RLS جداول موجود.
- STABLE → cache-safe. SECURITY DEFINER → داخل تابع `has_role` چک می‌شود.

## RLS / RBAC / audit impact
- RLS: بدون تغییر
- RBAC: RPC فقط برای admin/manager/accountant قابل اجرا (چک داخل تابع)
- Audit: بدون نیاز — read-only

## Performance impact
- هر بار ذخیره امتیاز → یک RPC call (چند JOIN سبک + یک aggregation). indexed. قابل قبول.
- بدون polling. فقط invalidate بعد از mutation.

## UI/UX impact
- اضافه شدن Badge «زنده» و «سرمایه قدیمی» — Persian، RTL، سازگار با design فعلی
- بدون تغییر layout اصلی صفحه
- Fallback واضح در حالت‌های `no_salesperson`, `overdue`, `no_capital`

## Manual test path
1. `/sales/customers/<test-1>/credit` → کارت‌های real-time لود شوند
2. یک پارامتر را تغییر بده و ذخیره کن → `weighted_score` و `final_limit` **بدون refresh** به‌روز شود
3. مشتری بدون `responsible_id` → binding='no_salesperson', limit=0
4. مشتری با `has_overdue=true` → binding='overdue', limit=0
5. `credit_limit` کم → binding='credit_limit'

## Commands to run
- `npm run build`
- `npm run lint`
- (بعد از migration) اجرای دستی RPC روی test 1 و مقایسه با snapshot

## Acceptance criteria
- ذخیره امتیاز → به‌روزرسانی فوری کارت‌ها بدون refresh
- سه binding جدید/موجود (`overdue`, `credit_limit`, `formula`) + `no_salesperson` درست کار کنند
- در نبود snapshot امروز، از آخرین `capital_date` موجود استفاده شود و badge stale ظاهر شود
- بدون regression روی کارت‌های snapshot موجود

## Risks
- **R1:** اگر تعداد مشتریان یک کارشناس زیاد باشد، aggregation کند شود → mitigation: index روی `dynamic_entity_scores(entity_id, period_month)` احتمالاً موجود است — بررسی در implementation
- **R2:** RPC مشتری‌ها اگر امتیاز نداشته باشند، `sum_scores=0` → division-by-zero → با `NULLIF` مدیریت شده
- **R3:** ناسازگاری تعریف period_month بین `calculate_dynamic_score` و ما — باید `capital_date_used` را به همان تابع pass کنیم

## Stop conditions
- اگر پاسخ سوال ۳ (رفتار `responsible_id=null`) با پیشنهاد ما مخالف باشد → پیش نرو
- اگر مشخص شد `calculate_dynamic_score` signature با فرض ما (پذیرش تاریخ) متفاوت است → بازنگری plan

---

## سوال‌های باقی‌مانده برای تأیید شما
1. رفتار `responsible_id = null` — پیشنهاد ما: `final_limit=0, binding='no_salesperson'`. موافقید؟
2. آیا `binding='no_salesperson'` را به عنوان binding جدید بپذیریم یا از `formula` استفاده کنیم؟
3. Phase 1 (migration) و Phase 2 (UI) را جدا تحویل بدهم یا یکجا؟

## Smallest safe next slice
Phase 1 فقط: migration ایجاد RPC + تست دستی روی test 1 قبل از هر تغییر UI.

## Next SAFE AGENT CHANGE prompt
"Phase 1 را اجرا کن: migration ایجاد `calculate_customer_realtime_credit` را بزن. بعد از تأیید و اجرا، RPC را روی مشتری test 1 صدا بزن و خروجی jsonb را نشان بده. UI هنوز تغییر نکند."
