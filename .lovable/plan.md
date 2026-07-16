# نقشهٔ اجرایی — دقیق‌سازی رهگیری تعاملات + نامزدی روزانهٔ فروش

Task ID: MKT-EVENTS+NOMINATION
Classification: PLAN ONLY — File edits allowed: No
Scope split: **DB (SQL migration files — apply خارج از Lovable با PowerShell)** vs **FE (Lovable edits)**.

---

## اصول مشترک همهٔ فازها

- هر فاز: کوچک، مستقل، بدون شکستن سازگاری با کدِ فعلی، قابل rollback.
- DB فقط additive: بدون drop ستون/جدول موجود؛ CHECKها با drop+create هم‌نام؛ ایندکس‌ها partial/CONCURRENTLY.
- عدد سهمیه/بوست/سقف در **جدول policy** (نه enum، نه هاردکد در function).
- تمام enforce (سهمیه/نقش/سقف) داخل RPC یا RLS؛ UI فقط راهنمای کاربر است.
- بعد از هر فاز FE: `bun run build` + `bun run lint`. بعد از هر فاز DB: smoke SQL (`\d table`, `select ... limit 5`).
- ترتیبِ اجرای واقعی: DB-A → FE-B → DB-C → DB-D → FE-E → FE-F. (FE-B فقط پس از اعمال DB-A روی سرور)

---

## فاز DB-A — پایهٔ رویدادها: session + رویداد جدید + وزنِ واحد

**نوع:** فقط SQL migration (اجرا خارجی).
**فایل پیشنهادی:** `supabase/migrations/<ts>_events_session_and_weights.sql`

**محتوا:**
1. `ALTER TABLE public.product_interaction_events ADD COLUMN IF NOT EXISTS search_session_id uuid NULL;`
2. Drop و re-create CHECK `product_interaction_events_event_type_check` با افزودن مقدار `sales_text_copied` (حفظ همهٔ مقادیر قبلی برای سازگاری backfill).
3. `CREATE UNIQUE INDEX IF NOT EXISTS uq_pie_session_dedup ON public.product_interaction_events(user_id, product_id, search_session_id, event_type) WHERE search_session_id IS NOT NULL;` (partial؛ ردیف‌های تاریخیِ بدون session دست‌نخورده).
4. یکسان‌سازی وزن‌ها در تمام توابع `mi_*` بر اساس **یک جدول ثابتِ داخلِ SQL** (CTE `weights(event_type, w)`):
   - `sales_text_copied=5, price_checked=4, board_price_viewed=3, chart_opened=2, product_details_opened=2, search_result_viewed=1` (search_result_viewed برای دادهٔ تاریخی نگه داشته می‌شود).
   - توابع تحت اثر: `mi_get_demand_growth`, `mi_get_emerging_products`, `mi_get_trending_products`, `mi_get_top_checked_today`, `mi_get_seller_top_products`, `mi_get_hot_brands`, `mi_get_hot_categories`.

**RLS/RBAC/Audit:** بدون تغییر (policyهای موجود کافی است). Audit نیاز ندارد.
**تست پذیرش:** insert آزمایشیِ `sales_text_copied` موفق؛ درج تکراری با همان `(user, product, session, type)` رد می‌شود؛ `select mi_get_demand_growth(1)` خطا نمی‌دهد.
**Rollback:** drop index → drop column → CHECK را به نسخهٔ قبل برگردان.

---

## فاز FE-B — session id + تفکیک رویدادها در sales search + رویداد کپی

**نوع:** Lovable (فقط FE). وابسته به DB-A روی سرور.
**فایل‌های احتمالی:**
- `src/routes/_app.sales.search.tsx`: افزودن `searchSessionIdRef = useRef<string>()` که در هر submit جست‌وجو `crypto.randomUUID()` می‌شود.
- **حذف کامل حلقهٔ `search_result_viewed` بعد از لود نتایج** (منبع نویز).
- افزودن رویداد `product_details_opened` هنگام انتخاب/بازکردن کارت (لیبل فارسی: «انتخاب محصول»)، با `search_session_id`.
- `chart_opened` باقی می‌ماند + `search_session_id`.
- `price_checked` روی «نمایش قیمت کامل / انتخاب نوع قیمت / استفاده از قیمت» + `search_session_id`.
- «کپی متن فروش» → `sales_text_copied` + `search_session_id`.
- `src/lib/analytics/product-interactions.ts` + `.functions.ts`: افزودن `sales_text_copied` به enum/zod؛ پارامتر اختیاری `searchSessionId`؛ سرور در insert `on conflict do nothing` وقتی session داده شده.

**تست پذیرش:** یک جست‌وجو → صفر ردیفِ `search_result_viewed`؛ کلیک روی یک کارت → یک ردیف `product_details_opened` (تکرارِ همان کارت در همان نشست ردیف دوم نسازد)؛ نمودار → `chart_opened`؛ نمایش قیمت کامل → `price_checked`؛ کپی → `sales_text_copied`.

