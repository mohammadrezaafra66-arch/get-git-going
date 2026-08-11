# پکیج B — ورود دستی متریک روزانه و گیمیفیکیشن (آیتم‌های ۱۴۳، ۱۵۶–۱۶۲)

## خلاصهٔ پکیج

این پکیج تقریباً **کامل و متصل** است — برخلاف انتظار اولیه. جدول `staff_daily_performance_metrics` هر پنج متریک را نگه می‌دارد، یک فرم واقعی با تقویم جلالی برای ثبت به تفکیک تاریخ و کارشناس وجود دارد (`_app.gamification.admin.manual-metrics.tsx`)، در منو mount شده، و از طریق RPC `upsert_staff_daily_performance_metric` می‌نویسد. مهم‌تر از همه: برخلاف کامنت هشدار در مهاجرت ۱۳۲.۱ («NOT WIRED INTO SCORING YET»)، مهاجرت بعدی **۱۴۶** تابع `calculate_employee_score` را بازنویسی کرده و اکنون **زندهٔ دیتابیس این جدول را می‌خواند** (تأیید شد: `reads_manual = t`). یعنی متریک‌های دستی واقعاً وارد امتیاز و لیدربورد می‌شوند.

سه نکتهٔ شکاف: (۱) لیدربورد «بلادرنگ» واقعی (Supabase Realtime) نیست؛ polling هر ۱۲۰ ثانیه + invalidate هنگام ذخیره است. (۲) KPI سود (`total_profit`) و `profit_per_talk_minute` در دیتابیس **غیرفعال** (`enabled=f`) هستند، پس سودِ واردشده فعلاً سهمی در امتیاز ندارد مگر مدیر آن را فعال کند. (۳) صفحهٔ وزن‌دهی KPI (`/gamification/settings`) در منوی اصلی nav نیست و فقط از صفحهٔ هاب گیمیفیکیشن قابل دسترسی است، و لینکش برای manager نمایش داده می‌شود ولی گارد route فقط admin است.

**بازهٔ ۵ روز در سه لایه اجرا می‌شود:** RLS (INSERT/UPDATE)، بدنهٔ RPC، و کد فرانت. override مدیر فقط در RPC (SECURITY DEFINER) هست؛ RLS خودش استثنای admin ندارد ولی چون فرانت همیشه از RPC می‌نویسد، override کار می‌کند.

| مؤلفه | وضعیت |
|---|---|
| جدول ۵ متریک | ✅ موجود، هر ۵ ستون |
| فرم ورود دستی (به تفکیک تاریخ/کارشناس) | ✅ موجود و mount‌شده |
| بازهٔ ویرایش ۵ روز | ✅ سه‌لایه (RLS + RPC + فرانت) |
| اتصال به امتیاز/لیدربورد | ✅ زنده (تابع می‌خواند) |
| «بلادرنگ» لیدربورد | 🔶 polling ۱۲۰ ثانیه، نه Realtime |
| وزن‌دهی دستی هر متریک | ✅ ویرایش‌پذیر admin در `/gamification/settings` |
| KPI سود | ⚠️ در DB غیرفعال (`enabled=f`) |
| آموزش/راهنمای درون‌صفحه | 🔶 فقط Alert درون‌صفحه؛ الگوی راهنمای کامل جای دیگری هست |

---

### آیتم ۱۵۶ — ثبت دستی مبلغ فروش روزانه

**وضعیت:** ✅ کامل

**پاسخ کوتاه:** ستون `sales_amount`، فیلد فرم، RLS و اتصال به امتیاز همه موجودند؛ یک سوییچ «خودکار/دستی» هم تعیین می‌کند فروش از پیش‌فاکتورهای پذیرفته‌شده خوانده شود یا از همین فرم (پیش‌فرض: دستی).

**شواهد:**
- L1 (UI): `src/routes/_app.gamification.admin.manual-metrics.tsx:405-412` — فیلد «مبلغ فروش»؛ در حالت auto غیرفعال (`isAuto`).
- L2 (front): mutation `save` → RPC `upsert_staff_daily_performance_metric` (خط ۲۲۲–۲۳۱)؛ سوییچ منبع → RPC `set_gamification_sales_source` (خط ۱۱۵).
- L3 (DB): ستون `sales_amount numeric NOT NULL DEFAULT 0 CHECK (>=0)` (مهاجرت `20260722200000_132_1...sql:69`). تابع `calculate_employee_score` حالت manual مبلغ را از `staff_daily_performance_metrics.sales_amount` می‌خواند (مهاجرت `20260723121101_146...sql:234-241`؛ زندهٔ DB: `reads_manual=t`). مقدار زندهٔ `shop_settings.gamification_sales_source = 'manual'`.
- L4 (access): گارد route `requireAnyRole(["admin","manager","accountant"])` (خط ۴۰)؛ RLS جدول همان سه نقش؛ سوییچ منبع فقط admin/accountant.

