## دلیل کندی

وقتی روی «ثبت» در کارت «نرخ ارزهای مؤثر» می‌زنید، تابع `saveCurrencyRateAndRecompute` در `src/lib/pricing/effective-currencies.ts` این کار را می‌کند:

1. غیرفعال‌سازی نرخ قبلی + درج نرخ جدید + audit (سریع، ۳ کوئری).
2. گرفتن همهٔ محصولات مؤثر آن ارز (مثلاً USD می‌تواند ده‌ها/صدها محصول باشد).
3. گرفتن همهٔ `sale_price_types` فعال (مثلاً ۵–۱۰ نوع).
4. **یک حلقهٔ تو در تو، کاملاً سریال** روی `محصولات × انواع قیمت فروش` که برای هر سلول:
   - `calculateSalePrice(...)` صدا می‌زند (که خودش چند کوئری به DB می‌زند: قیمت خرید فعال، نرخ ارز، قانون قیمت‌گذاری، …).
   - یک `select` جدا برای `product_computed_prices` (قیمت قبلی).
   - یک `upsert` در `product_computed_prices`.

برای N محصول و M نوع قیمت، این یعنی حدوداً **N × M × ۵ رفت‌وبرگشت HTTP از مرورگر به Supabase، همه پشت سر هم**. با ۵۰ محصول و ۵ نوع قیمت = ۱٬۲۵۰ درخواست سریال؛ با لاتنسی ۱۵۰ms هر کدام، چند دقیقه طول می‌کشد. این علت دقیق «خیلی طول می‌کشد تا پیغام موفقیت بدهد» است.

به‌علاوه، invalidate شدن `effective-currencies` و `my-workbench` بعد از پایان، باعث رفرش‌های اضافه هم می‌شود.

## برنامهٔ رفع

هدف: زمان ثبت نرخ ارز را از چند دقیقه به چند ثانیه برسانیم، بدون شکستن منطق قیمت‌گذاری.

### ۱) انتقال محاسبهٔ سنگین به یک Server Function

ایجاد `src/server/recompute-prices.functions.ts` با `createServerFn` (با `requireSupabaseAuth`) که:

- ورودی: `{ currency, newRate }` (با Zod اعتبارسنجی).
- روی سرور (نزدیک به DB، بدون لاتنسی مرورگر) همان منطق فعلی را اجرا می‌کند.
- مراحل ۱–۳ (insert نرخ + audit) را همان‌جا انجام می‌دهد.
- برای حلقهٔ N×M از موازی‌سازی با چانک استفاده می‌کند (مثلاً `Promise.all` با `concurrency = 8`) — چون از سرور به DB لاتنسی بسیار کمتر است و موازی امن است.
- به‌جای دو کوئری `select prev + upsert`، از یک `upsert(...).select("rounded_sale_price")` استفاده می‌کند و `old_price` را از یک batch‌ select اولیه (`product_computed_prices` با `.in("product_id", ids)`) می‌گیرد — یعنی فقط ۱ select اضافه به‌جای N×M select.
- خروجی: همان `RecomputeSummary[]` فعلی تا UI تغییر نکند.

### ۲) بهینه‌سازی `calculateSalePrice` در سرور

داخل همان server function، قبل از حلقه:
- یک‌بار `purchase_prices` فعال همهٔ محصولات را با `.in("product_id", ids)` بگیریم.
- یک‌بار `pricing_rules` لازم را بگیریم.
- یک‌بار `currency_rates` فعال را بگیریم (نرخ جدید را داریم).
- نسخهٔ سبک `calculateSalePriceFromContext({ product, purchasePrice, rule, rate, spt })` بسازیم که هیچ کوئری اضافه نزند.

این کار تعداد رفت‌وبرگشت‌ها را از O(N×M×چند) به O(۱ + N×M upsert) کاهش می‌دهد.

### ۳) تغییر کوچک سمت کلاینت

در `src/components/pricing/EffectiveCurrenciesPanel.tsx`:
- `saveCurrencyRateAndRecompute(...)` را با فراخوانی server function جایگزین کنیم.
- توست موقت «در حال بازمحاسبه…» نشان دهیم تا کاربر بداند کار در جریان است.
- `invalidateQueries` ها بدون تغییر بمانند.

فایل قدیمی `src/lib/pricing/effective-currencies.ts`: تابع `fetchEffectiveCurrencies` بدون تغییر می‌ماند؛ تابع `saveCurrencyRateAndRecompute` به یک wrapper نازک روی server function تبدیل می‌شود (تا اگر جای دیگری هم استفاده شده باشد، نشکند).

### ۴) رعایت قوانین پروژه

- بدون migration جدید (فقط بهینه‌سازی کد).
- بدون secret جدید، بدون CDN خارجی.
- RLS رعایت می‌شود چون از `requireSupabaseAuth` استفاده می‌کنیم نه `supabaseAdmin`.
- `audit_logs` همچنان ثبت می‌شود.
- خروجی نهایی شامل گزارش Self-Host Acceptance Check.

## نتیجهٔ مورد انتظار

برای مثال ۵۰ محصول × ۵ نوع قیمت: از ~۱٬۲۵۰ درخواست سریال از مرورگر به ~۲–۴ ثانیه روی سرور با چند ده کوئری بهینه. UI و API بیرونی بدون تغییر باقی می‌ماند.