---

## فاز DB-C — جدول policy سهمیه + جدول نامزدی + audit + RLS

**نوع:** فقط SQL migration.
**فایل پیشنهادی:** `supabase/migrations/<ts>_promotion_nominations_core.sql`

**محتوا:**
1. `promotion_nomination_policy` (per role/user override):
   - ستون‌ها: `id, role app_role null, user_id uuid null references auth.users, daily_quota int not null, per_product_daily_cap int not null default 3, boost_per_nomination numeric not null default 0, boost_cap_per_product numeric not null default 0, is_active bool not null default true, updated_at, updated_by`.
   - قرارداد lookup: اگر ردیفِ per-user فعال باشد اولویت دارد، وگرنه ردیفِ per-role، وگرنه پیش‌فرضِ صفر (غیرفعال).
   - seed محافظه‌کار: `sales=3, per_product_cap=3, boost_per_nomination=0, boost_cap=0, is_active=true` (بوست عمداً صفر تا فاز کالیبراسیون).
   - GRANT: SELECT برای authenticated (خواندنِ سهمیهٔ خود لازم است — اما فقط ردیف مربوطه)، write فقط service_role. RLS: manager/admin write، هر کاربر SELECT ردیف نقش‌خود/خودش.
2. `promotion_nominations`:
   - ستون‌ها: `id, product_id fk products, nominated_by uuid=auth.users, channel_id uuid null fk marketing_channels, reason_code text check in (customer_request, high_stock, high_margin, competitive_price, new_product, clearance, other), reason_note text null, nominated_on date default (now() at time zone 'Asia/Tehran')::date, created_at, cancelled_at null, cancelled_by null, boost_applied numeric not null default 0`.
   - GRANT: SELECT برای authenticated (زیر RLS)، INSERT/UPDATE از کلاینت REVOKE؛ فقط RPCها می‌نویسند.
   - RLS: SELECT برای manager/admin کامل؛ فروش فقط ردیف‌های خود؛ INSERT/UPDATE مستقیم بسته.
   - ایندکس‌ها: `(nominated_by, nominated_on)`, `(product_id, nominated_on)`, `(channel_id, nominated_on)`.
3. Audit: هر nominate/cancel یک ردیف در `audit_logs` با action `promotion_nominated`/`promotion_nomination_cancelled` (داخل RPC نوشته می‌شود).

**تست پذیرش:** جدول‌ها ساخته شدند؛ کاربر sales نمی‌تواند مستقیم INSERT کند (permission denied)؛ manager می‌تواند SELECT همه.

---

## فاز DB-D — RPCها + توسعهٔ view/امتیاز دو لِینه

**نوع:** فقط SQL migration.
**فایل پیشنهادی:** `supabase/migrations/<ts>_promotion_nominations_rpc_and_view.sql`

**محتوا:**
1. `has_role`/`get_effective_policy(_user_id)` helper (SECURITY DEFINER, `search_path=public`) — یک ردیفِ policy مؤثر برمی‌گرداند.
2. RPC `nominate_product_for_promotion(_product_id, _channel_id, _reason_code, _reason_note)` — SECURITY DEFINER:
   - نقش کاربر را با `has_role(auth.uid(),'sales')` (یا بالاتر) چک می‌کند.
   - `policy.is_active` را چک می‌کند.
   - شمارش نامزدی‌های امروزِ همان کاربر < `daily_quota`.
   - شمارش نامزدی‌های امروزِ همان محصول از همه کاربران < `per_product_daily_cap` تعیین می‌کند که `boost_applied = boost_per_nomination` باشد یا `0` (کاپ نرم).
   - insert در `promotion_nominations` + audit_log.
   - خروجی: `jsonb{ok, nomination_id, remaining_today, boost_applied, reason?}`.
3. RPC `cancel_promotion_nomination(_id)` — فقط nominated_by و همان‌روز (Tehran)؛ set `cancelled_at, cancelled_by`؛ audit_log.
4. RPC `get_promotion_nomination_quota()` — `{daily_quota, used_today, remaining_today, per_product_daily_cap, is_active}` برای کاربر جاری.
5. GRANT EXECUTE این سه RPC فقط به `authenticated` (نقش‌چکِ داخلی).
6. تغییر `v_promotion_suggestions`:
   - CTE `noms_today` (فقط ردیف‌های امروزِ Tehran، not cancelled، sum(boost_applied) کران‌دار به `boost_cap_per_product` از policy‌ی که در زمان درج ثبت شده — یا re-cap در view).
   - ستون‌های جدید: `market_score` (همان اسکورِ فعلی)، `sales_nomination_count`، `sales_nomination_boost` (کران‌دار)، `final_score = market_score + sales_nomination_boost`.
   - ستون قدیمیِ `score` را برای سازگاری برابر `final_score` نگه می‌داریم (alias).
7. تابع `compute_promotion_scores`: فیلتر/سورت بر اساس `final_score` (سیگنیچر پایدار).