**شکاف نسبت به نیازمندی:** ندارد.

**برنچ:** بله (سرور = nav).

**وابستگی‌ها:** تابع `calculate_employee_score`، جدول، `shop_settings`.

**برای رفع:** —

**ریسک/پیچیدگی:** پایین.

---

### آیتم ۱۵۷ — ثبت دستی مبلغ سود روزانه

**وضعیت:** ⚠️ ناقص (ورود و ذخیره کامل، ولی KPI سود در دیتابیس غیرفعال است)

**پاسخ کوتاه:** ستون سود، فیلد فرم و شاخهٔ محاسبه در تابع امتیاز هر سه وجود دارند و سود همیشه دستی است، اما KPIهای `total_profit` و `profit_per_talk_minute` در جدول `gamification_kpis` با `enabled=f` **خاموش**‌اند؛ پس سودِ واردشده تا وقتی مدیر این KPI را فعال نکند سهمی در امتیاز ندارد.

**شواهد:**
- L1 (UI): `manual-metrics.tsx:413` — فیلد «مبلغ سود».
- L2 (front): همان RPC `upsert_staff_daily_performance_metric` (پارامتر `p_profit_amount`).
- L3 (DB): ستون `profit_amount numeric NOT NULL DEFAULT 0` (مهاجرت ۱۳۲.۱:۷۰). تابع سود را همیشه از جدول می‌خواند (مهاجرت ۱۴۶:۲۶۲-۲۶۹). اما کوئری زندهٔ `gamification_kpis`: ردیف `total_profit` وزن `0.0002` و `enabled=f`؛ `profit_per_talk_minute` وزن `0.002` و `enabled=f`. حلقهٔ امتیاز فقط `WHERE enabled=true` را می‌پیماید (مهاجرت ۱۴۶:۲۹۸)، پس این دو نادیده گرفته می‌شوند.
- L4 (access): مثل ۱۵۶.

**شکاف نسبت به نیازمندی:** داده ثبت می‌شود ولی روی امتیاز اثر ندارد تا KPI سود فعال شود.

**برنچ:** بله.

**وابستگی‌ها:** `gamification_kpis` (نیاز به `enabled=true` برای سود).

**برای رفع چه لازم است:** در صفحهٔ وزن‌دهی (`/gamification/settings`) دو KPI سود را فعال و وزن مناسب تعیین شود (کار پیکربندی، نه کد).

**ریسک/پیچیدگی:** پایین — یک تغییر پیکربندی داده.

---

### آیتم ۱۵۸ — ثبت دستی تعداد تماس ورودی

**وضعیت:** ✅ کامل

**پاسخ کوتاه:** ستون `inbound_calls_count`، فیلد فرم و شاخهٔ KPI `inbound_calls` (وزن ۱، فعال) موجود و متصل‌اند؛ تماس‌ها همیشه از این جدول خوانده می‌شوند چون `call_logs` خالی است.

**شواهد:**
- L1 (UI): `manual-metrics.tsx:414` — «تماس ورودی».
- L2 (front): RPC `upsert...` پارامتر `p_inbound_calls_count`.
- L3 (DB): ستون `inbound_calls_count integer ... CHECK (>=0)` (مهاجرت ۱۳۲.۱:۷۱). تابع همیشه از جدول می‌خواند (مهاجرت ۱۴۶:۱۸۳-۲۰۵). KPI زنده `inbound_calls` وزن `1`، `enabled=t`.
- L4 (access): مثل ۱۵۶.

**شکاف:** ندارد. **برنچ:** بله. **ریسک:** پایین.

---

### آیتم ۱۵۹ — ثبت دستی تعداد تماس خروجی

**وضعیت:** ✅ کامل

**پاسخ کوتاه:** مانند ورودی؛ ستون `outbound_calls_count` + فیلد فرم + KPI `outbound_calls` (وزن ۲، فعال).

**شواهد:**
- L1: `manual-metrics.tsx:415`.
- L2: RPC پارامتر `p_outbound_calls_count`.
- L3: ستون (مهاجرت ۱۳۲.۱:۷۲)؛ خوانده‌شدن در تابع (۱۴۶:۱۸۳-۲۰۵)؛ KPI زنده `outbound_calls` وزن `2`، `enabled=t`.
- L4: مثل ۱۵۶.

**شکاف:** ندارد. **برنچ:** بله. **ریسک:** پایین.

---

### آیتم ۱۶۰ — ثبت دستی دقایق مکالمه

**وضعیت:** ✅ کامل

**پاسخ کوتاه:** ستون `talk_time_minutes` + فیلد فرم + KPI `talk_minutes` (وزن ۰.۵، فعال)؛ مقدار مستقیماً به‌عنوان دقیقه ذخیره و خوانده می‌شود.

**شواهد:**
- L1: `manual-metrics.tsx:416`.
- L2: RPC پارامتر `p_talk_time_minutes`.
- L3: ستون (مهاجرت ۱۳۲.۱:۷۳)؛ خوانده‌شدن (۱۴۶:۱۸۳-۲۰۵، کامنت «already in minutes»)؛ KPI زنده `talk_minutes` وزن `0.5`، `enabled=t`. علاوه بر آن در محاسبهٔ `active_work_minutes` هم استفاده می‌شود.
- L4: مثل ۱۵۶.

**شکاف:** ندارد. **برنچ:** بله. **ریسک:** پایین.

---

### آیتم ۱۶۱ — لیدربورد و «بلادرنگ» بودن

**وضعیت:** 🔶 جزئی

**پاسخ کوتاه:** لیدربورد واقعی و متصل به امتیازهای زنده هست (از `employee_scores` از طریق RPCهای `get_leaderboard_*`)، اما به‌روزرسانی **بلادرنگِ واقعی (Supabase Realtime) نیست**؛ polling هر ۱۲۰ ثانیه است به‌علاوهٔ invalidate فوری کوئری هنگام ثبت متریک روی همان دستگاه.

**شواهد:**
- L1 (UI): `src/routes/_app.gamification.leaderboard.tsx:40` — `useLeaderboard(period, 100)`؛ تب‌های روزانه/هفتگی/ماهانه/کل.
- L2 (front): `src/hooks/gamification/useGamification.ts:35-42` — `useLeaderboard` با `refetchInterval: 120_000` و `staleTime: 60_000`. تابع `getLeaderboard` (`src/lib/operations/gamification.ts:129-154`) بسته به دوره RPC `get_leaderboard_daily/weekly/monthly/all_time` را صدا می‌زند. هنگام ذخیرهٔ متریک، `manual-metrics.tsx:239-241` کوئری‌های `gamification-leaderboard`/`employee-scores` را invalidate می‌کند (به‌روزرسانی فوری فقط برای همان کاربر).
- L3 (DB): امتیاز هنگام هر upsert بازمحاسبه می‌شود: RPC upsert در انتها `PERFORM public.calculate_employee_score(p_staff_user_id)` را با محافظت try/except اجرا می‌کند (مهاجرت ۱۳۲.۱:۲۵۵-۲۶۱)، پس `employee_scores` بلافاصله پس از ثبت تازه است.
- L4 (access): route لیدربورد بدون گارد نقش (`_app.gamification.leaderboard.tsx:15-17`) — هر کاربر authenticated.

**شکاف نسبت به نیازمندی:** «real-time» در حد polling ۲ دقیقه‌ای است؛ هیچ `supabase.channel`/`postgres_changes`/`subscribe` در فایل‌های گیمیفیکیشن یافت نشد (grep بی‌نتیجه). داده‌ی زیربنایی بلافاصله به‌روز می‌شود، ولی سایر تماشاگرانِ لیدربورد تا حداکثر ۱۲۰ ثانیه تأخیر می‌بینند.

**برنچ:** بله.

**برای رفع چه لازم است:** یا افزودن اشتراک Supabase Realtime روی `employee_scores` و invalidate هنگام تغییر، یا کاهش `refetchInterval`. تصمیم محصولی است که آیا «تقریباً بلادرنگ ۲ دقیقه‌ای» کافی است.

**ریسک/پیچیدگی:** متوسط — افزودن Realtime نیازمند کانال و مدیریت اتصال است.

---