**تست پذیرش:** با کاربر sales صداکردن RPC nominate → ردیف + audit + remaining−1؛ فراخوانی بعد از سقف → `{ok:true, boost_applied:0}` یا `{ok:false, reason:'quota_exhausted'}` مطابق قرارداد؛ لغو در همان روز سهمیه را برمی‌گرداند؛ کاربر غیرsales رد می‌شود؛ `v_promotion_suggestions` سه ستونِ market/boost/final را برمی‌گرداند و boost کران‌دار است.

---

## فاز FE-E — دکمهٔ نامزدی + سهمیه + لغو در sales search

**نوع:** Lovable (FE). وابسته به DB-D روی سرور.
**فایل‌های احتمالی:**
- `src/routes/_app.sales.search.tsx` (فقط بخش کارتِ انتخاب‌شده): دکمهٔ «پیشنهاد برای تبلیغ» فقط برای نقش sales.
- Dialog کوچک: انتخاب کانال (اختیاری از `marketing_channels`)، `reason_code` (سِلِکتِ فارسی از هفت مقدار)، textarea کوتاه برای `reason_note`، نمایش «سهمیهٔ باقی‌مانده امروز».
- Hook `usePromotionNominationQuota()` روی RPC `get_promotion_nomination_quota` با `useQuery`.
- ثبت با RPC + toast فارسی؛ در صورت `quota_exhausted` پیام مناسب؛ در صورت `boost_applied=0` (کاپِ محصول پر) توضیح بده «ثبت شد ولی بوست اضافه نشد».
- در همان کارت: اگر نامزدیِ همان‌روزِ کاربر برای این محصول وجود دارد، دکمهٔ «لغو نامزدی» با RPC `cancel_promotion_nomination`.

**تست پذیرش:** کاربر sales دکمه را می‌بیند، سه ثبت پشتِ سرِ‌هم سهمیه را به ۰ می‌رساند و چهارمی مسدود می‌شود؛ کاربر غیرsales اصلاً دکمه را نمی‌بیند و اگر مستقیم RPC صدا زد، RPC رد می‌کند.

---

## فاز FE-F — نمایش دو لِینِ امتیاز در صفحهٔ پیشنهادهای تبلیغاتی

**نوع:** Lovable (FE). وابسته به DB-D.
**فایل احتمالی:** `src/routes/_app.marketing.suggestions.tsx` (یا اسم فعلی).
- ستون‌های جدید: «امتیاز بازار» (`market_score`)، «بوست نامزدی» (`sales_nomination_boost`) با ریزنمایشِ تعدادِ نامزدی و نام آخرین کارشناس روی hover، «امتیاز نهایی» (`final_score`).
- مرتب‌سازی پیش‌فرض بر اساس `final_score`؛ فیلتر «فقط دارای بوست».
- Tooltip فارسی برای هر ستون که بگوید boost چطور محاسبه می‌شود و کاپ چیست.

**تست پذیرش:** ردیف‌ها مرتب بر `final_score`؛ بوست صفر برای محصولی که هیچ نامزدیِ امروز ندارد؛ بوست کران‌دار حتی با نامزدی‌های بیشتر.

---

## فاز کالیبراسیون (بعد از FE-F، جدا)

- توزیع فعلی `market_score` را از `v_promotion_suggestions` استخراج کن (p50/p90/max).
- عدد `boost_per_nomination` و `boost_cap_per_product` را در `promotion_nomination_policy` update کن (فقط SQL update، نه migration ساختاری) تا بوست «قابل‌مشاهده اما نه غالب» شود (مثلاً boost_cap ≈ p50 امتیاز بازار).
- بدون تغییر کد.

---

## وابستگی‌ها و ترتیب اجرا

```text
DB-A ──► FE-B
  │
  └──► DB-C ──► DB-D ──► FE-E
                    │
                    └──► FE-F ──► کالیبراسیون
```

## Stop conditions

- اگر DB-A روی سرور apply نشد، FE-B شروع نشود (شکست runtime روی enum/CHECK).
- اگر DB-C/D حاوی خطای RLS بود (کاربر sales نتواند سهمیهٔ خود را بخواند)، به FE-E نرو.
- اگر `v_promotion_suggestions` بعد از DB-D کندتر از قبل شد (EXPLAIN)، ایندکس روی `promotion_nominations(product_id, nominated_on) where cancelled_at is null` اضافه شود قبل از FE-F.
- اگر `boost_per_nomination` قبل از فاز کالیبراسیون >0 seed شود، لغو کن و ۰ نگه دار.

## Out of scope

- تغییر نام/حذف ستون یا جدول موجود.
- تغییر توابع `mi_get_market_index` و `mi_get_price_movers` (وابسته به تاریخ قیمت، نه رویداد).
- طراحی مجدد صفحهٔ suggestions فراتر از سه ستون + tooltip.
- اتصال به سرویس خارجی، dependency جدید، تغییر auth/RBAC عمومی.