### آیتم ۱۶۲ — وزن‌دهی دستی هر متریک

**وضعیت:** ✅ کامل (با یک شکاف جزئی دسترسی منو)

**پاسخ کوتاه:** جدول `gamification_kpis` ستون `weight` دارد و صفحهٔ `/gamification/settings` به مدیر اجازهٔ ویرایش وزن و فعال/غیرفعال‌سازی هر KPI را می‌دهد؛ همین وزن‌ها مستقیماً در `calculate_employee_score` ضرب می‌شوند.

**شواهد:**
- L1 (UI): `src/routes/_app.gamification.settings.tsx:143-176` — برای هر KPI یک `Input` وزن + دکمهٔ ذخیره، و مجموع وزن‌ها (خط ۱۰۸). قابل دسترسی از هاب: `_app.gamification.tsx:216` لینک «تنظیمات وزن KPIها (مدیر)».
- L2 (front): `listKpis`/`updateKpi` (`src/lib/operations/gamification.ts:40-86`) روی جدول `gamification_kpis`؛ `updateKpi` به `audit_logs` هم لاگ می‌کند.
- L3 (DB): کوئری زندهٔ ۱۲ ردیف KPI با وزن‌های واقعی — نمونه: `inbound_calls=1`, `outbound_calls=2`, `talk_minutes=0.5`, `total_sales=0.0001`, `new_customers=200.2`. حلقهٔ امتیاز `_kpi.weight` را ضرب می‌کند (مهاجرت ۱۴۶:۳۳۶-۳۳۹).
- L4 (access): گارد route `requireAnyRole(["admin"])` (`settings.tsx:66-67`). **ناهماهنگی:** لینک در هاب با شرط `isAdminOrManager` نشان داده می‌شود ولی گارد فقط admin است؛ manager لینک را می‌بیند اما route ردش می‌کند. همچنین این صفحه در `registry.ts` منوی اصلی nav ثبت نشده (فقط از هاب گیمیفیکیشن قابل دسترسی).

**شکاف نسبت به نیازمندی:** وزن‌دهی کامل است؛ فقط مسیر دسترسی از منوی اصلی وجود ندارد و ناهماهنگی نقش manager.

**برنچ:** بله.

**برای رفع چه لازم است:** افزودن ورودی منو در `registry.ts` برای `/gamification/settings` (admin) و هم‌ترازکردن شرط نمایش لینک با گارد admin.

**ریسک/پیچیدگی:** پایین.

---

### آیتم ۱۴۳ — آموزش/راهنمای درون‌صفحه

**وضعیت:** 🔶 جزئی

**پاسخ کوتاه:** برای فرم متریک دستی فقط راهنمای کوتاه درون‌صفحه (Alert توضیح بازهٔ ۵ روز + hintهای فیلدها) هست، نه یک صفحهٔ آموزش/onboarding اختصاصی؛ اما **الگوی راهنمای کامل و قابل‌استفادهٔ مجدد** در پروژه موجود است.

**شواهد:**
- راهنمای درون‌صفحهٔ فعلی متریک: `manual-metrics.tsx:287-294` (Alert «محدودیت ویرایش») و hint فیلد فروش در حالت خودکار (خط ۴۱۱).
- الگوی راهنمای کامل قابل بازاستفاده: route `src/routes/_app.sales_.customers_.credit-allocation-guide.tsx` که کامپوننت `CustomerCreditGuide` را رندر می‌کند — `src/components/customers/CustomerCreditGuide.tsx` (ساختار Card/CardHeader/CardTitle چندبخشی، خطوط ۱۰۵، ۱۷۴، تابع `CustomerCreditGuide` خط ۱۱۹). نمونهٔ آموزشی دیگر: `src/routes/_app.sales_.customers_.credit-training.tsx` و `src/routes/_app.accounting.receipts_.training.tsx`.

**شکاف نسبت به نیازمندی:** صفحهٔ آموزش اختصاصی برای گیمیفیکیشن/متریک دستی وجود ندارد؛ فقط الگو برای ساختش آماده است.

**برنچ:** بله (الگوها در working tree هستند).

**برای رفع چه لازم است:** در صورت نیاز، ساخت یک route راهنما مشابه `credit-allocation-guide` با کامپوننت Card-based که فرم متریک، بازهٔ ۵ روز، سوییچ خودکار/دستی و اثر وزن‌ها را توضیح دهد.

**ریسک/پیچیدگی:** پایین.
